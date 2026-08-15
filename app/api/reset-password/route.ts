import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { PrismaClient } from "@/lib/generated/prisma";
import {
  MIN_PASSWORD_LENGTH,
  passwordFingerprint,
  verifyResetToken,
} from "@/lib/password-reset";

const prisma = new PrismaClient();

/**
 * Step two of the reset: exchange the token from POST /api/forgot-password for
 * a new password. The token carries a fingerprint of the password hash it was
 * issued against, so it is refused once that password has already been
 * changed — which is what makes it single-use.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resetToken =
      typeof body.resetToken === "string" ? body.resetToken : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (!resetToken || !newPassword) {
      return NextResponse.json(
        { message: "Reset token and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        },
        { status: 400 }
      );
    }

    const payload = verifyResetToken(resetToken);
    if (!payload) {
      return NextResponse.json(
        { message: "This reset link has expired. Please start again." },
        { status: 400 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { user_id: BigInt(payload.userId) },
      select: { user_id: true, password_hash: true },
    });

    if (!user || passwordFingerprint(user.password_hash) !== payload.pwd) {
      return NextResponse.json(
        { message: "This reset link has already been used. Please start again." },
        { status: 400 }
      );
    }

    await prisma.users.update({
      where: { user_id: user.user_id },
      data: { password_hash: await bcrypt.hash(newPassword, 10) },
    });

    await prisma.activity_logs.create({
      data: {
        user_id: user.user_id,
        action: "PASSWORD_RESET",
        details: "Password reset by the account holder",
      },
    });

    return NextResponse.json({
      message: "Password updated. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { message: "An internal server error occurred." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
