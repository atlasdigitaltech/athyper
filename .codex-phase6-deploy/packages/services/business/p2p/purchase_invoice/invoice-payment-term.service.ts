/**
 * Invoice Payment Term Evaluation Service
 *
 * Evaluates a master.payment_term for a purchase invoice and:
 *   1. Computes the due date from the payment term's header rule
 *      (due_rule_type: NET_DAYS | EOM | FIXED_DAY | COD | PREPAID and due_days / due_day_of_month).
 *   2. Creates document.payment_term_application (PTA) rows for each deduction/release
 *      clause (ADVANCE | ADVANCE_RECOVERY | RETENTION | RETENTION_RELEASE).
 *   3. (Phase 2) For non-PO invoices, upserts document.party_advance_balance so the
 *      advance/retention exposure is visible at the party level.
 *
 * Schema alignment notes:
 *   - master.payment_term        — head rule lives here: base_event, due_rule_type, due_days,
 *                                  due_day_of_month; no net_days / baseline_type columns.
 *   - master.payment_term_clause — only ADVANCE/ADVANCE_RECOVERY/RETENTION/RETENTION_RELEASE;
 *                                  no 'net' or 'discount' clause types; calc_mode is PERCENT or
 *                                  FIXED_AMOUNT with default_pct / default_amount.
 *   - document.payment_term_application — key columns: invoice_id (not purchase_invoice_id),
 *                                  application_status (not status), applied_amount (not amount),
 *                                  calculated_basis_amount, default_pct, applied_pct,
 *                                  evaluation_sequence_no, running_total_amount,
 *                                  remaining_balance_amount, clause_code.
 *
 * Phase 2: pta_deduction_needs_commitment constraint dropped (01m_tables_party_advance.sql).
 *   Non-PO invoices now get full PTA rows; balance tracked in party_advance_balance.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── master.payment_term header ────────────────────────────────────────────────

interface PaymentTermHeader {
  id:               string;
  code:             string;
  name:             string;
  due_rule_type:    string;   // NET_DAYS | EOM | FIXED_DAY | COD | PREPAID
  due_days:         number | null;
  due_day_of_month: number | null;
  base_event:       string;   // INVOICE_DATE | GR_DATE | SERVICE_ENTRY_DATE | DELIVERY_DATE | ...
  grace_days:       number;
  month_offset:     number;
}

// ── master.payment_term_clause ────────────────────────────────────────────────

interface PaymentTermClause {
  id:           string;
  clause_code:  string;
  clause_type:  string;   // ADVANCE | ADVANCE_RECOVERY | RETENTION | RETENTION_RELEASE
  sequence_no:  number;
  calc_mode:    string;   // PERCENT | FIXED_AMOUNT
  default_pct:  number | null;
  default_amount: number | null;
  settles_clause_code: string | null;
}

export interface PtaCreationResult {
  baseline_date:  Date;
  due_date:       Date;
  term_snapshot:  Record<string, unknown>;
  pta_rows:       string[];  // IDs of created PTA rows
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function endOfMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0);
}

function nextDayOfMonth(base: Date, dom: number): Date {
  const d = new Date(base);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);  // first of next month
  d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

function resolveBaseDate(
  baseEvent:    string,
  invoiceDate:  Date,
  receivedDate: Date,
): Date {
  switch (baseEvent) {
    case "GR_DATE":
    case "SERVICE_ENTRY_DATE":
    case "DELIVERY_DATE":
    case "CERTIFIED_DATE":
      return receivedDate;
    case "INVOICE_DATE":
    default:
      return invoiceDate;
  }
}

function computeDueDate(term: PaymentTermHeader, baseDate: Date): Date {
  const graceDays = Number(term.grace_days) || 0;
  switch (term.due_rule_type) {
    case "COD":
    case "PREPAID":
      return addDays(baseDate, graceDays);
    case "EOM":
      return addDays(endOfMonth(baseDate), graceDays + (Number(term.due_days) || 0));
    case "FIXED_DAY": {
      const dom = Number(term.due_day_of_month) || 1;
      return addDays(nextDayOfMonth(baseDate, dom), graceDays);
    }
    case "NET_DAYS":
    default:
      return addDays(baseDate, (Number(term.due_days) || 0) + graceDays);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function evaluatePaymentTerm(
  db:             AnyDb,
  tenantId:       string,
  paymentTermId:  string,
  invoiceId:      string,
  invoiceDate:    Date,
  postingDate:    Date,
  invoiceAmount:  number,
  principalId:    string | null,
  commitmentId?:  string | null,
  receivedDate?:  Date,
  logger?:        { warn?(e: string, f?: Record<string, unknown>): void },
): Promise<PtaCreationResult | null> {

  // ── Load payment term header ─────────────────────────────────────────────
  const termResult = await sql<PaymentTermHeader>`
    SELECT id, code, name, due_rule_type, due_days, due_day_of_month,
           base_event, grace_days, month_offset
      FROM master.payment_term
     WHERE id        = ${paymentTermId}
       AND tenant_id = ${tenantId}
     LIMIT 1
  `.execute(db);

  const term = termResult.rows[0];
  if (!term) return null;

  // ── Resolve base date and due date ───────────────────────────────────────
  const baseDate = resolveBaseDate(term.base_event, invoiceDate, receivedDate ?? postingDate);
  const dueDate  = computeDueDate(term, baseDate);

  const termSnapshot: Record<string, unknown> = {
    id:            term.id,
    code:          term.code,
    name:          term.name,
    due_rule_type: term.due_rule_type,
    due_days:      term.due_days,
    base_event:    term.base_event,
    grace_days:    term.grace_days,
  };

  // ── Load ADVANCE / RETENTION deduction clauses ───────────────────────────
  const clauseResult = await sql<PaymentTermClause>`
    SELECT id, clause_code, clause_type, sequence_no,
           calc_mode, default_pct, default_amount, settles_clause_code
      FROM master.payment_term_clause
     WHERE payment_term_id = ${paymentTermId}
       AND tenant_id       = ${tenantId}
       AND is_active        = true
     ORDER BY sequence_no
  `.execute(db);

  const clauses = clauseResult.rows;

  if (clauses.length === 0) {
    // Term has no deduction clauses — due date only
    return { baseline_date: baseDate, due_date: dueDate, term_snapshot: termSnapshot, pta_rows: [] };
  }

  // Phase 2: pta_deduction_needs_commitment constraint dropped (01m_tables_party_advance.sql).
  // Non-PO invoices (no commitmentId) now create PTA rows; balance tracked in party_advance_balance.
  const hasCommitment = commitmentId != null && commitmentId !== "";

  // ── Create PTA rows ──────────────────────────────────────────────────────
  const now    = new Date();
  const pId    = principalId ?? "00000000-0000-0000-0000-000000000000";
  const ptaIds: string[] = [];

  let runningTotal = 0;

  // PTA constraints pta_basis_nonneg and pta_applied_nonneg require non-negative amounts.
  // Credit notes store negative invoice totals; abs() here so deduction clauses compute
  // correctly against the absolute invoice value regardless of sign convention.
  const absBasis = Math.abs(invoiceAmount);

  for (const clause of clauses) {
    const basisAmount  = absBasis;
    const defaultPct   = clause.calc_mode === "PERCENT"      ? Number(clause.default_pct    ?? 0) : null;
    const defaultAmt   = clause.calc_mode === "FIXED_AMOUNT" ? Number(clause.default_amount ?? 0) : null;
    const appliedAmount = clause.calc_mode === "PERCENT"
      ? (basisAmount * (defaultPct ?? 0)) / 100
      : (defaultAmt ?? 0);

    runningTotal += appliedAmount;
    const remainingBalance = Math.max(0, absBasis - runningTotal);

    const clauseSnapshot: Record<string, unknown> = {
      clause_code:  clause.clause_code,
      clause_type:  clause.clause_type,
      calc_mode:    clause.calc_mode,
      default_pct:  clause.default_pct,
      default_amount: clause.default_amount,
      settles_clause_code: clause.settles_clause_code,
    };

    const ptaResult = await sql<{ id: string }>`
      INSERT INTO document.payment_term_application (
        tenant_id,
        invoice_id,
        commitment_id,
        payment_term_id,
        clause_id,
        term_snapshot,
        clause_snapshot,
        application_status,
        clause_type,
        clause_code,
        calculated_basis_amount,
        default_pct,
        applied_pct,
        default_amount,
        applied_amount,
        is_user_editable,
        evaluation_sequence_no,
        running_total_amount,
        remaining_balance_amount,
        is_effective,
        created_by,
        created_at
      ) VALUES (
        ${tenantId},
        ${invoiceId},
        ${commitmentId ?? null},
        ${paymentTermId},
        ${clause.id},
        ${JSON.stringify(termSnapshot)},
        ${JSON.stringify(clauseSnapshot)},
        'APPLIED',
        ${clause.clause_type},
        ${clause.clause_code},
        ${basisAmount.toFixed(4)},
        ${defaultPct ?? null},
        ${defaultPct ?? null},
        ${defaultAmt ?? 0},
        ${appliedAmount.toFixed(4)},
        false,
        ${clause.sequence_no},
        ${runningTotal.toFixed(4)},
        ${remainingBalance.toFixed(4)},
        true,
        ${pId},
        ${now}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `.execute(db);

    if (ptaResult.rows[0]) {
      ptaIds.push(ptaResult.rows[0].id);
    }
  }

  // Balance mutations are deferred to posting events — see advance-balance.service.ts
  // updatePartyBalanceOnPosting(), called from invoice-posting.service.ts.

  return {
    baseline_date: baseDate,
    due_date:      dueDate,
    term_snapshot: termSnapshot,
    pta_rows:      ptaIds,
  };
}
