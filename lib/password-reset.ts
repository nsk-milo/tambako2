// The self-service password reset flow.
//
// There is no SMS or email gateway wired up, so a reset link can't be
// delivered out of band. Instead the customer proves who they are with two
// facts only the account holder should hold together — the phone number they
// sign in with and the email they registered — and the server hands back a
// short-lived token that authorises exactly one thing: setting a new password.
//
// The token is bound to the password hash it was issued against, so it stops
// working the moment the password changes. That makes it single-use and
// retires any older token still in flight.

import { createHash } from "crypto";
import { sign, verify } from "jsonwebtoken";

export const RESET_TOKEN_TTL_SECONDS = 10 * 60;
export const MIN_PASSWORD_LENGTH = 6;

const PURPOSE = "password_reset";

interface ResetTokenPayload {
  purpose: string;
  userId: string;
  /** Fingerprint of the password hash in force when the token was issued. */
  pwd: string;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  return secret;
}

/** A short, non-reversible marker for the current password hash. */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
}

export function issueResetToken(userId: string, passwordHash: string): string {
  const payload: ResetTokenPayload = {
    purpose: PURPOSE,
    userId,
    pwd: passwordFingerprint(passwordHash),
  };
  return sign(payload, jwtSecret(), { expiresIn: RESET_TOKEN_TTL_SECONDS });
}

/**
 * Decodes a reset token, or null when it is malformed, expired, signed with
 * another secret, or a session token being passed off as a reset token.
 */
export function verifyResetToken(token: string): ResetTokenPayload | null {
  try {
    const decoded = verify(token, jwtSecret()) as Partial<ResetTokenPayload>;
    if (decoded.purpose !== PURPOSE || !decoded.userId || !decoded.pwd) {
      return null;
    }
    return { purpose: PURPOSE, userId: decoded.userId, pwd: decoded.pwd };
  } catch {
    return null;
  }
}

// Identity checks are guessable by brute force — a phone number is public and
// an email often is too. Cap how fast one phone number can be tried. In-memory
// is per-process and resets on deploy, which is enough to make guessing slow
// without adding a table.
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; windowStart: number }>();

/** Returns false once a key has burned through its attempts for the window. */
export function registerAttempt(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.windowStart > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

/** Clears the counter once the caller has proved who they are. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}
