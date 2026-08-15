import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import {
  RESET_TOKEN_TTL_SECONDS,
  clearAttempts,
  issueResetToken,
  registerAttempt,
} from "@/lib/password-reset";

const prisma = new PrismaClient();

/**
 * Step one of the reset: match the phone number the customer signs in with
 * against the email they registered. On a match we return a token that only
 * authorises setting a new password (see POST /api/reset-password).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!phone || !email) {
      return NextResponse.json(
        { message: "Phone number and email are required." },
        { status: 400 }
      );
    }

    // Throttle per phone number and per caller, so neither one account nor one
    // machine can grind through candidate emails.
    const callerIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (!registerAttempt(`phone:${phone}`) || !registerAttempt(`ip:${callerIp}`)) {
      return NextResponse.json(
        { message: "Too many attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    // Login matches the phone number exactly, so this does too.
    const user = await prisma.users.findFirst({
      where: { phone_number: phone },
      select: { user_id: true, name: true, email: true, password_hash: true },
    });

    // One message for "no such phone" and "email doesn't match", so this can't
    // be used to enumerate which phone numbers have accounts.
    if (!user || user.email.trim().toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        {
          message:
            "Those details don't match an account. Check the phone number and the email you registered with.",
        },
        { status: 400 }
      );
    }

    clearAttempts(`phone:${phone}`);
    clearAttempts(`ip:${callerIp}`);

    return NextResponse.json({
      message: "Identity confirmed. You can now set a new password.",
      name: user.name,
      resetToken: issueResetToken(user.user_id.toString(), user.password_hash),
      expiresInSeconds: RESET_TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { message: "An internal server error occurred." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
