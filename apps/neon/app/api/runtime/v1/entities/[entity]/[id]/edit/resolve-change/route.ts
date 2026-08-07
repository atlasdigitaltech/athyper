import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  ResolveChangeRequestSchema,
  ResolveChangeResponseSchema,
  type DocumentEditRuntimeContract,
  type ResolveChangeInvalidation,
  type ResolveChangeResponse,
} from "@athyper/runtime-contracts";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import { normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import {
  DocumentEditDraftConflictError,
  readDocumentEditServerDraft,
  upsertDocumentEditServerDraft,
} from "@/lib/server/document-edit-runtime-drafts";
import {
  createDocumentEditRedisClient,
  type DocumentEditRedisClient,
} from "@/lib/server/document-edit-runtime-redis";
import { loadDocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import { validateDocumentEditWorkspace } from "@/lib/server/document-edit-workspace-validation";
import { POST as resolveDefaults } from "../../../defaults/resolve/route";

const IDEMPOTENCY_WARNING_INTERVAL_MS = 60_000;

interface MemoryEntry {
  expiresAt: number;
  value: ResolveChangeResponse;
}

const memoryIdempotency = new Map<string, MemoryEntry>();
let redisWarningLastAt = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to resolve this change.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;
  const workspace = validateDocumentEditWorkspace({ request, context: loaded.context });
  if (!workspace.ok) return workspace.response;
  const {
    session,
    entityCode,
    recordId,
    editRuntime,
    record,
  } = loaded.context;

  const body = await readJson(request);
  const parsed = ResolveChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_RESOLVE_CHANGE_REQUEST",
        message: "Field change request does not match the document edit runtime contract.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (input.entityCode !== entityCode || normalizeRouteRecordId(input.recordId) !== recordId) {
    return NextResponse.json(
      { error: "ROUTE_BODY_MISMATCH", message: "Route entity/record does not match resolve-change body." },
      { status: 400 },
    );
  }

  const idempotencyKey = buildIdempotencyKey(session, input.idempotencyKey);
  const cached = await readCachedResponse(idempotencyKey);
  if (cached) {
    return NextResponse.json(
      cached,
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Document-Edit-Cache": "idempotency",
          "X-Document-Edit-Server-Ms": String(Math.max(0, Date.now() - startedAt)),
        },
      },
    );
  }

  const response = await resolveChange({
    request,
    entityCode,
    recordId,
    contract: editRuntime,
    input,
    startedAt,
  });
  if (response.accepted) {
    try {
      await persistResolvedDraft({
        session,
        entityCode,
        recordId,
        record,
        draftTtlMs: editRuntime.draftPolicy.expiryMs,
        workspaceId: workspace.scope.planHash,
        input,
        response,
      });
    } catch (error) {
      if (error instanceof DocumentEditDraftConflictError) {
        return NextResponse.json(
          {
            error: error.code,
            message: error.message,
            currentRevision: error.currentRevision,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw error;
    }
  }
  await writeCachedResponse(idempotencyKey, editRuntime.idempotencyPolicy.ttlMs, response);

  return NextResponse.json(
    response,
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Document-Edit-Cache": "none",
        "X-Document-Edit-Server-Ms": String(response.telemetry.serverMs ?? Math.max(0, Date.now() - startedAt)),
      },
    },
  );
}

async function persistResolvedDraft(input: {
  session: V4Session;
  entityCode: string;
  recordId: string;
  record: Record<string, unknown>;
  draftTtlMs: number;
  workspaceId: string;
  input: ReturnType<typeof ResolveChangeRequestSchema.parse>;
  response: ResolveChangeResponse;
}): Promise<void> {
  try {
    const lineContext = readLineResolveContext(input.input.currentDraft);
    const draft = applyResolvedDraftPatch({
      currentDraft: input.input.currentDraft,
      sourceField: input.input.sourceField,
      newValue: input.input.newValue,
      patch: input.response.patch,
      clearedFields: input.response.clearedFields,
      lineScope: Boolean(lineContext),
    });
    const existing = await readDocumentEditServerDraft({
      session: input.session,
      entityCode: input.entityCode,
      recordId: input.recordId,
      record: input.record,
      draftTtlMs: input.draftTtlMs,
      workspaceId: input.workspaceId,
    });
    await upsertDocumentEditServerDraft({
      scope: {
        session: input.session,
        entityCode: input.entityCode,
        recordId: input.recordId,
        record: input.record,
        draftTtlMs: input.draftTtlMs,
        workspaceId: input.workspaceId,
      },
      kind: lineContext ? "line" : "core",
      values: draft,
      sourceField: input.input.sourceField,
      expectedRevision: existing?.revision ?? 0,
      draftVersion: input.input.draftVersion,
      tabId: input.input.tabId,
      clientSeq: input.input.clientSeq,
      lineId: lineContext?.lineId,
      lineEntityCode: lineContext?.lineEntityCode,
      collectionKey: lineContext?.collectionKey,
    });
  } catch (error) {
    if (error instanceof DocumentEditDraftConflictError) throw error;
    if (error instanceof Error && error.message === "DOCUMENT_EDIT_DRAFT_STORE_UNAVAILABLE"
      && process.env.DOCUMENT_EDIT_DRAFT_RECOVERY_REQUIRED?.trim().toLowerCase() === "true") {
      throw error;
    }
    console.warn("[document-edit/resolve-change] failed to persist server draft", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function applyResolvedDraftPatch(input: {
  currentDraft: Record<string, unknown>;
  sourceField: string;
  newValue: unknown;
  patch: Record<string, unknown>;
  clearedFields: string[];
  lineScope: boolean;
}): Record<string, unknown> {
  const base = {
    ...input.currentDraft,
    [input.sourceField]: input.newValue,
    ...input.patch,
  };
  for (const field of input.clearedFields) delete base[field];
  return input.lineScope ? stripInternalDraftFields(base) : base;
}

async function resolveChange(input: {
  request: NextRequest;
  entityCode: string;
  recordId: string;
  contract: DocumentEditRuntimeContract;
  input: ReturnType<typeof ResolveChangeRequestSchema.parse>;
  startedAt: number;
}): Promise<ResolveChangeResponse> {
  const lineContext = readLineResolveContext(input.input.currentDraft);
  const draft = {
    ...input.input.currentDraft,
    [input.input.sourceField]: input.input.newValue,
  };
  const defaultsEntityCode = lineContext?.lineEntityCode ?? input.entityCode;
  const defaultsRecordId = lineContext?.lineId && lineContext.lineId !== "new"
    ? lineContext.lineId
    : input.recordId;
  const oldValues = lineContext ? stripInternalDraftFields(input.input.currentDraft) : input.input.currentDraft;
  const newValues = lineContext ? stripInternalDraftFields(draft) : draft;
  const defaultsRequest = new Request(
    new URL(`/api/runtime/v1/entities/${encodeURIComponent(defaultsEntityCode)}/defaults/resolve`, input.request.url),
    {
      method: "POST",
      headers: input.request.headers,
      body: JSON.stringify({
        recordId: defaultsRecordId,
        changedFields: [input.input.sourceField],
        oldValues,
        newValues,
        provenance: {},
        rowStatus: readString(newValues["status"]),
      }),
    },
  ) as NextRequest;

  const defaultsResponse = await resolveDefaults(defaultsRequest, {
    params: Promise.resolve({ entity: defaultsEntityCode }),
  });
  const defaultsBody = await defaultsResponse.json().catch(() => null) as unknown;
  if (!defaultsResponse.ok) {
    return ResolveChangeResponseSchema.parse({
      accepted: false,
      code: "DEFAULT_RESOLVE_FAILED",
      category: defaultsResponse.status >= 500 ? "internal" : "invalid",
      retryable: defaultsResponse.status >= 500,
      patch: {},
      clearedFields: [],
      invalidations: buildInvalidations(input.contract, input.input.sourceField),
      defaults: [],
      sectionVersionUpdates: {},
      telemetry: {
        serverMs: Math.max(0, Date.now() - input.startedAt),
        lineScope: lineContext ? 1 : 0,
      },
    });
  }

  const patch = readRecord(defaultsBody, "valueUpdates") ?? {};
  const clearedFields = readStringArray(readRecordValue(defaultsBody, "clearedFields"));

  return ResolveChangeResponseSchema.parse({
    accepted: true,
    patch,
    clearedFields,
    invalidations: buildInvalidations(input.contract, input.input.sourceField),
    defaults: Object.entries(patch).map(([field, value]) => ({
      field,
      value,
      provenance: "resolved",
    })),
    sectionVersionUpdates: {},
    telemetry: {
      serverMs: Math.max(0, Date.now() - input.startedAt),
      patchFieldCount: Object.keys(patch).length,
      clearedFieldCount: clearedFields.length,
      lineScope: lineContext ? 1 : 0,
    },
  });
}

function readLineResolveContext(draft: Record<string, unknown>): {
  lineEntityCode: string;
  lineId: string | null;
  collectionKey: string | null;
} | null {
  if (draft["__documentEditScope"] !== "line") return null;
  const lineEntityCode = readString(draft["__lineEntityCode"]);
  if (!lineEntityCode) return null;
  return {
    lineEntityCode,
    lineId: readString(draft["__lineId"]),
    collectionKey: readString(draft["__collectionKey"]),
  };
}

function stripInternalDraftFields(draft: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (key.startsWith("__documentEdit") || key.startsWith("__line") || key === "__collectionKey" || key === "__panelKey" || key === "__mode") {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function buildInvalidations(
  contract: DocumentEditRuntimeContract,
  sourceField: string,
): ResolveChangeInvalidation[] {
  const out = new Map<string, ResolveChangeInvalidation>();
  const sectionKeys = new Set(contract.sections.map((section) => section.key));

  for (const dependency of contract.fieldDependencies) {
    if (dependency.sourceField !== sourceField) continue;
    for (const key of [...dependency.invalidates, ...dependency.marksStale]) {
      addInvalidation(out, sectionKeys.has(key) ? "section" : "field_options", key);
    }
    for (const key of dependency.clears) {
      addInvalidation(out, "field_options", key);
    }
  }

  for (const optionField of contract.optionFields) {
    if (optionField.dependsOn.includes(sourceField)) {
      addInvalidation(out, "field_options", optionField.field);
    }
  }

  for (const addressRole of contract.addressRoles) {
    if (addressRole.invalidateOn.includes(sourceField) || addressRole.ownerInputs.includes(sourceField)) {
      addInvalidation(out, "address_role", addressRole.role);
    }
  }

  return [...out.values()];
}

function addInvalidation(
  out: Map<string, ResolveChangeInvalidation>,
  type: ResolveChangeInvalidation["type"],
  key: string,
): void {
  out.set(`${type}:${key}`, { type, key });
}

async function readCachedResponse(cacheKey: string): Promise<ResolveChangeResponse | null> {
  const memory = memoryIdempotency.get(cacheKey);
  if (memory && memory.expiresAt > Date.now()) return memory.value;

  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(cacheKey);
    if (!raw) return null;
    const parsed = ResolveChangeResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    rememberInMemory(cacheKey, 10_000, parsed.data);
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeCachedResponse(
  cacheKey: string,
  ttlMs: number,
  value: ResolveChangeResponse,
): Promise<void> {
  rememberInMemory(cacheKey, ttlMs, value);
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(cacheKey, JSON.stringify(value), {
      EX: Math.max(1, Math.ceil(ttlMs / 1000)),
    });
  } catch {
    // In-memory idempotency remains active for this process.
  }
}

function rememberInMemory(cacheKey: string, ttlMs: number, value: ResolveChangeResponse): void {
  pruneMemoryIdempotency();
  memoryIdempotency.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

function pruneMemoryIdempotency(): void {
  if (memoryIdempotency.size < 500) return;
  const now = Date.now();
  for (const [key, entry] of memoryIdempotency.entries()) {
    if (entry.expiresAt <= now) memoryIdempotency.delete(key);
  }
  while (memoryIdempotency.size >= 500) {
    const oldest = memoryIdempotency.keys().next().value;
    if (typeof oldest !== "string") break;
    memoryIdempotency.delete(oldest);
  }
}

async function getRedisClient(): Promise<DocumentEditRedisClient | null> {
  try {
    return await createDocumentEditRedisClient({ logPrefix: "[document-edit/resolve-change/redis]" });
  } catch (error) {
    const now = Date.now();
    if (now - redisWarningLastAt > IDEMPOTENCY_WARNING_INTERVAL_MS) {
      redisWarningLastAt = now;
      console.warn("[document-edit/resolve-change] redis unavailable; using in-process idempotency", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

function buildIdempotencyKey(session: V4Session, idempotencyKey: string): string {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const payload = JSON.stringify({
    planeKey: session.planeKey,
    realmKey: session.realmKey,
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
    tenantId: membership?.tenantId,
    roles: [...new Set(membership?.roles ?? [])].sort(),
    userId: session.userId,
    idempotencyKey,
  });
  return `edit:resolve-change:v1:${createHash("sha256").update(payload).digest("base64url")}`;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function readRecordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
