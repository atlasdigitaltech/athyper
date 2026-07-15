// GET /api/runtime/v1/lookups/[lookup_code] — descriptor-driven lookup resolver.
// Resolves a lookup_code from control.document_lookup, merges base_filters (authoritative,
// caller cannot widen the allowed set) with caller-provided extras, forwards to the records API.
import { NextResponse } from "next/server";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const LOG_PREFIX = "[runtime/v1/lookups]";
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 5000;

interface DocumentLookup {
  lookup_code:  string;
  child_entity: string;
  base_filters: Record<string, string>;
  status:       "active" | "inactive";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lookup_code: string }> },
) {
  const { lookup_code } = await params;

  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load records." },
      { status: 401 },
    );
  }

  const upstreamHeaders = buildRuntimeHeaders(session);

  const lookup = await fetchLookup(lookup_code, upstreamHeaders);
  if (!lookup) {
    return NextResponse.json(
      { error: "LOOKUP_NOT_FOUND", message: `No active lookup for code '${lookup_code}'.` },
      { status: 404 },
    );
  }

  // base_filters wins on key conflict — callers can narrow but never widen.
  const params2 = new URLSearchParams();
  const callerParams = new URL(request.url).searchParams;
  callerParams.forEach((value, key) => {
    if (key === "page" || key === "page_size") return;
    if (key.startsWith("filter.")) params2.append(key, value);
    else params2.append(`filter.${key}`, value);
  });
  for (const [key, value] of Object.entries(lookup.base_filters)) {
    params2.set(`filter.${key}`, value);
  }
  params2.set("page_size", String(clampPageSize(callerParams.get("page_size"))));

  const upstream = await fetch(
    buildRuntimeUrl(`${runtimeServerPath.entityList(lookup.child_entity)}?${params2.toString()}`),
    { headers: upstreamHeaders, cache: "no-store" },
  );

  if (!upstream.ok) {
    const upstreamBody = await readJson(upstream);
    console.warn(`${LOG_PREFIX} ${lookup_code} (${lookup.child_entity}) returned ${upstream.status}`);
    return NextResponse.json(
      normalizeUpstreamError(upstreamBody, upstream.status, "LOOKUP_RECORDS_UNAVAILABLE"),
      { status: upstream.status },
    );
  }

  // Records API returns `{ data: [...] }` not `records`. Reading the wrong key returned [].
  const body = await readJson(upstream) as { data?: RuntimeRecordRow[]; pagination?: unknown } | null;
  return NextResponse.json(
    {
      ok:      true,
      records: Array.isArray(body?.data) ? body!.data! : [],
      lookup:  { code: lookup.lookup_code, child_entity: lookup.child_entity },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function fetchLookup(
  lookupCode: string,
  headers: Record<string, string>,
): Promise<DocumentLookup | null> {
  const upstream = await fetch(
    buildRuntimeUrl(runtimeServerPath.lookup(lookupCode)),
    { headers, cache: "no-store" },
  );

  if (upstream.status === 404) {
    console.warn(
      `${LOG_PREFIX} fetchLookup('${lookupCode}'): 404 from metadata route. `
      + `Verify with: SELECT * FROM control.document_lookup `
      + `WHERE lookup_code = '${lookupCode}' AND status = 'active'.`,
    );
    return null;
  }
  if (!upstream.ok) {
    console.warn(`${LOG_PREFIX} fetchLookup('${lookupCode}'): upstream ${upstream.status}`);
    return null;
  }

  const row = await readJson(upstream) as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return null;
  return readLookupRow(row);
}

function readLookupRow(record: Record<string, unknown>): DocumentLookup | null {
  const lookup_code = readString(record, "lookup_code");
  const child_entity = readString(record, "child_entity");
  if (!lookup_code || !child_entity) return null;
  const status = record["status"];
  if (status !== "active" && status !== "inactive") return null;

  const baseRaw = record["base_filters"];
  const base_filters: Record<string, string> = {};
  if (isRecord(baseRaw)) {
    for (const [key, value] of Object.entries(baseRaw)) {
      if (typeof value === "string") base_filters[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") base_filters[key] = String(value);
    }
  }

  return { lookup_code, child_entity, base_filters, status };
}

function readString(record: Record<string, unknown>, field: string): string {
  const v = record[field];
  return typeof v === "string" ? v : "";
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

function clampPageSize(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
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
