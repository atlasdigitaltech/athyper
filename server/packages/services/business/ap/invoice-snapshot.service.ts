/**
 * Invoice Snapshot Service — BP-first capture.
 *
 * Freezes party / address / bank details from the BP-first master tables onto
 * immutable invoice_*_snapshot rows. Called from invoice-submit.handler.ts
 * before any non-draft status transition (so workflow, self-approve, and
 * auto-approve paths all freeze the legal record uniformly).
 *
 * Source mapping (per the locked schema decision):
 *   - Party  : document.purchase_invoice.supplier_id
 *              → master.supplier.business_partner_id
 *              → master.business_partner (legal_name, registration_no, country)
 *              tax_registration_no: master.party_tax_profile.vat_id ?? tax_id
 *                                   (fallback to business_partner.registration_no)
 *   - Address: master.v_business_partner_address
 *              purpose = 'remittance' preferred, then 'default', then is_primary
 *   - Bank   : master.v_business_partner_bank_account
 *              purpose = 'disbursement' preferred, then 'default', then is_primary
 *              account_id_type = 'IBAN' routes value into iban column
 *
 * Idempotency: each INSERT uses ON CONFLICT DO NOTHING on the snapshot table's
 * UNIQUE constraints, so re-submits are safe no-ops.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface SnapshotCaptureResult {
  /** True when this call inserted a new party snapshot row. */
  party:   boolean;
  /** True when this call inserted a new address snapshot row. */
  address: boolean;
  /** True when this call inserted a new bank snapshot row. */
  bank:    boolean;
  /** Resolved business_partner_id for the supplier (null when none). */
  bpId:    string | null;
}

export interface SnapshotLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Captures party / address / bank snapshots for a purchase invoice.
 *
 * Should be invoked inside the submit-handler transaction, before any UPDATE
 * that moves status out of 'draft'. Skipping snapshot capture for one_time
 * suppliers is intentional — those invoices carry counterparty data on the
 * invoice itself; phase-2 work will materialize a one-time snapshot from
 * invoice metadata.
 */
export async function captureInvoiceSnapshots(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  supplierId:  string | null,
  capturedBy:  string,
  logger?:     SnapshotLogger,
): Promise<SnapshotCaptureResult> {
  if (!supplierId) {
    logger?.warn("ap_snapshot_skipped_no_supplier", { tenantId, invoiceId });
    return { party: false, address: false, bank: false, bpId: null };
  }

  // ── Resolve business_partner_id from the supplier role ────────────────────
  const bpResult = await sql<{ business_partner_id: string }>`
    SELECT business_partner_id
      FROM master.supplier
     WHERE id = ${supplierId} AND tenant_id = ${tenantId}
     LIMIT 1
  `.execute(db);

  const bpId = bpResult.rows[0]?.business_partner_id ?? null;
  if (!bpId) {
    logger?.warn("ap_snapshot_supplier_missing_bp", { tenantId, invoiceId, supplierId });
    return { party: false, address: false, bank: false, bpId: null };
  }

  // ── Party snapshot ────────────────────────────────────────────────────────
  // tax_registration_no:
  //   1. master.party_tax_profile.vat_id (active, BP-owned, any country)
  //   2. master.party_tax_profile.tax_id (same precedence)
  //   3. master.business_partner.registration_no (corporate registration fallback)
  const partyResult = await sql<{ id: string }>`
    INSERT INTO document.invoice_party_snapshot (
      tenant_id, purchase_invoice_id, supplier_id, party_name,
      tax_registration_no, legal_entity_name, country_code,
      is_one_time_supplier, captured_by
    )
    SELECT ${tenantId}::uuid, ${invoiceId}::uuid, ${supplierId}::uuid,
           COALESCE(bp.legal_name, bp.display_name, bp.name),
           COALESCE(
             (SELECT COALESCE(ptp.vat_id, ptp.tax_id)
                FROM master.party_tax_profile ptp
               WHERE ptp.tenant_id  = ${tenantId}::uuid
                 AND ptp.owner_id   = bp.id
                 AND ptp.owner_type = 'business_partner'
                 AND ptp.is_active  = true
                 AND (ptp.vat_id IS NOT NULL OR ptp.tax_id IS NOT NULL)
               ORDER BY (ptp.vat_id IS NOT NULL) DESC, ptp.country_code
               LIMIT 1),
             bp.registration_no
           ),
           bp.legal_name,
           COALESCE(bp.registration_country_code, bp.tax_residence_country_code),
           false,
           ${capturedBy}::uuid
      FROM master.business_partner bp
     WHERE bp.id = ${bpId}::uuid AND bp.tenant_id = ${tenantId}::uuid
    ON CONFLICT (purchase_invoice_id) DO NOTHING
    RETURNING id
  `.execute(db);

  // ── Address snapshot (REMIT_TO) ───────────────────────────────────────────
  // v_business_partner_address columns: line1, city, region, postal_code, country_code.
  // No address_line_2 / state_province from the view — leave NULL; downstream
  // tooling can extend the view if a finer-grained capture is required.
  const addrResult = await sql<{ id: string }>`
    INSERT INTO document.invoice_address_snapshot (
      tenant_id, purchase_invoice_id, address_type,
      address_line_1, address_line_2, city, state_province, postal_code, country_code,
      captured_by
    )
    SELECT ${tenantId}::uuid, ${invoiceId}::uuid, 'REMIT_TO',
           a.line1, NULL, a.city, a.region, a.postal_code, COALESCE(a.country_code, 'XX'),
           ${capturedBy}::uuid
      FROM master.v_business_partner_address a
     WHERE a.owner_id  = ${bpId}::uuid
       AND a.tenant_id = ${tenantId}::uuid
       AND (a.effective_until IS NULL OR a.effective_until >= CURRENT_DATE)
       AND a.line1 IS NOT NULL
     ORDER BY
       (a.purpose = 'remittance') DESC,
       (a.purpose = 'default')    DESC,
        a.is_primary              DESC,
        a.effective_from          DESC NULLS LAST
     LIMIT 1
    ON CONFLICT (purchase_invoice_id, address_type) DO NOTHING
    RETURNING id
  `.execute(db);

  // ── Bank snapshot ─────────────────────────────────────────────────────────
  // invoice_bank_snapshot CHECK requires account_number IS NOT NULL OR iban IS NOT NULL.
  // master.bank_account.account_id_type is 'IBAN' or 'LOCAL'. Route 'IBAN' values
  // into the iban column for legal/regulatory clarity; LOCAL values into
  // account_number. swift_bic uses the view's COALESCE-resolved bic column.
  const bankResult = await sql<{ id: string }>`
    INSERT INTO document.invoice_bank_snapshot (
      tenant_id, purchase_invoice_id,
      bank_name, bank_country_code, account_holder_name,
      account_number, iban, swift_bic, routing_number, bank_branch,
      captured_by
    )
    SELECT ${tenantId}::uuid, ${invoiceId}::uuid,
           b.bank_name, b.bank_country_code, b.account_holder_name,
           CASE WHEN UPPER(COALESCE(b.account_id_type, '')) = 'IBAN'
                THEN NULL ELSE b.account_number END,
           CASE WHEN UPPER(COALESCE(b.account_id_type, '')) = 'IBAN'
                THEN b.account_number ELSE NULL END,
           b.bic,
           NULL,                         -- routing_number not exposed by view; phase 2
           b.branch_name,
           ${capturedBy}::uuid
      FROM master.v_business_partner_bank_account b
     WHERE b.business_partner_id = ${bpId}::uuid
       AND b.tenant_id           = ${tenantId}::uuid
       AND (b.effective_until IS NULL OR b.effective_until >= CURRENT_DATE)
       AND b.account_holder_name IS NOT NULL
       AND b.bank_name           IS NOT NULL
       AND b.account_number      IS NOT NULL
     ORDER BY
       (b.purpose = 'disbursement') DESC,
       (b.purpose = 'default')      DESC,
        b.is_primary                DESC,
        b.effective_from            DESC NULLS LAST
     LIMIT 1
    ON CONFLICT (purchase_invoice_id) DO NOTHING
    RETURNING id
  `.execute(db);

  const result: SnapshotCaptureResult = {
    party:   partyResult.rows.length > 0,
    address: addrResult.rows.length  > 0,
    bank:    bankResult.rows.length  > 0,
    bpId,
  };
  logger?.info("ap_snapshot_captured", { tenantId, invoiceId, ...result });
  return result;
}
