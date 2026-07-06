import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    // Expire the 'authToken' cookie. We clear it on every path it may have been
    // set on: "/" (the normal login flow) and "/admin" (the legacy admin-login
    // flow), otherwise a path-scoped cookie survives and keeps the user logged in.
    const cookieStore = await cookies();
    const expired = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0), // Set expiration to a past date
      maxAge: 0,
    };

    cookieStore.set("authToken", "", { ...expired, path: "/" });
    cookieStore.set("authToken", "", { ...expired, path: "/admin" });

    return NextResponse.json({ message: "Logout successful" }, { status: 200 });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { message: "An error occurred during logout." },
      { status: 500 }
    );
  }
}
