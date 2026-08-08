import { NextResponse } from "next/server";
import { reconcilePendingPayments } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Re-verifies payments that are still pending. With no webhook in the picture,
// a customer who approves the prompt after closing the tab has nobody polling
// for them — this sweep is what eventually grants their subscription.
//
// Schedule it a few minutes apart (Vercel Cron, or any scheduler that can POST
// with the shared secret).

/** Guards the endpoint the same way the subscriptions cron does. */
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
    const summary = await reconcilePendingPayments();
    if (summary.checked > 0) {
      console.log("Payment reconciliation:", JSON.stringify(summary));
    }
    return NextResponse.json({ message: "Pending payments reconciled.", ...summary });
  } catch (error) {
    console.error("Cron job for payments failed:", error);
    return NextResponse.json({ error: "Failed to reconcile payments" }, { status: 500 });
  }
}

// Vercel Cron issues GETs; keep both verbs on the same handler.
export const GET = POST;
