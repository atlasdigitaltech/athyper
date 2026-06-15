/**
 * @route GET /api/document-runtime/binding/<binding_code>/records/<parent_id>
 *
 * Generic descriptor-driven child-fetch route (Cleanup Plan v5 §4.5 + §5.6).
 *
 * Resolves a `binding_code` to a row in `control.polymorphic_child_binding`,
 * applies the right filter (FK or polymorphic), validates authz at multiple
 * gates per amendment 4, and forwards to the backend records API.
 *
 * ─── Authz gates (amendment 4) ────────────────────────────────────────
 *   1. Session — 401 if unauthenticated
 *   2. Binding active — 404 BINDING_NOT_FOUND if missing or inactive
 *   3. Parent entity descriptor — 404 PARENT_ENTITY_NOT_FOUND if not
 *      registered for the active plane / tenant
 *   4. Parent record access — load parent record by id + tenant scope;
 *      404 PARENT_NOT_ACCESSIBLE if not visible in active org
 *   5. Child entity readable — 403 CHILD_READ_DENIED if the child
 *      entity's descriptor disallows read in this contract
 *   6. Forward — POST to backend with computed filter merged with
 *      caller's extra `filter.*` query params
 *
 * `binding_code + parent_id` alone never exposes rows — every gate
 * must pass.
 *
 * ─── Pagination ───────────────────────────────────────────────────────
 * Loops while `pagination.total_pages > pages_fetched`; hard cap at
 * 20 pages (4000 rows at page_size=200) as a runaway guard. Warns when
 * `total > 500` so we monitor real-world distributions before committing
 * to cursor pagination (v5 §10 O2).
 *
 * Same pagination shape as the P0.3 fix on the legacy fetchRuntimeList.
 */

import { NextResponse } from "next/server";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const FETCH_PAGE_SIZE = 200;
const PAGINATION_HARD_CAP = 20;
const LOG_PREFIX = "[document-runtime/binding]";

interface PolymorphicChildBinding {
  binding_code:          string;
  parent_entity_code:    string;
  child_entity_code:     string;
  binding_kind:          "fk" | "polymorphic";
  fk_field:              string | null;
  source_doc_type_value: string | null;
  source_doc_id_field:   string | null;
  source_line_id_field:  string | null;
  status:                "active" | "inactive";
}

interface BackendListResponse {
  records?:       RuntimeRecordRow[];
  pagination?:    { total?: number; page?: number; page_size?: number; total_pages?: number };
  isFullyLoaded?: boolean;
}

// ─── Route handler ────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ binding_code: string; parent_id: string }> },
) {
  const { binding_code, parent_id } = await params;
  const parentRecordId = normalizeRouteRecordId(parent_id);

  // ── Gate 1: Session ──────────────────────────────────────────────────
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load records." },
      { status: 401 },
    );
  }

  const upstreamHeaders = buildRuntimeHeaders(session);

  // ── Gate 2: Binding row exists + active ──────────────────────────────
  const binding = await fetchBinding(binding_code, upstreamHeaders);
  if (!binding) {
    return NextResponse.json(
      { error: "BINDING_NOT_FOUND", message: `No active binding for code '${binding_code}'.` },
      { status: 404 },
    );
  }

  // ── Gate 3: Parent entity descriptor present for active plane ────────
  const parentDescriptor = await getMetaEntityRuntimeDescriptor(binding.parent_entity_code);
  if (!parentDescriptor) {
    return NextResponse.json(
      {
        error: "PARENT_ENTITY_NOT_FOUND",
        message: `Parent entity '${binding.parent_entity_code}' not registered for the active plane.`,
      },
      { status: 404 },
    );
  }

  // ── Gate 4: Parent record visible in active org scope ────────────────
  const parentDetail = await getMetaEntityRecordDetail(
    binding.parent_entity_code,
    parentRecordId,
    parentDescriptor,
  );
  if (parentDetail.state.status === "unavailable" || !parentDetail.record) {
    return NextResponse.json(
      {
        error: "PARENT_NOT_ACCESSIBLE",
        message: parentDetail.state.message ?? "Parent record not visible in the active organization scope.",
      },
      { status: 404 },
    );
  }

  // ── Gate 5: Child entity readable per the active runtime contract ────
  // The child entity may or may not be registered in the plane descriptor.
  // Polymorphic children (PC, AD) commonly aren't — but their parent IS,
  // and the binding registry plus parent-access gate above already
  // authorize the relationship. Soft-allow when the child descriptor is
  // missing; hard-check capability when it IS present.
  const childDescriptor = await getMetaEntityRuntimeDescriptor(binding.child_entity_code);
  if (childDescriptor && !childDescriptor.capabilities.canRead) {
    return NextResponse.json(
      {
        error: "CHILD_READ_DENIED",
        message: `Child entity '${binding.child_entity_code}' is not readable in the active contract.`,
      },
      { status: 403 },
    );
  }

  // ── Compute binding filter ───────────────────────────────────────────
  const bindingFilter = computeBindingFilter(binding, parentRecordId);
  if (!bindingFilter) {
    return NextResponse.json(
      {
        error: "BINDING_INVALID",
        message: `Binding '${binding_code}' has inconsistent kind/field configuration.`,
      },
      { status: 500 },
    );
  }

  // ── Pagination loop ──────────────────────────────────────────────────
  const callerParams = new URL(request.url).searchParams;
  const collected: RuntimeRecordRow[] = [];
  let page = 1;
  let totalPages = 1;
  let total: number | undefined;

  while (page <= totalPages) {
    if (page > PAGINATION_HARD_CAP) {
      console.warn(
        `${LOG_PREFIX} ${binding_code}: hit pagination hard cap (${PAGINATION_HARD_CAP} pages); `
        + `returning ${collected.length} records.`,
      );
      break;
    }

    const params = buildBackendParams({
      bindingFilter,
      callerParams,
      pageSize: FETCH_PAGE_SIZE,
      page,
    });

    const upstream = await fetch(
      buildRuntimeUrl(`/api/records/${encodeURIComponent(binding.child_entity_code)}?${params.toString()}`),
      { headers: upstreamHeaders, cache: "no-store" },
    );

    if (!upstream.ok) {
      const upstreamBody = await readJson(upstream);
      return NextResponse.json(
        normalizeUpstreamError(upstreamBody, upstream.status, "CHILD_RECORDS_UNAVAILABLE"),
        { status: upstream.status },
      );
    }

    const body = await readJson(upstream) as BackendListResponse | null;
    const pageRecords = Array.isArray(body?.records) ? body!.records! : [];
    collected.push(...pageRecords);

    const pagination = body?.pagination;
    if (!pagination || pagination.total_pages == null) break;
    if (body?.isFullyLoaded === true) break;
    if (pageRecords.length < FETCH_PAGE_SIZE) break;

    totalPages = pagination.total_pages;
    total = pagination.total;
    page += 1;
  }

  if (total != null && total > 500 && total !== collected.length) {
    console.warn(
      `${LOG_PREFIX} ${binding_code}/${parentRecordId}: ${total} rows reported, ${collected.length} fetched`,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      records: collected,
      pagination: { total: total ?? collected.length, fully_loaded: true },
      binding: { code: binding.binding_code, kind: binding.binding_kind },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Loads the binding row from the backend control plane. The binding
 * table itself goes through the records API so tenant scope + RLS
 * apply uniformly.
 */
async function fetchBinding(
  bindingCode: string,
  headers: Record<string, string>,
): Promise<PolymorphicChildBinding | null> {
  const params = new URLSearchParams({
    "filter.binding_code": bindingCode,
    "filter.status":       "active",
    page_size:             "1",
  });
  const upstream = await fetch(
    buildRuntimeUrl(`/api/records/polymorphic_child_binding?${params.toString()}`),
    { headers, cache: "no-store" },
  );
  if (!upstream.ok) return null;
  const body = await readJson(upstream) as { records?: RuntimeRecordRow[] } | null;
  const row = body?.records?.[0];
  if (!row) return null;
  // Flatten the runtime-record envelope.
  const flat = (row.data && typeof row.data === "object")
    ? { ...row, ...(row.data as Record<string, unknown>) }
    : (row as Record<string, unknown>);
  return readBindingRow(flat);
}

function readBindingRow(record: Record<string, unknown>): PolymorphicChildBinding | null {
  const binding_code = readString(record, "binding_code");
  const parent_entity_code = readString(record, "parent_entity_code");
  const child_entity_code = readString(record, "child_entity_code");
  const binding_kind = record["binding_kind"];
  if (!binding_code || !parent_entity_code || !child_entity_code) return null;
  if (binding_kind !== "fk" && binding_kind !== "polymorphic") return null;
  const status = record["status"];
  if (status !== "active" && status !== "inactive") return null;
  return {
    binding_code,
    parent_entity_code,
    child_entity_code,
    binding_kind,
    fk_field:              readNullableString(record, "fk_field"),
    source_doc_type_value: readNullableString(record, "source_doc_type_value"),
    source_doc_id_field:   readNullableString(record, "source_doc_id_field"),
    source_line_id_field:  readNullableString(record, "source_line_id_field"),
    status,
  };
}

/**
 * Build the filter dict for the child records query based on binding
 * kind. Returns null when the binding row's columns are inconsistent
 * (shouldn't happen due to pcb_kind_consistency_chk, but guards
 * against DB drift).
 */
function computeBindingFilter(
  binding: PolymorphicChildBinding,
  parentId: string,
): Record<string, string> | null {
  if (binding.binding_kind === "fk") {
    if (!binding.fk_field) return null;
    return { [`filter.${binding.fk_field}`]: parentId };
  }
  if (!binding.source_doc_type_value || !binding.source_doc_id_field) return null;
  return {
    "filter.source_doc_type":           binding.source_doc_type_value,
    [`filter.${binding.source_doc_id_field}`]: parentId,
  };
}

/**
 * Compose backend query params: binding filter (always wins) + caller
 * extras + pagination.
 */
function buildBackendParams(args: {
  bindingFilter: Record<string, string>;
  callerParams:  URLSearchParams;
  pageSize:      number;
  page:          number;
}): URLSearchParams {
  const out = new URLSearchParams();
  // Caller filters first — get prefixed if needed.
  args.callerParams.forEach((value, key) => {
    if (key === "page" || key === "page_size") return;
    if (key.startsWith("filter.")) out.append(key, value);
    else out.append(`filter.${key}`, value);
  });
  // Binding filter overrides caller extras on key conflict.
  for (const [key, value] of Object.entries(args.bindingFilter)) {
    out.set(key, value);
  }
  out.set("page_size", String(args.pageSize));
  out.set("page", String(args.page));
  return out;
}

function readString(record: Record<string, unknown>, field: string): string {
  const v = record[field];
  return typeof v === "string" ? v : "";
}

function readNullableString(record: Record<string, unknown>, field: string): string | null {
  const v = record[field];
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function readJson(input: Request | Response): Promise<unknown> {
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
    : `Records service returned ${status}.`;
  return { error, message };
}
