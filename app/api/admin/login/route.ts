import { NextResponse } from "next/server"
import bcrypt from "bcrypt"
import { sign } from "jsonwebtoken"
import { prisma } from "@/lib/prisma"

// Admin sign-in. Same session model as /api/login: cookie-free, with the JWT
// returned in the body for the client to hold and send as an
// `Authorization: Bearer` header. The payload has to match UserPayload —
// `userId` in particular, since routes such as the payout review write it to
// `payouts.reviewed_by`, a foreign key into users.

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 })
    }

    const user = await prisma.users.findUnique({
      where: { email: String(email).toLowerCase() },
      include: { role: true },
    })

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    if (user.role?.name !== "ADMIN") {
      return NextResponse.json({ message: "Access denied. Not an admin." }, { status: 403 })
    }

    const passwordsMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordsMatch) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    const token = sign(
      {
        userId: user.user_id.toString(),
        phoneNumber: user.phone_number,
        username: user.name,
        role: user.role.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    )

    return NextResponse.json(
      { message: "Login successful", role: user.role.name, token },
      { status: 200 }
    )
  } catch (error) {
    console.error("Admin login error:", error)
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 })
  }
}
