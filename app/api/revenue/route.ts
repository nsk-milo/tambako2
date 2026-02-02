import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { getRevenueSummary } from "@/lib/analytics";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const revenue = await getRevenueSummary(prisma);
    return NextResponse.json({ totalRevenue: Number(revenue.totalRevenue) });
  } catch (error) {
    console.error("Error fetching total revenue:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
