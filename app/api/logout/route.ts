import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    // This is the core logic: it finds the 'authToken' cookie
    // and effectively deletes it by setting its expiration date to the past.
    (await
      // This is the core logic: it finds the 'authToken' cookie
      // and effectively deauthTokenletes it by setting its expiration date to the past.
      cookies()).set("authToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      expires: new Date(0), // Set expiration to a past date
      path: "/",
    });

    return NextResponse.json({ message: "Logout successful" }, { status: 200 });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { message: "An error occurred during logout." },
      { status: 500 }
    );
  }
}
