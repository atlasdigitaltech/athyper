import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_TTL_SECONDS } from "@/lib/auth/redis-keys";
import { MFA_PENDING_TTL_SECONDS } from "@/lib/auth/session-policy";

export const SESSION_COOKIE_NAME = "neon_sid";
export const CSRF_COOKIE_NAME = "__csrf";

/** SHA-256 hex digest of a string — used for IP/UA binding and CSRF hashing. */
export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Generate a random opaque session ID. */
export function generateSid(): string {
  return createHash("sha256")
    .update(randomUUID() + Date.now().toString())
    .digest("hex");
}

/** Read the opaque session ID from the httpOnly cookie. */
export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Set the httpOnly session cookie (browser never sees the value in JS). */
export async function setSessionCookie(
  sid: string,
  env: string,
  maxAgeSeconds = SESSION_TTL_SECONDS,
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/**
 * Set the CSRF token cookie (JS-readable, NOT httpOnly).
 * Used for the double-submit cookie CSRF pattern:
 *   client reads __csrf and sends it as X-CSRF-Token header.
 *   middleware verifies header == cookie value.
 */
export async function setCsrfCookie(
  token: string,
  env: string,
  maxAgeSeconds = SESSION_TTL_SECONDS,
): Promise<void> {
  const store = await cookies();
  store.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function clearCsrfCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CSRF_COOKIE_NAME);
}

export const MFA_PENDING_COOKIE = "neon_mfa_pending";

/** Set the MFA-pending cookie (JS-readable so middleware edge runtime can read it). */
export async function setMfaPendingCookie(
  env: string,
  maxAgeSeconds = MFA_PENDING_TTL_SECONDS,
): Promise<void> {
  const store = await cookies();
  store.set(MFA_PENDING_COOKIE, "1", {
    httpOnly: false,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearMfaPendingCookie(): Promise<void> {
  const store = await cookies();
  store.delete(MFA_PENDING_COOKIE);
}
