import { PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET() {

  
  try {
    // Get all subscriptions ordered by created_at DESC
    const subscriptions = await prisma.user_subscriptions.findMany({
      orderBy: [{ user_id: "asc" }, { created_at: "desc" }],
      select: {
        user_subscription_id: true,
        users: { select: { name: true, email: true,phone_number: true} },
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

    // Filter to get only the latest subscription per user
    const latestSubsMap = new Map<string, (typeof subscriptions)[0]>();
    for (const sub of subscriptions) {
      const userId = sub.user_id.toString();
      if (!latestSubsMap.has(userId)) {
        latestSubsMap.set(userId, sub);
      }
    }
    const latestSubscriptions = Array.from(latestSubsMap.values());

    // Format BigInt and Date fields
    const formatted = latestSubscriptions.map((sub) => ({
      user_subscription_id: sub.user_subscription_id.toString(),
      users: sub.users,
      user_id: sub.user_id.toString(),
      is_active: sub.is_active,
      start_date: sub.start_date?.toISOString().slice(0, 10),
      end_date: sub.end_date?.toISOString().slice(0, 10),
      subscriptions: {
        cost: sub.subscriptions?.cost?.toString(),
        type: sub.subscriptions?.type,
      },
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription plans." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
