import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PayoutError, reviewPayout, serialisePayout } from "@/lib/payouts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Approving or rejecting one payout request.
//
// Approval moves no money — it only unlocks the creator's own "send to my
// wallet" button. Keeping the two apart means an approval can never itself
// debit the Flutterwave balance by accident, and the creator stays the one who
// chooses when the transfer goes out.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Unknown payout." }, { status: 400 });
    }

    const body = (await request.json()) as { action?: string; note?: string };
    const decision =
      body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;

    if (!decision) {
      return NextResponse.json(
        { error: "Say whether to approve or reject this payout." },
        { status: 400 }
      );
    }

    // A rejection the creator cannot read is just a payout that vanished.
    if (decision === "reject" && !body.note?.trim()) {
      return NextResponse.json(
        { error: "Give a reason so the creator knows why it was rejected." },
        { status: 400 }
      );
    }

    const payout = await reviewPayout({
      payoutId: BigInt(id),
      adminId: BigInt(admin.userId),
      decision,
      note: body.note,
    });

    return NextResponse.json({
      message:
        decision === "approve"
          ? "Payout approved. The creator can now send it to their mobile money wallet."
          : "Payout request rejected.",
      payout: payout ? serialisePayout(payout) : null,
    });
  } catch (error) {
    if (error instanceof PayoutError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }
    console.error("Admin payout review error:", error);
    return NextResponse.json({ error: "Failed to review that payout." }, { status: 500 });
  }
}
