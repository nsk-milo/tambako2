import { NextResponse } from "next/server";


import bcrypt from "bcrypt";

import { getUserDataFromToken } from "@/lib/auth";
import { PrismaClient } from "@/lib/generated/prisma";


const prisma = new PrismaClient();

export async function PATCH(request: Request) {
  const session = await getUserDataFromToken();



  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: "Current and new passwords are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { user_id: BigInt(session!.userId) },
    });

    

    const isPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user!.password_hash
    );

    if (!isPasswordCorrect) {
      return NextResponse.json(
        { message: "Incorrect current password." },
        { status: 400 }
      );
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.users.update({
      where: { user_id: BigInt(session!.userId) },
      data: { password_hash: hashedNewPassword },
    });

    return NextResponse.json(
      { message: "Password updated successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Password update error:", error);
    return NextResponse.json(
      { message: "An internal server error occurred." },
      { status: 500 }
    );
  }
}
