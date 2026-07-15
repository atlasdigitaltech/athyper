/**
 * @route GET /api/finance/ap/invoices/:id/pricing-components/:pcId/apportionment
 *
 * v3.1 Phase 4 — BFF forwarder for the apportionment breakup drawer.
 * v3.1 Phase 5c — CSV export pass-through.
 *
 * Forwards GET requests to the AP backend route of the same path. Preserves
 * the pagination + tab query string. Session is consumed at the BFF; the
 * runtime headers carry tenant + permission claims downstream.
 *
 * Query params (passed through verbatim):
 *   cursor — opaque base64url of (line_no, pil_id)
 *   limit  — 1..100, default 50
 *   tab    — "all" | "overrides" (default "all")
 *   q      — search filter. Pure digits → line_no exact match;
 *            ≥ 2 chars text → item_description ILIKE substring with
 *            wildcard escape. Validated server-side; safe to pass raw.
 *   format — "csv" triggers CSV export (gated server-side on
 *            purchase_invoice.export). Body is streamed as text/csv;
 *            Content-Type + Content-Disposition pass through unchanged.
 *
 * Responses:
 *   200 — apportionment payload (JSON) or CSV stream
 *   400 — INVALID_ID / INVALID_PC_ID / MISSING_TENANT
 *   401 — UNAUTHENTICATED
 *   403 — EXPORT_FORBIDDEN (CSV only)
 *   404 — INVOICE_NOT_FOUND / HEADER_PC_NOT_FOUND
 *   409 — HEADER_PC_SUPERSEDED
 */

import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; pcId: string }> },
) {
  // ── Gate 1: Session ────────────────────────────────────────────────────
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to view apportionment." },
      { status: 401 },
    );
  }

  const { id: invoiceId, pcId } = await context.params;
  if (!invoiceId || !pcId) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Invoice id and pcId are required." },
      { status: 400 },
    );
  }

  // Preserve cursor + limit + tab + format on the upstream call. `format`
  // is what drives the CSV branch in ap.route.ts.
  const incoming = new URL(request.url);
  const upstreamQs = new URLSearchParams();
  const passthrough = ["cursor", "limit", "tab", "format", "q"] as const;
  for (const key of passthrough) {
    const value = incoming.searchParams.get(key);
    if (value !== null) upstreamQs.set(key, value);
  }
  const qs = upstreamQs.toString();
  const upstreamPath =
    `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}`
    + `/pricing-components/${encodeURIComponent(pcId)}`
    + `/apportionment${qs ? `?${qs}` : ""}`;

  const upstream = await fetch(buildRuntimeUrl(upstreamPath), {
    method:  "GET",
    headers: buildRuntimeHeaders(session),
    cache:   "no-store",
  });

  // CSV pass-through. Keep upstream Content-Type + Content-Disposition so
  // the browser fires its native download. Don't try to parse — the body
  // is a stream of text/csv that we forward verbatim.
  const upstreamCt = upstream.headers.get("content-type") ?? "";
  if (upstreamCt.startsWith("text/csv")) {
    const headers = new Headers();
    headers.set("content-type",        upstreamCt);
    headers.set("cache-control",       "no-store");
    const cd = upstream.headers.get("content-disposition");
    if (cd) headers.set("content-disposition", cd);
    return new NextResponse(upstream.body, {
      status:  upstream.status,
      headers,
    });
  }

  const body = await readJson(upstream);
  return NextResponse.json(
    body ?? { error: "APPORTIONMENT_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
    { status: upstream.status, headers: { "cache-control": "no-store" } },
  );
}

async function readJson(input: Request | Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}
