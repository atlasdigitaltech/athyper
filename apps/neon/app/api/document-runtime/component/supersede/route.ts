/**
 * @route POST /api/document-runtime/component/supersede
 *
 * Generic descriptor-driven pricing-component supersede route
 * (Cleanup Plan v5 §4.8 + §5.8).
 *
 * Replaces the PI-specific /api/pricing-component/supersede with a
 * source_doc_type-agnostic version. `source_doc_type` comes from the
 * caller and is validated against the polymorphic-child binding
 * registry; the route refuses any value not present in
 * `control.polymorphic_child_binding` with
 * `child_entity_code='pricing_component'`.
 *
 * Behavior mirrors the PI route: POST new v2, PATCH v1 with
 * `If-Match: <expectedVersion>`, best-effort DELETE rollback when
 * the PATCH fails (typically 409). The orchestration window still
 * exists; a backend transactional endpoint closes it (v5 §9 O5).
 *
 * Request body:
 *   {
 *     "source_doc_type": "PURCHASE_INVOICE_LINE",   // caller-provided
 *     "create":    { ...new v2 row data... },        // POST payload
 *     "supersede": { "id": "<v1>", "expectedVersion": "<row_version>" } | null
 *   }
 *
 * Response:
 *   200 — { ok, created, superseded }                 full supersede success
 *   201 — { ok, created }                              pure add (no supersede block)
 *   400 — { error: "INVALID_REQUEST",   message }     malformed body
 *   400 — { error: "SOURCE_DOC_TYPE_NOT_ALLOWED",     unknown source_doc_type
 *                 message, allowed: string[] }
 *   401 — { error: "UNAUTHENTICATED", message }       no session
 *   409 — { error: "VERSION_CONFLICT", message, conflict }  v1 row_version advanced
 *   500 — { error: "PARTIAL_SUPERSEDE", message,      v2 created, v1 patch + rollback failed
 *                 createdId, originalError }
 */

import { NextResponse } from "next/server";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const COMPONENT_ENTITY = "pricing_component";
const LOG_PREFIX = "[document-runtime/component/supersede]";

interface SupersedeRequest {
  source_doc_type: string;
  create:          Record<string, unknown>;
  supersede:       { id: string; expectedVersion?: string | number } | null;
}

interface UpstreamRecord {
  id?:   string;
  data?: { id?: string };
}

interface UpstreamError {
  error?:    string;
  message?:  string;
  conflict?: unknown;
}

// ─── Route handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Gate 1: Session ──────────────────────────────────────────────────
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to save changes." },
      { status: 401 },
    );
  }

  // ── Gate 2: Body shape ───────────────────────────────────────────────
  const body = await readJson(request);
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Body must be a JSON object." },
      { status: 400 },
    );
  }
  const sourceDocType = typeof body["source_doc_type"] === "string" ? body["source_doc_type"] : "";
  const create = isRecord(body["create"]) ? body["create"] as Record<string, unknown> : null;
  if (!sourceDocType || !create) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: "`source_doc_type` (string) and `create` (object) are required.",
      },
      { status: 400 },
    );
  }
  const parsed: SupersedeRequest = {
    source_doc_type: sourceDocType,
    create,
    supersede:       parseSupersedeBlock(body["supersede"]),
  };

  const upstreamHeaders = {
    ...buildRuntimeHeaders(session),
    "Content-Type": "application/json",
  };

  // ── Gate 3: source_doc_type allow-list via binding registry ──────────
  const allowed = await fetchAllowedSourceDocTypes(upstreamHeaders);
  if (!allowed.includes(parsed.source_doc_type)) {
    return NextResponse.json(
      {
        error:   "SOURCE_DOC_TYPE_NOT_ALLOWED",
        message: `source_doc_type '${parsed.source_doc_type}' is not registered in control.polymorphic_child_binding for child='pricing_component'.`,
        allowed,
      },
      { status: 400 },
    );
  }

  // Inject source_doc_type into the create payload (caller-provided
  // values are overridden — the binding row is the authority).
  const createPayload: Record<string, unknown> = {
    ...parsed.create,
    source_doc_type: parsed.source_doc_type,
  };

  // ── Step 1: create v2 ────────────────────────────────────────────────
  const createRes = await fetch(
    buildRuntimeUrl(`/api/records/${encodeURIComponent(COMPONENT_ENTITY)}`),
    {
      method:  "POST",
      headers: upstreamHeaders,
      body:    JSON.stringify({ data: createPayload }),
      cache:   "no-store",
    },
  );
  const createResult = await readJson(createRes);
  if (!createRes.ok) {
    return NextResponse.json(
      normalizeUpstreamError(createResult, createRes.status, "PRICING_COMPONENT_CREATE_FAILED"),
      { status: createRes.status },
    );
  }

  const v2Record = createResult as UpstreamRecord;
  const v2Id = v2Record?.id ?? v2Record?.data?.id;
  if (!v2Id) {
    return NextResponse.json(
      {
        error: "PRICING_COMPONENT_CREATE_FAILED",
        message: "Backend returned no id for the new row.",
      },
      { status: 502 },
    );
  }

  // ── Pure add — no supersede block ────────────────────────────────────
  if (!parsed.supersede) {
    return NextResponse.json({ ok: true, created: v2Record }, { status: 201 });
  }

  // ── Step 2: supersede v1 with optimistic lock ────────────────────────
  const supersedeHeaders: Record<string, string> = { ...upstreamHeaders };
  if (parsed.supersede.expectedVersion != null) {
    supersedeHeaders["If-Match"] = String(parsed.supersede.expectedVersion);
  }
  const patchRes = await fetch(
    buildRuntimeUrl(
      `/api/records/${encodeURIComponent(COMPONENT_ENTITY)}/${encodeURIComponent(parsed.supersede.id)}`,
    ),
    {
      method:  "PATCH",
      headers: supersedeHeaders,
      body:    JSON.stringify({
        data: {
          superseded_by_id: v2Id,
          superseded_at:    new Date().toISOString(),
        },
      }),
      cache: "no-store",
    },
  );

  if (!patchRes.ok) {
    const patchErr = await readJson(patchRes) as UpstreamError | null;
    const isConflict = patchRes.status === 409 || patchRes.status === 412;

    // Best-effort rollback so the client can retry without an orphan v2.
    const rollback = await fetch(
      buildRuntimeUrl(`/api/records/${encodeURIComponent(COMPONENT_ENTITY)}/${encodeURIComponent(v2Id)}`),
      {
        method:  "DELETE",
        headers: buildRuntimeHeaders(session),
        cache:   "no-store",
      },
    );

    if (!rollback.ok) {
      console.warn(`${LOG_PREFIX} rollback failed for v2=${v2Id}`);
      return NextResponse.json(
        {
          error:   "PARTIAL_SUPERSEDE",
          message: `Created v2 (${v2Id}) but supersede of v1 failed and rollback also failed. Backend cleanup may be required.`,
          createdId:     v2Id,
          originalError: patchErr,
        },
        { status: 500 },
      );
    }

    if (isConflict) {
      return NextResponse.json(
        {
          error:    "VERSION_CONFLICT",
          message:  patchErr?.message
                    ?? "Another user edited this component while you were drafting. Reload to see the latest, then retry.",
          conflict: patchErr?.conflict,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      normalizeUpstreamError(patchErr, patchRes.status, "PRICING_COMPONENT_SUPERSEDE_FAILED"),
      { status: patchRes.status },
    );
  }

  const patchResult = await readJson(patchRes);
  return NextResponse.json(
    { ok: true, created: v2Record, superseded: patchResult },
    { status: 200 },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Returns the allow-listed source_doc_type values from
 * control.polymorphic_child_binding where child_entity_code = 'pricing_component'.
 * Cached implicitly by Next.js fetch deduplication within a single
 * request; if needed, add explicit caching when traffic warrants.
 */
async function fetchAllowedSourceDocTypes(headers: Record<string, string>): Promise<string[]> {
  const params = new URLSearchParams({
    "filter.child_entity_code": COMPONENT_ENTITY,
    "filter.status":            "active",
    "filter.binding_kind":      "polymorphic",
    page_size:                  "200",
  });
  const upstream = await fetch(
    buildRuntimeUrl(`/api/records/polymorphic_child_binding?${params.toString()}`),
    { headers, cache: "no-store" },
  );
  if (!upstream.ok) return [];
  const body = await readJson(upstream) as { records?: RuntimeRecordRow[] } | null;
  const out = new Set<string>();
  for (const row of body?.records ?? []) {
    const flat = (row.data && typeof row.data === "object")
      ? { ...row, ...(row.data as Record<string, unknown>) }
      : (row as Record<string, unknown>);
    const value = flat["source_doc_type_value"];
    if (typeof value === "string" && value.length > 0) out.add(value);
  }
  return [...out].sort();
}

function parseSupersedeBlock(value: unknown): SupersedeRequest["supersede"] {
  if (!isRecord(value)) return null;
  const id = value["id"];
  if (typeof id !== "string" || !id.trim()) return null;
  const expectedVersion = value["expectedVersion"];
  if (typeof expectedVersion === "string" || typeof expectedVersion === "number") {
    return { id, expectedVersion };
  }
  return { id };
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
    : `Pricing-component service returned ${status}.`;
  return { error, message };
}
