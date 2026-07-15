/**
 * @route GET /api/finance/ap/invoices/:id/pricing-components/apportionment-summary
 *
 * v3.1 Phase 6 — BFF forwarder for the strip's per-PC aggregate badges.
 *
 * Pure forward. The AP backend handler computes line_count, override_count,
 * balance_gap, allocated_sum, computed_at per header PC in one round-trip.
 *
 * Responses:
 *   200 — { summaries: [{ header_pc_id, line_count, override_count,
 *                          balance_gap, allocated_sum, computed_at }] }
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
      { error: "UNAUTHENTICATED", message: "Sign in to view apportionment summaries." },
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
      + `/pricing-components/apportionment-summary`,
    ),
    {
      method:  "GET",
      headers: buildRuntimeHeaders(session),
      cache:   "no-store",
    },
  );

  const body = await readJson(upstream);
  return NextResponse.json(
    body ?? { error: "APPORTIONMENT_SUMMARY_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
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
