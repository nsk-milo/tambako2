import axios from "axios";
import type { UserPayload } from "@/lib/auth";

// Session management is cookie-free: the JWT lives in localStorage and is sent
// as an `Authorization: Bearer <token>` header on every request.

const TOKEN_KEY = "authToken";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// Decode the JWT payload (no verification — that happens server-side). Returns
// null when there is no token or it has expired.
export function getClientUser(): UserPayload | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as UserPayload;
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearToken();
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Attach the Bearer token to every axios request. Reads the token at request
// time so it always reflects the latest login/logout state.
let interceptorInstalled = false;
export function installAuthInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  axios.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}

// For the few places that use the native fetch() against protected endpoints.
export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

// Install as soon as this module is evaluated on the client, before any
// component effect fires a request.
if (typeof window !== "undefined") {
  installAuthInterceptor();
}
