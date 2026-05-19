import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import {
  RUNTIME_API_URL,
  buildServiceUrl,
  buildRuntimeHeaders,
  copySetCookieHeaders,
  copyTraceResponseHeaders,
  safePathFromSegments,
  sanitizeContentDisposition,
  withTraceResponseHeaders,
} from "@/lib/server/runtime-headers";

/**
 * GET /api/relay/[...path]
 * POST /api/relay/[...path]
 * PUT /api/relay/[...path]
 * PATCH /api/relay/[...path]
 * DELETE /api/relay/[...path]
 *
 * Wildcard BFF proxy — forwards requests to RUNTIME_API_URL with
 * Bearer auth + tenant context injected from the Redis session.
 *
 * Client-side code never touches tokens directly; it calls /api/relay/*
 * and the BFF handles all auth concerns.
 */

type Params = { params: Promise<{ path: string[] }> };

const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_REQUEST_HEADERS = [
  "Idempotency-Key",
  "X-Idempotency-Key",
] as const;

function buildUpstreamPath(path: string[]): string | null {
  const safePath = safePathFromSegments(path);
  if (!safePath) return null;
  // Callers that use relayFetch() pass paths without the /api/ prefix (e.g. "/audit/events").
  // Callers that build the URL manually may already include it (e.g. "/api/relay/api/records/...").
  return safePath.startsWith("api/") ? `/${safePath}` : `/api/${safePath}`;
}

async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const upstreamPath = buildUpstreamPath(path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "INVALID_RELAY_PATH" }, { status: 400 });
  }

  // Preserve query string
  const search = req.nextUrl.search;
  const upstreamUrl = buildServiceUrl(RUNTIME_API_URL, upstreamPath, search);

  // Forward relevant headers, strip Next.js / host specifics
  const reqContentType = req.headers.get("Content-Type") ?? "";

  const forwarded = new Headers(Object.entries(buildRuntimeHeaders(session)));
  for (const headerName of PASSTHROUGH_REQUEST_HEADERS) {
    const value = req.headers.get(headerName);
    if (value) forwarded.set(headerName, value);
  }

  const accountingProfileResponse = await accountingProfileRecordsResponse(req, upstreamPath, forwarded);
  if (accountingProfileResponse) return accountingProfileResponse;

  const init: RequestInit = {
    method: req.method,
    headers: forwarded,
    cache: "no-store",
  };

  // Pass body for mutating methods
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (reqContentType.startsWith("multipart/form-data")) {
      // Stream multipart body directly — the runtime has a busboy handler that
      // enforces its own file-size limit without buffering into memory.
      // The old base64-JSON approach capped effective uploads at ~192 KB due to
      // the 256 KB JSON body-parser limit on the runtime side.
      const clHeader = req.headers.get("content-length");
      if (clHeader !== null) {
        const contentLength = parseInt(clHeader, 10);
        if (!Number.isFinite(contentLength) || contentLength > 100 * 1024 * 1024) {
          return NextResponse.json(
            { error: "FILE_TOO_LARGE", message: "File too large (max 100 MB)" },
            { status: 413 },
          );
        }
      }
      // Preserve Content-Type including the multipart boundary parameter.
      forwarded.set("Content-Type", reqContentType);
      // duplex: "half" is required by the fetch spec for streaming request bodies.
      (init as Record<string, unknown>)["duplex"] = "half";
      init.body = req.body as BodyInit;
    } else {
      forwarded.set("Content-Type", reqContentType || "application/json");
      init.body = await req.text();
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // 204 No Content — return as-is
    if (upstream.status === 204) {
      const res = new NextResponse(null, { status: 204 });
      copySetCookieHeaders(upstream.headers, res.headers);
      copyTraceResponseHeaders(upstream.headers, res.headers);
      return res;
    }

    const contentType        = upstream.headers.get("Content-Type") ?? "application/json";
    const contentDisposition = upstream.headers.get("Content-Disposition");

    const resHeaders: Record<string, string> = { "Content-Type": contentType };
    if (contentDisposition) resHeaders["Content-Disposition"] = sanitizeContentDisposition(contentDisposition);

    const res = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: withTraceResponseHeaders(upstream.headers, resHeaders),
    });
    copySetCookieHeaders(upstream.headers, res.headers);
    return res;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      console.error(`[relay] upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    console.error("[relay] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export const GET = relay;
export const POST = relay;
export const PUT = relay;
export const PATCH = relay;
export const DELETE = relay;

const ACCOUNTING_PROFILE_RECORD_ENTITIES = new Set([
  "accounting_profile",
  "intent_to_accounting_profile_rule",
  "acct_profile_book_rule",
  "acct_profile_commitment_config",
  "acct_profile_config",
  "acct_profile_dimension_rule",
  "acct_profile_entry_template",
  "acct_profile_event",
  "acct_profile_revenue_config",
  "acct_profile_settlement_config",
]);

async function accountingProfileRecordsResponse(
  req: NextRequest,
  upstreamPath: string,
  headers: Headers,
): Promise<NextResponse | null> {
  if (req.method !== "GET") return null;
  const match = /^\/api\/records\/([^/]+)(?:\/([^/]+))?$/.exec(upstreamPath);
  if (!match?.[1]) return null;

  const entityCode = safeDecode(match[1]).replace(/-/g, "_");
  if (!ACCOUNTING_PROFILE_RECORD_ENTITIES.has(entityCode)) return null;

  const recordId = match[2] ? safeDecode(match[2]) : null;
  let payload: AccountingProfileWorkbenchPayload;
  try {
    const payloadRes = await fetch(buildServiceUrl(RUNTIME_API_URL, "/api/finance/accounting-profiles", ""), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!payloadRes.ok) return null;
    payload = await payloadRes.json() as AccountingProfileWorkbenchPayload;
  } catch {
    return null;
  }

  const allRows = rowsForAccountingProfileEntity(payload, entityCode);
  if (recordId) {
    const row = allRows.find((item) => String(item.id ?? "") === recordId || String(item.code ?? "") === recordId);
    return row
      ? NextResponse.json(toMasterRecordEnvelope(row, entityCode))
      : NextResponse.json(
          {
            error: "RECORD_NOT_FOUND",
            message: `Record ${recordId} not found in ${entityCode}.`,
            workbench_href: accountingProfileWorkbenchHref(entityCode, recordId),
          },
          { status: 404 },
        );
  }

  const filteredRows = filterAccountingProfileRows(allRows, req.nextUrl.searchParams);
  const requestedPageSize = positiveInt(req.nextUrl.searchParams.get("page_size"));
  const pageSize = requestedPageSize ?? (filteredRows.length > 0 ? filteredRows.length : 25);
  const page = positiveInt(req.nextUrl.searchParams.get("page")) ?? 1;
  const start = (page - 1) * pageSize;
  const data = filteredRows.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / Math.max(1, pageSize)));

  return NextResponse.json({
    data,
    pagination: {
      page,
      page_size: pageSize,
      total: filteredRows.length,
      total_pages: totalPages,
    },
    facets: {},
    reasons: {
      workbench_backed: true,
      workbench_href: accountingProfileWorkbenchHref(entityCode),
    },
  });
}

interface AccountingProfileWorkbenchPayload {
  items?: Record<string, unknown>[];
  configs?: Record<string, unknown>[];
  rules?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  templates?: Record<string, unknown>[];
}

function rowsForAccountingProfileEntity(
  payload: AccountingProfileWorkbenchPayload,
  entityCode: string,
): Record<string, unknown>[] {
  const rows =
    entityCode === "accounting_profile" ? payload.items
      : entityCode === "intent_to_accounting_profile_rule" ? payload.rules
        : entityCode === "acct_profile_config" ? payload.configs
          : entityCode === "acct_profile_event" ? payload.events
            : entityCode === "acct_profile_entry_template" ? payload.templates
              : [];
  return (rows ?? []).map(toSnakeRecord);
}

function toMasterRecordEnvelope(row: Record<string, unknown>, entityCode: string): Record<string, unknown> {
  const id = typeof row.id === "string" && row.id ? row.id : String(row.code ?? "");
  const tenantId = typeof row.tenant_id === "string" && row.tenant_id ? row.tenant_id : null;
  return {
    id,
    tenant_id: tenantId,
    entity_code: entityCode,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data: row,
  };
}

function filterAccountingProfileRows(rows: Record<string, unknown>[], searchParams: URLSearchParams): Record<string, unknown>[] {
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = searchParams.get("sort");
  const filtered = query
    ? rows.filter((row) => Object.values(row).some((value) => typeof value === "string" && value.toLowerCase().includes(query)))
    : [...rows];

  if (sort) {
    const [field, direction = "asc"] = sort.split(":");
    if (field) {
      filtered.sort((left, right) => {
        const leftValue = comparableValue(left[field]);
        const rightValue = comparableValue(right[field]);
        const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
        return direction === "desc" ? -result : result;
      });
    }
  }

  return filtered;
}

function toSnakeRecord(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), value]),
  );
}

function comparableValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function accountingProfileWorkbenchHref(entityCode: string, recordId?: string): string {
  const params = new URLSearchParams();
  params.set("mode", "profile");
  params.set("sourceEntity", entityCode);
  if (recordId) params.set("sourceId", recordId);
  return `/finance/accounting-profiles?${params.toString()}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
