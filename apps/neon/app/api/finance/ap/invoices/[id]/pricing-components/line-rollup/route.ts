/**
 * @route GET /api/finance/ap/invoices/:id/pricing-components/line-rollup
 *
 * v3.1 Phase 6b — BFF forwarder for the line-scope component rollup.
 *
 * Returns one row per (condition_type_id) for user-entered line-scope
 * PCs (origin='manual', source_line_id NOT NULL, is_apportioned_from_id
 * NULL). The strip renders these as read-only summary rows alongside
 * header-scope components in the unified Components table.
 *
 * Response:
 *   { rollups: [{ condition_type_id, condition_type_label,
 *                 condition_type_code, term_type, line_count,
 *                 rate_value, amount, line_ids }] }
 *
 *   400 — INVALID_ID / MISSING_TENANT
 *   401 — UNAUTHENTICATED
 *   404 — INVOICE_NOT_FOUND
 */

import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to view component rollups." },
      { status: 401 },
    );
  }

  const { id: invoiceId } = await context.params;
  if (!invoiceId) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Invoice id is required." },
      { status: 400 },
    );
  }

  const upstream = await fetch(
    buildRuntimeUrl(
      `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}`
      + `/pricing-components/line-rollup`,
    ),
    {
      method:  "GET",
      headers: buildRuntimeHeaders(session),
      cache:   "no-store",
    },
  );

  const body = await readJson(upstream);
  return NextResponse.json(
    body ?? { error: "LINE_ROLLUP_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
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
