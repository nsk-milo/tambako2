import { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const PAYMENT_API_URL = process.env.PAWAPAY_URL as string;

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    // Parse and validate request body
    const { phoneNumber, amount, provider } = await req.json();

    if (!phoneNumber || !amount || !provider) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const deposit: Deposit = {
      currency: "ZMW",
      depositId: crypto.randomUUID(),
      amount: amount.toString(),
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber,
          provider: Provider[provider as keyof typeof Provider],
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

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.message || "Payment processing failed" },
        { status: response.status }
      );
    }

    if (data.status === "ACCEPTED") {
      console.log("Payment API response:", data);

      // Find the user by phone number
      const user = await prisma.users.findUnique({
        where: {
          phone_number: phoneNumber,
        },
      });

      if (!user) {
        console.error(
          `Payment successful but user with phone number ${phoneNumber} not found.`
        );
        // We still return a success response to the client because the payment was successful.
        // The app should handle this case gracefully, perhaps by notifying support.
        return NextResponse.json(
          {
            message: data as PaymentApiResponse,
            subscriptionStatus: "User not found",
          },
          { status: 200 }
        );
      }

      // Find the subscription plan by amount
      const subscription = await prisma.subscriptions.findFirst({
        where: {
          cost: new Prisma.Decimal(amount),
        },
      });

      if (!subscription) {
        console.error(
          `Payment successful but subscription with amount ${amount} not found.`
        );
        return NextResponse.json(
          {
            message: data as PaymentApiResponse,
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
              amount: new Prisma.Decimal(amount),
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
          message: data as PaymentApiResponse,
          subscriptionStatus: "Subscription created",
        },
        { status: 200 }
      );
    }
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
