import { PrismaClient } from "@/lib/generated/prisma";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { sign } from "jsonwebtoken";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {

    console.log("Received login request");

    const { phoneNumber, password } = await req.json();

    console.log("Parsed request body:", { phoneNumber, password });



    // Find the user by phone number
    const user = await prisma.users.findFirst({
      where: {
        phone_number: phoneNumber,
      },
      include:{
        role:true
      }
    });

    console.log("User found:", user); // Log the user object for debugging purposes

    if (!user) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Compare the provided password with the hashed password in the database
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 }
      );
    }

    console.log("User object:", user); // Add this for debugging


    
    // Create a JWT token
    const jwtSecret = process.env.JWT_SECRET || ""; // Use a strong, randomly generated secret in production

   

    const token = sign({ userId: user.user_id.toString(), phoneNumber: user.phone_number,username: user.name,role: user.role?.name }, jwtSecret, {
      expiresIn: '1h', // Token expires in 1 hour
    });

    // Return the token (and role) in the response body. The client stores it in
    // localStorage and sends it as an `Authorization: Bearer` header on requests.
    return NextResponse.json(
      { message: "Login successful", role: user.role?.name ?? null, token },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error("Error during login:", error);
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
