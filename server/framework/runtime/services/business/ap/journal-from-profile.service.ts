/**
 * Journal-From-Profile Service — Phase 4
 *
 * Expands a DerivedProfile's entry templates into concrete journal_line rows
 * for a purchase-invoice posting.
 *
 * Account resolution (in order):
 *   FIXED        → account_code (GL account code lookup)
 *   FROM_INTENT  → commodity category policy for selected business intent
 *                  (per invoice line — expands to one JE line per invoice line)
 *   FROM_CATEGORY→ commodity category default policy
 *   POSTING_ROLE → subledger_type lookup via POSTING_ROLE_SUBLEDGER alias map,
 *                  then code fallback via account_fallback column
 *
 * Amount resolution:
 *   LINE_AMOUNT      → sum(line.net_amount) — expanded per FROM_INTENT line
 *   TAX_AMOUNT       → invoice.taxAmount (header total)
 *   RETENTION_AMOUNT → invoice.retentionAmount
 *   CALCULATED       → context-driven: wht_payable role → invoice.whtAmount
 *   NET_PAYABLE      → invoice.payableAmount
 *   DOCUMENT_TOTAL   → invoice.totalAmount
 *   REMAINDER        → residual so that ∑DR = ∑CR (balancing line)
 *   (others)         → 0 (no-op; template is silently skipped)
 *
 * Zero-fire rule: a template line is skipped when its resolved amount is 0
 * and it is not a balancing line.
 *
 * Credit-note inversion: all posting sides are inverted when isCreditNote=true.
 *
 * Returns null when any required GL account cannot be resolved — the caller
 * (invoice-posting.service) falls back to the legacy hard-coded path.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DerivedProfile, EntryTemplate } from "./acct-profile-derivation.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Input context types ───────────────────────────────────────────────────────

export interface InvoiceLineCtx {
  id:               string;
  lineNo:           number;
  description:      string;
  netAmount:        number;
  taxAmount:        number;
  whtAmount:        number;
  spendCategoryId:  string | null;
  businessIntentId: string | null;
  costCenterId:     string | null;
  profitCenterId:   string | null;
  projectId:        string | null;
}

export interface InvoiceCtx {
  totalAmount:             number;
  payableAmount:           number;
  taxAmount:               number;
  whtAmount:               number;
  retentionAmount:         number;
  currencyCode:            string;
  baseCurrencyCode:        string;
  exchangeRate:            number;
  supplierId:              string;
  supplierName:            string;
  isCreditNote:            boolean;
  invoiceType:             string;
}

export interface PostingCtx {
  tenantId:       string;
  companyId:      string;
  bookId:         string;
  fiscalPeriodId: string;
  fiscalYear:     number;
  periodNumber:   number;
  postingDate:    Date;
  principalId:    string;
  jeId:           string;
}

// ── Output type ───────────────────────────────────────────────────────────────

export interface ResolvedJeLine {
  lineNo:           number;
  glAccountId:      string;
  postingSide:      string;   // 'DEBIT' | 'CREDIT' — already inverted for credit notes
  amount:           number;   // transaction currency, always positive
  baseAmount:       number;   // base currency
  description:      string;
  subledgerType:    string | null;
  partyType:        string | null;
  partyId:          string | null;
  sourceDocLineId:  string | null;
  costCenterId:     string | null;
  profitCenterId:   string | null;
  projectId:        string | null;
}

export interface ProfileBuildResult {
  jeLines:       ResolvedJeLine[];
  // Maps invoice-line-id → resolved GL account for accounting_distribution writes
  lineAccountMap: Map<string, string>;
}

// ── Posting-role → subledger_type alias map ───────────────────────────────────
//
// account_lookup_key on templates is the posting-role code from
// control.lookup_value (domain = control.payment_settlement_posting_role).
// master.gl_account uses a different set of subledger_type values.
// This map bridges the two.
//
const POSTING_ROLE_SUBLEDGER: Record<string, string> = {
  ap_trade_payable:      "ap",                   // IFRS-L-AP-TRADE
  wht_payable:           "wht_payable",
  input_tax_recoverable: "input_tax_recoverable",
  ap_retention_payable:  "ap_retention_payable",
  ap_advance_recovery:   "ap_advance_recovery",
  ap_clearing:           "ap_clearing",
  ar_clearing:           "ar_clearing",
  discount_earned:       "discount_earned",
  discount_given:        "discount_given",
  fx_gain:               "fx_gain",
  fx_loss:               "fx_loss",
};

// ── GL account resolvers ──────────────────────────────────────────────────────

async function resolveBySubledger(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
  subledger: string,
): Promise<string | null> {
  const r = await sql<{ id: string }>`
    SELECT ga.id
      FROM master.gl_account ga
      JOIN master.company_code_chart_assignment cca
             ON  cca.chart_of_account_id = ga.chart_of_account_id
             AND cca.tenant_id           = ${tenantId}
             AND cca.company_code_id     = ${companyId}
             AND cca.assignment_type     = 'operating'
             AND cca.status             = 'active'
             AND cca.effective_from     <= CURRENT_DATE
             AND (cca.effective_to IS NULL OR cca.effective_to >= CURRENT_DATE)
     WHERE ga.tenant_id      = ${tenantId}
       AND ga.subledger_type = ${subledger}
       AND ga.is_active      = true
       AND ga.node_type      = 'posting'
       AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
     LIMIT 1
  `.execute(db);
  return r.rows[0]?.id ?? null;
}

async function resolveByCode(
  db:       AnyDb,
  tenantId: string,
  companyId: string,
  code:     string,
): Promise<string | null> {
  const r = await sql<{ id: string }>`
    WITH operating AS (
      SELECT cca.chart_of_account_id
        FROM master.company_code_chart_assignment cca
        JOIN master.chart_of_account coa
          ON coa.tenant_id = cca.tenant_id
         AND coa.id = cca.chart_of_account_id
       WHERE cca.tenant_id = ${tenantId}
         AND cca.company_code_id = ${companyId}
         AND cca.assignment_type = 'operating'
         AND cca.status = 'active'
         AND cca.effective_from <= CURRENT_DATE
         AND (cca.effective_to IS NULL OR cca.effective_to >= CURRENT_DATE)
         AND coa.is_active = true
         AND COALESCE((coa.metadata->>'_operating_coa')::boolean, true) = true
         AND COALESCE((coa.metadata->>'_reporting_taxonomy')::boolean, false) = false
       ORDER BY cca.is_primary DESC, cca.effective_from DESC
       LIMIT 1
    ),
    source_group AS (
      SELECT ga.metadata->>'_group_map' AS group_map
        FROM master.gl_account ga
       WHERE ga.tenant_id = ${tenantId}
         AND ga.code = ${code}
         AND ga.metadata ? '_group_map'
       LIMIT 1
    ),
    candidates AS (
      SELECT ga.id, 0 AS priority, ga.sort_order, ga.code
        FROM master.gl_account ga
        JOIN operating op ON op.chart_of_account_id = ga.chart_of_account_id
       WHERE ga.tenant_id = ${tenantId}
         AND ga.code = ${code}
         AND ga.is_active = true
         AND ga.node_type = 'posting'
         AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
      UNION ALL
      SELECT ga.id, 1 AS priority, ga.sort_order, ga.code
        FROM master.gl_account ga
        JOIN operating op ON op.chart_of_account_id = ga.chart_of_account_id
        JOIN source_group sg ON sg.group_map = ga.metadata->>'_group_map'
       WHERE ga.tenant_id = ${tenantId}
         AND ga.is_active = true
         AND ga.node_type = 'posting'
         AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
    )
    SELECT id
      FROM candidates
     ORDER BY priority, sort_order, code
     LIMIT 1
  `.execute(db);
  return r.rows[0]?.id ?? null;
}

async function resolveFromIntent(
  db:              AnyDb,
  tenantId:        string,
  companyId:       string,
  businessIntentId: string | null,
  spendCategoryId: string | null,
  fallbackCode:    string | null,
): Promise<string | null> {
  if (businessIntentId) {
    const r = await sql<{ account_id: string }>`
      SELECT master.fn_resolve_intent_default_gl_account(
               ${tenantId}::uuid,
               ${businessIntentId}::uuid,
               ${companyId}::uuid
             )::text AS account_id
       LIMIT 1
    `.execute(db);
    if (r.rows[0]?.account_id) return r.rows[0].account_id;
  }
  if (spendCategoryId) {
    const r = await sql<{ account_id: string }>`
      SELECT resolved_gl_account_id::text AS account_id
        FROM master.fn_resolve_spend_category_defaults(
               ${tenantId}::uuid,
               ${spendCategoryId}::uuid,
               ${companyId}::uuid
             )
       LIMIT 1
    `.execute(db);
    if (r.rows[0]?.account_id) return r.rows[0].account_id;
  }
  // Last resort: account_fallback is a GL code
  if (fallbackCode) {
    return resolveByCode(db, tenantId, companyId, fallbackCode);
  }
  return null;
}

async function resolvePostingRole(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
  lookupKey: string,
  fallback:  string | null,
): Promise<string | null> {
  const subledger = POSTING_ROLE_SUBLEDGER[lookupKey] ?? lookupKey;
  const bySubledger = await resolveBySubledger(db, tenantId, companyId, subledger);
  if (bySubledger) return bySubledger;
  if (fallback) return resolveByCode(db, tenantId, companyId, fallback);
  return null;
}

// ── Amount resolver ───────────────────────────────────────────────────────────

function resolveAmount(
  tmpl:    EntryTemplate,
  invoice: InvoiceCtx,
  // lineAmount is set when expanding FROM_INTENT lines (net_amount of a single invoice line)
  lineAmount?: number,
): number {
  switch (tmpl.amountSource) {
    case "LINE_AMOUNT":      return Math.abs(lineAmount ?? invoice.totalAmount);
    case "TAX_AMOUNT":       return Math.abs(invoice.taxAmount);
    case "RETENTION_AMOUNT": return Math.abs(invoice.retentionAmount);
    case "NET_PAYABLE":      return Math.abs(invoice.payableAmount);
    case "DOCUMENT_TOTAL":   return Math.abs(invoice.totalAmount);
    case "ADVANCE_AMOUNT":   return Math.abs(invoice.totalAmount);  // whole invoice is an advance
    case "ADVANCE_RECOVERY": return 0; // deferred — ADVANCE_RECOVERED event not yet wired
    case "CALCULATED":
      // Context-driven: use account_lookup_key to determine what CALCULATED means
      if (tmpl.accountLookupKey === "wht_payable") return Math.abs(invoice.whtAmount);
      // amount_formula or amount_percentage fallback (deferred)
      if (tmpl.amountPercentage) {
        return Math.abs(invoice.totalAmount * Number(tmpl.amountPercentage) / 100);
      }
      return 0;
    case "REMAINDER": return 0; // computed after all other lines
    default:          return 0; // DISCOUNT_EARNED, SCF_FINANCIER_AMOUNT, etc. — deferred
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Builds concrete journal_line data from the profile's entry templates.
 * Returns null if any required GL account cannot be resolved (triggers legacy fallback).
 */
export async function buildJeLinesFromProfile(
  db:      AnyDb,
  profile: DerivedProfile,
  invoice: InvoiceCtx,
  lines:   InvoiceLineCtx[],
  ctx:     PostingCtx,
): Promise<ProfileBuildResult | null> {
  const { tenantId, companyId } = ctx;
  const { exchangeRate } = invoice;
  const docType      = invoice.invoiceType.toUpperCase();
  const isCreditNote = invoice.isCreditNote;

  const jeLines: ResolvedJeLine[]       = [];
  const lineAccountMap = new Map<string, string>();
  let lineSeqCounter = 10;

  // Running totals for REMAINDER computation (base currency)
  let totalDebit  = 0;
  let totalCredit = 0;

  for (const tmpl of profile.templates) {
    // applies_to filter
    if (tmpl.appliesTo && tmpl.appliesTo.length > 0 && !tmpl.appliesTo.includes(docType)) {
      continue;
    }

    // REMAINDER is deferred — will be computed after all other lines
    if (tmpl.isBalancingLine) continue;

    // ── FROM_INTENT: expand to one JE line per invoice line ──────────────────
    if (tmpl.accountSource === "FROM_INTENT" || tmpl.accountSource === "FROM_CATEGORY") {
      for (const invLine of lines) {
        const accountId = await resolveFromIntent(
          db, tenantId, companyId,
          invLine.businessIntentId,
          invLine.spendCategoryId,
          tmpl.accountFallback,
        );
        if (!accountId) return null; // required account missing → fallback

        lineAccountMap.set(invLine.id, accountId);

        const absAmount  = resolveAmount(tmpl, invoice, Math.abs(invLine.netAmount));
        if (absAmount === 0) continue;

        const effectiveSide = isCreditNote
          ? (tmpl.postingSide === "DEBIT" ? "CREDIT" : "DEBIT")
          : tmpl.postingSide;

        const baseAmt = absAmount * exchangeRate;
        if (effectiveSide === "DEBIT")  totalDebit  += baseAmt;
        else                            totalCredit += baseAmt;

        jeLines.push({
          lineNo:          lineSeqCounter,
          glAccountId:     accountId,
          postingSide:     effectiveSide,
          amount:          absAmount,
          baseAmount:      baseAmt,
          description:     invLine.description || tmpl.description,
          subledgerType:   null,
          partyType:       null,
          partyId:         null,
          sourceDocLineId: invLine.id,
          costCenterId:    invLine.costCenterId,
          profitCenterId:  invLine.profitCenterId,
          projectId:       invLine.projectId,
        });
        lineSeqCounter += 10;
      }
      continue;
    }

    // ── POSTING_ROLE ──────────────────────────────────────────────────────────
    if (tmpl.accountSource === "POSTING_ROLE") {
      if (!tmpl.accountLookupKey) return null;
      const accountId = await resolvePostingRole(
        db, tenantId, companyId, tmpl.accountLookupKey, tmpl.accountFallback,
      );
      if (!accountId) return null;

      const absAmount = resolveAmount(tmpl, invoice);
      if (absAmount === 0) continue; // zero-fire: skip this line

      const effectiveSide = isCreditNote
        ? (tmpl.postingSide === "DEBIT" ? "CREDIT" : "DEBIT")
        : tmpl.postingSide;

      // Subledger metadata for AP Trade Payable line
      const isApLine     = tmpl.accountLookupKey === "ap_trade_payable";
      const subledgerType = isApLine ? "ap" : null;
      const partyType     = isApLine ? "supplier" : null;
      const partyId       = isApLine ? invoice.supplierId : null;

      const baseAmt = absAmount * exchangeRate;
      if (effectiveSide === "DEBIT")  totalDebit  += baseAmt;
      else                            totalCredit += baseAmt;

      jeLines.push({
        lineNo:          lineSeqCounter,
        glAccountId:     accountId,
        postingSide:     effectiveSide,
        amount:          absAmount,
        baseAmount:      baseAmt,
        description:     tmpl.description,
        subledgerType,
        partyType,
        partyId,
        sourceDocLineId: null,
        costCenterId:    null,
        profitCenterId:  null,
        projectId:       null,
      });
      lineSeqCounter += 10;
      continue;
    }

    // ── FIXED ─────────────────────────────────────────────────────────────────
    if (tmpl.accountSource === "FIXED") {
      if (!tmpl.accountCode) return null;
      const accountId = await resolveByCode(db, tenantId, companyId, tmpl.accountCode);
      if (!accountId) return null;

      const absAmount = resolveAmount(tmpl, invoice);
      if (absAmount === 0) continue;

      const effectiveSide = isCreditNote
        ? (tmpl.postingSide === "DEBIT" ? "CREDIT" : "DEBIT")
        : tmpl.postingSide;

      const baseAmt = absAmount * exchangeRate;
      if (effectiveSide === "DEBIT")  totalDebit  += baseAmt;
      else                            totalCredit += baseAmt;

      jeLines.push({
        lineNo:          lineSeqCounter,
        glAccountId:     accountId,
        postingSide:     effectiveSide,
        amount:          absAmount,
        baseAmount:      baseAmt,
        description:     tmpl.description,
        subledgerType:   null,
        partyType:       null,
        partyId:         null,
        sourceDocLineId: null,
        costCenterId:    null,
        profitCenterId:  null,
        projectId:       null,
      });
      lineSeqCounter += 10;
      continue;
    }
  }

  // ── REMAINDER / balancing lines ───────────────────────────────────────────
  for (const tmpl of profile.templates) {
    if (!tmpl.isBalancingLine) continue;
    if (tmpl.appliesTo && tmpl.appliesTo.length > 0 && !tmpl.appliesTo.includes(docType)) {
      continue;
    }

    // Resolve account — required even for zero-amount remainder lines
    let accountId: string | null = null;
    if (tmpl.accountSource === "POSTING_ROLE" && tmpl.accountLookupKey) {
      accountId = await resolvePostingRole(
        db, tenantId, companyId, tmpl.accountLookupKey, tmpl.accountFallback,
      );
    } else if (tmpl.accountSource === "FIXED" && tmpl.accountCode) {
      accountId = await resolveByCode(db, tenantId, companyId, tmpl.accountCode);
    }
    if (!accountId) return null;

    // Residual in base currency, then back-convert to transaction currency
    const residualBase = Math.abs(totalDebit - totalCredit);
    if (residualBase === 0) continue;
    const residualTxn = exchangeRate !== 0 ? residualBase / exchangeRate : residualBase;

    // Which side absorbs the imbalance?
    // Standard: ∑DR > ∑CR (after expenses DR) → remainder is a CR.
    // Credit note: sides are inverted for all prior lines so the remainder is also inverted.
    const naturalSide = tmpl.postingSide; // from template (e.g., CREDIT for AP Trade Payable)
    const effectiveSide = isCreditNote
      ? (naturalSide === "DEBIT" ? "CREDIT" : "DEBIT")
      : naturalSide;

    const isApLine    = tmpl.accountLookupKey === "ap_trade_payable";
    const subledgerType = isApLine ? "ap" : null;
    const partyType     = isApLine ? "supplier" : null;
    const partyId       = isApLine ? invoice.supplierId : null;

    if (effectiveSide === "DEBIT")  totalDebit  += residualBase;
    else                            totalCredit += residualBase;

    jeLines.push({
      lineNo:          lineSeqCounter,
      glAccountId:     accountId,
      postingSide:     effectiveSide,
      amount:          residualTxn,
      baseAmount:      residualBase,
      description:     tmpl.description,
      subledgerType,
      partyType,
      partyId,
      sourceDocLineId: null,
      costCenterId:    null,
      profitCenterId:  null,
      projectId:       null,
    });
    lineSeqCounter += 10;
  }

  return { jeLines, lineAccountMap };
}
