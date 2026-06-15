/**
 * @route POST /api/pricing-component/supersede
 *
 * Orchestrates an atomic-style supersede of a pricing_component row.
 *
 * Request:
 *   {
 *     "create":    { ...new v2 row data... },           // POST payload
 *     "supersede": { "id": "<v1>", "expectedVersion": "<row_version>" } | null
 *   }
 *
 * When `supersede` is set, the route performs:
 *   1. POST   /api/records/pricing_component        → creates v2
 *   2. PATCH  /api/records/pricing_component/<v1>   → sets v1.superseded_by_id = v2.id
 *      with `If-Match: <expectedVersion>` for optimistic locking
 *
 * If step 2 returns 409 (VERSION_CONFLICT), the route attempts to
 * delete the v2 it just created so the client can retry without
 * leaving an orphan v2 behind. The rollback is best-effort: if it
 * also fails, we surface PARTIAL_SUPERSEDE with the v2 id so an
 * operator can clean it up.
 *
 * When `supersede` is null, only step 1 runs — useful for pure adds.
 *
 * True DB-atomicity (single transaction) requires a backend endpoint;
 * this BFF orchestration is the bridge until that lands.
 */

import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const ENTITY_CODE = "pricing_component";

interface SupersedeRequest {
  create: Record<string, unknown>;
  supersede: { id: string; expectedVersion?: string | number } | null;
}

interface UpstreamRecord {
  id?: string;
  data?: { id?: string };
}

interface UpstreamError {
  error?: string;
  message?: string;
  conflict?: unknown;
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to save changes." },
      { status: 401 },
    );
  }

  // ── Parse + validate body ─────────────────────────────────────────
  const body = await readJson(request);
  if (!isRecord(body) || !isRecord(body["create"])) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "`create` payload is required." },
      { status: 400 },
    );
  }
  const parsed: SupersedeRequest = {
    create:    body["create"] as Record<string, unknown>,
    supersede: parseSupersedeBlock(body["supersede"]),
  };

  const upstreamHeaders = {
    ...buildRuntimeHeaders(session),
    "Content-Type": "application/json",
  };

  // ── Step 1: create v2 ─────────────────────────────────────────────
  const createRes = await fetch(
    buildRuntimeUrl(`/api/records/${encodeURIComponent(ENTITY_CODE)}`),
    {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({ data: parsed.create }),
      cache: "no-store",
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
      { error: "PRICING_COMPONENT_CREATE_FAILED", message: "Backend returned no id for the new row." },
      { status: 502 },
    );
  }

  // ── Step 2 (only if requested): supersede v1 ──────────────────────
  if (parsed.supersede) {
    const supersedeHeaders: Record<string, string> = { ...upstreamHeaders };
    if (parsed.supersede.expectedVersion != null) {
      supersedeHeaders["If-Match"] = String(parsed.supersede.expectedVersion);
    }
    const patchRes = await fetch(
      buildRuntimeUrl(
        `/api/records/${encodeURIComponent(ENTITY_CODE)}/${encodeURIComponent(parsed.supersede.id)}`,
      ),
      {
        method: "PATCH",
        headers: supersedeHeaders,
        body: JSON.stringify({
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
        buildRuntimeUrl(`/api/records/${encodeURIComponent(ENTITY_CODE)}/${encodeURIComponent(v2Id)}`),
        {
          method: "DELETE",
          headers: buildRuntimeHeaders(session),
          cache: "no-store",
        },
      );

      if (!rollback.ok) {
        // Rollback failed — flag so an operator can clean up.
        return NextResponse.json(
          {
            error: "PARTIAL_SUPERSEDE",
            message:
              `Created v2 (${v2Id}) but supersede of v1 failed and rollback also failed. `
              + `Backend cleanup may be required.`,
            createdId: v2Id,
            originalError: patchErr,
          },
          { status: 500 },
        );
      }

      // Rollback succeeded → surface the original failure (with 409 mapped).
      if (isConflict) {
        return NextResponse.json(
          {
            error: "VERSION_CONFLICT",
            message:
              patchErr?.message
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

  // Pure add (no supersede)
  return NextResponse.json({ ok: true, created: v2Record }, { status: 201 });
}

// ── Helpers ──────────────────────────────────────────────────────

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
