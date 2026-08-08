import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activatePaidSubscription } from "@/lib/subscriptions";
import {
  chargeFailureReason,
  chargeMatchesPayment,
  isFailedStatus,
  isSettledStatus,
  retrieveCharge,
  verifyWebhookSignature,
} from "@/lib/flutterwave";

export const dynamic = "force-dynamic";

// Flutterwave webhook receiver. Point the dashboard's webhook URL at
// <NEXT_PUBLIC_BASE_URL>/api/payment/webhook and set the same secret hash there
// as in FLW_SECRET_HASH.
//
// This is the authoritative activation path: mobile money clears after the
// customer approves the prompt on their handset, often long after they have
// closed the browser tab, so `charge.completed` — not the redirect back to our
// callback page — is what reliably tells us the money arrived.

interface FlutterwaveWebhookEvent {
  type?: string;
  event?: string;
  data?: {
    id?: string;
    reference?: string;
    status?: string;
  };
}

export async function POST(req: Request) {
  // The signature covers the raw bytes, so read the body as text and parse it
  // ourselves rather than using req.json().
  const rawBody = await req.text();
  const signature = req.headers.get("flutterwave-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("Rejected Flutterwave webhook with an invalid signature.");
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let event: FlutterwaveWebhookEvent;
  try {
    event = JSON.parse(rawBody) as FlutterwaveWebhookEvent;
  } catch {
    return NextResponse.json({ message: "Malformed payload" }, { status: 400 });
  }

  const eventName = event.type || event.event || "";
  const chargeId = event.data?.id;
  const reference = event.data?.reference;

  if (!chargeId && !reference) {
    return NextResponse.json({ message: "Ignored: no charge identifier" }, { status: 200 });
  }

  try {
    if (eventName.startsWith("charge.")) {
      await handleChargeEvent(chargeId, reference);
    }
  } catch (error) {
    // Returning 5xx makes Flutterwave retry, which is what we want for a
    // transient database or gateway failure.
    console.error(`Failed to process Flutterwave webhook ${eventName}:`, error);
    return NextResponse.json({ message: "Processing failed" }, { status: 500 });
  }

  // Always acknowledge recognised-but-unhandled events so Flutterwave stops retrying.
  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * Never trusts the amount or status in the webhook body — a signature proves
 * the message came from Flutterwave, not that the body is what we should act
 * on. The charge is re-fetched and that result decides the outcome.
 */
async function handleChargeEvent(chargeId?: string, reference?: string) {
  // `data.reference` echoes the reference we sent, but only `data.id` is
  // guaranteed, so match on either.
  const identifiers = [
    ...(chargeId ? [{ charge_id: chargeId }] : []),
    ...(reference ? [{ reference }] : []),
  ];
  const payment = await prisma.payments.findFirst({ where: { OR: identifiers } });

  if (!payment) {
    console.warn(
      `Flutterwave webhook for unknown charge ${chargeId ?? reference}; ignoring.`
    );
    return;
  }

  if (payment.status === "successful") return;

  const lookupId = payment.charge_id || chargeId;
  if (!lookupId) {
    console.warn(`No charge id recorded for ${payment.reference}; cannot verify webhook.`);
    return;
  }

  const charge = await retrieveCharge(lookupId);
  if (!charge) {
    console.warn(`Flutterwave has no charge ${lookupId}; ignoring webhook.`);
    return;
  }

  if (isFailedStatus(charge.status)) {
    await prisma.payments.updateMany({
      where: { reference: payment.reference, status: { not: "successful" } },
      data: {
        status: "failed",
        provider_reference: charge.reference ?? undefined,
        failure_reason: chargeFailureReason(charge)?.slice(0, 255) ?? null,
      },
    });
    return;
  }

  if (!isSettledStatus(charge.status)) return;

  if (!chargeMatchesPayment(charge, Number(payment.amount), payment.currency)) {
    console.error(
      `Flutterwave webhook amount mismatch on ${payment.reference}: collected ${charge.amount} ${charge.currency}, expected ${payment.amount} ${payment.currency}`
    );
    await prisma.payments.updateMany({
      where: { reference: payment.reference, status: { not: "successful" } },
      data: { status: "mismatch", provider_reference: charge.reference ?? undefined },
    });
    return;
  }

  await activatePaidSubscription({
    reference: payment.reference,
    providerReference: charge.reference ?? charge.id,
    channel: charge.payment_method_details?.type ?? payment.channel,
  });
}
