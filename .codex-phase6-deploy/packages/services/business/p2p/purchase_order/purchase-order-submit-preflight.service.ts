import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface PurchaseOrderPreflightIssue {
  code: string;
  message: string;
  section?: "overview" | "lines" | "schedules" | "distributions";
  details?: Record<string, unknown>;
}

export interface PurchaseOrderSubmitPreflightResult {
  ok: boolean;
  blockers: PurchaseOrderPreflightIssue[];
  warnings: PurchaseOrderPreflightIssue[];
}

interface HeaderRow {
  status: string;
  commitment_type: string;
  company_code_id: string | null;
  requested_by: string | null;
  party_id: string | null;
  party_type: string | null;
  order_type: string | null;
  document_date: string | null;
  effective_date: string | null;
  currency_code: string | null;
  base_currency_code: string | null;
  exchange_rate: string | null;
  total_amount: string;
}

interface LineAuditRow {
  line_count: string;
  invalid_line_count: string;
  currency_mismatch_count: string;
  missing_schedule_count: string;
  schedule_quantity_mismatch_count: string;
  missing_distribution_count: string;
}

/** Authoritative, read-only validation used by both preflight UI and submit. */
export async function purchaseOrderSubmitPreflight(
  db: AnyDb,
  tenantId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderSubmitPreflightResult> {
  const blockers: PurchaseOrderPreflightIssue[] = [];
  const warnings: PurchaseOrderPreflightIssue[] = [];

  const headerResult = await sql<HeaderRow>`
    SELECT status, commitment_type, company_code_id, requested_by,
           party_id, party_type, order_type, document_date, effective_date,
           currency_code, base_currency_code, exchange_rate, total_amount::text
      FROM document.commitment
     WHERE tenant_id = ${tenantId}::uuid
       AND id = ${purchaseOrderId}::uuid
  `.execute(db);
  const header = headerResult.rows[0];
  if (!header || header.commitment_type !== "purchase_order") {
    return {
      ok: false,
      blockers: [{ code: "PO_NOT_FOUND", message: "Purchase order was not found." }],
      warnings,
    };
  }

  if (header.status !== "draft") {
    blockers.push({
      code: "PO_NOT_DRAFT",
      message: `Only a draft purchase order can be submitted (current status: ${header.status}).`,
      section: "overview",
    });
  }

  const required: Array<[string, unknown]> = [
    ["company_code_id", header.company_code_id],
    ["requested_by", header.requested_by],
    ["party_id", header.party_id],
    ["party_type", header.party_type],
    ["order_type", header.order_type],
    ["document_date", header.document_date],
    ["effective_date", header.effective_date],
    ["currency_code", header.currency_code],
    ["base_currency_code", header.base_currency_code],
  ];
  const missingFields = required.filter(([, value]) => value == null || value === "").map(([name]) => name);
  if (missingFields.length > 0) {
    blockers.push({
      code: "PO_REQUIRED_FIELDS_MISSING",
      message: `Required purchase-order fields are missing: ${missingFields.join(", ")}.`,
      section: "overview",
      details: { fields: missingFields },
    });
  }

  if (header.currency_code && header.base_currency_code) {
    const rate = Number(header.exchange_rate);
    if (header.currency_code === header.base_currency_code && rate !== 1) {
      blockers.push({ code: "PO_BASE_CURRENCY_RATE_INVALID", message: "Exchange rate must be 1 for base-currency purchase orders.", section: "overview" });
    } else if (header.currency_code !== header.base_currency_code && (!Number.isFinite(rate) || rate <= 0)) {
      blockers.push({ code: "PO_EXCHANGE_RATE_REQUIRED", message: "A positive exchange rate is required for a foreign-currency purchase order.", section: "overview" });
    }
  }

  const auditResult = await sql<LineAuditRow>`
    WITH lines AS (
      SELECT cl.id, cl.quantity, cl.price_unit, cl.unit_price, cl.currency_code,
             COALESCE((
               SELECT SUM(sl.scheduled_quantity)
                 FROM document.schedule_line sl
                WHERE sl.tenant_id = cl.tenant_id
                  AND sl.source_doc_type = 'commitment_line'
                  AND sl.source_doc_id = cl.commitment_id
                  AND sl.source_line_id = cl.id
                  AND sl.is_current_version = true
                  AND sl.terminal_status IS NULL
             ), 0) AS scheduled_quantity,
             EXISTS (
               SELECT 1 FROM document.schedule_line sl
                WHERE sl.tenant_id = cl.tenant_id
                  AND sl.source_doc_type = 'commitment_line'
                  AND sl.source_doc_id = cl.commitment_id
                  AND sl.source_line_id = cl.id
                  AND sl.is_current_version = true
                  AND sl.terminal_status IS NULL
             ) AS has_schedule,
             EXISTS (
               SELECT 1 FROM document.accounting_distribution ad
                WHERE ad.tenant_id = cl.tenant_id
                  AND ad.source_doc_type = 'commitment_line'
                  AND ad.source_doc_id = cl.commitment_id
                  AND ad.source_line_id = cl.id
             ) AS has_distribution
        FROM document.commitment_line cl
       WHERE cl.tenant_id = ${tenantId}::uuid
         AND cl.commitment_id = ${purchaseOrderId}::uuid
         AND cl.status <> 'cancelled'
    )
    SELECT COUNT(*)::text AS line_count,
           COUNT(*) FILTER (WHERE quantity <= 0 OR price_unit <= 0 OR unit_price < 0)::text AS invalid_line_count,
           COUNT(*) FILTER (WHERE currency_code IS DISTINCT FROM ${header.currency_code})::text AS currency_mismatch_count,
           COUNT(*) FILTER (WHERE NOT has_schedule)::text AS missing_schedule_count,
           COUNT(*) FILTER (WHERE has_schedule AND abs(scheduled_quantity - quantity) > 0.0001)::text AS schedule_quantity_mismatch_count,
           COUNT(*) FILTER (WHERE NOT has_distribution)::text AS missing_distribution_count
      FROM lines
  `.execute(db);
  const audit = auditResult.rows[0]!;
  const count = (value: string) => Number.parseInt(value, 10) || 0;

  if (count(audit.line_count) === 0) blockers.push({ code: "PO_NO_LINES", message: "Purchase order must contain at least one open line.", section: "lines" });
  if (count(audit.invalid_line_count) > 0) blockers.push({ code: "PO_INVALID_LINES", message: "One or more lines have invalid quantity or pricing values.", section: "lines", details: { count: count(audit.invalid_line_count) } });
  if (count(audit.currency_mismatch_count) > 0) blockers.push({ code: "PO_LINE_CURRENCY_MISMATCH", message: "Every line currency must match the purchase-order currency.", section: "lines", details: { count: count(audit.currency_mismatch_count) } });
  if (count(audit.missing_schedule_count) > 0) blockers.push({ code: "PO_LINE_SCHEDULE_MISSING", message: "Every open line must have a current operational schedule.", section: "schedules", details: { count: count(audit.missing_schedule_count) } });
  if (count(audit.schedule_quantity_mismatch_count) > 0) blockers.push({ code: "PO_SCHEDULE_QUANTITY_MISMATCH", message: "Scheduled quantity must equal line quantity before submission.", section: "schedules", details: { count: count(audit.schedule_quantity_mismatch_count) } });
  if (count(audit.missing_distribution_count) > 0) warnings.push({ code: "PO_DISTRIBUTION_MISSING", message: "One or more lines have no accounting distribution; budget policy may block approval.", section: "distributions", details: { count: count(audit.missing_distribution_count) } });

  const total = Number(header.total_amount);
  if (!Number.isFinite(total) || total <= 0) blockers.push({ code: "PO_TOTAL_NOT_POSITIVE", message: "Purchase-order total must be greater than zero.", section: "overview" });

  return { ok: blockers.length === 0, blockers, warnings };
}
