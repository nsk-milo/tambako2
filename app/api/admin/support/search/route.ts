import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get("phoneNumber");
    const subscriptionId = searchParams.get("subscriptionId");

    if (!phoneNumber && !subscriptionId) {
      return NextResponse.json({ error: "Provide phoneNumber or subscriptionId" }, { status: 400 });
    }

    const subscriptionIdNum = subscriptionId ? Number(subscriptionId) : null;
    if (subscriptionId && Number.isNaN(subscriptionIdNum)) {
      return NextResponse.json({ error: "Invalid subscriptionId" }, { status: 400 });
    }

    const user = await prisma.users.findFirst({
      where: phoneNumber ? { phone_number: phoneNumber } : undefined,
      include: {
        role: true,
        user_subscriptions: {
          include: { subscriptions: true },
          orderBy: { created_at: "desc" },
        },
      },
    });

    const subscription = subscriptionIdNum
      ? await prisma.user_subscriptions.findUnique({
          where: { user_subscription_id: BigInt(subscriptionIdNum) },
          include: {
            subscriptions: true,
            users: {
              include: {
                role: true,
                user_subscriptions: { include: { subscriptions: true } },
              },
            },
          },
        })
      : null;

    if (!user && !subscription) {
      return NextResponse.json({ error: "No matching user or subscription found" }, { status: 404 });
    }

    const selectedUser = user ?? subscription?.users ?? null;

    if (!selectedUser) {
      return NextResponse.json({ error: "No user found for this subscription" }, { status: 404 });
    }

    const activeSubscription = selectedUser.user_subscriptions.find((sub) => sub.is_active);

    return NextResponse.json({
      user: {
        user_id: selectedUser.user_id.toString(),
        name: selectedUser.name,
        email: selectedUser.email,
        phone_number: selectedUser.phone_number,
        role: selectedUser.role?.name ?? null,
        activeSubscription,
      },
      subscription,
    });
  } catch (error) {
    console.error("Admin support search error:", error);
    return NextResponse.json({ error: "Failed to search user" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}