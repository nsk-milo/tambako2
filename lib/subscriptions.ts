import { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";

/** Adds one plan period to `from`, based on the plan's `type` column. */
export function periodEndDate(planType: string, from: Date) {
  const end = new Date(from);
  switch (planType.trim().toLowerCase()) {
    case "daily":
    case "dialy": // legacy spelling present in seeded data
      end.setDate(end.getDate() + 1);
      break;
    case "weekly":
      end.setDate(end.getDate() + 7);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    default:
      end.setDate(end.getDate() + 1);
      break;
  }
  return end;
}

/**
 * Marks a payment successful and grants the subscription it paid for, in one
 * transaction. Safe to call more than once for the same reference — the
 * customer's polling page and the reconciliation sweep can verify the same
 * charge at the same moment — because the status update is conditional on the
 * row still being unpaid.
 *
 * Returns `null` when the payment was already activated by an earlier call.
 */
export async function activatePaidSubscription({
  reference,
  providerReference,
  channel,
}: {
  reference: string;
  providerReference?: string | null;
  channel?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payments.findUnique({
      where: { reference },
      include: { subscriptions: true },
    });

    if (!payment) return null;

    // Claim the payment. `count === 0` means a concurrent caller (the cron
    // sweep vs. the customer's own polling) got here first, so there is nothing
    // left to do.
    const claimed = await tx.payments.updateMany({
      where: { reference, status: { not: "successful" } },
      data: {
        status: "successful",
        provider_reference: providerReference ?? undefined,
        channel: channel ?? undefined,
      },
    });

    if (claimed.count === 0) return null;

    const activeSubscription = await tx.user_subscriptions.findFirst({
      where: { user_id: payment.user_id, is_active: true },
      orderBy: { end_date: "desc" },
    });

    const now = new Date();
    // Stack a renewal on top of the remaining time instead of discarding it.
    const startDate =
      activeSubscription && activeSubscription.end_date > now ? activeSubscription.end_date : now;
    const endDate = periodEndDate(payment.subscriptions.type, startDate);

    await tx.user_subscriptions.updateMany({
      where: { user_id: payment.user_id, is_active: true },
      data: { is_active: false },
    });

    const userSubscription = await tx.user_subscriptions.create({
      data: {
        user_id: payment.user_id,
        subscription_id: payment.subscription_id,
        start_date: startDate,
        end_date: endDate,
        is_active: true,
      },
    });

    await tx.transactions.create({
      data: {
        user_id: payment.user_id,
        user_subscription_id: userSubscription.user_subscription_id,
        amount: new Prisma.Decimal(payment.amount),
      },
    });

    return { userSubscription, plan: payment.subscriptions, endDate };
  });
}
