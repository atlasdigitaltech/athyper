/**
 * Controlled copy for PO commitment lines.
 *
 * This is intentionally not a raw row duplicate. The service preserves the
 * authoring inputs, allocates a new line number, resets lifecycle/fulfillment
 * state, and remaps current child carriers to the new source_line_id.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface CopyCommitmentLineInput {
  tenantId:     string;
  /** Destination commitment. Defaults to source for the existing duplicate-line action. */
  commitmentId: string;
  sourceCommitmentId?: string;
  lineId:       string;
  principalId:  string | null;
  includeChildren?: {
    accountingDistributions?: boolean;
    pricingComponents?:      boolean;
    schedules?:              boolean;
  };
}

export interface CopyCommitmentLineResult {
  line: Record<string, unknown>;
  children: {
    accountingDistributions: number;
    pricingComponents:      number;
    schedules:              number;
  };
  warnings: string[];
}

export async function copyCommitmentLine(
  db: AnyDb,
  input: CopyCommitmentLineInput,
): Promise<CopyCommitmentLineResult> {
  return db.transaction().execute((trx) => copyCommitmentLineInTransaction(trx, input));
}

export async function copyCommitmentLineInTransaction(
  db: AnyDb,
  input: CopyCommitmentLineInput,
): Promise<CopyCommitmentLineResult> {
  const include = {
    accountingDistributions: input.includeChildren?.accountingDistributions !== false,
    pricingComponents:      input.includeChildren?.pricingComponents      !== false,
    schedules:              input.includeChildren?.schedules              !== false,
  };
  const actor = input.principalId ?? SYSTEM_ACTOR;
  const inserted = await insertCopiedCommitmentLine(db, input, actor);
    const newLineId = String(inserted["id"] ?? "");
    if (!newLineId) throw new Error("Copied commitment_line insert did not return id.");

    const children = {
      accountingDistributions: include.accountingDistributions
        ? await copyAccountingDistributions(db, input, newLineId, actor)
        : 0,
      pricingComponents: include.pricingComponents
        ? await copyPricingComponents(db, input, newLineId, actor)
        : 0,
      schedules: include.schedules
        ? await copySchedules(db, input, newLineId, actor)
        : 0,
    };

    await refreshCopiedLinePricingCaches(db, input.tenantId, newLineId, actor);

    const refreshed = await sql<Record<string, unknown>>`
      SELECT *
        FROM document.commitment_line
       WHERE tenant_id = ${input.tenantId}::uuid
         AND id        = ${newLineId}::uuid
       LIMIT 1
    `.execute(db);

    return {
      line: refreshed.rows[0] ?? inserted,
      children,
      warnings: [],
    };
}

async function insertCopiedCommitmentLine(
  db: AnyDb,
  input: CopyCommitmentLineInput,
  actor: string,
): Promise<Record<string, unknown>> {
  const sourceCommitmentId = input.sourceCommitmentId ?? input.commitmentId;
  const rows = await sql<Record<string, unknown>>`
    WITH next_no AS (
      SELECT COALESCE(MAX(line_no), 0) + 1 AS line_no
        FROM document.commitment_line
       WHERE tenant_id     = ${input.tenantId}::uuid
         AND commitment_id = ${input.commitmentId}::uuid
    )
    INSERT INTO document.commitment_line (
        tenant_id, company_code_id, commitment_id, line_no,
        requisition_line_id, parent_contract_line_id,
        item_id, item_description, procurement_type, line_type,
        commodity_category_id, business_intent_id, classification_decision, asset_class_id,
        uom_code, quantity, unit_price, price_unit, currency_code,
        tax_amount, withholding_tax_amount,
        over_delivery_tolerance, under_delivery_tolerance,
        tax_group_id, withholding_tax_group_id, to_tax_jurisdiction_id, from_tax_jurisdiction_id,
        required_by_date, site_id, warehouse_id, storage_location,
        shipto_address_id, billto_address_id, billfrom_address_id,
        supplier_id, shipfrom_address_id, remitto_address_id,
        status, created_by
    )
    SELECT
        src.tenant_id, src.company_code_id, ${input.commitmentId}::uuid, next_no.line_no,
        NULL, src.parent_contract_line_id,
        src.item_id, src.item_description, src.procurement_type, src.line_type,
        src.commodity_category_id, src.business_intent_id, src.classification_decision, src.asset_class_id,
        src.uom_code, src.quantity, src.unit_price, src.price_unit, src.currency_code,
        0, 0,
        src.over_delivery_tolerance, src.under_delivery_tolerance,
        src.tax_group_id, src.withholding_tax_group_id, src.to_tax_jurisdiction_id, src.from_tax_jurisdiction_id,
        src.required_by_date, src.site_id, src.warehouse_id, src.storage_location,
        src.shipto_address_id, src.billto_address_id, src.billfrom_address_id,
        src.supplier_id, src.shipfrom_address_id, src.remitto_address_id,
        'open', ${actor}::uuid
      FROM document.commitment_line src
      CROSS JOIN next_no
     WHERE src.tenant_id     = ${input.tenantId}::uuid
       AND src.commitment_id = ${sourceCommitmentId}::uuid
       AND src.id            = ${input.lineId}::uuid
     RETURNING *
  `.execute(db);

  const row = rows.rows[0];
  if (!row) throw new Error("Source commitment_line not found for copy.");
  return row;
}

async function copyAccountingDistributions(
  db: AnyDb,
  input: CopyCommitmentLineInput,
  newLineId: string,
  actor: string,
): Promise<number> {
  const sourceCommitmentId = input.sourceCommitmentId ?? input.commitmentId;
  const source = await sql<{ n: number }>`
    SELECT count(*)::int AS n
      FROM document.accounting_distribution
     WHERE tenant_id       = ${input.tenantId}::uuid
       AND source_doc_type = 'commitment_line'
       AND source_doc_id   = ${sourceCommitmentId}::uuid
       AND source_line_id  = ${input.lineId}::uuid
  `.execute(db);
  if ((source.rows[0]?.n ?? 0) === 0) return 0;

  await sql`
    DELETE FROM document.accounting_distribution
     WHERE tenant_id       = ${input.tenantId}::uuid
       AND source_doc_type = 'commitment_line'
       AND source_doc_id   = ${input.commitmentId}::uuid
       AND source_line_id  = ${newLineId}::uuid
  `.execute(db);

  const result = await sql`
    INSERT INTO document.accounting_distribution (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        distribution_no, distribution_basis, split_pct, split_amount, split_quantity,
        distributed_amount, currency_code,
        account_source, gl_account_id,
        cost_center_id, profit_center_id, project_id, dimension_set_id, asset_id,
        description, tags, metadata, created_by
    )
    SELECT
        ad.tenant_id, 'commitment_line', ${input.commitmentId}::uuid, ${newLineId}::uuid,
        ad.distribution_no, ad.distribution_basis, ad.split_pct, ad.split_amount, ad.split_quantity,
        CASE
          WHEN ad.distribution_basis = 'PERCENT'
            THEN COALESCE(cl.net_amount, 0) * COALESCE(ad.split_pct, 0) / 100
          WHEN ad.distribution_basis = 'AMOUNT'
            THEN COALESCE(ad.split_amount, 0)
          WHEN ad.distribution_basis = 'QUANTITY'
            THEN COALESCE(ad.split_quantity, 0) * COALESCE(cl.unit_price, 0) / NULLIF(cl.price_unit, 0)
          ELSE 0
        END,
        cl.currency_code,
        CASE WHEN ad.account_source = 'OVERRIDE' THEN 'OVERRIDE' ELSE 'PENDING' END,
        CASE WHEN ad.account_source = 'OVERRIDE' THEN ad.gl_account_id ELSE NULL END,
        ad.cost_center_id, ad.profit_center_id, ad.project_id, ad.dimension_set_id, ad.asset_id,
        ad.description, ad.tags,
        COALESCE(ad.metadata, '{}'::jsonb)
          || jsonb_build_object('copied_from_accounting_distribution_id', ad.id),
        ${actor}::uuid
      FROM document.accounting_distribution ad
      JOIN document.commitment_line cl
        ON cl.tenant_id = ad.tenant_id
       AND cl.id        = ${newLineId}::uuid
     WHERE ad.tenant_id       = ${input.tenantId}::uuid
       AND ad.source_doc_type = 'commitment_line'
       AND ad.source_doc_id   = ${sourceCommitmentId}::uuid
       AND ad.source_line_id  = ${input.lineId}::uuid
     ORDER BY ad.distribution_no
  `.execute(db);

  return Number(result.numAffectedRows ?? 0);
}

async function copyPricingComponents(
  db: AnyDb,
  input: CopyCommitmentLineInput,
  newLineId: string,
  actor: string,
): Promise<number> {
  const sourceCommitmentId = input.sourceCommitmentId ?? input.commitmentId;
  const source = await sql<{ n: number }>`
    SELECT count(*)::int AS n
      FROM document.pricing_component
     WHERE tenant_id        = ${input.tenantId}::uuid
       AND source_doc_type  = 'commitment_line'
       AND source_doc_id    = ${sourceCommitmentId}::uuid
       AND source_line_id   = ${input.lineId}::uuid
       AND superseded_by_id IS NULL
       AND entry_level      = 'line'
       AND is_apportioned   = false
  `.execute(db);
  if ((source.rows[0]?.n ?? 0) === 0) return 0;

  await sql`
    DELETE FROM document.pricing_component
     WHERE tenant_id        = ${input.tenantId}::uuid
       AND source_doc_type  = 'commitment_line'
       AND source_doc_id    = ${input.commitmentId}::uuid
       AND source_line_id   = ${newLineId}::uuid
       AND superseded_by_id IS NULL
  `.execute(db);

  const result = await sql`
    INSERT INTO document.pricing_component (
        tenant_id, company_code_id,
        source_doc_type, source_doc_id, source_line_id,
        term_type, condition_type_id, sequence,
        basis, rate_value, amount_value, base_for_calculation, computed_amount, computed_base_amount,
        entry_level, apportion_basis, is_apportioned, is_apportioned_from_id,
        origin, ref_source_doc_type, ref_source_doc_id, ref_source_line_id, ref_value,
        tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
        currency_code, base_currency_code, exchange_rate,
        tags, metadata, created_by
    )
    SELECT
        pc.tenant_id, pc.company_code_id,
        'commitment_line', ${input.commitmentId}::uuid, ${newLineId}::uuid,
        pc.term_type, pc.condition_type_id, pc.sequence,
        pc.basis, pc.rate_value, pc.amount_value,
        cl.net_amount,
        CASE
          WHEN pc.basis = 'percent'  THEN cl.net_amount * COALESCE(pc.rate_value, 0) / 100
          WHEN pc.basis = 'per_unit' THEN cl.quantity * COALESCE(pc.rate_value, 0)
          WHEN pc.basis IN ('amount', 'flat') THEN COALESCE(pc.amount_value, 0)
          ELSE 0
        END,
        cl.net_amount,
        'line', NULL, false, NULL,
        pc.origin, 'commitment_line', pc.source_doc_id, pc.source_line_id, pc.computed_amount,
        pc.tax_group_id, pc.is_inclusive, pc.recoverable_pct, pc.tax_section_code,
        pc.currency_code, pc.base_currency_code, pc.exchange_rate,
        pc.tags,
        COALESCE(pc.metadata, '{}'::jsonb)
          || jsonb_build_object('copied_from_pricing_component_id', pc.id),
        ${actor}::uuid
      FROM document.pricing_component pc
      JOIN document.commitment_line cl
        ON cl.tenant_id = pc.tenant_id
       AND cl.id        = ${newLineId}::uuid
     WHERE pc.tenant_id        = ${input.tenantId}::uuid
       AND pc.source_doc_type  = 'commitment_line'
       AND pc.source_doc_id    = ${sourceCommitmentId}::uuid
       AND pc.source_line_id   = ${input.lineId}::uuid
       AND pc.superseded_by_id IS NULL
       AND pc.entry_level      = 'line'
       AND pc.is_apportioned   = false
     ORDER BY pc.sequence, pc.created_at
  `.execute(db);

  return Number(result.numAffectedRows ?? 0);
}

async function copySchedules(
  db: AnyDb,
  input: CopyCommitmentLineInput,
  newLineId: string,
  actor: string,
): Promise<number> {
  const sourceCommitmentId = input.sourceCommitmentId ?? input.commitmentId;
  const source = await sql<{ n: number }>`
    SELECT count(*)::int AS n
      FROM document.schedule_line
     WHERE tenant_id          = ${input.tenantId}::uuid
       AND source_doc_type    = 'commitment_line'
       AND source_doc_id      = ${sourceCommitmentId}::uuid
       AND source_line_id     = ${input.lineId}::uuid
       AND is_current_version = true
       AND terminal_status    IS NULL
  `.execute(db);
  if ((source.rows[0]?.n ?? 0) === 0) return 0;

  await sql`
    DELETE FROM document.schedule_line
     WHERE tenant_id       = ${input.tenantId}::uuid
       AND source_doc_type = 'commitment_line'
       AND source_doc_id   = ${input.commitmentId}::uuid
       AND source_line_id  = ${newLineId}::uuid
  `.execute(db);

  const result = await sql`
    INSERT INTO document.schedule_line (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        schedule_no, schedule_kind,
        scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
        fulfilled_quantity, fulfilled_amount, fulfillment_status,
        version_number, previous_version_id, is_current_version, supersedes_at,
        terminal_status, status_source, status,
        tags, metadata, created_by
    )
    SELECT
        sl.tenant_id, 'commitment_line', ${input.commitmentId}::uuid, ${newLineId}::uuid,
        row_number() OVER (ORDER BY sl.schedule_no)::smallint, sl.schedule_kind,
        sl.scheduled_quantity,
        CASE
          WHEN sl.scheduled_amount IS NULL THEN NULL
          ELSE sl.scheduled_quantity * cl.unit_price / NULLIF(cl.price_unit, 0)
        END,
        sl.scheduled_date, COALESCE(sl.currency_code, cl.currency_code),
        0, 0, 'open',
        1, NULL, true, NULL,
        NULL, 'manual', 'active',
        sl.tags,
        COALESCE(sl.metadata, '{}'::jsonb)
          || jsonb_build_object('copied_from_schedule_line_id', sl.id),
        ${actor}::uuid
      FROM document.schedule_line sl
      JOIN document.commitment_line cl
        ON cl.tenant_id = sl.tenant_id
       AND cl.id        = ${newLineId}::uuid
     WHERE sl.tenant_id          = ${input.tenantId}::uuid
       AND sl.source_doc_type    = 'commitment_line'
       AND sl.source_doc_id      = ${sourceCommitmentId}::uuid
       AND sl.source_line_id     = ${input.lineId}::uuid
       AND sl.is_current_version = true
       AND sl.terminal_status    IS NULL
     ORDER BY sl.schedule_no
  `.execute(db);

  return Number(result.numAffectedRows ?? 0);
}

async function refreshCopiedLinePricingCaches(
  db: AnyDb,
  tenantId: string,
  lineId: string,
  actor: string,
): Promise<void> {
  await sql`
    WITH totals AS (
      SELECT source_line_id,
             COALESCE(SUM(CASE WHEN term_type = 'tax' THEN computed_amount ELSE 0 END), 0) AS tax_amount,
             COALESCE(SUM(CASE WHEN term_type = 'withholding' THEN computed_amount ELSE 0 END), 0) AS withholding_tax_amount
        FROM document.pricing_component
       WHERE tenant_id        = ${tenantId}::uuid
         AND source_doc_type  = 'commitment_line'
         AND source_line_id   = ${lineId}::uuid
         AND superseded_by_id IS NULL
       GROUP BY source_line_id
    )
    UPDATE document.commitment_line cl
       SET tax_amount             = totals.tax_amount,
           withholding_tax_amount = totals.withholding_tax_amount,
           updated_at             = now(),
           updated_by             = ${actor}::uuid
      FROM totals
     WHERE cl.tenant_id = ${tenantId}::uuid
       AND cl.id        = totals.source_line_id
  `.execute(db);
}
