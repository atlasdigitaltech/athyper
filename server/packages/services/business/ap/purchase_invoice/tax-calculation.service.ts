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
  condition_term_type: string | null;  // from master.condition_type.term_type via tax_type.condition_type_id
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

// ── Tax-group resolver (Phase 3c: 4-jurisdiction model) ──────────────────────

export interface ResolveTaxGroupContext {
  tenantId:                  string;
  docEntityCode:             string;        // 'purchase_invoice' | 'sales_invoice' | ...

  // 4-jurisdiction context
  billToJurisdictionId:      string | null; // buyer's tax registration (OWNER-level)
  shipToJurisdictionId:      string | null; // delivery point (ADDRESS-level)
  billFromJurisdictionId:    string | null; // seller's tax registration (OWNER-level)
  shipFromJurisdictionId:    string | null; // dispatch point (ADDRESS-level)

  // Other context
  counterpartyTaxStatus:     string | null; // REGISTERED | UNREGISTERED | EXEMPT | FOREIGN | TREATY
  commodityCategoryId:       string | null;
  supplierIndustryCode:      string | null;
  docDate:                   Date;
}

export interface ResolveTaxGroupResult {
  taxGroupId: string;
  ruleId:     string;
  ruleCode:   string;
}

/**
 * Picks the highest-priority active tax_resolution_rule whose every non-NULL
 * scope matches the 4-jurisdiction context. NULL on a rule scope = wildcard.
 *
 * Predicates (requires_shipto_shipfrom_match / _mismatch) compare ship-to vs
 * ship-from. Predicate is skipped if either jurisdiction is NULL in context
 * (graceful degradation when address resolution incomplete).
 *
 * scope_doc_entity_codes is an array — a single rule can target many entities.
 *
 * Returns null if no rule matches — caller falls back to manual pick.
 */
export async function resolveTaxGroup(
  db:  AnyDb,
  ctx: ResolveTaxGroupContext,
): Promise<ResolveTaxGroupResult | null> {
  const result = await sql<{ tax_group_id: string; rule_id: string; rule_code: string }>`
    SELECT trr.resolved_tax_group_id AS tax_group_id,
           trr.id                    AS rule_id,
           trr.code                  AS rule_code
      FROM control.tax_resolution_rule trr
     WHERE trr.tenant_id = ${ctx.tenantId}::uuid
       AND trr.status = 'active'
       AND trr.effective_from <= ${ctx.docDate}::date
       AND (trr.effective_to IS NULL OR trr.effective_to >= ${ctx.docDate}::date)
       -- Entity filter via array (NULL = wildcard)
       AND (trr.scope_doc_entity_codes IS NULL
            OR ${ctx.docEntityCode} = ANY(trr.scope_doc_entity_codes))
       -- 4-jurisdiction scopes
       AND (trr.scope_billto_jurisdiction_id   IS NULL OR trr.scope_billto_jurisdiction_id   = ${ctx.billToJurisdictionId}::uuid)
       AND (trr.scope_shipto_jurisdiction_id   IS NULL OR trr.scope_shipto_jurisdiction_id   = ${ctx.shipToJurisdictionId}::uuid)
       AND (trr.scope_billfrom_jurisdiction_id IS NULL OR trr.scope_billfrom_jurisdiction_id = ${ctx.billFromJurisdictionId}::uuid)
       AND (trr.scope_shipfrom_jurisdiction_id IS NULL OR trr.scope_shipfrom_jurisdiction_id = ${ctx.shipFromJurisdictionId}::uuid)
       -- Other scopes
       AND (trr.scope_counterparty_tax_status IS NULL OR trr.scope_counterparty_tax_status = ${ctx.counterpartyTaxStatus})
       AND (trr.scope_commodity_category_id   IS NULL OR trr.scope_commodity_category_id   = ${ctx.commodityCategoryId}::uuid)
       AND (trr.scope_supplier_industry_code  IS NULL OR trr.scope_supplier_industry_code  = ${ctx.supplierIndustryCode})
       -- ship-to/ship-from match predicate (intra-state)
       AND (NOT trr.requires_shipto_shipfrom_match
            OR (${ctx.shipToJurisdictionId}::uuid IS NOT NULL
                AND ${ctx.shipFromJurisdictionId}::uuid IS NOT NULL
                AND ${ctx.shipToJurisdictionId}::uuid = ${ctx.shipFromJurisdictionId}::uuid))
       -- ship-to/ship-from mismatch predicate (inter-state)
       AND (NOT trr.requires_shipto_shipfrom_mismatch
            OR (${ctx.shipToJurisdictionId}::uuid IS NOT NULL
                AND ${ctx.shipFromJurisdictionId}::uuid IS NOT NULL
                AND ${ctx.shipToJurisdictionId}::uuid <> ${ctx.shipFromJurisdictionId}::uuid))
     ORDER BY trr.priority DESC, trr.effective_from DESC
     LIMIT 1
  `.execute(db);
  const r = result.rows[0];
  if (!r) return null;
  return { taxGroupId: r.tax_group_id, ruleId: r.rule_id, ruleCode: r.rule_code };
}

// ── Resolver explainer (Phase 3 / Phase 4) ───────────────────────────────────

export interface ResolveExplainerRow {
  ruleId:   string;
  ruleCode: string;
  ruleName: string;
  resolvedTaxGroupId: string;
  priority: number;
  matched: boolean;
  reasons: string[];
}

export interface ResolveExplainerResult {
  winner: ResolveExplainerRow | null;
  candidates: ResolveExplainerRow[];
}

/**
 * Returns the resolver "trace": every active rule in priority order, with
 * matched=true/false and a human-readable list of which scopes matched and
 * which failed. Used by the "Why this rule?" UI explainer.
 */
export async function explainTaxGroupResolution(
  db:  AnyDb,
  ctx: ResolveTaxGroupContext,
): Promise<ResolveExplainerResult> {
  const rows = await sql<{
    rule_id: string; rule_code: string; rule_name: string;
    resolved_tax_group_id: string; priority: number;
    scope_doc_entity_codes: string[] | null;
    scope_billto_jur:   string | null;
    scope_shipto_jur:   string | null;
    scope_billfrom_jur: string | null;
    scope_shipfrom_jur: string | null;
    scope_status: string | null;
    scope_commodity: string | null;
    scope_industry: string | null;
    requires_match: boolean;
    requires_mismatch: boolean;
  }>`
    SELECT trr.id AS rule_id, trr.code AS rule_code, trr.name AS rule_name,
           trr.resolved_tax_group_id, trr.priority,
           trr.scope_doc_entity_codes,
           trr.scope_billto_jurisdiction_id::text   AS scope_billto_jur,
           trr.scope_shipto_jurisdiction_id::text   AS scope_shipto_jur,
           trr.scope_billfrom_jurisdiction_id::text AS scope_billfrom_jur,
           trr.scope_shipfrom_jurisdiction_id::text AS scope_shipfrom_jur,
           trr.scope_counterparty_tax_status        AS scope_status,
           trr.scope_commodity_category_id::text    AS scope_commodity,
           trr.scope_supplier_industry_code         AS scope_industry,
           trr.requires_shipto_shipfrom_match       AS requires_match,
           trr.requires_shipto_shipfrom_mismatch    AS requires_mismatch
      FROM control.tax_resolution_rule trr
     WHERE trr.tenant_id = ${ctx.tenantId}::uuid
       AND trr.status = 'active'
       AND trr.effective_from <= ${ctx.docDate}::date
       AND (trr.effective_to IS NULL OR trr.effective_to >= ${ctx.docDate}::date)
     ORDER BY trr.priority DESC, trr.effective_from DESC
  `.execute(db);

  const candidates: ResolveExplainerRow[] = [];
  let winner: ResolveExplainerRow | null = null;

  for (const row of rows.rows) {
    const reasons: string[] = [];
    let matched = true;

    // Entity-code array
    if (row.scope_doc_entity_codes && !row.scope_doc_entity_codes.includes(ctx.docEntityCode)) {
      matched = false;
      reasons.push(`entity ${ctx.docEntityCode} not in [${row.scope_doc_entity_codes.join(',')}]`);
    }
    // 4 jurisdictions
    const checkJur = (label: string, ruleVal: string | null, ctxVal: string | null) => {
      if (ruleVal && ruleVal !== ctxVal) {
        matched = false;
        reasons.push(`${label}: rule=${ruleVal} ctx=${ctxVal ?? 'NULL'}`);
      } else if (ruleVal) {
        reasons.push(`${label}: ✓ ${ruleVal}`);
      }
    };
    checkJur('billto',   row.scope_billto_jur,   ctx.billToJurisdictionId);
    checkJur('shipto',   row.scope_shipto_jur,   ctx.shipToJurisdictionId);
    checkJur('billfrom', row.scope_billfrom_jur, ctx.billFromJurisdictionId);
    checkJur('shipfrom', row.scope_shipfrom_jur, ctx.shipFromJurisdictionId);
    // Other scopes
    if (row.scope_status && row.scope_status !== ctx.counterpartyTaxStatus) {
      matched = false;
      reasons.push(`status: rule=${row.scope_status} ctx=${ctx.counterpartyTaxStatus ?? 'NULL'}`);
    }
    if (row.scope_commodity && row.scope_commodity !== ctx.commodityCategoryId) {
      matched = false;
      reasons.push(`commodity_category mismatch`);
    }
    if (row.scope_industry && row.scope_industry !== ctx.supplierIndustryCode) {
      matched = false;
      reasons.push(`industry mismatch`);
    }
    // Predicates
    if (row.requires_match) {
      const matchHits = ctx.shipToJurisdictionId !== null
                     && ctx.shipFromJurisdictionId !== null
                     && ctx.shipToJurisdictionId === ctx.shipFromJurisdictionId;
      if (!matchHits) {
        matched = false;
        reasons.push(`shipto/shipfrom match required (ctx: ${ctx.shipToJurisdictionId ?? 'NULL'} vs ${ctx.shipFromJurisdictionId ?? 'NULL'})`);
      } else {
        reasons.push(`shipto/shipfrom match: ✓`);
      }
    }
    if (row.requires_mismatch) {
      const mismatchHits = ctx.shipToJurisdictionId !== null
                        && ctx.shipFromJurisdictionId !== null
                        && ctx.shipToJurisdictionId !== ctx.shipFromJurisdictionId;
      if (!mismatchHits) {
        matched = false;
        reasons.push(`shipto/shipfrom mismatch required (ctx: ${ctx.shipToJurisdictionId ?? 'NULL'} vs ${ctx.shipFromJurisdictionId ?? 'NULL'})`);
      } else {
        reasons.push(`shipto/shipfrom mismatch: ✓`);
      }
    }

    const explainer: ResolveExplainerRow = {
      ruleId: row.rule_id, ruleCode: row.rule_code, ruleName: row.rule_name,
      resolvedTaxGroupId: row.resolved_tax_group_id,
      priority: row.priority,
      matched, reasons,
    };
    candidates.push(explainer);
    if (matched && winner === null) winner = explainer;
  }

  return { winner, candidates };
}

// ── Per-entity jurisdiction resolution helpers (Phase 3b) ────────────────────

export interface FourJurisdictions {
  billTo:   string | null;
  shipTo:   string | null;
  billFrom: string | null;
  shipFrom: string | null;
}

/**
 * Bill-side jurisdictions from OWNER (legal fact). Looks up
 *   company_code.tax_jurisdiction_id   → billto (PI) / billfrom (SI)
 *   supplier.business_partner.tax_jurisdiction_id → billfrom (PI)
 *   customer.business_partner.tax_jurisdiction_id → billto   (SI)
 *
 * Ship-side jurisdictions from ADDRESS via fn_resolve_owner_jurisdiction.
 *
 * Per-entity recipes — extracted into per-entity functions for clarity.
 */
export async function resolvePurchaseInvoiceJurisdictions(
  db: AnyDb,
  tenantId: string,
  pi: {
    company_code_id: string;
    supplier_id:     string | null;
    site_id:         string | null;
  },
): Promise<FourJurisdictions> {
  // Bill-side: read tax_jurisdiction_id on owners
  const billRows = await sql<{
    billto:   string | null;
    billfrom: string | null;
  }>`
    SELECT
      cc.tax_jurisdiction_id AS billto,
      bp.tax_jurisdiction_id AS billfrom
    FROM master.company_code cc
    LEFT JOIN master.supplier         s  ON s.id = ${pi.supplier_id}::uuid AND s.tenant_id = ${tenantId}::uuid
    LEFT JOIN master.business_partner bp ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
    WHERE cc.id = ${pi.company_code_id}::uuid AND cc.tenant_id = ${tenantId}::uuid
  `.execute(db);

  const bill = billRows.rows[0] ?? { billto: null, billfrom: null };

  // Ship-side: walk owner chain → address purpose chain → jurisdiction
  // shipto: site.ship_to → company_code.ship_to → default
  const shipToWalk = pi.site_id
    ? [{ owner_type: 'site',         owner_id: pi.site_id },
       { owner_type: 'company_code', owner_id: pi.company_code_id }]
    : [{ owner_type: 'company_code', owner_id: pi.company_code_id }];

  const shipToRows = await sql<{ jur: string | null }>`
    SELECT master.fn_resolve_owner_jurisdiction(
      ${tenantId}::uuid,
      ${JSON.stringify(shipToWalk)}::jsonb,
      ARRAY['ship_to','default']::text[]
    ) AS jur
  `.execute(db);

  // shipfrom: supplier.ship_from → supplier.bill_from → supplier.default
  let shipFrom: string | null = null;
  if (pi.supplier_id) {
    const shipFromRows = await sql<{ jur: string | null }>`
      SELECT master.fn_resolve_owner_jurisdiction(
        ${tenantId}::uuid,
        ${JSON.stringify([{ owner_type: 'supplier', owner_id: pi.supplier_id }])}::jsonb,
        ARRAY['ship_from','bill_from','default']::text[]
      ) AS jur
    `.execute(db);
    shipFrom = shipFromRows.rows[0]?.jur ?? null;
  }

  return {
    billTo:   bill.billto,
    shipTo:   shipToRows.rows[0]?.jur ?? null,
    billFrom: bill.billfrom,
    shipFrom,
  };
}

// ── Schedule loader ───────────────────────────────────────────────────────────

async function loadGroupSchedules(
  db:          AnyDb,
  tenantId:    string,
  taxGroupId:  string,
  invoiceDate: Date,
): Promise<ScheduleRow[]> {
  // WHT detection: prefer trs.wht_basis (per-rate flag) and fall back to the
  // condition_type kind classification (term_type='withholding'), reached via
  // tax_type → condition_type bridge.
  const result = await sql<ScheduleRow>`
    SELECT
      trs.id                        AS schedule_id,
      tgc.tax_group_id,
      trs.jurisdiction_id,
      trs.tax_type_id,
      ct.term_type                  AS condition_term_type,
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
    LEFT JOIN master.condition_type ct
      ON  ct.id = tt.condition_type_id
    WHERE tgc.tenant_id    = ${tenantId}
      AND tgc.tax_group_id = ${taxGroupId}
      AND tgc.is_active    = true
      AND trs.is_active    = true
      AND (trs.tax_direction IN ('PURCHASE', 'BOTH') OR trs.wht_basis IS NOT NULL OR ct.term_type = 'withholding')
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
      const isWht         = row.wht_basis != null || row.condition_term_type === "withholding";
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
    SELECT COALESCE(supplier_invoice_date, CURRENT_DATE) AS invoice_date,
           tax_mode
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
          tax_section_code, jurisdiction_id, wht_basis,
          captured_at, captured_by
        ) VALUES (
          ${tenantId}, ${invoiceId}, ${line.id},
          ${comp.taxGroupId}, ${comp.componentCode ?? "UNCLASSIFIED"}, ${comp.scheduleId},
          ${comp.baseAmount.toFixed(4)}, ${comp.effectiveRate}, ${signedTax.toFixed(4)},
          ${currencyCode},
          ${comp.recoverabilityMode !== "NONE"}, ${comp.isWht},
          -- WS-SNAPSHOT: freeze jurisdiction + wht_basis so historical
          -- determinations stay stable across upstream schedule/jurisdiction
          -- edits. tax_section_code is left NULL here and populated by
          -- backfillSectionCodesFromPc (below) which joins the active PC
          -- chain for each line — this keeps the per-component loop free of
          -- a per-row PC lookup and batches the section-code capture into a
          -- single trailing statement.
          NULL, ${comp.jurisdictionId}, ${comp.whtBasis ?? null},
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

  // WS-SNAPSHOT: backfill tax_section_code on the just-written snapshot rows
  // from the active (non-superseded) WHT pricing_component for the matching
  // line + tax_group. Trailing UPDATE keeps the per-component loop free of
  // an extra lookup per row. Tax (non-WHT) rows have no section semantic;
  // their tax_section_code stays NULL.
  await sql`
    UPDATE document.invoice_tax_snapshot snap
       SET tax_section_code = pc.tax_section_code
      FROM document.pricing_component pc
     WHERE snap.tenant_id            = ${tenantId}
       AND snap.purchase_invoice_id  = ${invoiceId}
       AND snap.is_withholding       = true
       AND snap.tax_section_code IS NULL
       AND pc.tenant_id              = snap.tenant_id
       AND pc.source_doc_type        = 'purchase_invoice_line'
       AND pc.source_line_id         = snap.invoice_line_id
       AND pc.tax_group_id           = snap.tax_group_id
       AND pc.term_type              = 'withholding'
       AND pc.superseded_by_id IS NULL
       AND pc.tax_section_code IS NOT NULL
  `.execute(trx);

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
