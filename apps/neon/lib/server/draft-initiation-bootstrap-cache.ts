import "server-only";

import type { V4Session } from "@athyper/auth-bff";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildDocumentEditPermissionStamp } from "@/lib/server/document-edit-coordinator-identity";

const CACHE_TTL_MS = 15_000;
const CACHE_LIMIT = 100;
const cache = new Map<string, { record: RuntimeRecordRow; expiresAt: number }>();

export function writeDraftInitiationBootstrap(input: {
  session: V4Session;
  entityCode: string;
  record: RuntimeRecordRow;
}): void {
  const recordId = typeof input.record.id === "string" ? input.record.id : null;
  if (!recordId) return;
  pruneExpired();
  const key = buildKey(input.session, input.entityCode, recordId);
  cache.delete(key);
  cache.set(key, { record: structuredClone(input.record), expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function consumeDraftInitiationBootstrap(input: {
  session: V4Session;
  entityCode: string;
  recordId: string;
}): RuntimeRecordRow | undefined {
  const key = buildKey(input.session, input.entityCode, input.recordId);
  const entry = cache.get(key);
  cache.delete(key);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.record;
}

function buildKey(session: V4Session, entityCode: string, recordId: string): string {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  return [
    membership?.tenantId ?? "",
    session.planeKey ?? "",
    session.realmKey ?? "",
    session.userId,
    buildDocumentEditPermissionStamp(session),
    entityCode,
    recordId,
  ].join("\u0000");
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}
