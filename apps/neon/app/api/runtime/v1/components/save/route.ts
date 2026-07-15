// POST /api/runtime/v1/components/save
// BFF over the AP pricing-component writer. Unified lifecycle semantics treat
// this as save/replace while the parent document is draft/proforma.
import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

interface PricingComponentSaveRequest {
  source_doc_type: string;
  create:          Record<string, unknown>;
  replace:         { id: string; expectedVersion?: string | number } | null;
}

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
  const parsed: PricingComponentSaveRequest = {
    source_doc_type: sourceDocType,
    create,
    replace:         parseReplaceBlock(body["replace"]),
  };

  const createPayload: Record<string, unknown> = {
    ...parsed.create,
    source_doc_type: parsed.source_doc_type,
  };
  if (!isSupportedSourceDocType(parsed.source_doc_type)) {
    return NextResponse.json(
      {
        error: "SOURCE_DOC_TYPE_NOT_SUPPORTED_BY_WRITER",
        message: "This runtime writer supports purchase invoice and purchase order pricing components only.",
      },
      { status: 400 },
    );
  }

  const sourceDocId = readString(createPayload["source_doc_id"]);
  if (!sourceDocId) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "`create.source_doc_id` is required." },
      { status: 400 },
    );
  }

  const upstreamHeaders = {
    ...buildRuntimeHeaders(session),
    "Content-Type": "application/json",
  };

  const isPurchaseInvoice = parsed.source_doc_type === "PURCHASE_INVOICE_LINE"
    || parsed.source_doc_type === "purchase_invoice_line";
  const path = isPurchaseInvoice
    ? `/api/finance/ap/invoices/${encodeURIComponent(sourceDocId)}/pricing-components`
    : "/api/finance/pricing-components";

  const financeRes = await fetch(
    buildRuntimeUrl(path),
    {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({
        source_doc_type: parsed.source_doc_type,
        create: createPayload,
        // Finance still names the internal compatibility field `supersede`;
        // the public runtime route now uses save/replace vocabulary.
        supersede: parsed.replace,
      }),
      cache: "no-store",
    },
  );
  const financeResult = await readJson(financeRes);
  return NextResponse.json(
    financeResult ?? normalizeUpstreamError(null, financeRes.status, "PRICING_COMPONENT_SAVE_FAILED"),
    { status: financeRes.status },
  );
}

function parseReplaceBlock(value: unknown): PricingComponentSaveRequest["replace"] {
  if (!isRecord(value)) return null;
  const id = value["id"];
  if (typeof id !== "string" || !id.trim()) return null;
  const expectedVersion = value["expectedVersion"];
  if (typeof expectedVersion === "string" || typeof expectedVersion === "number") {
    return { id, expectedVersion };
  }
  return { id };
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
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
