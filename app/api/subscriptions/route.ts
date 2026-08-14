import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  BILLING_CYCLES,
  normalisePlanPeriod,
  planCycle,
  planDurationDays,
  planPeriodLabel,
  planPriceSuffix,
} from "@/lib/plans";

type PlanRow = {
  subscription_id: number;
  type: string;
  description: string | null;
  cost: Prisma.Decimal;
  billing_cycle: string;
  duration_count: number;
  is_active: boolean;
};

/** The shape both the admin screen and the subscribe page read plans in. */
const serialise = (plan: PlanRow) => ({
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
});

const MAX_TYPE_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 255;

interface PlanInput {
  type: string;
  description: string | null;
  cost: Prisma.Decimal;
  billing_cycle: string;
  duration_count: number;
  is_active: boolean;
}

/** Validates the fields a plan is created with, and the ones an edit changes. */
function readPlanInput(
  body: Record<string, unknown>
): { error: string; data?: undefined } | { error?: undefined; data: PlanInput } {
  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!type) return { error: "Give the plan a name." };
  if (type.length > MAX_TYPE_LENGTH) {
    return { error: `Plan name must be ${MAX_TYPE_LENGTH} characters or fewer.` };
  }

  const cost = Number(body.cost);
  if (!Number.isFinite(cost) || cost < 0) {
    return { error: "Enter a price of zero or more." };
  }

  const period = normalisePlanPeriod(body.billing_cycle, body.duration_count ?? 1);
  if (!period) {
    return {
      error: `Choose a billing cycle (${BILLING_CYCLES.join(", ")}) and a duration of at least 1.`,
    };
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
      : null;

  return {
    data: {
      type,
      description,
      cost: new Prisma.Decimal(cost.toFixed(2)),
      billing_cycle: period.billing_cycle,
      duration_count: period.duration_count,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    },
  };
}

/**
 * Lists plans, cheapest first. Retired plans are held back unless the caller
 * asks for them — the admin screen does, the subscribe page does not.
 */
export async function GET(request: Request) {
  try {
    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "true";

    const plans = await prisma.subscriptions.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: { cost: "asc" },
    });

    return NextResponse.json(plans.map(serialise));
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription plans." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { data, error: invalid } = readPlanInput(await request.json());
    if (!data) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const newPlan = await prisma.subscriptions.create({ data });
    return NextResponse.json(serialise(newPlan));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A plan with that name already exists." },
        { status: 409 }
      );
    }
    console.error("Error adding new subscription plan:", error);
    return NextResponse.json(
      { error: "Failed to add new subscription plan." },
      { status: 500 }
    );
  }
}

/**
 * Edits a plan in place. Changing the price or the period only affects payments
 * made from here on — subscriptions already granted keep the end date they were
 * given.
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const planId = Number(body.subscription_id);

    if (!Number.isInteger(planId) || planId <= 0) {
      return NextResponse.json(
        { error: "Subscription ID is required." },
        { status: 400 }
      );
    }

    const existing = await prisma.subscriptions.findUnique({
      where: { subscription_id: planId },
    });
    if (!existing) {
      return NextResponse.json({ error: "That plan no longer exists." }, { status: 404 });
    }

    // An edit may touch one field or all of them; anything left out keeps the
    // value the plan already has.
    const input = readPlanInput({
      type: body.type ?? existing.type,
      description: body.description === undefined ? existing.description : body.description,
      cost: body.cost ?? existing.cost.toString(),
      billing_cycle: body.billing_cycle ?? planCycle(existing),
      duration_count: body.duration_count ?? existing.duration_count,
      is_active: body.is_active === undefined ? existing.is_active : body.is_active,
    });

    if (!input.data) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }

    const updatedPlan = await prisma.subscriptions.update({
      where: { subscription_id: planId },
      data: input.data,
    });

    return NextResponse.json(serialise(updatedPlan));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A plan with that name already exists." },
        { status: 409 }
      );
    }
    console.error("Error updating subscription plan:", error);
    return NextResponse.json(
      { error: "Failed to update subscription plan." },
      { status: 500 }
    );
  }
}

/**
 * Removes a plan. A plan anyone has ever subscribed to or paid for is retired
 * instead of deleted, so their subscription and payment history stays intact.
 */
export async function DELETE(request: Request) {
  try {
    const planId = Number(new URL(request.url).searchParams.get("subscription_id"));

    if (!Number.isInteger(planId) || planId <= 0) {
      return NextResponse.json(
        { error: "Subscription ID is required." },
        { status: 400 }
      );
    }

    const [subscribers, payments] = await Promise.all([
      prisma.user_subscriptions.count({ where: { subscription_id: planId } }),
      prisma.payments.count({ where: { subscription_id: planId } }),
    ]);

    if (subscribers > 0 || payments > 0) {
      const retired = await prisma.subscriptions.update({
        where: { subscription_id: planId },
        data: { is_active: false },
      });
      return NextResponse.json({
        message:
          "This plan has been used before, so it was retired instead of deleted. It is no longer offered to customers.",
        retired: true,
        plan: serialise(retired),
      });
    }

    await prisma.subscriptions.delete({ where: { subscription_id: planId } });
    return NextResponse.json({ message: "Plan deleted.", retired: false });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "That plan no longer exists." }, { status: 404 });
    }
    console.error("Error deleting subscription plan:", error);
    return NextResponse.json(
      { error: "Failed to delete subscription plan." },
      { status: 500 }
    );
  }
}
