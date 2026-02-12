import { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const PAYMENT_API_URL = process.env.PAWAPAY_URL as string;
const PAYMENT_STATUS_URL = process.env.PAWAPAY_STATUS_URL as string | undefined;
const PAYMENT_POLL_ATTEMPTS = 6;
const PAYMENT_POLL_INTERVAL_MS = 5000;

const prisma = new PrismaClient();

const FAILED_PAYMENT_STATUSES = ["FAILED", "REJECTED", "ERROR", "CANCELLED", "EXPIRED"];
const SUCCESS_PAYMENT_STATUSES = ["ACCEPTED", "COMPLETED", "SUCCESS", "SUCCESSFUL"];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getProviderPayload = (data: unknown) => (Array.isArray(data) ? data[0] : data);

const getPaymentStatus = (payload: unknown) =>
  payload && typeof payload === "object" && "status" in payload
    ? String((payload as { status?: unknown }).status ?? "").trim().toUpperCase()
    : "";

const getDepositId = (payload: unknown) =>
  payload && typeof payload === "object" && "depositId" in payload
    ? String((payload as { depositId?: unknown }).depositId ?? "")
    : "";

export async function POST(req: Request) {
  try {
    // Parse and validate request body
    const { phoneNumber, amount, provider } = (await req.json()) as {
      phoneNumber?: string;
      amount?: string | number;
      provider?: string;
    };

    if (!phoneNumber || !amount || !provider) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const normalizedProviderKey = provider.toUpperCase() as keyof typeof Provider;
    const providerValue = Provider[normalizedProviderKey];
    if (!providerValue) {
      return NextResponse.json(
        { message: "Invalid provider selected" },
        { status: 400 }
      );
    }

    const numericAmount = typeof amount === "string" ? Number(amount) : amount;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { message: "Invalid payment amount" },
        { status: 400 }
      );
    }

    const cleanPhone = phoneNumber.replace(/\s+/g, "");

    const deposit: Deposit = {
      currency: "ZMW",
      depositId: crypto.randomUUID(),
      amount: numericAmount.toString(),
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: cleanPhone,
          provider: providerValue,
        },
      },
    };

    console.log(JSON.stringify(deposit, null, 2));

    // Call external payment API
    const response = await fetch(PAYMENT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PAYMENT_TOKEN}`,
      },
      body: JSON.stringify(deposit),
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    let paymentResponse = getProviderPayload(data);
    let normalizedPaymentStatus = getPaymentStatus(paymentResponse);
    const depositId = getDepositId(paymentResponse);

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            paymentResponse &&
            typeof paymentResponse === "object" &&
            "message" in paymentResponse &&
            typeof (paymentResponse as { message?: unknown }).message === "string"
              ? ((paymentResponse as { message?: string }).message as string)
              : "Payment processing failed",
        },
        { status: response.status }
      );
    }

    if (FAILED_PAYMENT_STATUSES.includes(normalizedPaymentStatus)) {
      return NextResponse.json(
        {
          message: "Payment was not approved.",
          paymentStatus: normalizedPaymentStatus,
          providerResponse: paymentResponse,
        },
        { status: 402 }
      );
    }

    if (!SUCCESS_PAYMENT_STATUSES.includes(normalizedPaymentStatus) && depositId) {
      for (let i = 0; i < PAYMENT_POLL_ATTEMPTS; i += 1) {
        await wait(PAYMENT_POLL_INTERVAL_MS);
        try {
          const statusUrl = `${PAYMENT_STATUS_URL ?? PAYMENT_API_URL}/${depositId}`;
          const statusResponse = await fetch(statusUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.PAYMENT_TOKEN}`,
            },
          });

          if (!statusResponse.ok) continue;

          const statusData: unknown = await statusResponse.json();
          const statusPayload = getProviderPayload(statusData);
          const polledStatus = getPaymentStatus(statusPayload);

          if (polledStatus) {
            normalizedPaymentStatus = polledStatus;
            paymentResponse = statusPayload;
          }

          if (SUCCESS_PAYMENT_STATUSES.includes(normalizedPaymentStatus)) break;
          if (FAILED_PAYMENT_STATUSES.includes(normalizedPaymentStatus)) {
            return NextResponse.json(
              {
                message: "Payment was not approved.",
                paymentStatus: normalizedPaymentStatus,
                providerResponse: paymentResponse,
              },
              { status: 402 }
            );
          }
        } catch {
          // continue polling
        }
      }
    }

    if (!SUCCESS_PAYMENT_STATUSES.includes(normalizedPaymentStatus)) {
      return NextResponse.json(
        {
          message: "Payment request submitted. Please approve the prompt on your phone.",
          paymentStatus: normalizedPaymentStatus,
          depositId,
          providerResponse: paymentResponse,
        },
        { status: 202 }
      );
    }

    console.log("Payment API response:", paymentResponse);

    // Find the user by phone number
    const candidatePhoneNumbers = new Set<string>([cleanPhone]);
    const digitsOnly = cleanPhone.replace(/\D/g, "");
    if (digitsOnly) {
      candidatePhoneNumbers.add(digitsOnly);
      if (digitsOnly.startsWith("0") && digitsOnly.length >= 10) {
        candidatePhoneNumbers.add(`26${digitsOnly}`);
      }
      if (digitsOnly.startsWith("260") && digitsOnly.length > 3) {
        candidatePhoneNumbers.add(`0${digitsOnly.slice(3)}`);
      }
    }

    const user = await prisma.users.findFirst({
      where: {
        phone_number: { in: Array.from(candidatePhoneNumbers) },
      },
    });

    if (!user) {
      console.error(
        `Payment successful but user with phone number ${cleanPhone} not found.`
      );
      // We still return success because payment request was accepted by provider.
      return NextResponse.json(
        {
          message: paymentResponse as PaymentApiResponse,
          subscriptionStatus: "User not found",
        },
        { status: 200 }
      );
    }

    // Find the subscription plan by amount
    const subscription = await prisma.subscriptions.findFirst({
      where: {
        cost: new Prisma.Decimal(numericAmount),
      },
    });

    if (!subscription) {
      console.error(
        `Payment successful but subscription with amount ${numericAmount} not found.`
      );
      return NextResponse.json(
        {
          message: paymentResponse as PaymentApiResponse,
          subscriptionStatus: "Subscription plan not found",
        },
        { status: 200 }
      );
    }

    // Check for an existing active subscription to handle renewals
    const activeSubscription = await prisma.user_subscriptions.findFirst({
      where: {
        user_id: user.user_id,
        is_active: true,
      },
    });

    let startDate = new Date();
    if (activeSubscription) {
      // If the current subscription is still active, stack the new one on top
      const now = new Date();
      if (activeSubscription.end_date > now) {
        startDate = activeSubscription.end_date;
      }
    }

    const endDate = new Date(startDate);
    switch (subscription.type.toLowerCase()) {
      case "daily":
      case "dialy":
        endDate.setDate(endDate.getDate() + 1);
        break;
      case "weekly":
        endDate.setDate(endDate.getDate() + 7);
        break;
      case "monthly":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      default:
        console.warn(
          `Unknown subscription type "${subscription.type}", defaulting to 1 day.`
        );
        endDate.setDate(endDate.getDate() + 1);
        break;
    }

    // Use a transaction to deactivate the old subscription and create the new one
    await prisma.$transaction(async (tx) => {
      // Deactivate any existing active subscription for this user
      await tx.user_subscriptions.updateMany({
        where: { user_id: user.user_id, is_active: true },
        data: { is_active: false },
      });

      // Create the new user subscription record
      const user_sub = await tx.user_subscriptions.create({
        data: {
          user_id: user.user_id,
          subscription_id: subscription.subscription_id,
          start_date: startDate,
          end_date: endDate,
          is_active: true,
        },
      });

      if (user_sub) {
        console.log("Created user subscription:", user_sub);
        // Create the transaction using the same tx client
        await tx.transactions.create({
          data: {
            user_id: user.user_id,
            user_subscription_id: user_sub.user_subscription_id,
            amount: new Prisma.Decimal(numericAmount),
          },
        });
      }
    });

    console.log(
      "User subscription created successfully for user:",
      user.user_id
    );

    return NextResponse.json(
      {
        message: paymentResponse as PaymentApiResponse,
        subscriptionStatus: "Subscription created",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Payment processing error:", error);
    return NextResponse.json(
      { message: "failed to make payment" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

interface Deposit {
  depositId: string;
  amount: string;
  currency: "ZMW";
  payer: Payer;
}

interface Payer {
  type: "MMO";
  accountDetails: AccountDetails;
}

interface AccountDetails {
  phoneNumber: string;
  provider: Provider;
}

enum Provider {
  MTN = "MTN_MOMO_ZMB",
  AIRTEL = "AIRTEL_OAPI_ZMB",
  ZAMTEL = "ZAMTEL_ZMB",
}

interface PaymentApiResponse {
  depositId: string;
  status: string;
  created: string;
  nextStep: string;
}
