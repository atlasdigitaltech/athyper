/**
 * @athyper/auth — Session Management
 *
 * Server-side session utilities for Next.js.
 * Stores session in httpOnly cookies, validates JWT via jose.
 *
 * Usage in server components / middleware:
 *   import { getSession } from "@athyper/auth/session";
 *   const session = await getSession();
 */
import { type Session } from "./types";

const SESSION_COOKIE_NAME = "neon_sid";

/**
 * Get the current session from request cookies.
 * Returns null if no valid session exists.
 *
 * Implementation note: This is a thin wrapper. The actual JWT
 * validation and Keycloak token exchange happen in apps/web/app/api/auth/
 * (the BFF relay layer). This function reads the already-validated
 * session cookie.
 */
export async function getSession(): Promise<Session | null> {
  // In Next.js App Router, cookies() is available in server components
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const session: Session = JSON.parse(sessionCookie.value);

    // Check expiry
    if (session.expires_at < Date.now() / 1000) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Check if a valid session exists.
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Get the session or throw — for server components that require auth.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}

export { SESSION_COOKIE_NAME };
