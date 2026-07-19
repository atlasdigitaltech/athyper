// GET /api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id] — child fetch via descriptor relation.
// Relationship resolution comes from MetaEntityRuntimeDescriptor.relations so runtime logic does not need a special
// binding table.
import { NextResponse } from "next/server";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type { MetaEntityRelation } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  getMetaEntityRecordDetail,
  hydrateMetaEntityRecordRows,
  normalizeRouteRecordId,
} from "@/lib/server/meta-entity-records";
import {
  getMetaEntityRuntimeDescriptor,
  getMetaEntityRuntimeDescriptorCacheState,
} from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const FETCH_PAGE_SIZE = 200;
const PAGINATION_HARD_CAP = 20;
const LOG_PREFIX = "[runtime/v1/relations]";

interface BackendListResponse {
  data?: RuntimeRecordRow[];
  pagination?: {
    total?: number;
    page?: number;
    page_size?: number;
    total_pages?: number;
    has_more?: boolean;
    next_cursor?: string;
    count_mode?: string;
  };
  isFullyLoaded?: boolean;
}

type RelationTimingName =
  | "params"
  | "session"
  | "parent_descriptor"
  | "parent_access"
  | "child_descriptor"
  | "records"
  | "decode"
  | "hydrate";

class RelationDiagnostics {
  private readonly startedAt = performance.now();
  private readonly timings = new Map<RelationTimingName, { durationMs: number; count: number }>();
  private pages = 0;
  private queryMode: "v1" | "legacy" = "legacy";
  private queryReason = "descriptor_missing";
  private descriptorCacheState = "bypass";
  private parentDescriptorCacheState = "unresolved";
  private childDescriptorCacheState = "unresolved";
  private recordCacheState = "bypass";
  private readonly upstreamServerTimings: string[] = [];

  async measure<T>(name: RelationTimingName, loader: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await loader();
    } finally {
      this.record(name, performance.now() - startedAt);
    }
  }

  record(name: RelationTimingName, durationMs: number): void {
    const safeDuration = roundDuration(durationMs);
    const current = this.timings.get(name);
    this.timings.set(name, current
      ? { durationMs: roundDuration(current.durationMs + safeDuration), count: current.count + 1 }
      : { durationMs: safeDuration, count: 1 });
  }

  recordUpstream(response: Response): void {
    this.pages += 1;
    if (response.headers.get("X-Entity-Query") === "v1") {
      this.queryMode = "v1";
    } else if (this.queryMode === "v1") {
      this.queryMode = "legacy";
      this.queryReason = "compiled_query_unavailable";
    }
    this.descriptorCacheState = response.headers.get("X-Descriptor-Cache") ?? this.descriptorCacheState;
    this.recordCacheState = response.headers.get("X-List-Cache") ?? this.recordCacheState;
    const serverTiming = response.headers.get("Server-Timing");
    if (serverTiming) this.upstreamServerTimings.push(serverTiming);
  }

  setQueryDecision(input: { useEntityQueryV1: boolean; reason: string }): void {
    this.queryMode = input.useEntityQueryV1 ? "v1" : "legacy";
    this.queryReason = input.reason;
  }

  setRuntimeDescriptorCacheState(
    role: "parent" | "child",
    state: "cold" | "warm" | "bypass" | "missing",
  ): void {
    if (role === "parent") this.parentDescriptorCacheState = state;
    else this.childDescriptorCacheState = state;
  }

  responseHeaders(): Record<string, string> {
    const timings = [...this.timings.entries()].map(([name, entry]) => {
      const description = entry.count > 1 ? `;desc=\"${entry.count} calls\"` : "";
      return `relation_${name};dur=${entry.durationMs}${description}`;
    });
    timings.push(...this.upstreamServerTimings);
    timings.push(`relation_total;dur=${roundDuration(performance.now() - this.startedAt)}`);
    return {
      "Cache-Control": "no-store",
      "Server-Timing": timings.join(", "),
      "X-Athyper-Relation-Query": this.queryMode,
      "X-Athyper-Relation-Query-Reason": this.queryReason,
      "X-Athyper-Relation-Pages": String(this.pages),
      "X-Athyper-Descriptor-Cache": this.descriptorCacheState,
      "X-Athyper-Parent-Descriptor-Cache": this.parentDescriptorCacheState,
      "X-Athyper-Child-Descriptor-Cache": this.childDescriptorCacheState,
      "X-Athyper-Record-Cache": this.recordCacheState,
    };
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; relation: string; parent_id: string }> },
) {
  const diagnostics = new RelationDiagnostics();
  const { entity, relation, parent_id } = await diagnostics.measure("params", () => params);
  const parentEntity = entity.trim().replace(/-/g, "_");
  const relationName = relation.trim();
  const parentRecordId = normalizeRouteRecordId(parent_id);

  const session = await diagnostics.measure("session", getNeonServerSession);
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load records." },
      { status: 401, headers: diagnostics.responseHeaders() },
    );
  }

  const parentDescriptor = await diagnostics.measure(
    "parent_descriptor",
    () => getMetaEntityRuntimeDescriptor(parentEntity),
  );
  if (!parentDescriptor) {
    return NextResponse.json(
      {
        error: "PARENT_ENTITY_NOT_FOUND",
        message: `Parent entity '${parentEntity}' not registered for the active plane.`,
      },
      { status: 404, headers: diagnostics.responseHeaders() },
    );
  }
  diagnostics.setRuntimeDescriptorCacheState(
    "parent",
    getMetaEntityRuntimeDescriptorCacheState(parentDescriptor),
  );

  const resolvedRelation = resolveRelation(parentDescriptor.relations, relationName);
  if (!resolvedRelation) {
    return NextResponse.json(
      {
        error: "RELATION_NOT_FOUND",
        message: `No descriptor relation '${relationName}' found on entity '${parentEntity}'.`,
      },
      { status: 404, headers: diagnostics.responseHeaders() },
    );
  }

  // Parent access and child descriptor resolution are independent after the
  // relation contract is known. Resolve them concurrently so a cold child
  // descriptor does not serialize behind the parent access lookup.
  const [parentDetail, childDescriptor] = await Promise.all([
    diagnostics.measure(
      "parent_access",
      () => getMetaEntityRecordDetail(
        parentDescriptor.entityCode,
        parentRecordId,
        parentDescriptor,
        { session, scopeStrategy: "verified_upstream" },
      ),
    ),
    diagnostics.measure(
      "child_descriptor",
      () => getMetaEntityRuntimeDescriptor(resolvedRelation.targetEntity),
    ),
  ]);
  diagnostics.setRuntimeDescriptorCacheState(
    "child",
    childDescriptor ? getMetaEntityRuntimeDescriptorCacheState(childDescriptor) : "missing",
  );
  if (parentDetail.state.status === "unavailable" || !parentDetail.record) {
    return NextResponse.json(
      {
        error: "PARENT_NOT_ACCESSIBLE",
        message: parentDetail.state.message ?? "Parent record not visible in the active organization scope.",
      },
      { status: 404, headers: diagnostics.responseHeaders() },
    );
  }

  // Soft-allow when child descriptor is missing (polymorphic children like PC/AD).
  if (childDescriptor && !childDescriptor.capabilities.canRead) {
    return NextResponse.json(
      {
        error: "CHILD_READ_DENIED",
        message: `Child entity '${resolvedRelation.targetEntity}' is not readable in the active contract.`,
      },
      { status: 403, headers: diagnostics.responseHeaders() },
    );
  }

  const relationFilter = computeRelationFilter(resolvedRelation, parentRecordId);
  if (!relationFilter) {
    return NextResponse.json(
      {
        error: "RELATION_INVALID",
        message: `Relation '${relationName}' has inconsistent resolution metadata.`,
      },
      { status: 500, headers: diagnostics.responseHeaders() },
    );
  }

  const upstreamHeaders = buildRuntimeHeaders(session);
  if (childDescriptor?.cachePolicy) {
    upstreamHeaders["X-Athyper-List-Cache-Mode"] = childDescriptor.cachePolicy.mode;
    upstreamHeaders["X-Athyper-List-Cache-Fresh-Seconds"] = String(
      childDescriptor.cachePolicy.freshForSeconds,
    );
  }
  const callerParams = new URL(request.url).searchParams;
  const splitFilter = splitComputedRelationFilters(relationFilter, childDescriptor);
  const queryDecision = relationQueryV1Decision(childDescriptor, splitFilter.queryable);
  diagnostics.setQueryDecision(queryDecision);
  const collected: RuntimeRecordRow[] = [];
  let page = 1;
  let totalPages = 1;
  let total: number | undefined;
  let cursor: string | undefined;

  while (page <= totalPages) {
    if (page > PAGINATION_HARD_CAP) {
      console.warn(
        `${LOG_PREFIX} ${parentEntity}.${relationName}: hit pagination hard cap `
        + `(${PAGINATION_HARD_CAP} pages); returning ${collected.length} records.`,
      );
      break;
    }

    const params = buildBackendParams({
      relationFilter: splitFilter.queryable,
      callerParams,
      pageSize: FETCH_PAGE_SIZE,
      page,
      cursor,
      useEntityQueryV1: queryDecision.useEntityQueryV1,
    });

    const upstream = await diagnostics.measure(
      "records",
      () => fetch(
        buildRuntimeUrl(`${runtimeServerPath.entityList(resolvedRelation.targetEntity)}?${params.toString()}`),
        { headers: upstreamHeaders, cache: "no-store" },
      ),
    );
    diagnostics.recordUpstream(upstream);

    if (!upstream.ok) {
      const upstreamBody = await diagnostics.measure("decode", () => readJson(upstream));
      return NextResponse.json(
        normalizeUpstreamError(upstreamBody, upstream.status, "CHILD_RECORDS_UNAVAILABLE"),
        { status: upstream.status, headers: diagnostics.responseHeaders() },
      );
    }

    const body = await diagnostics.measure("decode", () => readJson(upstream)) as BackendListResponse | null;
    const pageRecords = Array.isArray(body?.data) ? body.data : [];
    collected.push(...pageRecords);

    const pagination = body?.pagination;
    if (!pagination) break;
    if (pagination.has_more === true) {
      if (!pagination.next_cursor || pagination.next_cursor === cursor) {
        console.warn(
          `${LOG_PREFIX} ${parentEntity}.${relationName}: query v1 reported more rows without a usable cursor.`,
        );
        break;
      }
      cursor = pagination.next_cursor;
      totalPages = page + 1;
      page += 1;
      continue;
    }
    if (pagination.total_pages == null) break;
    if (body?.isFullyLoaded === true) break;
    if (pageRecords.length < FETCH_PAGE_SIZE) break;

    totalPages = pagination.total_pages;
    total = pagination.total;
    page += 1;
  }

  if (total != null && total > 500 && total !== collected.length) {
    console.warn(
      `${LOG_PREFIX} ${parentEntity}.${relationName}/${parentRecordId}: `
      + `${total} rows reported, ${collected.length} fetched`,
    );
  }

  const filteredRecords = applyPostFetchFilters(collected, splitFilter.postFetch);
  const records = await diagnostics.measure(
    "hydrate",
    () => hydrateMetaEntityRecordRows(
      filteredRecords,
      childDescriptor,
      session,
      upstreamHeaders,
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      records,
      pagination: { total: records.length, fully_loaded: true },
      relation: {
        name: resolvedRelation.name,
        runtimeRole: resolvedRelation.runtimeRole,
        targetEntity: resolvedRelation.targetEntity,
        resolutionKind: resolvedRelation.resolutionKind,
      },
    },
    { headers: diagnostics.responseHeaders() },
  );
}

function resolveRelation(
  relations: ReadonlyArray<MetaEntityRelation>,
  relationName: string,
): MetaEntityRelation | null {
  return relations.find((candidate) =>
    candidate.name === relationName
    || candidate.runtimeRole === relationName
    || candidate.key === relationName,
  ) ?? null;
}

function computeRelationFilter(
  relation: MetaEntityRelation,
  parentId: string,
): Record<string, string> | null {
  const resolutionKind = relation.resolutionKind ?? "fk";
  const base: Record<string, string> | null =
    resolutionKind === "fk"
      ? (relation.fkField ? { [`filter.${relation.fkField}`]: parentId } : null)
      : resolutionKind === "polymorphic"
        ? (
            relation.sourceTypeField
            && relation.sourceTypeValue
            && relation.sourceIdField
              ? {
                  [`filter.${relation.sourceTypeField}`]: relation.sourceTypeValue,
                  [`filter.${relation.sourceIdField}`]: parentId,
                }
              : null
          )
        : null;

  if (!base) return null;

  for (const [key, value] of Object.entries(relation.recordFilter ?? {})) {
    const normalized = normalizeFilterValue(value);
    if (normalized !== null) base[`filter.${key}`] = normalized;
  }

  return base;
}

function buildBackendParams(input: {
  relationFilter: Record<string, string>;
  callerParams: URLSearchParams;
  pageSize: number;
  page: number;
  cursor?: string;
  useEntityQueryV1: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input.relationFilter)) {
    params.set(key, value);
  }
  for (const [key, value] of input.callerParams.entries()) {
    if (!key.startsWith("filter.")) continue;
    if (params.has(key)) continue;
    params.append(key, value);
  }
  params.set("page", String(input.page));
  params.set("page_size", String(input.pageSize));
  if (input.useEntityQueryV1) {
    params.set("query_v1", "1");
    params.set("count_mode", "none");
    if (input.cursor) params.set("cursor", input.cursor);
  }
  return params;
}

function roundDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

function relationQueryV1Decision(
  childDescriptor: Awaited<ReturnType<typeof getMetaEntityRuntimeDescriptor>>,
  queryableFilters: Record<string, string>,
): { useEntityQueryV1: boolean; reason: string } {
  if (!childDescriptor) {
    return { useEntityQueryV1: false, reason: "descriptor_missing" };
  }

  const fields = new Map(
    childDescriptor.fields.flatMap((field) => [
      [field.name, field] as const,
      [field.columnName, field] as const,
    ]),
  );
  const unsupportedField = Object.keys(queryableFilters)
    .map((key) => key.startsWith("filter.") ? key.slice("filter.".length) : key)
    .find((name) => {
      const field = fields.get(name);
      return !field || !field.isFilterable || field.isComputed;
    });

  return unsupportedField
    ? { useEntityQueryV1: false, reason: "filter_contract_incomplete" }
    : { useEntityQueryV1: true, reason: "compiled_filter_contract" };
}

function splitComputedRelationFilters(
  relationFilter: Record<string, string>,
  childDescriptor: Awaited<ReturnType<typeof getMetaEntityRuntimeDescriptor>>,
): { queryable: Record<string, string>; postFetch: Record<string, string> } {
  if (!childDescriptor) return { queryable: relationFilter, postFetch: {} };

  const computedFields = new Set(
    childDescriptor.fields
      .filter((field) => field.isComputed)
      .map((field) => field.name),
  );
  if (computedFields.size === 0) return { queryable: relationFilter, postFetch: {} };

  const queryable: Record<string, string> = {};
  const postFetch: Record<string, string> = {};
  for (const [key, value] of Object.entries(relationFilter)) {
    const fieldName = key.startsWith("filter.") ? key.slice("filter.".length) : key;
    if (computedFields.has(fieldName)) postFetch[key] = value;
    else queryable[key] = value;
  }
  return { queryable, postFetch };
}

function applyPostFetchFilters(
  records: RuntimeRecordRow[],
  filters: Record<string, string>,
): RuntimeRecordRow[] {
  const entries = Object.entries(filters);
  if (entries.length === 0) return records;

  return records.filter((record) => {
    const flat = flattenRuntimeRecord(record);
    return entries.every(([key, expected]) => {
      const fieldName = key.startsWith("filter.") ? key.slice("filter.".length) : key;
      return normalizedComparableValue(flat[fieldName]) === expected;
    });
  });
}

function flattenRuntimeRecord(record: RuntimeRecordRow): Record<string, unknown> {
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : {};
  return { ...record, ...data };
}

function normalizedComparableValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function normalizeFilterValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return null;
}

async function readJson(input: Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeUpstreamError(
  value: unknown,
  status: number,
  fallbackCode: string,
): { error: string; message: string } {
  const error = isRecord(value) && typeof value["error"] === "string" ? value["error"] : fallbackCode;
  const message = isRecord(value) && typeof value["message"] === "string"
    ? value["message"]
    : `Child records service returned ${status}.`;
  return { error, message };
}
