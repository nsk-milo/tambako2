import { PrismaClient } from "@/lib/generated/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt"

const prisma = new PrismaClient();

export async function POST(request: Request) {
  // console.log("Received POST request to /api/register");
  try {
    const { name, email, phone_number, password } = await request.json();

    // console.log("Received registration data:", { name, email, phone_number });

    if (!name || !email || !phone_number || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [{ email: email }, { phone_number: phone_number }],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email or phone number already exists" },
        { status: 409 }
      );
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await prisma.users.create({
      data: {
        name,
        email,
        phone_number,
        password_hash,
        roleId: 3 // Default role ID for regular users
      },
    });

    

    return NextResponse.json(
      {
        message: "User registered successfully",
        userId: newUser.user_id.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    // console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error. Registration failed "+error},
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

const getProviderBasedOnPhoneNumberPrefix = (phoneNumber: string) => {
  if (phoneNumber.startsWith("26095") || phoneNumber.startsWith("26075")) {
    return "zamtel";
  }
  if (phoneNumber.startsWith("26096") || phoneNumber.startsWith("26076")) {
    return "mtn";
  }
  if (
    phoneNumber.startsWith("26097") ||
    phoneNumber.startsWith("26057") ||
    phoneNumber.startsWith("26077")
  ) {
    return "airtel";
  }
};
