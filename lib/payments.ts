import { prisma } from "@/lib/prisma";
import { activatePaidSubscription } from "@/lib/subscriptions";
import {
  chargeFailureReason,
  chargeMatchesPayment,
  isFailedStatus,
  isSettledStatus,
  retrieveCharge,
} from "@/lib/flutterwave";

// Verification is the single source of truth for whether a payment cleared.
// We do not accept webhooks: every activation goes through `GET /charges/{id}`
// and is checked against the row we recorded when the charge was created.
// https://developer.flutterwave.com/docs/payment-orchestrator-flow
//
// Two callers drive it — the customer's own page, which polls while they hold
// their handset, and the cron sweep, which picks up the payments whose customer
// closed the tab before the charge cleared.

/** A charge left `pending` for this long is treated as abandoned. */
export const PAYMENT_ABANDON_AFTER_MS = 60 * 60 * 1000;

export type VerificationState =
  | "successful"
  | "pending"
  | "failed"
  | "mismatch"
  | "unstarted"
  | "unknown";

export interface VerificationResult {
  state: VerificationState;
  message: string;
  /** Flutterwave's own status, when we got as far as reading one. */
  chargeStatus?: string;
  planType?: string;
  expiresAt?: Date | null;
  /** True only on the call that actually granted the subscription. */
  activated?: boolean;
}

/**
 * Confirms one payment with Flutterwave and, if it really did settle for the
 * plan price, grants the subscription.
 *
 * Safe to call repeatedly and concurrently: the activation claims the row with
 * a conditional update, so a second caller gets `activated: false` rather than
 * a second subscription period.
 */
export async function verifyPaymentByReference(
  reference: string,
  options: { userId?: bigint } = {}
): Promise<VerificationResult> {
  const payment = await prisma.payments.findUnique({
    where: { reference },
    include: { subscriptions: true },
  });

  // Scoped lookups must not leak whether someone else's reference exists.
  if (!payment || (options.userId !== undefined && payment.user_id !== options.userId)) {
    return { state: "unknown", message: "We have no record of that payment." };
  }

  if (payment.status === "successful") {
    return {
      state: "successful",
      message: "Your subscription is already active.",
      chargeStatus: "succeeded",
      planType: payment.subscriptions.type,
      activated: false,
    };
  }

  if (!payment.charge_id) {
    return {
      state: "unstarted",
      message: "That payment was never started with the gateway.",
    };
  }

  const charge = await retrieveCharge(payment.charge_id);

  // Still in flight — for mobile money this is the normal state for as long as
  // the customer takes to approve the prompt on their handset.
  if (!charge || (!isSettledStatus(charge.status) && !isFailedStatus(charge.status))) {
    return {
      state: "pending",
      message:
        "Your payment is still being confirmed. Approve the prompt on your phone — we will activate your subscription as soon as it clears.",
      chargeStatus: charge?.status ?? "pending",
    };
  }

  if (isFailedStatus(charge.status)) {
    const reason = chargeFailureReason(charge);
    await prisma.payments.updateMany({
      where: { reference, status: { not: "successful" } },
      data: {
        status: "failed",
        provider_reference: charge.reference ?? undefined,
        failure_reason: reason?.slice(0, 255) ?? null,
      },
    });
    return {
      state: "failed",
      message: reason || "The payment was declined. Please try again.",
      chargeStatus: charge.status,
    };
  }

  // Succeeded — but only honour it if Flutterwave collected what the plan costs.
  if (!chargeMatchesPayment(charge, Number(payment.amount), payment.currency)) {
    console.error(
      `Flutterwave amount mismatch on ${reference}: collected ${charge.amount} ${charge.currency}, expected ${payment.amount} ${payment.currency}`
    );
    await prisma.payments.updateMany({
      where: { reference, status: { not: "successful" } },
      data: { status: "mismatch", provider_reference: charge.reference ?? undefined },
    });
    return {
      state: "mismatch",
      message:
        "The amount received does not match the plan price. Please contact support with your reference.",
      chargeStatus: charge.status,
    };
  }

  const result = await activatePaidSubscription({
    reference,
    providerReference: charge.reference ?? charge.id,
    channel: charge.payment_method_details?.type ?? payment.channel,
  });

  return {
    state: "successful",
    message: result
      ? "Payment confirmed — your subscription is active."
      : "Your subscription is already active.",
    chargeStatus: charge.status,
    planType: payment.subscriptions.type,
    expiresAt: result?.endDate ?? null,
    activated: Boolean(result),
  };
}

export interface SweepSummary {
  checked: number;
  activated: number;
  failed: number;
  mismatched: number;
  stillPending: number;
  abandoned: number;
  errors: number;
}

/**
 * Verifies every payment still sitting at `pending`. Without webhooks this is
 * what closes the gap left by a customer who approved the prompt after closing
 * the tab: their charge settles at Flutterwave and nothing on our side would
 * ever hear about it otherwise.
 *
 * Rows that have been pending past `PAYMENT_ABANDON_AFTER_MS` are checked one
 * last time and then written off, so the sweep does not grow without bound.
 */
export async function reconcilePendingPayments(limit = 100): Promise<SweepSummary> {
  const pending = await prisma.payments.findMany({
    where: { status: "pending", charge_id: { not: null } },
    orderBy: { created_at: "asc" },
    take: limit,
  });

  const summary: SweepSummary = {
    checked: pending.length,
    activated: 0,
    failed: 0,
    mismatched: 0,
    stillPending: 0,
    abandoned: 0,
    errors: 0,
  };

  for (const payment of pending) {
    try {
      const result = await verifyPaymentByReference(payment.reference);

      switch (result.state) {
        case "successful":
          if (result.activated) summary.activated += 1;
          break;
        case "failed":
          summary.failed += 1;
          break;
        case "mismatch":
          summary.mismatched += 1;
          break;
        case "pending": {
          const age = Date.now() - payment.created_at.getTime();
          if (age < PAYMENT_ABANDON_AFTER_MS) {
            summary.stillPending += 1;
            break;
          }
          // Flutterwave still says pending long after the prompt would have
          // timed out on the handset — nobody is going to approve it now.
          const { count } = await prisma.payments.updateMany({
            where: { reference: payment.reference, status: "pending" },
            data: {
              status: "abandoned",
              failure_reason: "The payment was not approved in time.",
            },
          });
          summary.abandoned += count;
          break;
        }
        default:
          break;
      }
    } catch (error) {
      // One unreachable charge must not stop the rest of the sweep; the next
      // run picks this row up again.
      summary.errors += 1;
      console.error(`Failed to reconcile payment ${payment.reference}:`, error);
    }
  }

  return summary;
}
