import type { CacheClient } from "./session.service.js";

const namespaces = ["neon", "mesh", "admin", "platform"] as const;

/** Canonical, idempotent frontend-session termination primitive. */
export async function terminateFrontendSessions(
  cache: Pick<CacheClient, "smembers" | "del">,
  subjectId: string,
  realmKey?: string,
): Promise<number> {
  let terminated = 0;
  for (const realm of realmKey ? [realmKey] : ["athyper", "platform-control"]) {
    const realmIndex = `realm_subject_sessions:${realm}:${subjectId}`;
    const realmEntries = await cache.smembers?.(realmIndex).catch(() => [] as string[]) ?? [];
    for (const entry of realmEntries) {
      const separator = entry.indexOf(":");
      if (separator < 1) continue;
      await cache.del(`sess:${entry.slice(0, separator)}:${entry.slice(separator + 1)}`);
      terminated++;
    }
    await cache.del(realmIndex).catch(() => undefined);
  }

  // Compatibility cleanup for sessions created before realm-scoped indexes.
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
