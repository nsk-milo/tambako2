"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getClientUser } from "@/lib/http";

// Paths that never require authentication.
const PUBLIC_PATHS = ["/", "/login", "/register", "/landing", "/forgot-password", "/admin-login"];
// Auth-only pages an already-logged-in user should be redirected away from.
const AUTH_PAGES = ["/", "/login", "/register", "/admin-login"];

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

// Cookie-free route guarding. Middleware can't read localStorage, so the same
// rules the middleware used to enforce now run on the client after each
// navigation. APIs still verify the Bearer token independently.
export function AuthGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const user = getClientUser();
    const isPublic = PUBLIC_PATHS.includes(pathname);

    if (!user) {
      if (!isPublic) router.replace("/login");
      return;
    }

    const isAdmin = user.role === "ADMIN";

    if (isAdmin) {
      // Admins are confined to the admin area.
      if (!isAdminPath(pathname)) router.replace("/admin");
      return;
    }

    // Non-admins cannot access admin routes.
    if (isAdminPath(pathname)) {
      router.replace("/");
      return;
    }

    // Logged-in non-admins shouldn't sit on auth-only pages.
    if (AUTH_PAGES.includes(pathname)) {
      router.replace("/home");
    }
  }, [pathname, router]);

  return null;
}
