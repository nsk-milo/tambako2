import { useState, useEffect } from "react";
import { getClientUser } from "@/lib/http";
import type { UserPayload } from "@/lib/auth";

// Reads the current user by decoding the JWT from localStorage. Runs only after
// mount to avoid a server/client hydration mismatch (localStorage is client-only).
export function useCurrentUser(): UserPayload | null {
  const [user, setUser] = useState<UserPayload | null>(null);

  useEffect(() => {
    setUser(getClientUser());
  }, []);

  return user;
}
