import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { V4Session } from "@athyper/auth-bff";
import type { DocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import {
  createDocumentEditRedisClient,
  type DocumentEditRedisClient,
} from "@/lib/server/document-edit-runtime-redis";

const DEFAULT_DRAFT_TTL_MS = 12 * 60 * 60_000;
const MEMORY_DRAFT_MAX = 500;
const REDIS_WARNING_INTERVAL_MS = 60_000;

interface MemoryDraftEntry {
  expiresAt: number;
  value: DocumentEditServerDraft;
}

export interface DocumentEditDraftScopeInput {
  session: V4Session;
  entityCode: string;
  recordId: string;
  record?: Record<string, unknown> | null;
  /** Stable workspace identity, when the caller has one. This value is only hashed into the Redis key. */
  workspaceId?: string;
  draftTtlMs?: number;
}

export interface DocumentEditServerDraftLine {
  collectionKey: string | null;
  lineEntityCode: string | null;
  lineId: string;
  values: Record<string, unknown>;
  draftVersion?: string;
  updatedAt: string;
}

export interface DocumentEditServerDraftChange {
  scope: "core" | "line";
  scopeKey: string;
  field: string;
  draftVersion?: string;
  tabId?: string;
  clientSeq?: number;
  updatedAt: string;
}

export interface DocumentEditServerDraft {
  persisted: true;
  draftId: string;
  entityCode: string;
  recordId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  core: Record<string, unknown> | null;
  lines: Record<string, DocumentEditServerDraftLine>;
  lastChange?: DocumentEditServerDraftChange;
  lastChangeByScope?: Record<string, DocumentEditServerDraftChange>;
}

export class DocumentEditDraftConflictError extends Error {
  readonly code = "DRAFT_REVISION_CONFLICT";
  constructor(readonly currentRevision: number | null) {
    super("This draft changed in another editing session. Reload before saving more changes.");
  }
}

const DRAFT_COMPARE_AND_SET = `
local current = redis.call('GET', KEYS[1])
if not current then
  if ARGV[1] ~= '0' then return {0, 0} end
else
  local parsed = cjson.decode(current)
  if tostring(parsed.revision or 0) ~= ARGV[1] then return {0, parsed.revision or 0} end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return {1, tonumber(ARGV[4])}
`;

export interface DocumentEditDraftSummary {
  persisted: boolean;
  /** Recovery cache only; never the source of truth for committed business data. */
  authoritative: false;
  purpose: "crash_recovery";
  draftId?: string;
  revision?: number;
  updatedAt?: string;
  expiresAt?: string;
  corePersisted?: boolean;
  lineDraftCount?: number;
  mode: "server_draft" | "client_draft";
  message: string;
}

export interface DocumentEditDraftRecoveryStatus {
  mode: "optional" | "required";
  backend: "redis";
  memoryFallbackEnabled: boolean;
  outcomes: Readonly<Record<DraftOutcome, number>>;
}

type DraftOutcome = "expired" | "evicted" | "conflict" | "fallback" | "cleanup";
const draftOutcomes: Record<DraftOutcome, number> = {
  expired: 0,
  evicted: 0,
  conflict: 0,
  fallback: 0,
  cleanup: 0,
};

/** Configuration-only health payload; it never probes Redis on a liveness request. */
export function documentEditDraftRecoveryStatus(): DocumentEditDraftRecoveryStatus {
  return {
    mode: draftRecoveryRequired() ? "required" : "optional",
    backend: "redis",
    memoryFallbackEnabled: memoryFallbackEnabled(),
    outcomes: { ...draftOutcomes },
  };
}

const memoryDrafts = new Map<string, MemoryDraftEntry>();
let redisWarningLastAt = 0;

export function documentEditDraftSummary(draft: DocumentEditServerDraft | null): DocumentEditDraftSummary {
  if (!draft) {
    return {
      persisted: false,
      authoritative: false,
      purpose: "crash_recovery",
      mode: "client_draft",
      message: "No server draft is currently persisted for this edit session.",
    };
  }

  return {
    persisted: true,
    authoritative: false,
    purpose: "crash_recovery",
    draftId: draft.draftId,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    expiresAt: draft.expiresAt,
    corePersisted: Boolean(draft.core),
    lineDraftCount: Object.keys(draft.lines).length,
    mode: "server_draft",
    message: "A server draft is persisted for recovery and duplicate-tab coordination.",
  };
}

export async function readDocumentEditServerDraft(
  input: DocumentEditDraftScopeInput | DocumentEditRuntimeRouteContext,
): Promise<DocumentEditServerDraft | null> {
  const key = buildDocumentEditDraftKey(input);
  const ttlMs = readDraftTtlMs(input);
  const memory = memoryDrafts.get(key);
  if (memoryFallbackEnabled() && memory && memory.expiresAt > Date.now()) return memory.value;

  const redis = await getDraftRedisClient();
  if (!redis) {
    if (draftRecoveryRequired()) throw new Error("DOCUMENT_EDIT_DRAFT_STORE_UNAVAILABLE");
    recordDraftOutcome("fallback");
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = parseDraft(raw);
    if (!parsed) return null;
    if (memoryFallbackEnabled()) rememberDraft(key, parsed, ttlMs);
    return parsed;
  } catch (error) {
    if (draftRecoveryRequired()) throw error;
    return null;
  }
}

export async function upsertDocumentEditServerDraft(input: {
  scope: DocumentEditDraftScopeInput | DocumentEditRuntimeRouteContext;
  kind: "core" | "line";
  values: Record<string, unknown>;
  sourceField: string;
  draftVersion?: string;
  tabId?: string;
  clientSeq?: number;
  /** Revision observed immediately before this write; required for Redis CAS. */
  expectedRevision: number;
  lineId?: string | null;
  lineEntityCode?: string | null;
  collectionKey?: string | null;
}): Promise<DocumentEditServerDraft> {
  const key = buildDocumentEditDraftKey(input.scope);
  const ttlMs = readDraftTtlMs(input.scope);
  const existing = await readDocumentEditServerDraft(input.scope);
  const draftScopeKey = buildDraftChangeScopeKey(input);
  if (existing && isStaleDraftChange(existing, draftScopeKey, input)) return existing;

  const now = new Date();
  // Draft lifetime is an absolute recovery-policy window, not a sliding TTL.
  // Otherwise a busy (or faulty) client can keep sensitive recovery state
  // alive indefinitely by repeatedly writing it.
  const expiresAt = existing ? new Date(existing.expiresAt) : new Date(now.getTime() + ttlMs);
  const remainingTtlMs = expiresAt.getTime() - now.getTime();
  if (!Number.isFinite(remainingTtlMs) || remainingTtlMs <= 0) {
    recordDraftOutcome("expired");
    throw new Error("DOCUMENT_EDIT_DRAFT_EXPIRED");
  }
  const next: DocumentEditServerDraft = existing
    ? {
      persisted: true,
      draftId: existing.draftId,
      entityCode: existing.entityCode,
      recordId: existing.recordId,
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      core: existing.core,
      lines: { ...existing.lines },
      ...(existing.lastChange ? { lastChange: existing.lastChange } : {}),
      lastChangeByScope: { ...(existing.lastChangeByScope ?? {}) },
    }
    : {
      persisted: true,
      draftId: randomUUID(),
      entityCode: input.scope.entityCode,
      recordId: input.scope.recordId,
      revision: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      core: null,
      lines: {},
      lastChangeByScope: {},
    };

  if (input.kind === "line") {
    const lineId = readDraftLineId(input);
    const lineKey = `${input.collectionKey ?? "lines"}:${lineId}`;
    next.lines[lineKey] = {
      collectionKey: input.collectionKey ?? null,
      lineEntityCode: input.lineEntityCode ?? null,
      lineId,
      values: input.values,
      ...(input.draftVersion ? { draftVersion: input.draftVersion } : {}),
      updatedAt: now.toISOString(),
    };
  } else {
    next.core = input.values;
  }

  const change: DocumentEditServerDraftChange = {
    scope: input.kind,
    scopeKey: draftScopeKey,
    field: input.sourceField,
    updatedAt: now.toISOString(),
    ...(input.draftVersion ? { draftVersion: input.draftVersion } : {}),
    ...(input.tabId ? { tabId: input.tabId } : {}),
    ...(typeof input.clientSeq === "number" ? { clientSeq: input.clientSeq } : {}),
  };
  next.lastChange = change;
  next.lastChangeByScope = {
    ...(next.lastChangeByScope ?? {}),
    [draftScopeKey]: change,
  };

  const redis = await getDraftRedisClient();
  if (redis) {
    const expectedRevision = input.expectedRevision;
    const outcome = await redis.eval(DRAFT_COMPARE_AND_SET, {
      keys: [key],
      arguments: [
        String(expectedRevision),
        JSON.stringify(next),
        String(Math.max(1, Math.floor(remainingTtlMs / 1000))),
        String(next.revision),
      ],
    }) as unknown;
    const result = Array.isArray(outcome) ? outcome : [];
    if (Number(result[0]) !== 1) {
      recordDraftOutcome("conflict");
      throw new DocumentEditDraftConflictError(
        typeof result[1] === "number" ? result[1] : Number(result[1]) || null,
      );
    }
    if (memoryFallbackEnabled()) rememberDraft(key, next, remainingTtlMs);
  } else if (memoryFallbackEnabled()) {
    recordDraftOutcome("fallback");
    rememberDraft(key, next, remainingTtlMs);
  } else {
    // Recovery is optional by default: normal document submit continues, but
    // no process-local state is presented as shared cross-instance state.
    throw new Error("DOCUMENT_EDIT_DRAFT_STORE_UNAVAILABLE");
  }

  return next;
}

function isStaleDraftChange(
  existing: DocumentEditServerDraft,
  draftScopeKey: string,
  input: {
    kind: "core" | "line";
    tabId?: string;
    clientSeq?: number;
  },
): boolean {
  if (!existing || !input.tabId || typeof input.clientSeq !== "number") return false;

  const scopedChange = existing.lastChangeByScope?.[draftScopeKey];
  if (
    scopedChange?.tabId === input.tabId
    && typeof scopedChange.clientSeq === "number"
    && scopedChange.clientSeq >= input.clientSeq
  ) {
    return true;
  }

  const legacyChange = existing.lastChange;
  return !existing.lastChangeByScope
    && legacyChange?.scope === input.kind
    && legacyChange.tabId === input.tabId
    && typeof legacyChange.clientSeq === "number"
    && legacyChange.clientSeq >= input.clientSeq;
}

function buildDraftChangeScopeKey(input: {
  kind: "core" | "line";
  lineId?: string | null;
  draftVersion?: string;
  collectionKey?: string | null;
}): string {
  if (input.kind === "core") return "core";
  return `${input.collectionKey ?? "lines"}:${readDraftLineId(input)}`;
}

function readDraftLineId(input: {
  lineId?: string | null;
  draftVersion?: string;
}): string {
  return input.lineId && input.lineId.trim() ? input.lineId : input.draftVersion ?? "new";
}

export async function deleteDocumentEditServerDraft(
  input: DocumentEditDraftScopeInput | DocumentEditRuntimeRouteContext,
): Promise<boolean> {
  const key = buildDocumentEditDraftKey(input);
  const hadMemory = memoryFallbackEnabled() && memoryDrafts.delete(key);
  const redis = await getDraftRedisClient();
  if (!redis) return hadMemory;
  try {
    const deleted = await redis.del(key);
    if (deleted > 0) recordDraftOutcome("cleanup");
    return hadMemory || deleted > 0;
  } catch {
    return hadMemory;
  }
}

function buildDocumentEditDraftKey(
  input: DocumentEditDraftScopeInput | DocumentEditRuntimeRouteContext,
): string {
  const normalized = normalizeScopeInput(input);
  const identity = buildDocumentEditCoordinatorIdentity(
    normalized.session,
    normalized.record ?? undefined,
  );
  const membership = normalized.session.activeOrg
    ? normalized.session.organizations[normalized.session.activeOrg]
    : undefined;
  const payload = {
    tenantId: identity?.tenantId ?? membership?.tenantId,
    planeKey: identity?.planeKey ?? normalized.session.planeKey,
    realmKey: identity?.realmKey ?? normalized.session.realmKey,
    activeOrg: normalized.session.activeOrg,
    activeWorkbench: normalized.session.activeWorkbench,
    principal: normalized.session.userId,
    permissionStamp: identity?.permissionStamp,
    entityCode: normalized.entityCode,
    physicalRecordId: typeof normalized.record?.id === "string" && normalized.record.id.trim()
      ? normalized.record.id.trim()
      : normalized.recordId,
    workspaceId: normalized.workspaceId ?? null,
  };
  return `document-edit:draft:v1:${hashJson(payload)}`;
}

function normalizeScopeInput(
  input: DocumentEditDraftScopeInput | DocumentEditRuntimeRouteContext,
): DocumentEditDraftScopeInput {
  const runtimeWorkspaceId = "editRuntime" in input
    ? readRuntimeWorkspaceId(input.editRuntime)
    : undefined;
  return {
    session: input.session,
    entityCode: input.entityCode,
    recordId: input.recordId,
    record: "record" in input ? input.record as Record<string, unknown> : input.record,
    workspaceId: runtimeWorkspaceId ?? ("workspaceId" in input ? input.workspaceId : undefined),
    draftTtlMs: "editRuntime" in input ? input.editRuntime.draftPolicy.expiryMs : input.draftTtlMs,
  };
}

function readRuntimeWorkspaceId(editRuntime: unknown): string | undefined {
  if (!isRecord(editRuntime)) return undefined;
  const planHash = editRuntime["planHash"];
  return typeof planHash === "string" && planHash.trim() ? planHash.trim() : undefined;
}

function readDraftTtlMs(input: DocumentEditDraftScopeInput | DocumentEditRuntimeRouteContext): number {
  const ttlMs = "editRuntime" in input ? input.editRuntime.draftPolicy.expiryMs : input.draftTtlMs;
  return typeof ttlMs === "number" && Number.isFinite(ttlMs) && ttlMs > 0
    ? ttlMs
    : DEFAULT_DRAFT_TTL_MS;
}

function rememberDraft(key: string, value: DocumentEditServerDraft, ttlMs = DEFAULT_DRAFT_TTL_MS): void {
  pruneDraftMemory();
  memoryDrafts.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

function pruneDraftMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memoryDrafts) {
    if (entry.expiresAt <= now) {
      memoryDrafts.delete(key);
      recordDraftOutcome("expired");
    }
  }
  while (memoryDrafts.size >= MEMORY_DRAFT_MAX) {
    const first = memoryDrafts.keys().next().value as string | undefined;
    if (!first) break;
    memoryDrafts.delete(first);
    recordDraftOutcome("evicted");
  }
}

async function getDraftRedisClient(): Promise<DocumentEditRedisClient | null> {
  try {
    return await createDocumentEditRedisClient({ logPrefix: "[document-edit/drafts/redis]" });
  } catch (error) {
    const now = Date.now();
    if (now - redisWarningLastAt > REDIS_WARNING_INTERVAL_MS) {
      redisWarningLastAt = now;
      console.warn("[document-edit/drafts] redis unavailable; server draft recovery disabled", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

function memoryFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.DOCUMENT_EDIT_DRAFT_MEMORY_FALLBACK?.trim().toLowerCase() === "true";
}

function draftRecoveryRequired(): boolean {
  return process.env.DOCUMENT_EDIT_DRAFT_RECOVERY_REQUIRED?.trim().toLowerCase() === "true";
}

function recordDraftOutcome(outcome: DraftOutcome): void {
  draftOutcomes[outcome] += 1;
  console.info("[document-edit/draft-metric]", { outcome });
}

function parseDraft(raw: string): DocumentEditServerDraft | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const draft = parsed as Partial<DocumentEditServerDraft>;
    if (draft.persisted !== true || typeof draft.draftId !== "string") return null;
    if (typeof draft.entityCode !== "string" || typeof draft.recordId !== "string") return null;
    return {
      persisted: true,
      draftId: draft.draftId,
      entityCode: draft.entityCode,
      recordId: draft.recordId,
      revision: typeof draft.revision === "number" ? draft.revision : 1,
      createdAt: typeof draft.createdAt === "string" ? draft.createdAt : new Date().toISOString(),
      updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : new Date().toISOString(),
      expiresAt: typeof draft.expiresAt === "string" ? draft.expiresAt : new Date(Date.now() + DEFAULT_DRAFT_TTL_MS).toISOString(),
      core: isRecord(draft.core) ? draft.core : null,
      lines: isRecord(draft.lines) ? draft.lines as Record<string, DocumentEditServerDraftLine> : {},
      ...(isRecord(draft.lastChange) ? { lastChange: draft.lastChange as DocumentEditServerDraft["lastChange"] } : {}),
      ...(isRecord(draft.lastChangeByScope) ? { lastChangeByScope: draft.lastChangeByScope as Record<string, DocumentEditServerDraftChange> } : {}),
    };
  } catch {
    return null;
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 32);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
