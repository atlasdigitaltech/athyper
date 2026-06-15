/**
 * @route GET /api/document-runtime/lookup/<lookup_code>?<filters>
 *
 * Descriptor-driven lookup route (Cleanup Plan v5 §4.6 + §5.6 +
 * amendment 5).
 *
 * Replaces the rejected generic /api/document-runtime/lookup/<entity>
 * pattern with allow-listed codes whose `base_filters` are server-
 * authoritative. Callers can add their own `?key=value` extras, but
 * `base_filters` always wins on key conflict — callers cannot widen
 * the allowed set.
 *
 * Resolves a `lookup_code` to a row in `control.document_lookup`,
 * merges `base_filters` (authoritative) with caller-provided extras,
 * and forwards to the backend records API for the resolved
 * `child_entity`.
 *
 * ─── Authz gates ──────────────────────────────────────────────────────
 *   1. Session — 401 if unauthenticated
 *   2. Lookup row active — 404 LOOKUP_NOT_FOUND otherwise
 *   3. Forward with merged filters; backend enforces tenant scope + RLS
 */

import { NextResponse } from "next/server";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const LOG_PREFIX = "[document-runtime/lookup]";

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

  // ── Gate 1: Session ──────────────────────────────────────────────────
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load records." },
      { status: 401 },
    );
  }

  const upstreamHeaders = buildRuntimeHeaders(session);

  // ── Gate 2: Lookup row active ────────────────────────────────────────
  const lookup = await fetchLookup(lookup_code, upstreamHeaders);
  if (!lookup) {
    return NextResponse.json(
      { error: "LOOKUP_NOT_FOUND", message: `No active lookup for code '${lookup_code}'.` },
      { status: 404 },
    );
  }

  // ── Merge filters: base (authoritative) wins on conflict ─────────────
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
  const callerPageSize = callerParams.get("page_size") ?? "200";
  params2.set("page_size", callerPageSize);

  // ── Forward to backend records API ───────────────────────────────────
  const upstream = await fetch(
    buildRuntimeUrl(`/api/records/${encodeURIComponent(lookup.child_entity)}?${params2.toString()}`),
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

  const body = await readJson(upstream) as { records?: RuntimeRecordRow[]; pagination?: unknown } | null;
  return NextResponse.json(
    {
      ok:      true,
      records: Array.isArray(body?.records) ? body!.records! : [],
      lookup:  { code: lookup.lookup_code, child_entity: lookup.child_entity },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function fetchLookup(
  lookupCode: string,
  headers: Record<string, string>,
): Promise<DocumentLookup | null> {
  const params = new URLSearchParams({
    "filter.lookup_code": lookupCode,
    "filter.status":      "active",
    page_size:            "1",
  });
  const upstream = await fetch(
    buildRuntimeUrl(`/api/records/document_lookup?${params.toString()}`),
    { headers, cache: "no-store" },
  );
  if (!upstream.ok) return null;
  const body = await readJson(upstream) as { records?: RuntimeRecordRow[] } | null;
  const row = body?.records?.[0];
  if (!row) return null;
  const flat = (row.data && typeof row.data === "object")
    ? { ...row, ...(row.data as Record<string, unknown>) }
    : (row as Record<string, unknown>);
  return readLookupRow(flat);
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
