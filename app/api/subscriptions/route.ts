import { PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const subscriptions = await prisma.subscriptions.findMany({
      orderBy: {
        cost: "asc", // Order plans by price
      },
    })
    console.log("Fetched subscriptions:", subscriptions);
    return NextResponse.json(subscriptions)
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    return NextResponse.json({ error: "Failed to fetch subscription plans." }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(request: Request) {
  try {
    const { type, cost } = await request.json();

    if (!type || cost === undefined) {
      return NextResponse.json(
        { error: "Plan type and cost are required." },
        { status: 400 }
      );
    }

    const newPlan = await prisma.subscriptions.create({
      data: { type, cost: parseFloat(cost) }, // Ensure cost is parsed to a number
    });

    return NextResponse.json(newPlan);
  } catch (error) {
    console.error("Error adding new subscription plan:", error);
    return NextResponse.json({ error: "Failed to add new subscription plan." }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function PUT(request: Request) {
  try {
    const { subscription_id, cost } = await request.json();

    if (!subscription_id || cost === undefined) {
      return NextResponse.json(
        { error: "Subscription ID and cost are required." },
        { status: 400 }
      );
    }

    const updatedPlan = await prisma.subscriptions.update({
      where: { subscription_id: Number(subscription_id) },
      data: { cost: parseFloat(cost) },
    });

    return NextResponse.json(updatedPlan);
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    return NextResponse.json(
      { error: "Failed to update subscription plan." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
