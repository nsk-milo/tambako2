import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const generateTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 10);

    const updatedUser = await prisma.users.update({
      where: { user_id: BigInt(userId) },
      data: { password_hash: hashed },
    });

    await prisma.activity_logs.create({
      data: {
        user_id: updatedUser.user_id,
        action: "PASSWORD_RESET",
        details: "Temporary password reset by admin",
      },
    });

    return NextResponse.json({
      message: "Password reset successfully",
      temporaryPassword: tempPassword,
    });
  } catch (error) {
    console.error("Admin reset password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}