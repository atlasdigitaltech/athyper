/**
 * Invoice search document enrichment override.
 *
 * Source: document.purchase_invoice
 * Entity type: "invoice" (matches control.entity.name)
 *
 * The generic default-mapper already handles id/title/summary/status/
 * tags/updated_at from conventions. This override adds financial-specific
 * extensions that make the search UI useful:
 *   - supplier_invoice_number (searchable alongside invoice_number)
 *   - total_amount + currency_code for amount display/filtering
 *   - document_date for chronological filters
 *   - fiscal_year + period_number for period-scoped queries
 *
 * Signature: (defaultDoc, row) → enriched doc.
 */

import type { SearchDocument } from "../client/index-schema.js";
import type { EntityDocumentOverride } from "../client/default-mapper.js";

export const INVOICE_ENTITY_TYPE = "invoice";

function toIsoDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const invoiceOverride: EntityDocumentOverride = (
  defaultDoc: SearchDocument,
  row:        Record<string, unknown>,
): SearchDocument => {
  // Title: the default picks `name` first; for purchase_invoice the
  // invoice_number is the canonical identifier. Force it.
  const title = typeof row["invoice_number"] === "string" && row["invoice_number"].trim()
    ? row["invoice_number"]
    : defaultDoc.title;

  // Summary: prefer description, fall back to notes.
  const summary =
    (typeof row["description"] === "string" && row["description"].trim()) ||
    (typeof row["notes"] === "string"       && row["notes"].trim())       ||
    defaultDoc.summary;

  return {
    ...defaultDoc,
    title,
    ...(summary ? { summary } : {}),

    // Financial extensions — pass-through already covers scalar columns,
    // but these are re-stated here to document the search-relevant set.
    supplier_invoice_number: typeof row["supplier_invoice_number"] === "string"
      ? row["supplier_invoice_number"]
      : undefined,
    total_amount:  toNumber(row["total_amount"]),
    currency_code: typeof row["currency_code"] === "string" ? row["currency_code"] : undefined,
    document_date: toIsoDate(row["document_date"]),
    fiscal_year:   toNumber(row["fiscal_year"]),
    period_number: toNumber(row["period_number"]),
    match_status:  typeof row["match_status"] === "string" ? row["match_status"] : undefined,
    is_credit_note: typeof row["is_credit_note"] === "boolean" ? row["is_credit_note"] : undefined,
  };
};
