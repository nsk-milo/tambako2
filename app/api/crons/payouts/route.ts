import { NextResponse } from "next/server";
import { reconcileProcessingPayouts } from "@/lib/payouts";

export const dynamic = "force-dynamic";

// Re-verifies payouts still in flight. With no webhook in the picture, a
// creator who closes the tab after sending a payout has nobody polling for
// them — this sweep is what eventually marks it paid, or hands the amount back
// to their balance when the transfer failed.
//
// Schedule it a few minutes apart, alongside the payments sweep.

/** Guards the endpoint the same way the payments cron does. */
function isAuthorised(request: Request) {
  const secret = process.env.VERCEL_CRON_SECRET;
  if (!secret) return true;
  return (
    request.headers.get("x-vercel-cron-secret") === secret ||
    request.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcileProcessingPayouts();
    if (summary.checked > 0) {
      console.log("Payout reconciliation:", JSON.stringify(summary));
    }
    return NextResponse.json({ message: "In-flight payouts reconciled.", ...summary });
  } catch (error) {
    console.error("Cron job for payouts failed:", error);
    return NextResponse.json({ error: "Failed to reconcile payouts" }, { status: 500 });
  }
}

// Vercel Cron issues GETs; keep both verbs on the same handler.
export const GET = POST;
