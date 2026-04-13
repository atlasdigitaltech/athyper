import "server-only";
import { cookies } from "next/headers";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { resolveSessionNamespace } from "@/lib/server/session-namespace";
import type { V4Session, OrgMembership } from "@/lib/auth/types";
export { parseOrgAlias } from "@/lib/auth/parse-org-alias";

/**
 * Read the full V4Session from Redis for use in Server Components.
 * Returns null if the session cookie is absent or the key has expired.
 */
export async function getServerSession(): Promise<V4Session | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) return null;

  const ns = await resolveSessionNamespace();

  try {
    const redis = await getSessionRedis();
    const raw = await redis.get(`sess:${ns}:${sid}`);
    if (!raw) return null;
    return JSON.parse(raw) as V4Session;
  } catch {
    return null;
  }
}

/**
 * Serializable shape of the session passed from Server Component → Client Component.
 * Contains only the fields the shell needs; no tokens, no hashes.
 */
export interface ShellSessionProps {
  userId: string;
  displayName: string;
  email?: string;
  organizations: Record<string, OrgMembership>;
  activeOrg: string | null;
  activeWorkbench: string | null;
}

/** Extract the shell-safe props from a full V4Session. */
export function toShellSessionProps(session: V4Session): ShellSessionProps {
  return {
    userId: session.userId,
    displayName: session.displayName,
    email: session.email,
    organizations: session.organizations,
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
  };
}
