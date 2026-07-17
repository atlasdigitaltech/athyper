import type { CacheClient } from "./session.service.js";

const namespaces = ["neon", "mesh", "admin", "platform"] as const;

/** Canonical, idempotent frontend-session termination primitive. */
export async function terminateFrontendSessions(
  cache: Pick<CacheClient, "smembers" | "del">,
  subjectId: string,
): Promise<number> {
  let terminated = 0;
  await Promise.allSettled(namespaces.map(async (namespace) => {
    const indexKey = `user_sessions:${namespace}:${subjectId}`;
    const sids = await cache.smembers?.(indexKey).catch(() => [] as string[]) ?? [];
    if (sids.length > 0) {
      await cache.del(sids.map((sid) => `sess:${namespace}:${sid}`));
      terminated += sids.length;
    }
    await cache.del(indexKey).catch(() => undefined);
  }));
  return terminated;
}
