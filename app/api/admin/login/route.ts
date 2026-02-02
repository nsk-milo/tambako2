import { NextResponse } from "next/server"
import jwt, { sign,JwtPayload } from "jsonwebtoken"

// --- Mock Data and Functions ---
// In a real application, you would replace this with your actual database logic
// (e.g., using Prisma or Mongoose) to find a user and verify their password.

const mockAdminUser = {
  id: "admin-user-123",
  email: "admin@tambako.com",
  // In a real app, this would be a securely hashed password.
  // The plain text for this example is "adminpassword".
  password: "adminpassword",
  username: "Admin",
  role: "ADMIN",
}

async function findUserByEmail(email: string) {
  if (email.toLowerCase() === mockAdminUser.email) {
    return mockAdminUser
  }
  return null
}

async function verifyPassword(password: string, userPassword_DB: string) {
  // In a real app, use a library like bcrypt to compare the password hash.
  // e.g., `await bcrypt.compare(password, user.passwordHash)`
  return password === userPassword_DB
}
// --- End of Mock Data ---

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 })
    }

    // 1. Find the user in the database
    const user = await findUserByEmail(email)

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    // 2. Check if the user has the 'admin' role
    if (user.role !== "ADMIN") {
      return NextResponse.json({ message: "Access denied. Not an admin." }, { status: 403 })
    }

    // 3. Compare the provided password with the stored one
    const passwordsMatch = await verifyPassword(password, user.password)

    if (!passwordsMatch) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    // 4. Create JWT payload and sign the token
    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role }
    const token = sign(tokenPayload, process.env.JWT_SECRET!, { expiresIn: "1d" })

  
    // 5. Set the token in a secure, HTTP-only cookie
    const response = NextResponse.json({ message: "Login successful" }, { status: 200 })

    response.cookies.set("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/admin",
    })

    return response
  } catch (error) {
    console.error("Admin login error:", error)
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 })
  }
}

