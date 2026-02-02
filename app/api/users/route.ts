import { PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const userCount = await prisma.users.count();
    return NextResponse.json({ count: userCount });
  } catch (error) {
    console.error("Failed to fetch user count:", error);
    return NextResponse.json({ error: "Failed to fetch user count" }, { status: 500 });
  }
}

