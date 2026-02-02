import { getUserDataFromToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // This function runs on the server, so it can safely access cookies
    // and use the logic within getUserDataFromToken.
    const user = await getUserDataFromToken();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "An internal server error occurred" },
      { status: 500 }
    );
  }
}

