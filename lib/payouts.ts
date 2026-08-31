import { prisma } from "@/lib/prisma";
import { getProviderAnalytics } from "@/lib/analytics";
import {
  FLW_CURRENCY,
  FlutterwaveError,
  FlutterwaveNetwork,
  createMobileMoneyTransfer,
  generatePayoutReference,
  isFailedTransferStatus,
  isSettledTransferStatus,
  isValidNetwork,
  isValidZambianNumber,
  retrieveTransfer,
  splitCustomerName,
  toNationalNumber,
  transferFailureReason,
} from "@/lib/flutterwave";

// Paying creators for what their titles earned.
//
// Money never leaves on a creator's say-so alone. A payout walks three hands:
//
//   creator requests  ->  admin approves  ->  creator sends it to their wallet
//
// which is why `approved` is a state of its own rather than something the
// disbursement call decides for itself. Rejection ends it at the admin's hand;
// only an `approved` payout can ever reach `disbursePayout`.
//
// As with collections there are no webhooks in the picture: a transfer counts
// as paid only once `GET /transfers/{id}` says SUCCESSFUL, read either by the
// creator's own polling or by the cron sweep.

/** The least a creator can cash out at once, in ZMW. */
export const PAYOUT_MINIMUM_AMOUNT = Number(process.env.PAYOUT_MINIMUM_AMOUNT || 50);

/** What appears on the recipient's mobile money statement. */
const PAYOUT_NARRATION = "Tambako creator earnings";

/**
 * Statuses that still hold money against the creator's balance.
 *
 * Everything from the moment they ask to the moment it lands: an amount under
 * review is as spent as one already paid, or the same earnings could be
 * requested again while the first request sits in the admin's queue. Only
 * `rejected` and `failed` give it back.
 */
export const HELD_PAYOUT_STATUSES = ["requested", "approved", "processing", "paid"] as const;

/** Statuses a creator still has something outstanding on. */
const OPEN_PAYOUT_STATUSES = ["requested", "approved", "processing"] as const;

export type PayoutStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "processing"
  | "paid"
  | "failed";

/** The legacy cash-out log, from before payouts had a table of their own. */
const LEGACY_WITHDRAW_ACTION = "PROVIDER_WITHDRAWAL";

const round2 = (value: number) => Number(value.toFixed(2));

/* -------------------------------------------------------------------------- */
/* Balance                                                                     */
/* -------------------------------------------------------------------------- */

export interface PayoutBalance {
  /** Everything the creator's titles have ever earned, at the per-view rate. */
  totalEarned: number;
  /** Requested or approved but not yet in their wallet. */
  pendingTotal: number;
  /** Landed in their wallet. */
  paidTotal: number;
  /** Earned, less everything already claimed — what a new request may draw on. */
  availableBalance: number;
  minimumPayout: number;
  /** Whether there is enough here to ask for a payout at all. */
  isEligible: boolean;
  /** True while an earlier request is still working its way through. */
  hasOpenPayout: boolean;
  currency: string;
}

/**
 * What a creator has earned and what is left to draw on.
 *
 * Earnings come from `media_views` by way of the analytics rollup — the same
 * number the dashboard shows — so a payout can never exceed what the platform
 * actually credited them.
 */
export async function getPayoutBalance(providerId: bigint): Promise<PayoutBalance> {
  const [analytics, grouped, legacyLogs, openCount] = await Promise.all([
    getProviderAnalytics(prisma, Number(providerId)),
    prisma.payouts.groupBy({
      by: ["status"],
      where: { provider_id: providerId, status: { in: [...HELD_PAYOUT_STATUSES] } },
      _sum: { amount: true },
    }),
    // Cash-outs logged before this table existed still have to count against
    // the balance, or every one of them would be payable a second time.
    prisma.activity_logs.findMany({
      where: { user_id: providerId, action: LEGACY_WITHDRAW_ACTION },
      select: { details: true },
    }),
    prisma.payouts.count({
      where: { provider_id: providerId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
    }),
  ]);

  const totalEarned = Number(analytics.providerTotals?.providerShareTotal ?? 0);

  const sumOf = (statuses: PayoutStatus[]) =>
    grouped
      .filter((row) => statuses.includes(row.status as PayoutStatus))
      .reduce((total, row) => total + Number(row._sum.amount || 0), 0);

  const paidTotal = sumOf(["paid"]);
  const pendingTotal = sumOf(["requested", "approved", "processing"]);
  const legacyTotal = legacyLogs.reduce((sum, log) => sum + parseLegacyAmount(log.details), 0);

  const availableBalance = Math.max(totalEarned - paidTotal - pendingTotal - legacyTotal, 0);

  return {
    totalEarned: round2(totalEarned),
    pendingTotal: round2(pendingTotal),
    paidTotal: round2(paidTotal + legacyTotal),
    availableBalance: round2(availableBalance),
    minimumPayout: PAYOUT_MINIMUM_AMOUNT,
    isEligible: availableBalance >= PAYOUT_MINIMUM_AMOUNT,
    hasOpenPayout: openCount > 0,
    currency: FLW_CURRENCY,
  };
}

/** Reads the amount out of a legacy `amount=123.45` activity log detail. */
function parseLegacyAmount(details: string | null) {
  const match = details?.match(/amount=([0-9]+(?:\.[0-9]+)?)/i);
  const amount = match ? Number(match[1]) : 0;
  return Number.isFinite(amount) ? amount : 0;
}

/* -------------------------------------------------------------------------- */
/* Requesting                                                                  */
/* -------------------------------------------------------------------------- */

export class PayoutError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = "PayoutError";
  }
}

export interface RequestPayoutInput {
  providerId: bigint;
  amount: number;
  /** The wallet to pay, in any Zambian form; stored nationally. */
  phoneNumber: string;
  network: string;
  /** Name on the mobile money wallet, which need not match the account name. */
  accountName: string;
}

/**
 * Records a creator's request for a cash-out. Nothing is sent anywhere — this
 * only puts the amount in front of an admin, and holds it against the balance
 * so it cannot be requested twice.
 */
export async function requestPayout(input: RequestPayoutInput) {
  const amount = round2(Number(input.amount));

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PayoutError("Enter a valid amount to cash out.", 400);
  }

  if (!isValidZambianNumber(input.phoneNumber)) {
    throw new PayoutError(
      "Enter a valid Zambian mobile money number, e.g. 0966123456.",
      400
    );
  }

  if (!isValidNetwork(input.network)) {
    throw new PayoutError("Choose the mobile money network for that number.", 400);
  }

  const name = splitCustomerName(input.accountName || "");
  if (!name) {
    throw new PayoutError(
      "Enter the name on your mobile money wallet (at least two letters).",
      400
    );
  }

  const balance = await getPayoutBalance(input.providerId);

  // One at a time. Beyond being the simpler thing to explain, it is what keeps
  // two requests submitted at once from each passing the balance check.
  if (balance.hasOpenPayout) {
    throw new PayoutError(
      "You already have a payout in progress. It has to finish before you can request another.",
      409
    );
  }

  if (amount < balance.minimumPayout) {
    throw new PayoutError(
      `The smallest payout is K${balance.minimumPayout.toFixed(2)}.`,
      400
    );
  }

  if (amount > balance.availableBalance) {
    throw new PayoutError(
      `You can cash out at most K${balance.availableBalance.toFixed(2)} right now.`,
      400
    );
  }

  return prisma.payouts.create({
    data: {
      reference: generatePayoutReference(input.providerId),
      provider_id: input.providerId,
      amount,
      currency: FLW_CURRENCY,
      status: "requested",
      network: input.network as FlutterwaveNetwork,
      phone_number: toNationalNumber(input.phoneNumber),
      account_name: [name.first, name.last].filter(Boolean).join(" "),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Admin review                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Approves or rejects a pending request.
 *
 * Approval unlocks disbursement and nothing else — no money moves until the
 * creator sends it. The conditional `updateMany` on `requested` is what stops
 * two admins reviewing the same request, and stops an already-sent payout being
 * rejected out from under a transfer in flight.
 */
export async function reviewPayout({
  payoutId,
  adminId,
  decision,
  note,
}: {
  payoutId: bigint;
  adminId: bigint;
  decision: "approve" | "reject";
  note?: string;
}) {
  const payout = await prisma.payouts.findUnique({ where: { payout_id: payoutId } });
  if (!payout) throw new PayoutError("That payout request no longer exists.", 404);

  if (payout.status !== "requested") {
    throw new PayoutError(
      `That request has already been ${payout.status === "approved" ? "approved" : payout.status}.`,
      409
    );
  }

  const { count } = await prisma.payouts.updateMany({
    where: { payout_id: payoutId, status: "requested" },
    data: {
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_by: adminId,
      reviewed_at: new Date(),
      admin_note: note?.trim().slice(0, 255) || null,
    },
  });

  if (count === 0) {
    throw new PayoutError("That request was reviewed by someone else just now.", 409);
  }

  return prisma.payouts.findUnique({ where: { payout_id: payoutId } });
}

/* -------------------------------------------------------------------------- */
/* Disbursing                                                                  */
/* -------------------------------------------------------------------------- */

export interface DisburseResult {
  status: PayoutStatus;
  message: string;
  transferId?: string | null;
  transferStatus?: string | null;
}

/**
 * Sends an approved payout to the creator's mobile money wallet.
 *
 * The row is claimed as `processing` before Flutterwave is called, so a
 * double-tap on the button cannot send the money twice. If the call never
 * lands, where the row goes back to depends on why:
 *
 *  - a gateway or network fault leaves it `approved`, because the transfer may
 *    in fact have been created — a retry carries the same reference, and the
 *    idempotency key resolves it to that same transfer rather than a second one;
 *  - a refusal of the request itself (bad wallet, insufficient balance) ends it
 *    at `failed`, which releases the hold so the creator can request again with
 *    corrected details.
 */
export async function disbursePayout({
  payoutId,
  providerId,
}: {
  payoutId: bigint;
  /** Scopes the payout to its owner; omit for an admin-initiated send. */
  providerId?: bigint;
}): Promise<DisburseResult> {
  const payout = await prisma.payouts.findUnique({ where: { payout_id: payoutId } });

  // A scoped lookup must not leak that someone else's payout exists.
  if (!payout || (providerId !== undefined && payout.provider_id !== providerId)) {
    throw new PayoutError("We have no record of that payout.", 404);
  }

  if (payout.status === "requested") {
    throw new PayoutError("That payout is still waiting for admin approval.", 409);
  }
  if (payout.status === "rejected") {
    throw new PayoutError("That payout request was rejected.", 409);
  }
  if (payout.status === "processing" || payout.status === "paid") {
    return verifyPayout({ payoutId, providerId });
  }
  if (payout.status !== "approved") {
    throw new PayoutError("That payout can no longer be sent.", 409);
  }

  // Claim it before spending any money against it.
  const { count } = await prisma.payouts.updateMany({
    where: { payout_id: payoutId, status: "approved" },
    data: { status: "processing", failure_reason: null },
  });

  if (count === 0) {
    return verifyPayout({ payoutId, providerId });
  }

  const name = splitCustomerName(payout.account_name);
  if (!name) {
    await prisma.payouts.updateMany({
      where: { payout_id: payoutId, status: "processing" },
      data: {
        status: "failed",
        failure_reason: "The name on the mobile money wallet is not usable.",
      },
    });
    throw new PayoutError(
      "The name on this payout is not usable. Request the payout again with the name on your wallet.",
      400
    );
  }

  let transfer;
  try {
    transfer = await createMobileMoneyTransfer({
      reference: payout.reference,
      amount: Number(payout.amount),
      destinationCurrency: payout.currency,
      phoneNumber: payout.phone_number,
      name,
      narration: PAYOUT_NARRATION,
    });
  } catch (error) {
    const rejected = error instanceof FlutterwaveError && error.httpStatus < 500;
    const reason =
      error instanceof Error ? error.message.slice(0, 255) : "The payout could not be sent.";

    await prisma.payouts.updateMany({
      where: { payout_id: payoutId, status: "processing" },
      data: { status: rejected ? "failed" : "approved", failure_reason: reason },
    });
    throw error;
  }

  await prisma.payouts.update({
    where: { payout_id: payoutId },
    data: {
      transfer_id: transfer.id,
      transfer_status: transfer.status,
      // `NEW` means accepted, not delivered — only verification can say paid.
      status: isFailedTransferStatus(transfer.status) ? "failed" : "processing",
      ...(isFailedTransferStatus(transfer.status)
        ? { failure_reason: transferFailureReason(transfer)?.slice(0, 255) ?? null }
        : {}),
    },
  });

  return {
    status: isFailedTransferStatus(transfer.status) ? "failed" : "processing",
    message: isFailedTransferStatus(transfer.status)
      ? transferFailureReason(transfer) || "The payout was refused."
      : "Payout sent. It usually reaches your mobile money wallet within a few minutes.",
    transferId: transfer.id,
    transferStatus: transfer.status,
  };
}

/* -------------------------------------------------------------------------- */
/* Verifying                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Re-reads a transfer at Flutterwave and settles the payout on what it says.
 *
 * Safe to call repeatedly: `paid` is claimed with a conditional update, so
 * concurrent callers — the creator's polling and the cron sweep at once — leave
 * one row in one state.
 */
export async function verifyPayout({
  payoutId,
  providerId,
}: {
  payoutId: bigint;
  providerId?: bigint;
}): Promise<DisburseResult> {
  const payout = await prisma.payouts.findUnique({ where: { payout_id: payoutId } });

  if (!payout || (providerId !== undefined && payout.provider_id !== providerId)) {
    throw new PayoutError("We have no record of that payout.", 404);
  }

  if (payout.status === "paid") {
    return {
      status: "paid",
      message: "This payout has already been paid into your mobile money wallet.",
      transferId: payout.transfer_id,
      transferStatus: payout.transfer_status,
    };
  }

  if (payout.status !== "processing" || !payout.transfer_id) {
    return {
      status: payout.status as PayoutStatus,
      message: payoutStatusMessage(payout.status as PayoutStatus, payout.failure_reason),
      transferId: payout.transfer_id,
      transferStatus: payout.transfer_status,
    };
  }

  const transfer = await retrieveTransfer(payout.transfer_id);

  // Still in flight, or Flutterwave has not caught up with its own transfer yet.
  if (!transfer || (!isSettledTransferStatus(transfer.status) && !isFailedTransferStatus(transfer.status))) {
    if (transfer) {
      await prisma.payouts.updateMany({
        where: { payout_id: payoutId, status: "processing" },
        data: { transfer_status: transfer.status },
      });
    }
    return {
      status: "processing",
      message: "Your payout is on its way. We will mark it paid as soon as it lands.",
      transferId: payout.transfer_id,
      transferStatus: transfer?.status ?? payout.transfer_status,
    };
  }

  if (isFailedTransferStatus(transfer.status)) {
    const reason = transferFailureReason(transfer);
    await prisma.payouts.updateMany({
      where: { payout_id: payoutId, status: "processing" },
      data: {
        status: "failed",
        transfer_status: transfer.status,
        failure_reason: reason?.slice(0, 255) ?? "The payout did not go through.",
      },
    });
    return {
      status: "failed",
      message:
        reason ||
        "The payout did not go through. The amount is back in your balance — you can request it again.",
      transferId: payout.transfer_id,
      transferStatus: transfer.status,
    };
  }

  await prisma.payouts.updateMany({
    where: { payout_id: payoutId, status: "processing" },
    data: {
      status: "paid",
      transfer_status: transfer.status,
      paid_at: new Date(),
      failure_reason: null,
    },
  });

  return {
    status: "paid",
    message: "Paid — check your mobile money wallet.",
    transferId: payout.transfer_id,
    transferStatus: transfer.status,
  };
}

/** The stock line for a payout in a state verification cannot move on from. */
export function payoutStatusMessage(status: PayoutStatus, failureReason?: string | null) {
  switch (status) {
    case "requested":
      return "Waiting for an admin to approve this payout.";
    case "approved":
      return failureReason
        ? `Approved, but the last attempt did not go through: ${failureReason}`
        : "Approved. Send it to your mobile money wallet when you are ready.";
    case "rejected":
      return failureReason || "This payout request was rejected.";
    case "processing":
      return "Your payout is on its way to your mobile money wallet.";
    case "paid":
      return "Paid into your mobile money wallet.";
    case "failed":
      return failureReason
        ? `${failureReason} The amount is back in your balance.`
        : "The payout did not go through. The amount is back in your balance.";
    default:
      return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                              */
/* -------------------------------------------------------------------------- */

export interface PayoutSweepSummary {
  checked: number;
  paid: number;
  failed: number;
  stillProcessing: number;
  errors: number;
}

/**
 * Re-verifies every payout still in flight. Without webhooks this is what
 * closes a payout whose creator shut the tab before the transfer landed — the
 * money moves at Flutterwave and nothing on our side would otherwise hear.
 */
export async function reconcileProcessingPayouts(limit = 100): Promise<PayoutSweepSummary> {
  const processing = await prisma.payouts.findMany({
    where: { status: "processing", transfer_id: { not: null } },
    orderBy: { created_at: "asc" },
    take: limit,
  });

  const summary: PayoutSweepSummary = {
    checked: processing.length,
    paid: 0,
    failed: 0,
    stillProcessing: 0,
    errors: 0,
  };

  for (const payout of processing) {
    try {
      const result = await verifyPayout({ payoutId: payout.payout_id });
      if (result.status === "paid") summary.paid += 1;
      else if (result.status === "failed") summary.failed += 1;
      else summary.stillProcessing += 1;
    } catch (error) {
      // One unreachable transfer must not stop the rest of the sweep; the next
      // run picks this row up again.
      summary.errors += 1;
      console.error(`Failed to reconcile payout ${payout.reference}:`, error);
    }
  }

  return summary;
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                               */
/* -------------------------------------------------------------------------- */

type PayoutRow = Awaited<ReturnType<typeof requestPayout>>;

/** A payout as the browser sees it — BigInt and Decimal flattened out. */
export function serialisePayout(
  payout: PayoutRow & { provider?: { name: string; email: string } | null }
) {
  return {
    id: payout.payout_id.toString(),
    reference: payout.reference,
    providerId: payout.provider_id.toString(),
    providerName: payout.provider?.name ?? null,
    providerEmail: payout.provider?.email ?? null,
    amount: Number(payout.amount),
    currency: payout.currency,
    status: payout.status as PayoutStatus,
    network: payout.network,
    phoneNumber: payout.phone_number,
    accountName: payout.account_name,
    transferId: payout.transfer_id,
    transferStatus: payout.transfer_status,
    failureReason: payout.failure_reason,
    adminNote: payout.admin_note,
    statusMessage: payoutStatusMessage(
      payout.status as PayoutStatus,
      payout.status === "rejected" ? payout.admin_note : payout.failure_reason
    ),
    requestedAt: payout.created_at.toISOString(),
    reviewedAt: payout.reviewed_at?.toISOString() ?? null,
    paidAt: payout.paid_at?.toISOString() ?? null,
  };
}
