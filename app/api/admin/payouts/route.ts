import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayoutStatus, serialisePayout } from "@/lib/payouts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The admin's payout queue. Requests land here the moment a creator asks for
// one; approving or rejecting is /api/admin/payouts/[id].

const PAYOUT_STATUSES: PayoutStatus[] = [
  "requested",
  "approved",
  "processing",
  "paid",
  "rejected",
  "failed",
];

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const statusParam = request.nextUrl.searchParams.get("status");
    const status = PAYOUT_STATUSES.includes(statusParam as PayoutStatus)
      ? (statusParam as PayoutStatus)
      : null;

    const [payouts, counts, owedAgg] = await Promise.all([
      prisma.payouts.findMany({
        where: status ? { status } : {},
        orderBy: [{ created_at: "desc" }],
        take: 100,
        include: { provider: { select: { name: true, email: true } } },
      }),
      prisma.payouts.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
      // What the platform has committed to but not yet handed over.
      prisma.payouts.aggregate({
        _sum: { amount: true },
        where: { status: { in: ["requested", "approved", "processing"] } },
      }),
    ]);

    const byStatus = Object.fromEntries(
      PAYOUT_STATUSES.map((value) => {
        const row = counts.find((entry) => entry.status === value);
        return [value, { count: row?._count._all ?? 0, amount: Number(row?._sum.amount || 0) }];
      })
    );

    return NextResponse.json({
      payouts: payouts.map((payout) => serialisePayout(payout)),
      byStatus,
      /** Requested, approved or in flight — money the platform still owes. */
      outstandingTotal: Number(owedAgg._sum.amount || 0),
    });
  } catch (error) {
    console.error("Admin payout list error:", error);
    return NextResponse.json({ error: "Failed to load payouts." }, { status: 500 });
  }
}
