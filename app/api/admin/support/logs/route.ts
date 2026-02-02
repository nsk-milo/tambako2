import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const logs = await prisma.activity_logs.findMany({
      where: userId ? { user_id: BigInt(userId) } : undefined,
      orderBy: { created_at: "desc" },
      take: 50,
      include: { users: { select: { name: true, phone_number: true } } },
    });

    return NextResponse.json(
      logs.map((log) => ({
        id: log.log_id.toString(),
        userId: log.user_id.toString(),
        userName: log.users?.name ?? null,
        phoneNumber: log.users?.phone_number ?? null,
        action: log.action,
        details: log.details,
        createdAt: log.created_at,
      }))
    );
  } catch (error) {
    console.error("Admin logs error:", error);
    return NextResponse.json({ error: "Failed to load activity logs" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}