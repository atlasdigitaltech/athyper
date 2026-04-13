import "server-only";
import { cookies } from "next/headers";

/**
 * Resolve the Redis session namespace from the neon_realm cookie.
 *
 * Namespace rules:
 *   neon_realm = "platform" → "platform"   (platform-control realm sessions)
 *   otherwise              → KEYCLOAK_REALM (default "athyper")
 *
 * Session keys are stored as `sess:{namespace}:{sid}` so platform and
 * tenant sessions never collide even when Redis is shared.
 *
 * This is the single authoritative implementation — used by every route
 * that reads or writes the Redis session.
 */
export async function resolveSessionNamespace(): Promise<string> {
  const cookieStore = await cookies();
  const realm = cookieStore.get("neon_realm")?.value;
  return realm === "platform" ? "platform" : (process.env.KEYCLOAK_REALM ?? "athyper");
}
