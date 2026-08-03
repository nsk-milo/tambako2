import { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();
const LENCO_API_BASE_URL = process.env.LENCO_API_BASE_URL || "https://api.lenco.co";
const LENCO_PUBLIC_KEY = process.env.LENCO_PUBLIC_KEY;
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY;
const LENCO_WIDGET_URL = process.env.NEXT_PUBLIC_LENCO_WIDGET_URL || process.env.LENCO_WIDGET_URL || "https://pay.sandbox.lenco.co/js/v1/inline.js";

const buildPhoneCandidates = (phoneNumber: string) => {
  const cleanPhone = phoneNumber.replace(/\s+/g, "");
  const candidates = new Set<string>([cleanPhone]);
  const digitsOnly = cleanPhone.replace(/\D/g, "");

  if (digitsOnly) {
    candidates.add(digitsOnly);
    if (digitsOnly.startsWith("0") && digitsOnly.length >= 10) {
      candidates.add(`26${digitsOnly}`);
    }
    if (digitsOnly.startsWith("260") && digitsOnly.length > 3) {
      candidates.add(`0${digitsOnly.slice(3)}`);
    }
  }

  return Array.from(candidates);
};

const createSubscriptionForUser = async ({
  userId,
  amount,
  planId,
}: {
  userId: bigint;
  amount: number;
  planId?: number;
}) => {
  const plan = planId
    ? await prisma.subscriptions.findUnique({ where: { subscription_id: planId } })
    : await prisma.subscriptions.findFirst({ where: { cost: new Prisma.Decimal(amount) } });

  if (!plan) {
    throw new Error(`Subscription plan not found for amount ${amount}`);
  }

  const activeSubscription = await prisma.user_subscriptions.findFirst({
    where: {
      user_id: userId,
      is_active: true,
    },
  });

  let startDate = new Date();
  if (activeSubscription && activeSubscription.end_date > new Date()) {
    startDate = activeSubscription.end_date;
  }

  const endDate = new Date(startDate);
  switch (plan.type.toLowerCase()) {
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
      endDate.setDate(endDate.getDate() + 1);
      break;
  }

  return prisma.$transaction(async (tx) => {
    await tx.user_subscriptions.updateMany({
      where: { user_id: userId, is_active: true },
      data: { is_active: false },
    });

    const userSubscription = await tx.user_subscriptions.create({
      data: {
        user_id: userId,
        subscription_id: plan.subscription_id,
        start_date: startDate,
        end_date: endDate,
        is_active: true,
      },
    });

    await tx.transactions.create({
      data: {
        user_id: userId,
        user_subscription_id: userSubscription.user_subscription_id,
        amount: new Prisma.Decimal(amount),
      },
    });

    return { userSubscription, plan };
  });
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "initiate" | "verify";
      phoneNumber?: string;
      amount?: string | number;
      email?: string;
      customerName?: string;
      channels?: string[];
      reference?: string;
      planId?: number;
    };

    const action = body.action || "initiate";
    const numericAmount = typeof body.amount === "string" ? Number(body.amount) : body.amount;
    const safeAmount = typeof numericAmount === "number" ? numericAmount : NaN;

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return NextResponse.json({ message: "Invalid payment amount" }, { status: 400 });
    }

    if (action === "initiate") {
      const email = body.email?.trim().toLowerCase();
      if (!email) {
        return NextResponse.json({ message: "Email is required" }, { status: 400 });
      }

      return NextResponse.json({
        message: "Payment widget ready",
        reference: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        publicKey: LENCO_PUBLIC_KEY || "",
        amount: safeAmount,
        currency: "ZMW",
        channels: body.channels?.length ? body.channels : ["mobile-money"],
        widgetUrl: LENCO_WIDGET_URL,
      });
    }

    const reference = body.reference?.trim();
    if (!reference) {
      return NextResponse.json({ message: "Missing payment reference" }, { status: 400 });
    }

    const verificationResponse = await fetch(`${LENCO_API_BASE_URL}/access/v2/collections/status/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${LENCO_SECRET_KEY}`,
      },
    });

    if (!verificationResponse.ok) {
      const errorData = await verificationResponse.text();
      console.error("Lenco verification failed:", errorData);
      return NextResponse.json(
        { message: "We could not verify the payment with Lenco yet." },
        { status: verificationResponse.status }
      );
    }

    const verificationPayload = (await verificationResponse.json()) as {
      status?: boolean;
      data?: {
        status?: string;
        settlementStatus?: string;
        reference?: string;
      };
    };

    const paymentStatus = String(verificationPayload.data?.status || "").trim().toLowerCase();
    const settlementStatus = String(verificationPayload.data?.settlementStatus || "").trim().toLowerCase();
    const isSuccessful = paymentStatus === "successful" || paymentStatus === "completed" || paymentStatus === "paid" || settlementStatus === "settled";

    if (!isSuccessful) {
      return NextResponse.json(
        {
          message: "Payment is still pending confirmation.",
          paymentStatus,
          settlementStatus,
        },
        { status: 202 }
      );
    }

    const normalizedEmail = body.email?.trim().toLowerCase();
    const phoneCandidates = body.phoneNumber ? buildPhoneCandidates(body.phoneNumber) : [];

    const user = await prisma.users.findFirst({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(phoneCandidates.length ? [{ phone_number: { in: phoneCandidates } }] : []),
        ],
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: "Payment successful but your account could not be linked automatically.",
          subscriptionStatus: "User not found",
        },
        { status: 200 }
      );
    }

    const subscriptionResult = await createSubscriptionForUser({
      userId: user.user_id,
      amount: safeAmount,
      planId: body.planId,
    });

    return NextResponse.json(
      {
        message: "Payment successful and subscription activated.",
        subscriptionStatus: "Subscription created",
        planName: subscriptionResult.plan?.subscription_id ? "Subscription plan" : "Subscription plan",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Payment processing error:", error);
    return NextResponse.json({ message: "Unable to process payment right now." }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
