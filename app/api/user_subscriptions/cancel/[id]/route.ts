import { PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function PATCH(request: Request, context: any) {
  try {
    const awaitedParams = await context?.params?.id;
    // Get the latest subscription for the user
    const latestSubscription = await prisma.user_subscriptions.findFirst({
      where: {
        user_id: BigInt(awaitedParams),
      },
      orderBy: { created_at: "desc" },
      select: {
        user_subscription_id: true,
        users: { select: { name: true, email: true, phone_number: true } },
        user_id: true,
        is_active: true,
        start_date: true,
        end_date: true,
        created_at: true,
        subscriptions: {
          select: {
            cost: true,
            type: true,
          },
        },
      },
    });

    if (!latestSubscription) {
      return NextResponse.json(
        { error: "Subscription not found for this user." },
        { status: 404 }
      );
    }

    const updatedSubscription = await prisma.user_subscriptions.update({
      where: {
        user_subscription_id: latestSubscription.user_subscription_id,
      },
      data: {
        is_active: false,
      },
    });

    if (!updatedSubscription) {
      return NextResponse.json(
        { error: "Failed to cancel subscription." },
        { status: 500 }
      );
    }

    return NextResponse.json("Subscription cancelled successfully.");
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
