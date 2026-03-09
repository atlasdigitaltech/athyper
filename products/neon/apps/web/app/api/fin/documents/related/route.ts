/**
 * GET /api/fin/documents/related
 *
 * Returns related financial documents for a given source document.
 * Uses the fin.financial_document registry to find:
 *   - Credit notes linked to an invoice
 *   - Debit notes linked to an invoice
 *   - Payments allocated against an invoice
 *   - Journal entries generated from any document
 *   - The parent invoice for a line item (via invoice_id FK)
 *
 * Query params:
 *   docId       — UUID of the source document (required)
 *   docType     — Document type: PURCHASE_INVOICE, CREDIT_NOTE, etc. (required)
 *   entityCode  — Entity code for tenant scoping (required)
 *
 * Security:
 *   - No sql.raw(): all identifiers are static or use sql.table()/sql.ref()
 *   - docType is validated against a static allowlist before query dispatch
 *   - docId is pre-validated to belong to the current tenant before use in JOINs
 *   - Every query hard-applies tenant_id scoping
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

// ── Static allowlist: only these doc types can be queried ───────────

const ALLOWED_DOC_TYPES = new Set([
  "PURCHASE_INVOICE",
  "PAYMENT_ENTRY",
  "JOURNAL_ENTRY",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "ACCRUAL",
  "RECLASS",
  "FX_REVALUATION",
  "IC_ELIMINATION",
]);

// ── Shared SELECT fragment (no sql.raw) ─────────────────────────────

const DOC_SELECT = sql<RelatedDocumentRow>`
  fd.doc_id         as "docId",
  fd.txn_id         as "txnId",
  fd.doc_type       as "docType",
  fd.doc_no         as "docNo",
  fd.doc_date::text as "docDate",
  fd.posting_date::text as "postingDate",
  fd.status,
  fd.currency_code  as "currencyCode",
  fd.total_amount::text as "totalAmount",
  fd.counterparty_type  as "counterpartyType",
  fd.counterparty_id    as "counterpartyId",
  fd.entity_name    as "entityName",
  fd.je_id          as "jeId"
`;

interface RelatedDocumentRow {
  docId: string;
  txnId: string | null;
  docType: string;
  docNo: string;
  docDate: string | null;
  postingDate: string | null;
  status: string;
  currencyCode: string | null;
  totalAmount: string | null;
  counterpartyType: string | null;
  counterpartyId: string | null;
  entityName: string | null;
  relationship: string;
  jeId: string | null;
}

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const url = new URL(req.url);

    const docId = url.searchParams.get("docId");
    const docType = url.searchParams.get("docType");
    const entityCode = url.searchParams.get("entityCode");

    if (!docId || !docType || !entityCode) {
      return errorResponse("VALIDATION", "docId, docType, and entityCode are required", 400);
    }

    // ── A. Validate docType against static allowlist ──
    if (!ALLOWED_DOC_TYPES.has(docType)) {
      return errorResponse("VALIDATION", `Unsupported document type: ${docType}`, 400);
    }

    // ── C. Pre-validate docId belongs to current tenant ──
    // Before using docId in any FK traversal, confirm it exists within
    // the tenant-scoped financial_document registry.
    const ownershipCheck = await sql<{ exists: boolean }>`
      select exists(
        select 1 from fin.financial_document
        where tenant_id = ${tenantUuid}::uuid
          and source_ref_id = ${docId}::uuid
      ) as "exists"
    `.execute(db);

    if (!ownershipCheck.rows[0]?.exists) {
      // Document not found in this tenant — return empty result, not an error,
      // to avoid leaking existence information across tenants
      console.warn(
        `[related-documents] docId=${docId} not found for tenant=${tenantUuid}, docType=${docType}. ` +
          `Returning empty. This may indicate a stale client reference or seed gap.`,
      );
      return successResponse({ items: [], total: 0 });
    }

    const related: RelatedDocumentRow[] = [];

    // 1. For PURCHASE_INVOICE: find credit notes, debit notes, and payments
    if (docType === "PURCHASE_INVOICE") {
      // Credit notes referencing this invoice (separate static query — no sql.raw)
      const creditNotes = await sql<RelatedDocumentRow>`
        select
          ${DOC_SELECT},
          'CREDIT_NOTE' as "relationship"
        from fin.financial_document fd
        where fd.tenant_id = ${tenantUuid}::uuid
          and fd.entity_code = ${entityCode}
          and fd.doc_type = 'CREDIT_NOTE'
          and fd.source_ref_id in (
            select cn.id from fin.credit_note cn
            where cn.tenant_id = ${tenantUuid}::uuid
              and cn.invoice_id = ${docId}::uuid
          )
      `.execute(db);
      related.push(...creditNotes.rows);

      // Debit notes referencing this invoice (separate static query — no sql.raw)
      const debitNotes = await sql<RelatedDocumentRow>`
        select
          ${DOC_SELECT},
          'DEBIT_NOTE' as "relationship"
        from fin.financial_document fd
        where fd.tenant_id = ${tenantUuid}::uuid
          and fd.entity_code = ${entityCode}
          and fd.doc_type = 'DEBIT_NOTE'
          and fd.source_ref_id in (
            select dn.id from fin.debit_note dn
            where dn.tenant_id = ${tenantUuid}::uuid
              and dn.invoice_id = ${docId}::uuid
          )
      `.execute(db);
      related.push(...debitNotes.rows);

      // Payments allocated to this invoice
      const payments = await sql<RelatedDocumentRow>`
        select
          fd.doc_id         as "docId",
          fd.txn_id         as "txnId",
          fd.doc_type       as "docType",
          fd.doc_no         as "docNo",
          fd.doc_date::text as "docDate",
          fd.posting_date::text as "postingDate",
          fd.status,
          fd.currency_code  as "currencyCode",
          pa.allocated_amount::text as "totalAmount",
          fd.counterparty_type  as "counterpartyType",
          fd.counterparty_id    as "counterpartyId",
          fd.entity_name    as "entityName",
          'PAYMENT'         as "relationship",
          fd.je_id          as "jeId"
        from fin.payment_allocation pa
        join fin.payment_entry pe on pe.id = pa.payment_id and pe.tenant_id = pa.tenant_id
        join fin.financial_document fd on fd.source_ref_id = pe.id and fd.tenant_id = pe.tenant_id and fd.doc_type = 'PAYMENT_ENTRY'
        where pa.tenant_id = ${tenantUuid}::uuid
          and pa.invoice_id = ${docId}::uuid
      `.execute(db);
      related.push(...payments.rows);
    }

    // 2. For CREDIT_NOTE: find the parent invoice via static query (no sql.raw)
    if (docType === "CREDIT_NOTE") {
      const parentInvoice = await sql<RelatedDocumentRow>`
        select
          ${DOC_SELECT},
          'PARENT_INVOICE' as "relationship"
        from fin.financial_document fd
        where fd.tenant_id = ${tenantUuid}::uuid
          and fd.doc_type = 'PURCHASE_INVOICE'
          and fd.source_ref_id = (
            select cn.invoice_id from fin.credit_note cn
            where cn.tenant_id = ${tenantUuid}::uuid
              and cn.id = ${docId}::uuid
          )
      `.execute(db);
      related.push(...parentInvoice.rows);
    }

    // 3. For DEBIT_NOTE: find the parent invoice via static query (no sql.raw)
    if (docType === "DEBIT_NOTE") {
      const parentInvoice = await sql<RelatedDocumentRow>`
        select
          ${DOC_SELECT},
          'PARENT_INVOICE' as "relationship"
        from fin.financial_document fd
        where fd.tenant_id = ${tenantUuid}::uuid
          and fd.doc_type = 'PURCHASE_INVOICE'
          and fd.source_ref_id = (
            select dn.invoice_id from fin.debit_note dn
            where dn.tenant_id = ${tenantUuid}::uuid
              and dn.id = ${docId}::uuid
          )
      `.execute(db);
      related.push(...parentInvoice.rows);
    }

    // 4. For any document: find the linked journal entry via document registry
    const journalEntry = await sql<RelatedDocumentRow>`
      select
        fd2.doc_id         as "docId",
        fd2.txn_id         as "txnId",
        fd2.doc_type       as "docType",
        fd2.doc_no         as "docNo",
        fd2.doc_date::text as "docDate",
        fd2.posting_date::text as "postingDate",
        fd2.status,
        fd2.currency_code  as "currencyCode",
        fd2.total_amount::text as "totalAmount",
        null               as "counterpartyType",
        null               as "counterpartyId",
        fd2.entity_name    as "entityName",
        'JOURNAL_ENTRY'    as "relationship",
        fd2.doc_id         as "jeId"
      from fin.financial_document fd
      join fin.financial_document fd2
        on fd2.tenant_id = fd.tenant_id
        and fd2.doc_type = 'JOURNAL_ENTRY'
        and fd2.source_ref_id = fd.je_id
      where fd.tenant_id = ${tenantUuid}::uuid
        and fd.source_ref_id = ${docId}::uuid
        and fd.je_id is not null
    `.execute(db);
    related.push(...journalEntry.rows);

    return successResponse({ items: related, total: related.length });
  } catch (err) {
    console.error("[related-documents] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch related documents",
    );
  } finally {
    await redis?.quit();
  }
}
