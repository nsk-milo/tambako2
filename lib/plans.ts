// Everything the rest of the app needs to reason about a plan's length: how a
// plan the admin typed in is normalised, how long it runs for, and what an
// upgrade off a running one costs.

export const BILLING_CYCLES = ["daily", "weekly", "monthly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Days in one cycle, used for pricing arithmetic and rough comparisons. */
const DAYS_PER_CYCLE: Record<BillingCycle, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

/** A plan shorter than a week is a daily plan, whatever it was entered as. */
export const DAYS_IN_WEEK = 7;

/** The smallest charge a mobile money provider will accept, in ZMW. */
export const MIN_CHARGE_AMOUNT = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PlanPeriod {
  billing_cycle: string;
  duration_count: number;
  /** Only consulted for legacy rows that predate `billing_cycle`. */
  type?: string;
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return (
    typeof value === "string" &&
    BILLING_CYCLES.includes(value.trim().toLowerCase() as BillingCycle)
  );
}

/**
 * The cycle a plan really bills on. Rows seeded before plans carried a cycle
 * only have their label to go on — including the `dialy` misspelling that was
 * in the original seed data.
 */
export function planCycle(plan: PlanPeriod): BillingCycle {
  if (isBillingCycle(plan.billing_cycle)) {
    return plan.billing_cycle.trim().toLowerCase() as BillingCycle;
  }
  const label = plan.type?.trim().toLowerCase();
  if (label === "weekly") return "weekly";
  if (label === "monthly") return "monthly";
  return "daily";
}

export function planDurationCount(plan: PlanPeriod): number {
  const count = Number(plan.duration_count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
}

/** Roughly how many days one payment buys — exact except across month lengths. */
export function planDurationDays(plan: PlanPeriod): number {
  return DAYS_PER_CYCLE[planCycle(plan)] * planDurationCount(plan);
}

/**
 * Normalises what the admin entered into a cycle and a count.
 *
 * A duration that comes out shorter than a week is stored as a daily plan of
 * that many days, so "5 days" stays a daily plan instead of being rounded into
 * a week it does not cover.
 */
export function normalisePlanPeriod(
  cycle: unknown,
  count: unknown
): { billing_cycle: BillingCycle; duration_count: number } | null {
  if (!isBillingCycle(cycle)) return null;

  const requested = Number(count);
  if (!Number.isFinite(requested) || requested < 1) return null;

  const resolvedCycle = (cycle as string).trim().toLowerCase() as BillingCycle;
  const resolvedCount = Math.floor(requested);
  const days = DAYS_PER_CYCLE[resolvedCycle] * resolvedCount;

  if (days < DAYS_IN_WEEK) {
    return { billing_cycle: "daily", duration_count: days };
  }

  return { billing_cycle: resolvedCycle, duration_count: resolvedCount };
}

/** Adds one full plan period to `from`. */
export function periodEndDate(plan: PlanPeriod, from: Date): Date {
  const end = new Date(from);
  const count = planDurationCount(plan);

  switch (planCycle(plan)) {
    case "monthly":
      end.setMonth(end.getMonth() + count);
      break;
    case "weekly":
      end.setDate(end.getDate() + count * DAYS_IN_WEEK);
      break;
    default:
      end.setDate(end.getDate() + count);
      break;
  }

  return end;
}

/** "3 days", "1 week", "2 months" — how long one payment lasts, in words. */
export function planPeriodLabel(plan: PlanPeriod): string {
  const count = planDurationCount(plan);
  const unit = { daily: "day", weekly: "week", monthly: "month" }[planCycle(plan)];
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** What the price is quoted per, e.g. `K30.00 /month` or `K10.00 /3 days`. */
export function planPriceSuffix(plan: PlanPeriod): string {
  const count = planDurationCount(plan);
  if (count === 1) {
    return { daily: "day", weekly: "week", monthly: "month" }[planCycle(plan)];
  }
  return planPeriodLabel(plan);
}

/** Whole days left on a subscription, counting a part day as a day. */
export function daysRemaining(endDate: Date, now: Date = new Date()): number {
  const remaining = Math.ceil((endDate.getTime() - now.getTime()) / MS_PER_DAY);
  return remaining > 0 ? remaining : 0;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface UpgradeQuote {
  /** Value of the time left on the running plan, applied against the new one. */
  credit: number;
  /** What the customer pays now. */
  amountDue: number;
  daysRemaining: number;
}

/**
 * Prices an upgrade: the new plan, less whatever the unused days on the current
 * plan were worth. The credit can never exceed what was paid for the current
 * plan, and the charge never drops below what the gateway will accept.
 */
export function quoteUpgrade({
  currentPlan,
  currentPlanCost,
  currentEndDate,
  newPlanCost,
  now = new Date(),
}: {
  currentPlan: PlanPeriod;
  currentPlanCost: number;
  currentEndDate: Date;
  newPlanCost: number;
  now?: Date;
}): UpgradeQuote {
  const remaining = daysRemaining(currentEndDate, now);
  const dailyRate = currentPlanCost / Math.max(planDurationDays(currentPlan), 1);
  const credit = round2(Math.min(dailyRate * remaining, currentPlanCost));
  const amountDue = round2(Math.max(newPlanCost - credit, MIN_CHARGE_AMOUNT));

  return { credit, amountDue, daysRemaining: remaining };
}

/**
 * Whether moving to `target` from `current` is an upgrade at all: it has to be
 * a different plan that costs more — buying the same or a cheaper plan is a
 * renewal, which stacks onto the end of the current period instead.
 */
export function isUpgradeFrom(
  current: { subscription_id: number; cost: number },
  target: { subscription_id: number; cost: number }
): boolean {
  return (
    target.subscription_id !== current.subscription_id && target.cost > current.cost
  );
}
