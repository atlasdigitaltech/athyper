// GET /api/runtime/v1/bindings/[binding_code]/records/[parent_id] — generic descriptor-driven child fetch.
// Resolves a binding_code to control.polymorphic_child_binding, applies the FK or polymorphic filter,
// and authorizes through five gates before returning child rows.
//
// Authorization gates (binding_code + parent_id alone never expose rows — every gate must pass):
//   1. Session
//   2. Binding row active
//   3. Parent entity registered for active plane
//   4. Parent record visible in active org scope
//   5. Child entity readable per active contract
import { NextResponse } from "next/server";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const FETCH_PAGE_SIZE = 200;
const PAGINATION_HARD_CAP = 20;
const LOG_PREFIX = "[runtime/v1/bindings]";

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
  // metadata.record_filter lets a binding inject extra WHERE clauses
  // (e.g. exclude superseded pricing_component rows via `superseded_by_id: "null"`).
  record_filter:         Record<string, string> | null;
}

interface BackendListResponse {
  // Records API envelope key is `data`, not `records`.
  data?:          RuntimeRecordRow[];
  pagination?:    { total?: number; page?: number; page_size?: number; total_pages?: number };
  isFullyLoaded?: boolean;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ binding_code: string; parent_id: string }> },
) {
  const { binding_code, parent_id } = await params;
  const parentRecordId = normalizeRouteRecordId(parent_id);

  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load records." },
      { status: 401 },
    );
  }

  const upstreamHeaders = buildRuntimeHeaders(session);

  const bindingResult = await fetchBinding(binding_code, upstreamHeaders);
  if (bindingResult.kind === "not_found") {
    return NextResponse.json(
      {
        error:   "BINDING_NOT_FOUND",
        message: `No active binding row for code '${binding_code}'. `
                 + `Verify with: SELECT * FROM control.polymorphic_child_binding `
                 + `WHERE binding_code = '${binding_code}' AND status = 'active'.`,
      },
      { status: 404 },
    );
  }
  if (bindingResult.kind === "backend_route_missing") {
    return NextResponse.json(
      {
        error:   "BACKEND_ROUTE_MISSING",
        message: `The backend /api/runtime/v1/bindings/:code route is not registered. `
                 + `Restart/rebuild the API service. Upstream status ${bindingResult.upstreamStatus}.`,
      },
      { status: 503 },
    );
  }
  if (bindingResult.kind === "error") {
    return NextResponse.json(
      {
        error:   "BINDING_UPSTREAM_ERROR",
        message: `Upstream returned ${bindingResult.upstreamStatus} fetching binding '${binding_code}'.`,
      },
      { status: 502 },
    );
  }
  const binding = bindingResult.binding;

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

  // Polymorphic children (e.g. pricing_component) may have no plane descriptor.
  // Soft-allow when child descriptor missing; hard-check capability when present.
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
      buildRuntimeUrl(`${runtimeServerPath.entityList(binding.child_entity_code)}?${params.toString()}`),
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
    const pageRecords = Array.isArray(body?.data) ? body!.data! : [];
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

type FetchBindingResult =
  | { kind: "ok";                    binding: PolymorphicChildBinding }
  | { kind: "not_found" }
  | { kind: "backend_route_missing"; upstreamStatus: number }
  | { kind: "error";                 upstreamStatus: number };

async function fetchBinding(
  bindingCode: string,
  headers: Record<string, string>,
): Promise<FetchBindingResult> {
  const upstream = await fetch(
    buildRuntimeUrl(runtimeServerPath.binding(bindingCode)),
    { headers, cache: "no-store" },
  );

  if (upstream.status === 404) {
    // 404 has two meanings: (a) backend route registered, binding row missing
    // (returns `{ error: "BINDING_NOT_FOUND" }`); (b) backend route not registered
    // (older build, Express default 404). Inspect body to distinguish.
    const bodyText = await upstream.text().catch(() => "");
    const parsed = safeParseJson(bodyText);
    const isOurBindingNotFound = parsed
      && typeof parsed === "object"
      && (parsed as { error?: unknown }).error === "BINDING_NOT_FOUND";

    if (isOurBindingNotFound) {
      console.warn(
        `${LOG_PREFIX} fetchBinding('${bindingCode}'): backend confirmed binding row missing.`,
      );
      return { kind: "not_found" };
    }

    console.warn(
      `${LOG_PREFIX} fetchBinding('${bindingCode}'): backend 404 WITHOUT the BINDING_NOT_FOUND envelope. `
      + `Likely an older API build without /api/runtime/v1/bindings/:code. `
      + `Body: ${bodyText.slice(0, 200)}`,
    );
    return { kind: "backend_route_missing", upstreamStatus: 404 };
  }
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.warn(
      `${LOG_PREFIX} fetchBinding('${bindingCode}'): upstream ${upstream.status}. Body: ${errText.slice(0, 200)}`,
    );
    return { kind: "error", upstreamStatus: upstream.status };
  }

  const row = await readJson(upstream) as Record<string, unknown> | null;
  if (!row || typeof row !== "object") {
    console.warn(`${LOG_PREFIX} fetchBinding('${bindingCode}'): empty/invalid response body.`);
    return { kind: "error", upstreamStatus: upstream.status };
  }

  const parsed = readBindingRow(row);
  if (!parsed) {
    console.warn(
      `${LOG_PREFIX} fetchBinding('${bindingCode}'): row present but malformed. Got: ${JSON.stringify(row).slice(0, 200)}`,
    );
    return { kind: "error", upstreamStatus: upstream.status };
  }
  return { kind: "ok", binding: parsed };
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
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
    record_filter:         readRecordFilter(record["metadata"]),
  };
}

function readRecordFilter(value: unknown): Record<string, string> | null {
  if (value == null || typeof value !== "object") return null;
  const filterRaw = (value as Record<string, unknown>)["record_filter"];
  if (filterRaw == null || typeof filterRaw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filterRaw)) {
    if (typeof k !== "string" || !k) continue;
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    else if (v === null) out[k] = "null";
  }
  return Object.keys(out).length > 0 ? out : null;
}

function computeBindingFilter(
  binding: PolymorphicChildBinding,
  parentId: string,
): Record<string, string> | null {
  const base: Record<string, string> | null =
    binding.binding_kind === "fk"
      ? (binding.fk_field
          ? { [`filter.${binding.fk_field}`]: parentId }
          : null)
      : (binding.source_doc_type_value && binding.source_doc_id_field
          ? {
              "filter.source_doc_type":           binding.source_doc_type_value,
              [`filter.${binding.source_doc_id_field}`]: parentId,
            }
          : null);

  if (!base) return null;

  if (binding.record_filter) {
    for (const [k, v] of Object.entries(binding.record_filter)) {
      base[`filter.${k}`] = v;
    }
  }

  return base;
}

function buildBackendParams(args: {
  bindingFilter: Record<string, string>;
  callerParams:  URLSearchParams;
  pageSize:      number;
  page:          number;
}): URLSearchParams {
  const out = new URLSearchParams();
  args.callerParams.forEach((value, key) => {
    if (key === "page" || key === "page_size") return;
    if (key.startsWith("filter.")) out.append(key, value);
    else out.append(`filter.${key}`, value);
  });
  // Binding filter wins on conflict — caller cannot override.
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
