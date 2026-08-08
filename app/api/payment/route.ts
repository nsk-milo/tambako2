import { NextResponse } from "next/server";
import { getUserDataFromToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activatePaidSubscription } from "@/lib/subscriptions";
import {
  FLW_CHANNEL,
  FLW_CURRENCY,
  FlutterwaveCharge,
  FlutterwaveError,
  FlutterwaveNetwork,
  assertFlutterwaveConfigured,
  chargeFailureReason,
  chargeMatchesPayment,
  createMobileMoneyCharge,
  detectNetwork,
  generatePaymentReference,
  isFailedStatus,
  isSettledStatus,
  isValidNetwork,
  isValidReference,
  isValidZambianNumber,
  retrieveCharge,
  splitCustomerName,
} from "@/lib/flutterwave";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = <T,>(body: T, status = 200) => {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
};

interface PaymentRequest {
  action?: "initiate" | "verify";
  planId?: number | string;
  network?: string;
  phoneNumber?: string;
  email?: string;
  fullName?: string;
  reference?: string;
}

export async function POST(req: Request) {
  try {
    const user = await getUserDataFromToken();
    if (!user) {
      return noStore({ message: "Please sign in to subscribe." }, 401);
    }
    const userId = BigInt(user.userId);

    const body = (await req.json()) as PaymentRequest;
    const action = body.action === "verify" ? "verify" : "initiate";

    return action === "initiate"
      ? await handleInitiate(userId, body)
      : await handleVerify(userId, body);
  } catch (error) {
    if (error instanceof FlutterwaveError) {
      return noStore({ message: error.message }, error.httpStatus);
    }
    console.error("Payment processing error:", error);
    return noStore({ message: "Unable to process payment right now." }, 500);
  }
}

/**
 * Creates the Flutterwave charge for a plan and records it locally. The amount
 * is read from the plan row — never from the request — so a client cannot pay a
 * daily price for a monthly plan.
 */
async function handleInitiate(userId: bigint, body: PaymentRequest) {
  assertFlutterwaveConfigured();

  const planId = Number(body.planId);
  if (!Number.isInteger(planId) || planId <= 0) {
    return noStore({ message: "Select a subscription plan to continue." }, 400);
  }

  const phoneNumber = body.phoneNumber?.trim() || "";
  if (!isValidZambianNumber(phoneNumber)) {
    return noStore(
      { message: "Enter a valid Zambian mobile money number, e.g. 0966123456." },
      400
    );
  }

  const [plan, account] = await Promise.all([
    prisma.subscriptions.findUnique({ where: { subscription_id: planId } }),
    prisma.users.findUnique({ where: { user_id: userId } }),
  ]);

  if (!plan) {
    return noStore({ message: "That subscription plan no longer exists." }, 404);
  }
  if (!account) {
    return noStore({ message: "Your account could not be found." }, 404);
  }

  // Trust the customer's explicit choice; fall back to the prefix, then MTN.
  const network: FlutterwaveNetwork = isValidNetwork(body.network)
    ? body.network
    : detectNetwork(phoneNumber) ?? "MTN";

  const email = body.email?.trim() || account.email;
  if (!email) {
    return noStore({ message: "An email address is required to complete payment." }, 400);
  }

  const name = splitCustomerName(body.fullName?.trim() || account.name || "");
  if (!name) {
    return noStore(
      { message: "Enter the name on your mobile money account (at least two letters)." },
      400
    );
  }

  const reference = generatePaymentReference(userId);
  const amount = Number(plan.cost);

  await prisma.payments.create({
    data: {
      reference,
      user_id: userId,
      subscription_id: plan.subscription_id,
      amount: plan.cost,
      currency: FLW_CURRENCY,
      status: "pending",
      channel: FLW_CHANNEL,
      network,
    },
  });

  let charge;
  try {
    charge = await createMobileMoneyCharge({
      reference,
      amount,
      currency: FLW_CURRENCY,
      network,
      phoneNumber,
      email,
      name,
      redirectUrl: buildRedirectUrl(reference),
    });
  } catch (error) {
    // The charge never got off the ground, so nothing can ever settle against
    // this reference — close the row out rather than leaving it pending forever.
    await prisma.payments.update({
      where: { reference },
      data: {
        status: "failed",
        failure_reason:
          error instanceof Error ? error.message.slice(0, 255) : "Charge creation failed.",
      },
    });
    throw error;
  }

  await prisma.payments.update({
    where: { reference },
    data: { charge_id: charge.id, status: chargeStatusToPaymentStatus(charge.status) },
  });

  return noStore({
    message: "Payment initiated.",
    reference,
    chargeId: charge.id,
    amount,
    currency: FLW_CURRENCY,
    network,
    paymentStatus: charge.status,
    // Whatever the customer still has to do: approve a push prompt on their
    // handset, or visit a hosted authorisation page.
    nextAction: charge.next_action ?? null,
  });
}

/**
 * Confirms a charge with Flutterwave and grants the subscription. Mobile money
 * clears after the customer approves the prompt on their handset, so a
 * `pending` result here is expected — the `charge.completed` webhook finishes
 * the activation, and the client keeps polling this endpoint meanwhile.
 */
async function handleVerify(userId: bigint, body: PaymentRequest) {
  const reference = body.reference?.trim();
  if (!reference || !isValidReference(reference)) {
    return noStore({ message: "Missing or malformed payment reference." }, 400);
  }

  const payment = await prisma.payments.findUnique({
    where: { reference },
    include: { subscriptions: true },
  });

  if (!payment || payment.user_id !== userId) {
    return noStore({ message: "We have no record of that payment." }, 404);
  }

  if (payment.status === "successful") {
    return noStore({
      message: "Your subscription is already active.",
      paymentStatus: "successful",
      planType: payment.subscriptions.type,
    });
  }

  if (!payment.charge_id) {
    return noStore({ message: "That payment was never started with the gateway." }, 409);
  }

  const charge = await retrieveCharge(payment.charge_id);

  if (!charge || (!isSettledStatus(charge.status) && !isFailedStatus(charge.status))) {
    return noStore(
      {
        message:
          "Your payment is still being confirmed. Approve the prompt on your phone — we will activate your subscription as soon as it clears.",
        paymentStatus: charge?.status ?? "pending",
      },
      202
    );
  }

  if (isFailedStatus(charge.status)) {
    const reason = chargeFailureReason(charge);
    await prisma.payments.updateMany({
      where: { reference, status: { not: "successful" } },
      data: {
        status: "failed",
        provider_reference: charge.reference ?? undefined,
        failure_reason: reason?.slice(0, 255) ?? null,
      },
    });
    return noStore(
      {
        message: reason || "The payment was declined. Please try again.",
        paymentStatus: "failed",
      },
      402
    );
  }

  // Succeeded — but only honour it if Flutterwave collected what the plan costs.
  if (!chargeMatchesPayment(charge, Number(payment.amount), payment.currency)) {
    console.error(
      `Flutterwave amount mismatch on ${reference}: collected ${charge.amount} ${charge.currency}, expected ${payment.amount} ${payment.currency}`
    );
    await prisma.payments.updateMany({
      where: { reference, status: { not: "successful" } },
      data: { status: "mismatch", provider_reference: charge.reference ?? undefined },
    });
    return noStore(
      {
        message:
          "The amount received does not match the plan price. Please contact support with your reference.",
        paymentStatus: "mismatch",
      },
      409
    );
  }

  const result = await activatePaidSubscription({
    reference,
    providerReference: charge.reference ?? charge.id,
    channel: charge.payment_method_details?.type ?? payment.channel,
  });

  return noStore({
    message: result
      ? "Payment confirmed — your subscription is active."
      : "Your subscription is already active.",
    paymentStatus: "successful",
    planType: payment.subscriptions.type,
    expiresAt: result?.endDate ?? null,
  });
}

/** Where Flutterwave sends the customer back after a hosted authorisation page. */
function buildRedirectUrl(reference: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/subscribe/callback?reference=${encodeURIComponent(reference)}`;
}

/** A charge that already reads `succeeded` still activates via handleVerify. */
function chargeStatusToPaymentStatus(status: FlutterwaveCharge["status"]) {
  return isFailedStatus(status) ? "failed" : "pending";
}
