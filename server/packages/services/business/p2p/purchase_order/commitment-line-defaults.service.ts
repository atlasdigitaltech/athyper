/**
 * Commitment line default resolvers.
 *
 * Mirrors purchase_invoice/pi-line-defaults.service.ts. Service-layer owner for
 * user-visible defaults on document.commitment_line that would otherwise be
 * created by DB triggers. Idempotent — safe to call from records.route.ts
 * create/PATCH hooks AND from writer services (commitment-from-requisition,
 * future contract-conversion).
 *
 * Concurrency-safe:
 *   - AD insert uses ON CONFLICT (ad_line_dist_uq) DO NOTHING (matches PI)
 *   - Actor null-safety via all-zero UUID fallback (matches PI convention)
 *
 * Except-by-default discriminators (existing schema — no new hardcoded strings):
 *   - AD:  account_source ∈ {'PENDING','PROFILE','FALLBACK'} → system-owned
 *          account_source = 'OVERRIDE'                        → user-owned (frozen)
 *   - PC:  origin classified via control.lookup_value(
 *            domain_code = 'pricing_component.origin_ownership')
 *          metadata.ownership = 'system_owned' → refresh permitted
 *          metadata.ownership = 'user_owned'   → frozen
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { copyPricingComponentsFromContractLine } from "./commitment-line-pc-copy.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface ApplyCommitmentLineDefaultsInput {
  tenantId:         string;
  commitmentId:     string;
  commitmentLineId: string;
  principalId:      string | null;
}

/**
 * Rebuild buyer-authored commitment header projections from their authoritative
 * line children. Call inside the writer transaction after line/schedule changes.
 */
export async function refreshCommitmentHeaderAmounts(
  db: AnyDb,
  input: { tenantId: string; commitmentId: string; principalId: string | null },
): Promise<{ totalAmount: number; scheduledAmount: number }> {
  const actor = input.principalId ?? SYSTEM_ACTOR;
  const result = await sql<{ total_amount: string; scheduled_amount: string }>`
    WITH line_totals AS (
      SELECT COALESCE(SUM(cl.net_amount), 0)::numeric(18,4) AS total_amount
        FROM document.commitment_line cl
       WHERE cl.tenant_id = ${input.tenantId}::uuid
         AND cl.commitment_id = ${input.commitmentId}::uuid
    ), schedule_totals AS (
      SELECT COALESCE(SUM(sl.scheduled_amount), 0)::numeric(18,4) AS scheduled_amount
        FROM document.schedule_line sl
       WHERE sl.tenant_id = ${input.tenantId}::uuid
         AND sl.source_doc_type = 'commitment_line'
         AND sl.source_doc_id = ${input.commitmentId}::uuid
         AND sl.is_current_version = true
         AND sl.terminal_status IS NULL
    )
    UPDATE document.commitment c
       SET total_amount = lt.total_amount,
           scheduled_amount = st.scheduled_amount,
           updated_at = now(),
           updated_by = ${actor}::uuid,
           row_version = c.row_version + 1
      FROM line_totals lt, schedule_totals st
     WHERE c.tenant_id = ${input.tenantId}::uuid
       AND c.id = ${input.commitmentId}::uuid
    RETURNING c.total_amount::text, c.scheduled_amount::text
  `.execute(db);
  const row = result.rows[0];
  return {
    totalAmount: Number(row?.total_amount ?? 0),
    scheduledAmount: Number(row?.scheduled_amount ?? 0),
  };
}

/**
 * Apply all commitment_line defaults. Called after INSERT of a commitment_line
 * row. Runs inside the caller's transaction — do not manage transactions here.
 */
export async function applyCommitmentLineDefaults(
  db: AnyDb,
  input: ApplyCommitmentLineDefaultsInput,
): Promise<void> {
  await createCommitmentLineDefaultAd(db, input);
  await copyContractPricingComponentsIfApplicable(db, input);
  // schedule_line default is owned by trg_commitment_line_default_schedule (kept).
}

/**
 * Create a default AD row for the commitment_line. Matches PI canonical pattern:
 *   distribution_basis = 'PERCENT'
 *   split_pct          = 100
 *   distributed_amount = net_amount (COALESCE with 0)
 *   account_source     = 'PENDING' (posting service resolves gl_account_id)
 * Idempotent via ON CONFLICT (ad_line_dist_uq) DO NOTHING.
 */
export async function createCommitmentLineDefaultAd(
  db: AnyDb,
  input: ApplyCommitmentLineDefaultsInput,
): Promise<void> {
  await sql`
    INSERT INTO document.accounting_distribution (
        tenant_id,
        source_doc_type, source_doc_id, source_line_id,
        distribution_no, distribution_basis, split_pct,
        distributed_amount, currency_code,
        account_source,
        created_by
    )
    SELECT cl.tenant_id,
           'commitment_line', cl.commitment_id, cl.id,
           1, 'PERCENT', 100,
           COALESCE(cl.net_amount, 0), cl.currency_code,
           'PENDING',
           ${input.principalId ?? SYSTEM_ACTOR}::uuid
      FROM document.commitment_line cl
     WHERE cl.tenant_id     = ${input.tenantId}::uuid
       AND cl.id            = ${input.commitmentLineId}::uuid
       AND cl.commitment_id = ${input.commitmentId}::uuid
    ON CONFLICT (source_doc_type, source_doc_id, source_line_id, distribution_no) DO NOTHING
  `.execute(db);
}

/**
 * If the just-inserted line carries parent_contract_line_id, copy line-scope
 * pricing_component rows from the parent contract commitment_line. No-op when
 * the FK is null. Uses commitment-line-pc-copy.service.ts for the actual copy.
 */
async function copyContractPricingComponentsIfApplicable(
  db: AnyDb,
  input: ApplyCommitmentLineDefaultsInput,
): Promise<void> {
  const row = await sql<{
    parent_contract_line_id: string | null;
    company_code_id:         string;
    currency_code:           string;
    base_currency_code:      string | null;
    exchange_rate:           string | number | null;
  }>`
    SELECT cl.parent_contract_line_id,
           cl.company_code_id,
           cl.currency_code,
           c.base_currency_code,
           c.exchange_rate
      FROM document.commitment_line cl
      JOIN document.commitment c ON c.id = cl.commitment_id
     WHERE cl.tenant_id = ${input.tenantId}::uuid
       AND cl.id        = ${input.commitmentLineId}::uuid
     LIMIT 1
  `.execute(db);

  const line = row.rows[0];
  if (!line || !line.parent_contract_line_id) return;

  await copyPricingComponentsFromContractLine(db, {
    tenantId:             input.tenantId,
    parentContractLineId: line.parent_contract_line_id,
    commitmentLineId:     input.commitmentLineId,
    commitmentId:         input.commitmentId,
    companyCodeId:        line.company_code_id,
    currencyCode:         line.currency_code,
    baseCurrencyCode:     line.base_currency_code ?? line.currency_code,
    exchangeRate:         Number(line.exchange_rate ?? 1),
    principalId:          input.principalId,
  });
}


export interface RefreshCommitmentLineChildrenInput {
  tenantId:         string;
  commitmentLineId: string;
  principalId:      string | null;
}

/**
 * Refresh system-owned AD/PC rows after the line UPDATE commits.
 * Called from records.route.ts PATCH hook.
 *
 * AD refresh discriminator: account_source != 'OVERRIDE'
 * PC refresh discriminator: origin has metadata.ownership = 'system_owned'
 *                           (via control.lookup_value domain_code
 *                            'pricing_component.origin_ownership')
 */
export async function refreshCommitmentLineChildren(
  db: AnyDb,
  input: RefreshCommitmentLineChildrenInput,
): Promise<{ adRefreshed: number; pcRefreshed: number }> {
  const actor = input.principalId ?? SYSTEM_ACTOR;

  const adResult = await sql`
    UPDATE document.accounting_distribution ad
       SET distributed_amount = cl.net_amount,
           currency_code      = cl.currency_code,
           updated_at         = now(),
           updated_by         = ${actor}::uuid
      FROM document.commitment_line cl
     WHERE cl.tenant_id       = ${input.tenantId}::uuid
       AND cl.id              = ${input.commitmentLineId}::uuid
       AND ad.tenant_id       = cl.tenant_id
       AND ad.source_doc_type = 'commitment_line'
       AND ad.source_line_id  = cl.id
       AND ad.account_source <> 'OVERRIDE'
  `.execute(db);

  const pcResult = await sql`
    UPDATE document.pricing_component pc
       SET base_for_calculation = CASE
               WHEN pc.entry_level = 'line' THEN cl.net_amount
               ELSE pc.base_for_calculation
           END,
           computed_amount = CASE
               WHEN pc.basis = 'percent'  THEN (cl.net_amount * COALESCE(pc.rate_value,0)) / 100
               WHEN pc.basis = 'per_unit' THEN cl.quantity * COALESCE(pc.rate_value,0)
               WHEN pc.basis IN ('amount','flat') THEN COALESCE(pc.amount_value,0)
               ELSE pc.computed_amount
           END,
           updated_at  = now(),
           updated_by  = ${actor}::uuid,
           row_version = pc.row_version + 1
      FROM document.commitment_line cl
     WHERE cl.tenant_id        = ${input.tenantId}::uuid
       AND cl.id               = ${input.commitmentLineId}::uuid
       AND pc.tenant_id        = cl.tenant_id
       AND pc.source_doc_type  = 'commitment_line'
       AND pc.source_line_id   = cl.id
       AND pc.superseded_by_id IS NULL
       AND pc.is_apportioned   = false
       AND pc.origin IN (
           SELECT lv.code FROM control.lookup_value lv
            WHERE lv.domain_code = 'pricing_component.origin_ownership'
              AND (lv.tenant_id = cl.tenant_id OR lv.tenant_id IS NULL)
              AND lv.metadata->>'ownership' = 'system_owned'
              AND lv.status = 'active'
       )
  `.execute(db);

  const lineRow = await sql<{ commitment_id: string }>`
    SELECT commitment_id
      FROM document.commitment_line
     WHERE tenant_id = ${input.tenantId}::uuid
       AND id        = ${input.commitmentLineId}::uuid
     LIMIT 1
  `.execute(db);
  if (lineRow.rows[0]) {
    await refreshCommitmentLineTaxAmountCache(db, {
      tenantId:         input.tenantId,
      commitmentId:     lineRow.rows[0].commitment_id,
      commitmentLineId: input.commitmentLineId,
      principalId:      input.principalId,
    });
  }

  return {
    adRefreshed: Number(adResult.numAffectedRows ?? 0),
    pcRefreshed: Number(pcResult.numAffectedRows ?? 0),
  };
}

export interface SyncCommitmentLineTaxComponentInput {
  tenantId:         string;
  commitmentId:     string;
  commitmentLineId: string;
  principalId:      string | null;
}

/**
 * Keeps the line's Tax Group picker and its resolver-owned Tax pricing
 * component in sync. User-created Tax Drawer rows are deliberately untouched.
 *
 * Ownership discriminator:
 *   origin = 'system_resolved'
 *   metadata.source = 'tax_group.default_pricing_component'
 */
export async function syncCommitmentLineTaxComponentFromTaxGroup(
  db: AnyDb,
  input: SyncCommitmentLineTaxComponentInput,
): Promise<{ deleted: number; inserted: number }> {
  const actor = input.principalId ?? SYSTEM_ACTOR;

  const deleted = await sql`
    DELETE FROM document.pricing_component pc
     WHERE pc.tenant_id        = ${input.tenantId}::uuid
       AND pc.source_doc_type  = 'commitment_line'
       AND pc.source_doc_id    = ${input.commitmentId}::uuid
       AND pc.source_line_id   = ${input.commitmentLineId}::uuid
       AND pc.term_type        = 'tax'
       AND pc.origin           = 'system_resolved'
       AND pc.metadata->>'source' = 'tax_group.default_pricing_component'
  `.execute(db);

  const inserted = await sql`
    WITH line_ctx AS (
      SELECT
          cl.tenant_id,
          cl.company_code_id,
          cl.commitment_id,
          cl.id AS commitment_line_id,
          cl.tax_group_id,
          cl.net_amount,
          cl.currency_code,
          c.base_currency_code,
          c.exchange_rate
        FROM document.commitment_line cl
        JOIN document.commitment c
          ON c.tenant_id = cl.tenant_id
         AND c.id        = cl.commitment_id
       WHERE cl.tenant_id     = ${input.tenantId}::uuid
         AND cl.commitment_id = ${input.commitmentId}::uuid
         AND cl.id            = ${input.commitmentLineId}::uuid
         AND cl.tax_group_id IS NOT NULL
       LIMIT 1
    ),
    candidates AS (
      SELECT
          lc.*,
          tgc.calculation_seq,
          COALESCE(tgc.rate_override, trs.rate_value) AS component_rate,
          COALESCE(
            trs.recoverability_percent,
            CASE WHEN trs.recoverability_mode = 'FULL' THEN 100 ELSE 0 END
          ) AS recoverable_pct,
          ct.id AS condition_type_id,
          trs.id AS tax_rate_schedule_id,
          trs.tax_direction,
          trs.effective_from,
          trs.effective_to
        FROM line_ctx lc
        JOIN control.tax_group_component tgc
          ON tgc.tenant_id    = lc.tenant_id
         AND tgc.tax_group_id = lc.tax_group_id
         AND tgc.is_active    = true
        JOIN control.tax_rate_schedule trs
          ON trs.tenant_id = tgc.tenant_id
         AND trs.id        = tgc.tax_rate_schedule_id
         AND trs.is_active = true
        JOIN master.tax_type tt
          ON tt.tenant_id = trs.tenant_id
         AND tt.id        = trs.tax_type_id
         AND tt.status    = 'active'
        JOIN master.condition_type ct
          ON ct.id = tt.condition_type_id
         AND ct.term_type = 'tax'
         AND ct.status    = 'active'
       WHERE trs.wht_basis IS NULL
         AND current_date BETWEEN trs.effective_from AND COALESCE(trs.effective_to, DATE '9999-12-31')
    ),
    ranked AS (
      SELECT *,
             CASE
               WHEN tax_direction IN ('PURCHASE','BOTH') THEN 0
               ELSE 1
             END AS direction_rank
        FROM candidates
    ),
    chosen AS (
      SELECT *
        FROM ranked
       WHERE direction_rank = (SELECT MIN(direction_rank) FROM ranked)
    ),
    rollup AS (
      SELECT
          tenant_id,
          company_code_id,
          commitment_id,
          commitment_line_id,
          tax_group_id,
          net_amount,
          currency_code,
          COALESCE(base_currency_code, currency_code) AS base_currency_code,
          COALESCE(exchange_rate, 1) AS exchange_rate,
          (ARRAY_AGG(condition_type_id ORDER BY calculation_seq))[1] AS condition_type_id,
          SUM(component_rate) AS rate_value,
          MAX(recoverable_pct) AS recoverable_pct,
          jsonb_agg(
            jsonb_build_object(
              'tax_rate_schedule_id', tax_rate_schedule_id,
              'rate', component_rate,
              'direction', tax_direction,
              'calculation_seq', calculation_seq,
              'effective_from', effective_from,
              'effective_to', effective_to
            )
            ORDER BY calculation_seq
          ) AS component_snapshot
        FROM chosen
       GROUP BY tenant_id, company_code_id, commitment_id, commitment_line_id,
                tax_group_id, net_amount, currency_code, base_currency_code, exchange_rate
    )
    INSERT INTO document.pricing_component (
        tenant_id, company_code_id,
        source_doc_type, source_doc_id, source_line_id,
        term_type, condition_type_id, sequence,
        basis, rate_value, amount_value, base_for_calculation,
        computed_amount, computed_base_amount,
        entry_level, apportion_basis,
        origin,
        tax_group_id, is_inclusive, recoverable_pct,
        metadata,
        currency_code, base_currency_code, exchange_rate,
        created_by
    )
    SELECT
        tenant_id, company_code_id,
        'commitment_line', commitment_id, commitment_line_id,
        'tax', condition_type_id, 300,
        'percent', rate_value, NULL, net_amount,
        ROUND((net_amount * COALESCE(rate_value, 0)) / 100, 4),
        ROUND(((net_amount * COALESCE(rate_value, 0)) / 100) * exchange_rate, 4),
        'line', NULL,
        'system_resolved',
        tax_group_id, false, recoverable_pct,
        jsonb_build_object(
          'source', 'tax_group.default_pricing_component',
          'ownership', 'system_owned',
          'resolver', 'tax_group.default_pricing_component',
          'tax_group_id', tax_group_id,
          'component_snapshot', component_snapshot
        ),
        currency_code, base_currency_code, exchange_rate,
        ${actor}::uuid
      FROM rollup
     WHERE condition_type_id IS NOT NULL
       AND COALESCE(rate_value, 0) >= 0
  `.execute(db);

  await refreshCommitmentLineTaxAmountCache(db, input);

  return {
    deleted:  Number(deleted.numAffectedRows ?? 0),
    inserted: Number(inserted.numAffectedRows ?? 0),
  };
}

async function refreshCommitmentLineTaxAmountCache(
  db: AnyDb,
  input: SyncCommitmentLineTaxComponentInput,
): Promise<void> {
  const actor = input.principalId ?? SYSTEM_ACTOR;
  await sql`
    WITH totals AS (
      SELECT
          COALESCE(SUM(CASE WHEN term_type = 'tax' THEN computed_amount ELSE 0 END), 0) AS tax_amount,
          COALESCE(SUM(CASE WHEN term_type = 'withholding' THEN computed_amount ELSE 0 END), 0) AS withholding_tax_amount
        FROM document.pricing_component
       WHERE tenant_id        = ${input.tenantId}::uuid
         AND source_doc_type  = 'commitment_line'
         AND source_doc_id    = ${input.commitmentId}::uuid
         AND source_line_id   = ${input.commitmentLineId}::uuid
         AND superseded_by_id IS NULL
    )
    UPDATE document.commitment_line cl
       SET tax_amount             = totals.tax_amount,
           withholding_tax_amount = totals.withholding_tax_amount,
           updated_at             = now(),
           updated_by             = ${actor}::uuid
      FROM totals
     WHERE cl.tenant_id     = ${input.tenantId}::uuid
       AND cl.commitment_id = ${input.commitmentId}::uuid
       AND cl.id            = ${input.commitmentLineId}::uuid
  `.execute(db);
}
