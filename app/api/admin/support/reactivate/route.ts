import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { userId, subscriptionId } = await request.json();

    if (!userId && !subscriptionId) {
      return NextResponse.json({ error: "userId or subscriptionId is required" }, { status: 400 });
    }

    const subscription = subscriptionId
      ? await prisma.user_subscriptions.update({
          where: { user_subscription_id: BigInt(subscriptionId) },
          data: { is_active: true, updated_at: new Date() },
        })
      : await prisma.user_subscriptions.updateMany({
          where: { user_id: BigInt(userId), is_active: false },
          data: { is_active: true, updated_at: new Date() },
        });

    const logUserId = userId
      ? BigInt(userId)
      : subscriptionId
        ? (await prisma.user_subscriptions.findUnique({
            where: { user_subscription_id: BigInt(subscriptionId) },
            select: { user_id: true },
          }))?.user_id
        : undefined;

    if (!logUserId) {
      return NextResponse.json({ error: "Unable to resolve user for log entry" }, { status: 400 });
    }

    await prisma.activity_logs.create({
      data: {
        user_id: logUserId,
        action: "ACCOUNT_REACTIVATED",
        details: subscriptionId
          ? `Subscription ${subscriptionId} reactivated by admin`
          : "User subscriptions reactivated by admin",
      },
    });

    return NextResponse.json({ message: "Account reactivated successfully", subscription });
  } catch (error) {
    console.error("Admin reactivate error:", error);
    return NextResponse.json({ error: "Failed to reactivate account" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}