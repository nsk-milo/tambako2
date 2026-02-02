import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { getAdminAnalytics } from "@/lib/analytics";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const analytics = await getAdminAnalytics(prisma);
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Failed to load admin analytics" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}