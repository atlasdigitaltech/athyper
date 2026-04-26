import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type RouteContext = { params: Promise<{ id: string }> };

// Map from DB snake_case column names to the camelCase keys the ApInvoiceDetail
// TypeScript interface expects.  The runtime route uses selectAll("pi") which
// returns raw DB column names; the list endpoint uses explicit aliases, so the
// list and detail shapes diverge.  We normalise here so the client type is
// always satisfied by both endpoints.
const INVOICE_HEADER_MAP: Record<string, string> = {
  invoice_number:           "invoiceNumber",
  invoice_source:           "invoiceSource",
  invoice_type:             "invoiceType",
  supplier_id:              "supplierId",
  supplier_invoice_number:  "supplierInvoiceNumber",
  supplier_invoice_date:    "supplierInvoiceDate",
  commitment_id:            "commitmentId",
  invoice_date:             "invoiceDate",
  document_date:            "documentDate",
  due_date:                 "dueDate",
  baseline_date:            "baselineDate",
  received_date:            "receivedDate",
  payable_amount:           "payableAmount",
  outstanding_amount:       "outstandingAmount",
  subtotal_amount:          "subtotalAmount",
  tax_amount:               "taxAmount",
  withholding_tax_amount:   "withholdingTaxAmount",
  total_amount:             "totalAmount",
  paid_amount:              "paidAmount",
  currency_code:            "currencyCode",
  base_currency_code:       "baseCurrencyCode",
  exchange_rate:            "exchangeRate",
  fiscal_year:              "fiscalYear",
  period_number:            "periodNumber",
  posting_date:             "postingDate",
  is_posted:                "isPosted",
  is_voided:                "isVoided",
  is_reversal:              "isReversal",
  reversal_of_id:           "reversalOfId",
  is_credit_note:           "isCreditNote",
  match_type:               "matchType",
  match_status:             "matchStatus",
  workflow_request_id:      "workflowRequestId",
  ap_je_id:                 "apJeId",
  is_on_hold:               "isOnHold",
  hold_reason:              "holdReason",
  payment_term_id:          "paymentTermId",
  payment_method_id:        "paymentMethodId",
  budget_allocation_id:     "budgetAllocationId",
  budget_check_result:      "budgetCheckResult",
  cost_center_id:           "costCenterId",
  profit_center_id:         "profitCenterId",
  project_id:               "projectId",
  line_count:               "lineCount",
  company_code_id:          "companyCodeId",
  created_by:               "createdBy",
  updated_at:               "updatedAt",
  updated_by:               "updatedBy",
};

function normalizeInvoiceHeader(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const [snake, camel] of Object.entries(INVOICE_HEADER_MAP)) {
    if (snake in raw && !(camel in raw)) {
      out[camel] = raw[snake];
    }
  }
  return out;
}

export async function GET(
  _req: Request,
  { params }: RouteContext,
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ap/invoices/${encodeURIComponent(id)}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: res.status });
    const data = await res.json() as Record<string, unknown>;
    const { lines, allocations, ...header } = data;
    return NextResponse.json({
      ...normalizeInvoiceHeader(header),
      lines:       lines       ?? [],
      allocations: allocations ?? [],
    });
  } catch (e) {
    console.error("[api/finance/ap/invoices/[id] GET]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function PATCH(
  req: Request,
  { params }: RouteContext,
) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json() as Record<string, unknown>;
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/ap/invoices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/ap/invoices/[id] PATCH]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
