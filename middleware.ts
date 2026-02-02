import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose" // Using 'jose' as it's Edge Runtime compatible

// Define a type for your JWT payload for better type safety
interface AuthTokenPayload {
  userId: string; // Or whatever your user ID type is
  username: string;
  role: "ADMIN" | "USER" | "ContentCreator"; // Or other roles you might have
  iat: number; // Issued at
  exp: number; // Expiration time
}

export async function middleware(request: NextRequest) {
  // 1. Environment Variable Check
  // Ensure the JWT_SECRET is configured, otherwise, authentication cannot work.
  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET environment variable is not set.");
    // In a production app, you might want to return a static 500 error page.
    return new NextResponse("Internal Server Error: Application is not configured correctly.", { status: 500 });
  }
  const path = request.nextUrl.pathname
  const authToken = request.cookies.get("authToken")?.value

  // Define paths that are accessible without authentication.
  // The root path '/' is now included as a public page.
  const publicPaths = ["/", "/login", "/register", "/landing", "/forgot-password", "/admin-login"]

  const isPublicPath = publicPaths.includes(path)

  // If accessing a public path without a token, allow access immediately.
  if (isPublicPath && !authToken) {
    return NextResponse.next();
  }

  // If there's no token and the path is protected, redirect to login.
  if (!authToken && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If we are here, it means a token exists. We need to verify it.
  if (authToken) {
    try {
      // The secret key needs to be a Uint8Array for jose
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      const { payload: decoded } = await jwtVerify<AuthTokenPayload>(authToken, secret);

      // Conditionally log payload in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log("Verified JWT Payload:", decoded);
      }

      const isAdmin = decoded.role === "ADMIN";

      // Role-based access control for admin routes
      if (path.startsWith("/admin") && !isAdmin) {
        console.warn(`Access denied for user ${decoded.userId} to admin path: ${path}`);
        return NextResponse.redirect(new URL("/", request.url));
      }

      // Define pages that are exclusively for unauthenticated users.
      const authPages = ["/","/login", "/register", "/admin-login"];

      // If an authenticated user tries to access an auth page (e.g., /login), redirect them.
      // This prevents a redirect loop on '/', which is public but not an 'auth' page.
      if (authPages.includes(path)) {
        console.info(`Authenticated user ${decoded.userId} attempted to access auth page: ${path}. Redirecting to home.`);
        return NextResponse.redirect(new URL("/home", request.url));
      }
    } catch (err) {
      console.error("JWT verification failed:", err instanceof Error ? err.message : "Unknown error");
      // The token is invalid. Redirect to login and clear the bad cookie.
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.set("authToken", "", { expires: new Date(0) });
      return response;
    }
  }

  return NextResponse.next()
}

export const config = {
  // Middleware typically runs in the 'edge' runtime for performance.
  runtime: "experimental-edge",
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.jpg|.*\\.jpeg|.*\\.png|.*\\.gif|.*\\.svg|.*\\.webp|.*\\.ico|.*\\.txt|.*\\.xml).*)",
  ],
}


// import { NextResponse } from "next/server"
// import type { NextRequest } from "next/server"

// export function middleware(request: NextRequest) {
//   const path = request.nextUrl.pathname
//   const authToken = request.cookies.get("authToken")?.value

//   // Define paths that are considered public and don't require authentication
//   const publicPaths = ["/login", "/register", "/landing", "/forgot-password","/","/admin-login"]

//   const isPublicPath = publicPaths.includes(path)

  

//   // If the user is authenticated
//   if (authToken) {
//     // If they try to access a public path like /login, redirect them to the home page
//     if (isPublicPath) {
//       return NextResponse.redirect(new URL("/", request.url))
//     }
//   } else {
//     // If the user is not authenticated and is trying to access a protected path
//     if (!isPublicPath) {
//       // Redirect them to the login page
//       return NextResponse.redirect(new URL("/login", request.url))
//     }
//   }

//   // Allow the request to proceed if none of the above conditions are met
//   return NextResponse.next()
// }

// // See "Matching Paths" below to learn more
// export const config = {
//   runtine: "nodejs",
//   matcher: [
//     /*
//      * Match all request paths except for the ones starting with:
//      * - api (API routes)
//      * - _next/static (static files)
//      * - _next/image (image optimization files)
//      * - favicon.ico (favicon file)
//      */
//      // - static files (images, fonts, etc.)
//      "/((?!api|_next/static|_next/image|favicon.ico|.*\\.jpg|.*\\.jpeg|.*\\.png|.*\\.gif|.*\\.svg|.*\\.webp|.*\\.ico|.*\\.txt|.*\\.xml).*)",
//   ],
// }