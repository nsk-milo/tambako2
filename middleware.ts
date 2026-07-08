import { NextResponse } from "next/server"

// Session management is cookie-free: the JWT lives in localStorage and is sent
// as an `Authorization: Bearer` header. The Edge middleware cannot read
// localStorage, so route guarding happens on the client (see
// components/auth-guard.tsx) and every API route independently verifies the
// Bearer token via getUserDataFromToken(). This middleware is therefore a
// pass-through.
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.jpg|.*\\.jpeg|.*\\.png|.*\\.gif|.*\\.svg|.*\\.webp|.*\\.ico|.*\\.txt|.*\\.xml).*)",
  ],
}
