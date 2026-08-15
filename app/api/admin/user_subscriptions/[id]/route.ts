import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { requireAdmin } from "@/lib/auth";
import { daysRemaining, planPeriodLabel } from "@/lib/plans";

const prisma = new PrismaClient();

// Keyed by `user_subscription_id` — one row of the admin subscriptions table —
// unlike /api/user_subscriptions/[id], which takes a user id and answers with
// whichever subscription is newest.

const asDate = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;

/** Everything the View dialog shows for one subscription. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    let subscriptionId: bigint;
    try {
      subscriptionId = BigInt(id);
    } catch {
      return NextResponse.json({ error: "Invalid subscription id." }, { status: 400 });
    }

    const record = await prisma.user_subscriptions.findUnique({
      where: { user_subscription_id: subscriptionId },
      select: {
        user_subscription_id: true,
        user_id: true,
        subscription_id: true,
        is_active: true,
        start_date: true,
        end_date: true,
        created_at: true,
        updated_at: true,
        users: {
          select: {
            name: true,
            email: true,
            phone_number: true,
            created_at: true,
            role: { select: { name: true } },
          },
        },
        subscriptions: {
          select: {
            subscription_id: true,
            type: true,
            cost: true,
            billing_cycle: true,
            duration_count: true,
          },
        },
        transactions: {
          orderBy: { created_at: "desc" },
          take: 10,
          select: { transaction_id: true, amount: true, created_at: true },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }

    // Payments are recorded against the user and the plan rather than the
    // subscription row, so show the customer's recent ones for context.
    const payments = await prisma.payments.findMany({
      where: { user_id: record.user_id },
      orderBy: { created_at: "desc" },
      take: 5,
      select: {
        payment_id: true,
        reference: true,
        amount: true,
        currency: true,
        status: true,
        channel: true,
        network: true,
        created_at: true,
      },
    });

    return NextResponse.json({
      user_subscription_id: record.user_subscription_id.toString(),
      user_id: record.user_id.toString(),
      subscription_id: record.subscription_id,
      is_active: record.is_active,
      start_date: asDate(record.start_date),
      end_date: asDate(record.end_date),
      created_at: record.created_at?.toISOString() ?? null,
      updated_at: record.updated_at?.toISOString() ?? null,
      days_remaining: record.end_date ? daysRemaining(record.end_date) : 0,
      user: {
        name: record.users.name,
        email: record.users.email,
        phone_number: record.users.phone_number,
        role: record.users.role?.name ?? null,
        joined_at: record.users.created_at?.toISOString() ?? null,
      },
      plan: {
        subscription_id: record.subscriptions.subscription_id,
        type: record.subscriptions.type,
        cost: record.subscriptions.cost.toString(),
        billing_cycle: record.subscriptions.billing_cycle,
        duration_count: record.subscriptions.duration_count,
        period_label: planPeriodLabel(record.subscriptions),
      },
      transactions: record.transactions.map((transaction) => ({
        transaction_id: transaction.transaction_id.toString(),
        amount: transaction.amount.toString(),
        created_at: transaction.created_at?.toISOString() ?? null,
      })),
      payments: payments.map((payment) => ({
        payment_id: payment.payment_id.toString(),
        reference: payment.reference,
        amount: payment.amount.toString(),
        currency: payment.currency,
        status: payment.status,
        channel: payment.channel,
        network: payment.network,
        created_at: payment.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching subscription detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * What the Edit dialog saves: the plan the customer is on, when their access
 * ends, and whether it is active. Every field is optional — only what is sent
 * is changed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    let subscriptionId: bigint;
    try {
      subscriptionId = BigInt(id);
    } catch {
      return NextResponse.json({ error: "Invalid subscription id." }, { status: 400 });
    }

    const existing = await prisma.user_subscriptions.findUnique({
      where: { user_subscription_id: subscriptionId },
      select: {
        user_id: true,
        subscription_id: true,
        start_date: true,
        end_date: true,
        is_active: true,
        subscriptions: { select: { type: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }

    const body = await request.json();
    const data: {
      subscription_id?: number;
      end_date?: Date;
      is_active?: boolean;
      updated_at: Date;
    } = { updated_at: new Date() };
    const changes: string[] = [];

    if (body.subscription_id !== undefined && body.subscription_id !== null) {
      const planId = Number(body.subscription_id);
      if (!Number.isInteger(planId)) {
        return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
      }
      const plan = await prisma.subscriptions.findUnique({
        where: { subscription_id: planId },
        select: { subscription_id: true, type: true },
      });
      if (!plan) {
        return NextResponse.json({ error: "That plan no longer exists." }, { status: 400 });
      }
      if (plan.subscription_id !== existing.subscription_id) {
        data.subscription_id = plan.subscription_id;
        changes.push(`plan ${existing.subscriptions.type} → ${plan.type}`);
      }
    }

    if (body.end_date !== undefined && body.end_date !== null) {
      const endDate = new Date(`${String(body.end_date).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
      }
      if (existing.start_date && endDate < existing.start_date) {
        return NextResponse.json(
          { error: "End date cannot be before the start date." },
          { status: 400 }
        );
      }
      if (asDate(endDate) !== asDate(existing.end_date)) {
        data.end_date = endDate;
        changes.push(`ends ${asDate(existing.end_date)} → ${asDate(endDate)}`);
      }
    }

    if (typeof body.is_active === "boolean" && body.is_active !== existing.is_active) {
      data.is_active = body.is_active;
      changes.push(body.is_active ? "reactivated" : "cancelled");
    }

    const updated = await prisma.user_subscriptions.update({
      where: { user_subscription_id: subscriptionId },
      data,
      select: {
        user_subscription_id: true,
        user_id: true,
        is_active: true,
        start_date: true,
        end_date: true,
        users: { select: { name: true, email: true, phone_number: true } },
        subscriptions: { select: { subscription_id: true, type: true, cost: true } },
      },
    });

    if (changes.length > 0) {
      await prisma.activity_logs.create({
        data: {
          user_id: existing.user_id,
          action: "SUBSCRIPTION_UPDATED",
          details: `Admin updated subscription: ${changes.join(", ")}`.slice(0, 255),
        },
      });
    }

    // Shaped like a row of GET /api/user_subscriptions so the table can swap it
    // straight in.
    return NextResponse.json({
      message: changes.length > 0 ? "Subscription updated." : "No changes to save.",
      subscription: {
        user_subscription_id: updated.user_subscription_id.toString(),
        user_id: updated.user_id.toString(),
        users: updated.users,
        is_active: updated.is_active,
        start_date: asDate(updated.start_date),
        end_date: asDate(updated.end_date),
        subscriptions: {
          subscription_id: updated.subscriptions.subscription_id,
          type: updated.subscriptions.type,
          cost: updated.subscriptions.cost.toString(),
        },
      },
    });
  } catch (error) {
    console.error("Error updating subscription:", error);
    return NextResponse.json(
      { error: "Failed to update subscription." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
