import { NextResponse } from "next/server";
import { getUserDataFromToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isUpgradeFrom,
  planCycle,
  planDurationDays,
  planPeriodLabel,
  planPriceSuffix,
  quoteUpgrade,
} from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * What the signed-in customer can move up to, and what each move would cost
 * once the unused days on their running plan are credited back.
 *
 * `POST /api/payment` prices the upgrade again from the same helper when the
 * charge is created, so a stale quote here cannot be paid against.
 */
export async function GET() {
  try {
    const user = await getUserDataFromToken();
    if (!user) {
      return NextResponse.json({ message: "Please sign in." }, { status: 401 });
    }

    const current = await prisma.user_subscriptions.findFirst({
      where: { user_id: BigInt(user.userId), is_active: true },
      orderBy: { end_date: "desc" },
      include: { subscriptions: true },
    });

    const now = new Date();

    // Nothing running means nothing to upgrade from — the customer subscribes
    // at the normal price instead.
    if (!current || current.end_date <= now) {
      return NextResponse.json({ eligible: false, current: null, options: [] });
    }

    const currentPlan = current.subscriptions;
    const currentCost = Number(currentPlan.cost);

    const plans = await prisma.subscriptions.findMany({
      where: { is_active: true },
      orderBy: { cost: "asc" },
    });

    const options = plans
      .filter((plan) =>
        isUpgradeFrom(
          { subscription_id: currentPlan.subscription_id, cost: currentCost },
          { subscription_id: plan.subscription_id, cost: Number(plan.cost) }
        )
      )
      .map((plan) => {
        const quote = quoteUpgrade({
          currentPlan,
          currentPlanCost: currentCost,
          currentEndDate: current.end_date,
          newPlanCost: Number(plan.cost),
          now,
        });

        return {
          subscription_id: plan.subscription_id,
          type: plan.type,
          description: plan.description,
          cost: plan.cost.toString(),
          billing_cycle: planCycle(plan),
          duration_count: plan.duration_count,
          duration_days: planDurationDays(plan),
          period_label: planPeriodLabel(plan),
          price_suffix: planPriceSuffix(plan),
          is_active: plan.is_active,
          credit: quote.credit,
          amount_due: quote.amountDue,
        };
      });

    return NextResponse.json({
      eligible: options.length > 0,
      current: {
        user_subscription_id: current.user_subscription_id.toString(),
        subscription_id: currentPlan.subscription_id,
        type: currentPlan.type,
        cost: currentPlan.cost.toString(),
        period_label: planPeriodLabel(currentPlan),
        end_date: current.end_date.toISOString().slice(0, 10),
        days_remaining: quoteUpgrade({
          currentPlan,
          currentPlanCost: currentCost,
          currentEndDate: current.end_date,
          newPlanCost: currentCost,
          now,
        }).daysRemaining,
      },
      options,
    });
  } catch (error) {
    console.error("Error building upgrade options:", error);
    return NextResponse.json(
      { message: "Failed to load upgrade options." },
      { status: 500 }
    );
  }
}
