import { PrismaClient } from "@/lib/generated/prisma";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: awaitedParams } = await params;
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

    // Format BigInt and Date fields
    const formatted = {
      user_subscription_id: latestSubscription.user_subscription_id.toString(),
      users: latestSubscription.users,
      user_id: latestSubscription.user_id.toString(),
      is_active: latestSubscription.is_active,
      start_date: latestSubscription.start_date?.toISOString().slice(0, 10),
      end_date: latestSubscription.end_date?.toISOString().slice(0, 10),
      subscriptions: {
        cost: latestSubscription.subscriptions?.cost?.toString(),
        type: latestSubscription.subscriptions?.type,
      },
    };

    return NextResponse.json(formatted);
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
