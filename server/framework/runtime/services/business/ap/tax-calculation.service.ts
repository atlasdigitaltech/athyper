/**
 * Tax Calculation Service — Phase 3
 *
 * Three responsibilities:
 *   1. computeLineTax
 *        Resolves tax group components → rate schedules → per-component amounts.
 *        Called from invoice-lines.handler before INSERT/UPDATE to populate
 *        tax_amount and withholding_tax_amount on document.purchase_invoice_line.
 *
 *   2. postInvoiceTaxCalculations
 *        Writes the immutable audit trail at posting time:
 *          - ledger.tax_calculation     (one row per line × component)
 *          - document.invoice_tax_snapshot (frozen tax determination)
 *          - ledger.tax_credit_movement (one row per jurisdiction × tax_type)
 *        Called from invoice-posting.service.handlePostInvoice.
 *
 *   3. reverseInvoiceTaxCalculations
 *        Mirrors original tax_calculation rows with reverses_calculation_id set,
 *        and inserts REVERSAL credit movements.
 *        Called from invoice-posting.service.handleReverseInvoice.
 *
 * Tax modes:
 *   exclusive — net_amount is pre-tax; tax is computed on top.
 *   inclusive — net_amount includes tax; base is back-calculated using the
 *               sum of PERCENT-kind effective rates (exact for flat, non-compound
 *               groups; compound + inclusive is a known limitation deferred).
 *   no_tax    — skip; zero out tax fields.
 *
 * WHT detection: rate schedules with wht_basis IS NOT NULL are treated as
 *   withholding tax components regardless of the group they belong to.
 *   Dedicated withholding_tax_group_id on the line is processed alongside the
 *   main tax_group_id in the same pass.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Internal types ────────────────────────────────────────────────────────────

interface ScheduleRow {
  schedule_id:         string;
  tax_group_id:        string;
  jurisdiction_id:     string;
  tax_type_id:         string;
  tax_category:        string;
  component_code:      string | null;
  rate_kind:           string;
  rate_value:          string;
  rate_override:       string | null;
  calculation_basis:   string;
  recoverability_mode: string;
  recoverability_pct:  string | null;
  reverse_charge_mode: string;
  wht_basis:           string | null;
}

interface TaxComponent {
  scheduleId:          string;
  taxGroupId:          string;
  jurisdictionId:      string;
  taxTypeId:           string;
  componentCode:       string | null;
  rateKind:            string;
  effectiveRate:       number;
  calculationBasis:    string;
  baseAmount:          number;
  taxAmount:           number;
  roundingAdj:         number;
  isWht:               boolean;
  whtBasis:            string | null;
  recoverabilityMode:  string;
  creditRecoveryPct:   number | null;
  reverseChargeMode:   string;
}

export interface LineTaxResult {
  taxAmount:  number;   // sum of non-WHT components
  whtAmount:  number;   // sum of WHT components
  components: TaxComponent[];
}

// ── Schedule loader ───────────────────────────────────────────────────────────

async function loadGroupSchedules(
  db:          AnyDb,
  tenantId:    string,
  taxGroupId:  string,
  invoiceDate: Date,
): Promise<ScheduleRow[]> {
  const result = await sql<ScheduleRow>`
    SELECT
      trs.id                        AS schedule_id,
      tgc.tax_group_id,
      trs.jurisdiction_id,
      trs.tax_type_id,
      tt.category                   AS tax_category,
      trs.component_code,
      trs.rate_kind,
      trs.rate_value,
      tgc.rate_override,
      trs.calculation_basis,
      trs.recoverability_mode,
      trs.recoverability_percent    AS recoverability_pct,
      trs.reverse_charge_mode,
      trs.wht_basis
    FROM control.tax_group_component tgc
    JOIN control.tax_rate_schedule trs
      ON  trs.id        = tgc.tax_rate_schedule_id
      AND trs.tenant_id = tgc.tenant_id
    JOIN master.tax_type tt
      ON  tt.id        = trs.tax_type_id
      AND tt.tenant_id = trs.tenant_id
    WHERE tgc.tenant_id    = ${tenantId}
      AND tgc.tax_group_id = ${taxGroupId}
      AND tgc.is_active    = true
      AND trs.is_active    = true
      AND (trs.tax_direction IN ('PURCHASE', 'BOTH') OR trs.wht_basis IS NOT NULL OR tt.category = 'WITHHOLDING')
      AND trs.effective_from <= ${invoiceDate}::date
      AND (trs.effective_to IS NULL OR trs.effective_to >= ${invoiceDate}::date)
    ORDER BY tgc.calculation_seq
  `.execute(db);
  return result.rows;
}

// ── Per-component amount via ledger.calculate_tax ─────────────────────────────

async function callCalculateTax(
  db:        AnyDb,
  base:      number,
  rateValue: number,
  rateKind:  string,
): Promise<{ taxAmount: number; roundingAdj: number }> {
  const r = await sql<{ result: Record<string, unknown> }>`
    SELECT ledger.calculate_tax(
      ${base}::numeric(18,4),
      ${rateValue}::numeric(18,6),
      ${rateKind}::text,
      1::numeric(18,4),
      'ROUND_HALF_UP',
      4::smallint
    ) AS result
  `.execute(db);
  const j = r.rows[0]?.result ?? {};
  return {
    taxAmount:   Number(j["tax_amount"]          ?? 0),
    roundingAdj: Number(j["rounding_adjustment"] ?? 0),
  };
}

// ── Main computation ──────────────────────────────────────────────────────────

/**
 * Resolves tax-group components and computes amounts for a single line.
 * Pure computation — does NOT write to the database.
 *
 * netAmount should be the absolute value of the line's net_amount
 * (credit notes use positive amounts; sign is handled at JE construction).
 */
export async function computeLineTax(
  db:          AnyDb,
  tenantId:    string,
  netAmount:   number,
  taxGroupId:  string | null,
  whtGroupId:  string | null,
  taxMode:     string,
  invoiceDate: Date,
): Promise<LineTaxResult> {
  if (taxMode === "no_tax" || (!taxGroupId && !whtGroupId)) {
    return { taxAmount: 0, whtAmount: 0, components: [] };
  }

  const absNet     = Math.abs(netAmount);
  const components: TaxComponent[] = [];

  const processGroup = async (groupId: string): Promise<void> => {
    const rows = await loadGroupSchedules(db, tenantId, groupId, invoiceDate);
    if (rows.length === 0) return;

    // For inclusive mode back-calculate base using sum of PERCENT-kind rates.
    // Compound groups (is_compound = true) would require iterative solving;
    // deferred — the sum-of-rates approximation is used for Phase 3.
    const sumPctRates = rows.reduce((s, r) => {
      const rate = Number(r.rate_override ?? r.rate_value);
      return r.rate_kind === "PERCENT" ? s + rate : s;
    }, 0);

    const base = taxMode === "inclusive" && sumPctRates > 0
      ? absNet / (1 + sumPctRates / 100)
      : absNet;

    for (const row of rows) {
      const effectiveRate = Number(row.rate_override ?? row.rate_value);
      const isWht         = row.wht_basis != null || row.tax_category === "WITHHOLDING";
      const { taxAmount, roundingAdj } = await callCalculateTax(db, base, effectiveRate, row.rate_kind);
      components.push({
        scheduleId:         row.schedule_id,
        taxGroupId:         row.tax_group_id,
        jurisdictionId:     row.jurisdiction_id,
        taxTypeId:          row.tax_type_id,
        componentCode:      row.component_code,
        rateKind:           row.rate_kind,
        effectiveRate,
        calculationBasis:   row.calculation_basis,
        baseAmount:         base,
        taxAmount,
        roundingAdj,
        isWht,
        whtBasis:           row.wht_basis,
        recoverabilityMode: row.recoverability_mode,
        creditRecoveryPct:  row.recoverability_pct != null ? Number(row.recoverability_pct) : null,
        reverseChargeMode:  row.reverse_charge_mode,
      });
    }
  };

  if (taxGroupId) await processGroup(taxGroupId);
  if (whtGroupId) await processGroup(whtGroupId);

  const taxAmount = components.filter(c => !c.isWht).reduce((s, c) => s + c.taxAmount, 0);
  const whtAmount = components.filter(c =>  c.isWht).reduce((s, c) => s + c.taxAmount, 0);
  return { taxAmount, whtAmount, components };
}

// ── Post: write tax audit trail ───────────────────────────────────────────────

/**
 * Writes ledger.tax_calculation, document.invoice_tax_snapshot, and
 * ledger.tax_credit_movement rows for all lines of the given invoice.
 * Must run inside the posting transaction.
 *
 * No-op for lines without a tax group assigned.
 */
export async function postInvoiceTaxCalculations(
  trx:           AnyDb,
  tenantId:      string,
  companyId:     string,
  bookId:        string,
  invoiceId:     string,
  principalId:   string | null,
  currencyCode:  string,
  exchangeRate:  number,
  fiscalYear:    number,
  periodNumber:  number,
  referenceJeId: string | null,
): Promise<void> {
  const pId = principalId ?? "00000000-0000-0000-0000-000000000000";
  const now  = new Date();

  const hdrResult = await sql<{ invoice_date: string; tax_mode: string | null }>`
    SELECT invoice_date, tax_mode
      FROM document.purchase_invoice
     WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
     LIMIT 1
  `.execute(trx);

  const hdr = hdrResult.rows[0];
  if (!hdr) return;

  const invoiceDate = new Date(hdr.invoice_date);
  const taxMode     = String(hdr.tax_mode ?? "exclusive");

  const linesResult = await sql<{
    id: string; line_no: number; net_amount: string;
    tax_group_id: string | null; withholding_tax_group_id: string | null;
  }>`
    SELECT id, line_no, net_amount, tax_group_id, withholding_tax_group_id
      FROM document.purchase_invoice_line
     WHERE purchase_invoice_id = ${invoiceId} AND tenant_id = ${tenantId}
     ORDER BY line_no
  `.execute(trx);

  // Accumulate credit movements per jurisdiction + tax_type
  const creditAcc = new Map<string, {
    jurisdictionId: string; taxTypeId: string;
    inputAmount: number; whtDeducted: number;
    firstCalcId: string | null;
  }>();

  for (const line of linesResult.rows) {
    if (!line.tax_group_id && !line.withholding_tax_group_id) continue;

    const rawNet  = Number(line.net_amount);
    // docSign propagates the credit-note sign to all posted tax amounts.
    // base_amount in tax_calculation stays positive (tc_base_nonneg constraint);
    // tax_amount and base_currency_amount are signed.
    // invoice_tax_snapshot.tax_base_amount also stays positive (its_base_nonneg);
    // invoice_tax_snapshot.tax_amount is signed.
    const docSign = rawNet >= 0 ? 1 : -1;

    const result = await computeLineTax(
      trx, tenantId, Math.abs(rawNet),
      line.tax_group_id, line.withholding_tax_group_id,
      taxMode, invoiceDate,
    );

    for (const comp of result.components) {
      const taxTreatment   = comp.isWht ? "WITHHOLDING" : "STANDARD";
      const signedTax      = comp.taxAmount * docSign;
      const signedRounding = comp.roundingAdj * docSign;
      const signedBaseFx   = comp.taxAmount * exchangeRate * docSign;

      const calcResult = await sql<{ id: string }>`
        INSERT INTO ledger.tax_calculation (
          tenant_id, company_code_id, book_id,
          doc_type, doc_id, doc_line_id, doc_line_index,
          jurisdiction_id, tax_type_id, component_code,
          tax_group_id, tax_rate_schedule_id,
          base_amount, rate_kind, rate_value, calculation_basis,
          tax_amount, rounding_adjustment,
          currency_code, base_currency_amount, exchange_rate,
          tax_direction, tax_treatment,
          recoverability_mode, credit_recovery_pct, reverse_charge_mode,
          is_wht, wht_basis,
          reference_je_id, idempotency_key,
          fiscal_year, period_number,
          posted_at, posted_by, created_at, created_by
        ) VALUES (
          ${tenantId}, ${companyId}, ${bookId},
          'purchase_invoice', ${invoiceId}, ${line.id}, ${line.line_no},
          ${comp.jurisdictionId}, ${comp.taxTypeId}, ${comp.componentCode ?? null},
          ${comp.taxGroupId}, ${comp.scheduleId},
          ${comp.baseAmount.toFixed(4)}, ${comp.rateKind}, ${comp.effectiveRate}, ${comp.calculationBasis},
          ${signedTax.toFixed(4)}, ${signedRounding.toFixed(4)},
          ${currencyCode}, ${signedBaseFx.toFixed(4)}, ${exchangeRate},
          'PURCHASE', ${taxTreatment},
          ${comp.recoverabilityMode}, ${comp.creditRecoveryPct ?? null}, ${comp.reverseChargeMode},
          ${comp.isWht}, ${comp.whtBasis ?? null},
          ${referenceJeId ?? null},
          ${`${invoiceId}:${line.id}:${comp.scheduleId}`},
          ${fiscalYear}, ${periodNumber},
          ${now}, ${pId}, ${now}, ${pId}
        )
        RETURNING id
      `.execute(trx);

      const calcId = calcResult.rows[0]?.id ?? null;

      await sql`
        INSERT INTO document.invoice_tax_snapshot (
          tenant_id, purchase_invoice_id, invoice_line_id,
          tax_group_id, tax_component_code, tax_rate_schedule_id,
          tax_base_amount, tax_rate, tax_amount, currency_code,
          is_recoverable, is_withholding,
          captured_at, captured_by
        ) VALUES (
          ${tenantId}, ${invoiceId}, ${line.id},
          ${comp.taxGroupId}, ${comp.componentCode ?? "UNCLASSIFIED"}, ${comp.scheduleId},
          ${comp.baseAmount.toFixed(4)}, ${comp.effectiveRate}, ${signedTax.toFixed(4)},
          ${currencyCode},
          ${comp.recoverabilityMode !== "NONE"}, ${comp.isWht},
          ${now}, ${pId}
        )
      `.execute(trx);

      const key = `${comp.jurisdictionId}:${comp.taxTypeId}`;
      const acc = creditAcc.get(key) ?? {
        jurisdictionId: comp.jurisdictionId,
        taxTypeId:      comp.taxTypeId,
        inputAmount:    0,
        whtDeducted:    0,
        firstCalcId:    null,
      };
      if (comp.isWht) {
        acc.whtDeducted += signedTax;
      } else if (comp.recoverabilityMode !== "NONE") {
        acc.inputAmount += signedTax;
      }
      if (!acc.firstCalcId) acc.firstCalcId = calcId;
      creditAcc.set(key, acc);
    }
  }

  for (const acc of creditAcc.values()) {
    if (acc.inputAmount === 0 && acc.whtDeducted === 0) continue;
    await sql`
      INSERT INTO ledger.tax_credit_movement (
        tenant_id, company_code_id, book_id,
        jurisdiction_id, tax_type_id,
        fiscal_year, period_number,
        movement_type,
        input_amount, output_amount,
        wht_deducted_amount, wht_suffered_amount,
        source_tax_calculation_id, currency_code, reference,
        created_at, created_by
      ) VALUES (
        ${tenantId}, ${companyId}, ${bookId},
        ${acc.jurisdictionId}, ${acc.taxTypeId},
        ${fiscalYear}, ${periodNumber},
        'POSTING',
        ${acc.inputAmount.toFixed(4)}, 0,
        ${acc.whtDeducted.toFixed(4)}, 0,
        ${acc.firstCalcId ?? null}, ${currencyCode}, ${invoiceId},
        ${now}, ${pId}
      )
    `.execute(trx);
  }
}

// ── Reverse: mirror tax rows + REVERSAL credit movement ──────────────────────

/**
 * Mirrors all original ledger.tax_calculation rows for the invoice, linking
 * them back via reverses_calculation_id (append-only — originals untouched).
 * Inserts offsetting REVERSAL rows in ledger.tax_credit_movement.
 * Must run inside the reversal transaction.
 */
export async function reverseInvoiceTaxCalculations(
  trx:         AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string | null,
  revJeId:     string | null,
): Promise<void> {
  const pId = principalId ?? "00000000-0000-0000-0000-000000000000";
  const now  = new Date();

  await sql`
    INSERT INTO ledger.tax_calculation (
      tenant_id, company_code_id, book_id,
      doc_type, doc_id, doc_line_id, doc_line_index,
      jurisdiction_id, tax_type_id, component_code,
      tax_group_id, tax_rate_schedule_id,
      base_amount, rate_kind, rate_value, calculation_basis,
      tax_amount, rounding_adjustment,
      currency_code, base_currency_amount, exchange_rate,
      tax_direction, tax_treatment,
      recoverability_mode, credit_recovery_pct, reverse_charge_mode,
      is_wht, wht_basis,
      reference_je_id, idempotency_key,
      reverses_calculation_id,
      fiscal_year, period_number,
      posted_at, posted_by, created_at, created_by
    )
    SELECT
      tenant_id, company_code_id, book_id,
      doc_type, doc_id, doc_line_id, doc_line_index,
      jurisdiction_id, tax_type_id, component_code,
      tax_group_id, tax_rate_schedule_id,
      base_amount, rate_kind, rate_value, calculation_basis,
      -tax_amount, -rounding_adjustment,
      currency_code, -base_currency_amount, exchange_rate,
      tax_direction, tax_treatment,
      recoverability_mode, credit_recovery_pct, reverse_charge_mode,
      is_wht, wht_basis,
      ${revJeId ?? null},
      'REV:' || COALESCE(idempotency_key, id::text),
      id,
      fiscal_year, period_number,
      ${now}, ${pId}, ${now}, ${pId}
    FROM ledger.tax_calculation
    WHERE doc_id    = ${invoiceId}::uuid
      AND tenant_id = ${tenantId}
      AND reverses_calculation_id IS NULL
  `.execute(trx);

  await sql`
    INSERT INTO ledger.tax_credit_movement (
      tenant_id, company_code_id, book_id,
      jurisdiction_id, tax_type_id,
      fiscal_year, period_number,
      movement_type,
      input_amount, output_amount,
      wht_deducted_amount, wht_suffered_amount,
      source_tax_calculation_id, source_movement_id,
      currency_code, reference,
      created_at, created_by
    )
    SELECT
      tenant_id, company_code_id, book_id,
      jurisdiction_id, tax_type_id,
      fiscal_year, period_number,
      'REVERSAL',
      -input_amount, -output_amount,
      -wht_deducted_amount, -wht_suffered_amount,
      source_tax_calculation_id, id,
      currency_code, reference,
      ${now}, ${pId}
    FROM ledger.tax_credit_movement
    WHERE reference     = ${invoiceId}
      AND tenant_id     = ${tenantId}
      AND movement_type = 'POSTING'
  `.execute(trx);
}
