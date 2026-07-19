export const RECORD_WORKSPACE_OBSERVABILITY_EVENT = "athyper:record-workspace-observability";

export type RecordWorkspaceResource =
  | "core"
  | "process"
  | "approvals"
  | "lifecycle"
  | "collections"
  | "versions"
  | "comments"
  | "attachments"
  | "activity"
  | "support";

export interface RecordWorkspaceObservedRequest {
  resource: RecordWorkspaceResource;
  surface: string;
  requestKey: string;
  familyKey: string;
  instanceKey?: string;
  startedAtMs: number;
  durationMs: number;
  transferBytes: number;
  encodedBodyBytes: number;
  decodedBodyBytes: number;
  initiatorType: string;
  serverTiming?: ReadonlyArray<{ name: string; durationMs: number }>;
}

export interface RecordWorkspaceMetricGroup {
  key: string;
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
  totalTransferBytes: number;
}

export interface RecordWorkspaceDuplicateRequest {
  requestKey: string;
  calls: number;
  totalDurationMs: number;
}

export interface RecordWorkspaceNPlusOneFamily {
  familyKey: string;
  calls: number;
  distinctInstances: number;
  totalDurationMs: number;
}

export interface RecordWorkspaceObservabilitySnapshot {
  schemaVersion: 1;
  kind: "athyper.record-workspace-baseline";
  entityCode: string;
  renderer: string;
  recordKeyHash: string;
  observedAtMs: number;
  totals: {
    calls: number;
    durationMs: number;
    transferBytes: number;
    duplicateCalls: number;
    nPlusOneCalls: number;
  };
  resources: RecordWorkspaceMetricGroup[];
  surfaces: RecordWorkspaceMetricGroup[];
  duplicates: RecordWorkspaceDuplicateRequest[];
  nPlusOne: RecordWorkspaceNPlusOneFamily[];
  requests: RecordWorkspaceObservedRequest[];
}

export interface RecordWorkspaceRequestClassification {
  resource: RecordWorkspaceResource;
  requestKey: string;
  familyKey: string;
  instanceKey?: string;
}

interface ClassifyInput {
  url: string;
  entityCode: string;
  recordIds: readonly string[];
}

/**
 * Maps the current runtime endpoints to stable, identifier-free resource
 * families. This is deliberately observational: it does not alter fetch,
 * query keys, caching, or retry behaviour.
 */
export function classifyRecordWorkspaceRequest({
  url,
  entityCode,
  recordIds,
}: ClassifyInput): RecordWorkspaceRequestClassification | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://record-workspace.local");
  } catch {
    return null;
  }

  const path = decodeURIComponent(parsed.pathname);
  const normalizedEntity = normalizeEntityCode(entityCode);
  const aliases = recordIds.map((value) => value.trim()).filter(Boolean);
  const identityQueryKeys = ["entityId", "entity_id", "recordId", "record_id", "id"];
  const recordMatch = aliases.some((value) =>
    path.includes(value)
    || identityQueryKeys.some((key) => parsed.searchParams.get(key) === value),
  );

  if (path.startsWith(`/app/${entityCode}/`) || path.startsWith(`/app/${entityCode.replaceAll("_", "-")}/`)) {
    if (!recordMatch) return null;
    return classification("core", "record.rsc", "record.rsc");
  }

  const commentItem = /^\/api\/collab\/comments\/([^/]+)\/(attachments|reactions)(?:\/|$)/.exec(path);
  if (commentItem) {
    const itemHash = stableHash(commentItem[1]!);
    const child = commentItem[2]!;
    return classification(
      "comments",
      `comments.item.${child}.${itemHash}`,
      `comments.item.${child}`,
      itemHash,
    );
  }

  if (path === "/api/collab/comments" || path.startsWith("/api/collab/comments/")) {
    if (aliases.length > 0 && !recordMatch) return null;
    const queryKind = path.endsWith("/unread-count") ? "unread" : path === "/api/collab/comments" ? "list" : "item";
    return classification("comments", `comments.${queryKind}.${safeQueryShape(parsed)}`, `comments.${queryKind}`);
  }

  if (path.startsWith("/api/collab/drafts")) {
    if (aliases.length > 0 && !recordMatch) return null;
    return classification("comments", `comments.draft.${safeQueryShape(parsed)}`, "comments.draft");
  }

  if (path.includes("/api/metadata/lookups/master.comment_intent")) {
    return classification("comments", "comments.intent", "comments.intent");
  }

  if (/\/api\/(?:relay\/api\/)?documents\/[^/]+\/[^/]+\/attachments(?:\/|$)/.test(path)) {
    if (aliases.length > 0 && !recordMatch) return null;
    return classification("attachments", "attachments.list", "attachments.list");
  }
  if (/\/api\/(?:relay\/api\/)?documents\/[^/]+\/[^/]+\/folders(?:\/|$)/.test(path)) {
    if (aliases.length > 0 && !recordMatch) return null;
    return classification("attachments", "attachments.folders", "attachments.folders");
  }
  if (path.includes("/api/collab/entity-attachments") || path === "/api/collab/attachments") {
    return classification("attachments", `attachments.collab.${safeQueryShape(parsed)}`, "attachments.collab");
  }

  if (/\/api\/(?:relay\/api\/)?activity\/[^/]+\/[^/]+/.test(path)) {
    if (aliases.length > 0 && !recordMatch) return null;
    return classification("activity", "activity.list", "activity.list");
  }

  if (path.includes("/snapshots")) {
    return classification("versions", `snapshots.${snapshotRequestKind(path)}`, "snapshots");
  }
  if (path.includes("/versions")) {
    return classification("lifecycle", "lifecycle.timeline", "lifecycle.timeline");
  }
  if (path.includes("/approvals")) {
    return classification("approvals", "approvals.list", "approvals.list");
  }
  if (path.includes("/workflow") || path.includes("/status-route") || path.endsWith("/lifecycle")) {
    return classification("process", processRequestKey(path), "process.state");
  }

  const relationMatch = /\/api\/runtime\/v1\/entities\/([^/]+)\/relations\/([^/]+)\/records\/([^/?]+)/.exec(path);
  if (relationMatch) {
    if (normalizeEntityCode(relationMatch[1]!) !== normalizedEntity && !recordMatch) return null;
    return classification(
      "collections",
      `collection.${safeToken(relationMatch[2]!)}.${safeQueryShape(parsed)}`,
      `collection.${safeToken(relationMatch[2]!)}`,
    );
  }

  if (/\/api\/runtime\/v1\/entities\/[^/]+\/rules(?:\/|$)/.test(path)) {
    return classification("collections", "collection.rules", "collection.rules");
  }
  if (/\/api\/relay\/api\/metadata\/entities\/[^/]+\/compiled(?:\/|$)/.test(path)) {
    return classification("collections", "collection.child-metadata", "collection.child-metadata");
  }

  const directRecord = /\/api\/(?:relay\/api\/)?records\/([^/]+)\/([^/?]+)/.exec(path);
  if (directRecord) {
    const itemHash = stableHash(directRecord[2]!);
    return classification(
      "collections",
      `collection.reference.${safeToken(directRecord[1]!)}.${itemHash}`,
      `collection.reference.${safeToken(directRecord[1]!)}`,
      itemHash,
    );
  }

  if (path === "/api/auth/touch" || path === "/api/auth/session" || path === "/api/me/preferences") {
    return classification("support", safeToken(path.slice(5).replaceAll("/", ".")), "workspace.support");
  }
  if (path === "/api/iam/parameters/effective") {
    return classification("support", `support.parameters.${safeQueryShape(parsed)}`, "support.parameters");
  }

  const runtimeRecord = new RegExp(`/api/runtime/v1/entities/${escapeRegExp(entityCode)}(?:/[^/?]+)?(?:\\?|$)`).test(path);
  if (runtimeRecord && (recordMatch || aliases.length === 0)) {
    return classification("core", "record.core", "record.core");
  }

  return null;
}

export function buildRecordWorkspaceObservabilitySnapshot(input: {
  entityCode: string;
  renderer: string;
  recordId: string;
  observedAtMs: number;
  requests: readonly RecordWorkspaceObservedRequest[];
}): RecordWorkspaceObservabilitySnapshot {
  const requests = [...input.requests].sort((left, right) => left.startedAtMs - right.startedAtMs);
  const resources = aggregateMetrics(requests, (request) => request.resource);
  const surfaces = aggregateMetrics(requests, (request) => request.surface);

  const exactGroups = groupBy(requests, (request) => request.requestKey);
  const duplicates = [...exactGroups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([requestKey, items]) => ({
      requestKey,
      calls: items.length,
      totalDurationMs: round(items.reduce((sum, item) => sum + item.durationMs, 0)),
    }))
    .sort((left, right) => right.calls - left.calls || left.requestKey.localeCompare(right.requestKey));

  const familyGroups = groupBy(
    requests.filter((request) => request.instanceKey),
    (request) => request.familyKey,
  );
  const nPlusOne = [...familyGroups.entries()]
    .map(([familyKey, items]) => ({
      familyKey,
      calls: items.length,
      distinctInstances: new Set(items.map((item) => item.instanceKey)).size,
      totalDurationMs: round(items.reduce((sum, item) => sum + item.durationMs, 0)),
    }))
    .filter((entry) => entry.calls > 1 && entry.distinctInstances > 1)
    .sort((left, right) => right.calls - left.calls || left.familyKey.localeCompare(right.familyKey));

  return {
    schemaVersion: 1,
    kind: "athyper.record-workspace-baseline",
    entityCode: input.entityCode,
    renderer: input.renderer,
    recordKeyHash: stableHash(input.recordId),
    observedAtMs: round(input.observedAtMs),
    totals: {
      calls: requests.length,
      durationMs: round(requests.reduce((sum, request) => sum + request.durationMs, 0)),
      transferBytes: requests.reduce((sum, request) => sum + request.transferBytes, 0),
      duplicateCalls: duplicates.reduce((sum, duplicate) => sum + duplicate.calls - 1, 0),
      nPlusOneCalls: nPlusOne.reduce((sum, family) => sum + family.calls, 0),
    },
    resources,
    surfaces,
    duplicates,
    nPlusOne,
    requests,
  };
}

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function aggregateMetrics(
  requests: readonly RecordWorkspaceObservedRequest[],
  keyOf: (request: RecordWorkspaceObservedRequest) => string,
): RecordWorkspaceMetricGroup[] {
  return [...groupBy(requests, keyOf).entries()]
    .map(([key, items]) => ({
      key,
      calls: items.length,
      totalDurationMs: round(items.reduce((sum, item) => sum + item.durationMs, 0)),
      maxDurationMs: round(Math.max(0, ...items.map((item) => item.durationMs))),
      totalTransferBytes: items.reduce((sum, item) => sum + item.transferBytes, 0),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function classification(
  resource: RecordWorkspaceResource,
  requestKey: string,
  familyKey: string,
  instanceKey?: string,
): RecordWorkspaceRequestClassification {
  return { resource, requestKey, familyKey, ...(instanceKey ? { instanceKey } : {}) };
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function snapshotRequestKind(path: string): string {
  if (path.endsWith("/compare")) return "compare";
  const match = /\/snapshots\/([^/]+)$/.exec(path);
  return match ? `detail.${stableHash(match[1]!)}` : "index";
}

function processRequestKey(path: string): string {
  if (path.includes("/workflow")) return "process.workflow";
  if (path.includes("/status-route")) return "process.status-route";
  return "process.lifecycle";
}

function safeQueryShape(url: URL): string {
  const safe: string[] = [];
  for (const key of [...url.searchParams.keys()].sort()) {
    if (key === "_rsc") continue;
    const value = url.searchParams.get(key) ?? "";
    if (["limit", "offset", "page", "page_size", "query_v1"].includes(key)) {
      safe.push(`${safeToken(key)}=${safeToken(value)}`);
    } else {
      safe.push(`${safeToken(key)}=${stableHash(value)}`);
    }
  }
  return safe.length > 0 ? safe.join("&") : "default";
}

function safeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.=-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeEntityCode(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

function round(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
