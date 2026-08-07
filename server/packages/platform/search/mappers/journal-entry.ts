/**
 * Journal entry search document enrichment override.
 *
 * Source: document.journal_entry
 * Entity type: "journal_entry" (matches control.entity.name)
 *
 * The generic default-mapper handles id/title/summary/status/tags/
 * updated_at from conventions. This override adds financial extensions:
 *   - je_number (explicit — default would pick `name` first which is
 *     usually empty for journal entries)
 *   - total_debit + total_credit for amount display
 *   - document_date + posting_date
 *   - base_currency, fiscal_year, period_number
 *   - source_doc_type + book_id for lineage filtering
 */

import type { SearchDocument } from "../client/index-schema.js";
import type { EntityDocumentOverride } from "../client/default-mapper.js";

export const JOURNAL_ENTRY_ENTITY_TYPE = "journal_entry";

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

export const journalEntryOverride: EntityDocumentOverride = (
  defaultDoc: SearchDocument,
  row:        Record<string, unknown>,
): SearchDocument => {
  const name       = typeof row["name"]       === "string" ? row["name"].trim()       : "";
  const jeNumber   = typeof row["je_number"]  === "string" ? row["je_number"].trim()  : "";

  const title = name || jeNumber || defaultDoc.title;

  return {
    ...defaultDoc,
    title,

    je_number:       jeNumber || undefined,
    document_date:   toIsoDate(row["document_date"]),
    posting_date:    toIsoDate(row["posting_date"]),
    total_debit:     toNumber(row["total_debit"]),
    total_credit:    toNumber(row["total_credit"]),
    base_currency:   typeof row["base_currency"]   === "string" ? row["base_currency"]   : undefined,
    fiscal_year:     toNumber(row["fiscal_year"]),
    period_number:   toNumber(row["period_number"]),
    source_doc_type: typeof row["source_doc_type"] === "string" ? row["source_doc_type"] : undefined,
    book_id:         typeof row["book_id"]         === "string" ? row["book_id"]         : undefined,
    is_reversal:     typeof row["is_reversal"]     === "boolean" ? row["is_reversal"]    : undefined,
  };
};
