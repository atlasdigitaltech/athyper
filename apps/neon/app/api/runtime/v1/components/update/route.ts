// POST /api/runtime/v1/components/update — in-place pricing-component edit for draft-mode rows.
// PATCH /api/finance/ap/invoices/:id/pricing-components/:pcId on the runtime side enforces:
//   parent status ∈ PC_MUTABLE_STATUSES, PC.origin === 'manual', PC not superseded, tenant + permission.
// Used when an audit chain is not needed (draft / rejected / proforma); supersede is used otherwise.
import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

export async function POST(request: Request) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to save changes." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Body must be a JSON object." },
      { status: 400 },
    );
  }
  const sourceDocType = typeof body["source_doc_type"] === "string" ? body["source_doc_type"] : "";
  const sourceDocId   = typeof body["source_doc_id"]   === "string" ? body["source_doc_id"]   : "";
  const componentId   = typeof body["component_id"]    === "string" ? body["component_id"]    : "";
  const patch         = isRecord(body["patch"]) ? body["patch"] as Record<string, unknown> : null;
  if (!sourceDocType || !sourceDocId || !componentId || !patch) {
    return NextResponse.json(
      {
        error:   "INVALID_REQUEST",
        message: "`source_doc_type`, `source_doc_id`, `component_id`, and `patch` are required.",
      },
      { status: 400 },
    );
  }
  if (!isSupportedSourceDocType(sourceDocType)) {
    return NextResponse.json(
      {
        error:   "SOURCE_DOC_TYPE_NOT_SUPPORTED_BY_WRITER",
        message: "This runtime writer supports purchase invoice and purchase order pricing components only.",
      },
      { status: 400 },
    );
  }

  // AP's parsePricingComponentRequest expects source_doc_type + source_doc_id inside the create envelope.
  const patchPayload: Record<string, unknown> = {
    ...patch,
    source_doc_type: sourceDocType,
    source_doc_id:   sourceDocId,
  };

  const upstreamHeaders = {
    ...buildRuntimeHeaders(session),
    "Content-Type": "application/json",
  };

  const isPurchaseInvoice = sourceDocType === "PURCHASE_INVOICE_LINE"
    || sourceDocType === "purchase_invoice_line";
  const path = isPurchaseInvoice
    ? `/api/finance/ap/invoices/${encodeURIComponent(sourceDocId)}/pricing-components/${encodeURIComponent(componentId)}`
    : `/api/finance/pricing-components/${encodeURIComponent(componentId)}`;

  const upstream = await fetch(
    buildRuntimeUrl(path),
    {
      method: "PATCH",
      headers: upstreamHeaders,
      body: JSON.stringify({ source_doc_type: sourceDocType, create: patchPayload, supersede: null }),
      cache: "no-store",
    },
  );

  const upstreamBody = await readJson(upstream);
  return NextResponse.json(
    upstreamBody ?? normalizeUpstreamError(null, upstream.status, "PRICING_COMPONENT_UPDATE_FAILED"),
    { status: upstream.status },
  );
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

function isSupportedSourceDocType(value: string): boolean {
  return value === "PURCHASE_INVOICE_LINE"
    || value === "purchase_invoice_line"
    || value === "commitment_line";
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
