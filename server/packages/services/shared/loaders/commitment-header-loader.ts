/**
 * Shared loader — commitment header snapshot for cascade / validation.
 *
 * Purpose
 * -------
 * Three P2P callers (purchase-invoice header-defaults resolver,
 * receipt-from-commitment service, service-sheet-from-commitment service)
 * used to run the same SELECT against `document.commitment` inline. This
 * centralises the query so:
 *
 *   - The party_type='SUPPLIER' → party_id mapping to `supplier_id` lives
 *     in exactly one place. If polymorphic-party semantics evolve, the
 *     three callers keep working.
 *   - Column names stay consistent even after the DDL rename (e.g. code
 *     vs. commitment_number vs. document_no historical drift).
 *   - Callers can trust the snapshot for both status / type gating AND
 *     cascade-defaults patches — the shape covers both use cases.
 *
 * NOT a resolver
 * --------------
 * This is a raw data loader. The cascade orchestration for PI already runs
 * through the resolver framework (@athyper/cascade evaluator +
 * `applyServerSourceChangeActions`); this loader is just the shared SQL
 * that PI's `commitment_default` resolver — and the receipt / SES services
 * — all read from.
 *
 * Tenant safety
 * -------------
 * Never trusts caller-supplied tenant_id; always uses the ctx tenantId
 * (or the tenantId argument). Returns null if commitment does not exist,
 * belongs to a different tenant, or has null tenant scope.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface CommitmentHeaderSnapshot {
  id:                  string;
  tenantId:            string;
  companyCodeId:       string;
  code:                string;
  commitmentType:      string;
  orderType:           string | null;
  status:              string;
  supplierId:          string | null;   // party_id when party_type='SUPPLIER'
  requestedBy:         string;
  responsiblePersonId: string | null;
  documentDate:        string;
  effectiveDate:       string;
  expiryDate:          string | null;
  currencyCode:        string;
  baseCurrencyCode:    string;
  paymentTermId:       string | null;
}

interface CommitmentHeaderRow {
  id:                    string;
  tenant_id:             string;
  company_code_id:       string;
  code:                  string;
  commitment_type:       string;
  order_type:            string | null;
  status:                string;
  supplier_id:           string | null;
  requested_by:          string;
  responsible_person_id: string | null;
  document_date:         string;
  effective_date:        string;
  expiry_date:           string | null;
  currency_code:         string;
  base_currency_code:    string;
  payment_term_id:       string | null;
}

/**
 * Load a commitment header snapshot for the given tenant.
 * Returns null if not found in tenant scope.
 */
export async function loadCommitmentHeader(
  db:            AnyDb,
  tenantId:      string,
  commitmentId:  string,
): Promise<CommitmentHeaderSnapshot | null> {
  const rows = await sql<CommitmentHeaderRow>`
    SELECT
      c.id::text                    AS id,
      c.tenant_id::text             AS tenant_id,
      c.company_code_id::text       AS company_code_id,
      c.code                        AS code,
      c.commitment_type             AS commitment_type,
      c.order_type                  AS order_type,
      c.status                      AS status,
      CASE WHEN c.party_type = 'SUPPLIER'
           THEN c.party_id::text
           END                      AS supplier_id,
      c.requested_by::text          AS requested_by,
      c.responsible_person_id::text AS responsible_person_id,
      c.document_date::text         AS document_date,
      c.effective_date::text        AS effective_date,
      c.expiry_date::text           AS expiry_date,
      c.currency_code               AS currency_code,
      c.base_currency_code          AS base_currency_code,
      c.payment_term_id::text       AS payment_term_id
    FROM document.commitment c
   WHERE c.id        = ${commitmentId}::uuid
     AND c.tenant_id = ${tenantId}::uuid
   LIMIT 1
  `.execute(db);

  const row = rows.rows[0];
  if (!row) return null;

  return {
    id:                  row.id,
    tenantId:            row.tenant_id,
    companyCodeId:       row.company_code_id,
    code:                row.code,
    commitmentType:      row.commitment_type,
    orderType:           row.order_type,
    status:              row.status,
    supplierId:          row.supplier_id,
    requestedBy:         row.requested_by,
    responsiblePersonId: row.responsible_person_id,
    documentDate:        row.document_date,
    effectiveDate:       row.effective_date,
    expiryDate:          row.expiry_date,
    currencyCode:        row.currency_code,
    baseCurrencyCode:    row.base_currency_code,
    paymentTermId:       row.payment_term_id,
  };
}

/**
 * Project a commitment snapshot into a cascade-defaults patch — the flat
 * key/value shape resolvers return. Keeps the field-name mapping (physical
 * → PI-facing) in one place. Extend when new PI cascade fields are added.
 */
export function commitmentHeaderToDefaultsPatch(
  snapshot: CommitmentHeaderSnapshot,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (snapshot.companyCodeId)    patch["company_code_id"]    = snapshot.companyCodeId;
  if (snapshot.supplierId)       patch["supplier_id"]        = snapshot.supplierId;
  if (snapshot.currencyCode)     patch["currency_code"]      = snapshot.currencyCode;
  if (snapshot.baseCurrencyCode) patch["base_currency_code"] = snapshot.baseCurrencyCode;
  if (snapshot.paymentTermId)    patch["payment_term_id"]    = snapshot.paymentTermId;
  return patch;
}
