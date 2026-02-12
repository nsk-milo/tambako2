import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { getUserDataFromToken } from "@/lib/auth";
import { getProviderAnalytics } from "@/lib/analytics";

const prisma = new PrismaClient();

const WITHDRAW_ACTION = "PROVIDER_WITHDRAWAL";

const parseWithdrawAmount = (details: string | null) => {
  if (!details) return 0;
  const match = details.match(/amount=([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : 0;
};

async function getProviderWithdrawalSummary(providerId: number) {
  const analytics = await getProviderAnalytics(prisma, providerId);
  const totalEarned = Number(analytics.providerTotals?.providerShareTotal ?? 0);

  const logs = await prisma.activity_logs.findMany({
    where: {
      user_id: BigInt(providerId),
      action: WITHDRAW_ACTION,
    },
    select: { details: true },
  });

  const withdrawnTotal = logs.reduce(
    (sum, log) => sum + parseWithdrawAmount(log.details),
    0
  );

  return {
    totalEarned: Number(totalEarned.toFixed(2)),
    withdrawnTotal: Number(withdrawnTotal.toFixed(2)),
    availableBalance: Number(Math.max(totalEarned - withdrawnTotal, 0).toFixed(2)),
  };
}

export async function GET() {
  try {
    const user = await getUserDataFromToken();
    if (!user || user.role !== "ContentCreator") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const providerId = Number(user.userId);
    if (!Number.isFinite(providerId)) {
      return NextResponse.json({ error: "Invalid provider id" }, { status: 400 });
    }

    const summary = await getProviderWithdrawalSummary(providerId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Provider withdraw summary error:", error);
    return NextResponse.json({ error: "Failed to load withdrawal summary" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserDataFromToken();
    if (!user || user.role !== "ContentCreator") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const providerId = Number(user.userId);
    if (!Number.isFinite(providerId)) {
      return NextResponse.json({ error: "Invalid provider id" }, { status: 400 });
    }

    const body = (await request.json()) as { amount?: number | string };
    const amount = typeof body.amount === "string" ? Number(body.amount) : body.amount;

    if (!Number.isFinite(amount) || !amount || amount <= 0) {
      return NextResponse.json({ error: "Please enter a valid withdrawal amount" }, { status: 400 });
    }

    const summary = await getProviderWithdrawalSummary(providerId);
    if (amount > summary.availableBalance) {
      return NextResponse.json(
        { error: "Withdrawal amount exceeds your available balance" },
        { status: 400 }
      );
    }

    const roundedAmount = Number(amount.toFixed(2));

    await prisma.activity_logs.create({
      data: {
        user_id: BigInt(providerId),
        action: WITHDRAW_ACTION,
        details: `amount=${roundedAmount.toFixed(2)}`,
      },
    });

    const updated = {
      totalEarned: summary.totalEarned,
      withdrawnTotal: Number((summary.withdrawnTotal + roundedAmount).toFixed(2)),
      availableBalance: Number((summary.availableBalance - roundedAmount).toFixed(2)),
    };

    return NextResponse.json({
      message: "Withdrawal request submitted successfully",
      ...updated,
    });
  } catch (error) {
    console.error("Provider withdraw request error:", error);
    return NextResponse.json({ error: "Failed to submit withdrawal request" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
