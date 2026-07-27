/**
 * Purchase Invoice Submit Preflight
 *
 * Read-only check that returns the blockers and warnings the user would
 * hit if they clicked Submit right now. Surfaced in the UI via a tooltip
 * + inline panel so users see what's wrong without needing to actually
 * fail Submit and read the error.
 *
 * Reuses {@link validatePurchaseInvoiceInvariants} for the financial /
 * structural blockers — single source of truth so the preflight never
 * disagrees with the real submit handler.
 *
 * Additional preflight-only checks (not in the invariants service because
 * they're soft warnings, not hard invariants):
 *   - PARTIAL_PAYMENT_RECEIVED (warning) — invoice already has paid_amount > 0
 *   - NO_LINES                 (blocker) — invoice has zero lines (can't submit
 *                                          an empty PI even though invariants
 *                                          would technically pass at 0 = 0)
 *   - NO_DISTRIBUTIONS         (warning) — no AD rows; policy may resolve at
 *                                          posting but the user should know
 *
 * Note on shape: blockers gate Submit (UI disables the button), warnings
 * allow Submit through a confirmation step. Both use the same `code` +
 * `message` shape so the client can render them in a unified list.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { validatePurchaseInvoiceInvariants } from "./invoice-invariants.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface PreflightIssue {
  code:    string;
  message: string;
  /** Optional anchor — UI scrolls to this section when the issue is clicked. */
  section?: string;
  details?: Record<string, unknown>;
}

export interface PurchaseInvoiceSubmitPreflightResult {
  /** True when there are zero blockers. Warnings do not affect ok. */
  ok:       boolean;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
}

interface PreflightRow {
  status:       string;
  paid_amount:  string;
  line_count:   string;
  ad_count:     string;
}

export async function purchaseInvoiceSubmitPreflight(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
): Promise<PurchaseInvoiceSubmitPreflightResult> {
  const blockers: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];

  // Snapshot in one query — header status + paid amount + structural counts.
  const headerRows = await sql<PreflightRow>`
    SELECT pi.status,
           pi.paid_amount::text                       AS paid_amount,
           (SELECT COUNT(*)::text
              FROM document.purchase_invoice_line pil
             WHERE pil.purchase_invoice_id = pi.id
               AND pil.tenant_id           = pi.tenant_id) AS line_count,
           (SELECT COUNT(*)::text
              FROM document.accounting_distribution ad
             WHERE ad.source_doc_type = 'purchase_invoice_line'
               AND ad.source_doc_id   = pi.id
               AND ad.tenant_id       = pi.tenant_id)      AS ad_count
      FROM document.purchase_invoice pi
     WHERE pi.id        = ${invoiceId}::uuid
       AND pi.tenant_id = ${tenantId}::uuid
  `.execute(db);

  const row = headerRows.rows[0];
  if (!row) {
    blockers.push({
      code:    "NOT_FOUND",
      message: `Invoice ${invoiceId} not found.`,
    });
    return { ok: false, blockers, warnings };
  }

  // ── Hard structural blockers ─────────────────────────────────────────────
  const lineCount = parseInt(row.line_count, 10);
  if (lineCount === 0) {
    blockers.push({
      code:    "NO_LINES",
      message: "Invoice has no lines.",
      section: "lines",
    });
  }

  // ── Reuse the canonical invariants service for the financial checks ─────
  const invariants = await validatePurchaseInvoiceInvariants(db, tenantId, invoiceId, { phase: "submit" });
  for (const v of invariants.violations) {
    blockers.push({
      code:    v.code,
      message: v.message,
      section: deriveSectionFromInvariant(v.code),
      details: v.details,
    });
  }

  // ── Soft warnings ───────────────────────────────────────────────────────
  const adCount = parseInt(row.ad_count, 10);
  if (lineCount > 0 && adCount === 0) {
    warnings.push({
      code:    "NO_DISTRIBUTIONS",
      message: "No accounting distributions. Policy will resolve them at posting if a default applies.",
      section: "distributions",
    });
  }

  const paid = Number(row.paid_amount);
  if (Number.isFinite(paid) && paid > 0) {
    warnings.push({
      code:    "PARTIAL_PAYMENT_RECEIVED",
      message: "Invoice has received payment activity. Editing payment-related fields is restricted.",
      section: "payment",
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Map invariant codes to a UI section anchor so the client can deep-link the
 * blocker pill to the right scroll target. Returns `undefined` when the
 * invariant spans the whole document (e.g. header-total drift).
 */
function deriveSectionFromInvariant(code: string): string | undefined {
  switch (code) {
    case "AD_SPLIT_PERCENT_NOT_100":
    case "AD_SPLIT_AMOUNT_MISMATCH":
    case "AD_SPLIT_QUANTITY_MISMATCH":
    case "ASSET_LINE_AD_MISSING_CAPEX":
      return "distributions";
    case "PIL_SITE_SCOPE_MISMATCH":
    case "PIL_SHIPTO_NOT_LINKED_TO_SITE":
    case "PIL_SHIPFROM_NOT_LINKED_TO_SUPPLIER":
      return "lines";
    case "PC_BASIS_VALUE_DRIFT":
    case "PC_APPORTION_SUM_DRIFT":
    case "PC_SUPERSEDE_CHAIN_BROKEN":
    case "PC_BASE_REQUIRED_FOR_BASIS":
      return "pricing_components";
    case "PO_COMMITMENT_REQUIRED":
    case "REVERSAL_OF_NOT_POSTED":
      return "overview";
    default:
      return undefined;
  }
}
