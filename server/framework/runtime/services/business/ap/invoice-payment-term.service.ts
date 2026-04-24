/**
 * Invoice Payment Term Service
 *
 * Fully evaluates a payment_term for an invoice and creates
 * document.payment_term_application rows for each clause.
 *
 * Replaces the incomplete net_days-only calculation in promote-proforma.handler.ts.
 *
 * Supported clause types:
 *   net          — final balance due on net_days after baseline_date
 *   discount     — early-payment discount if paid within discount_days
 *   advance      — advance payment due before invoice date
 *   retention    — portion withheld until release milestone
 *
 * Returns:
 *   baseline_date, due_date, term_snapshot (JSONB), and the created PTA rows.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface PaymentTermClause {
  id:             string;
  clause_type:    string;   // 'net' | 'discount' | 'advance' | 'retention'
  sequence_no:    number;
  net_days:       number;
  discount_days:  number | null;
  discount_pct:   number | null;
  amount_pct:     number | null;
  baseline_type:  string;  // 'invoice_date' | 'posting_date' | 'received_date' | 'statement_date'
}

export interface PaymentTermData {
  id:             string;
  code:           string;
  name:           string;
  net_days:       number;
  baseline_type:  string;
  clauses:        PaymentTermClause[];
}

export interface PtaCreationResult {
  baseline_date: Date | null;
  due_date:      Date | null;
  term_snapshot: Record<string, unknown>;
  pta_rows:      string[];  // IDs of created payment_term_application rows
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function resolveBase(
  clause:        PaymentTermClause,
  invoiceDate:   Date,
  postingDate:   Date,
  receivedDate?: Date,
): Date {
  switch (clause.baseline_type) {
    case "posting_date":  return postingDate;
    case "received_date": return receivedDate ?? invoiceDate;
    default:              return invoiceDate;
  }
}

export async function evaluatePaymentTerm(
  db:              AnyDb,
  tenantId:        string,
  paymentTermId:   string,
  invoiceId:       string,
  invoiceDate:     Date,
  postingDate:     Date,
  invoiceAmount:   number,
  principalId:     string | null,
  receivedDate?:   Date,
): Promise<PtaCreationResult | null> {

  // Load the payment term with all clauses
  const termResult = await sql<PaymentTermClause & { term_code: string; term_name: string; term_net_days: number; term_baseline_type: string }>`
    SELECT
      ptc.id,
      ptc.clause_type,
      COALESCE(ptc.sequence_no, 10)  AS sequence_no,
      COALESCE(ptc.net_days,    0)   AS net_days,
      ptc.discount_days,
      ptc.discount_pct,
      ptc.amount_pct,
      COALESCE(ptc.baseline_type, pt.baseline_type) AS baseline_type,
      pt.code   AS term_code,
      pt.name   AS term_name,
      COALESCE(pt.net_days, 0)       AS term_net_days,
      pt.baseline_type               AS term_baseline_type
    FROM   master.payment_term_clause ptc
    JOIN   master.payment_term        pt  ON pt.id = ptc.payment_term_id
    WHERE  ptc.payment_term_id = ${paymentTermId}
      AND  ptc.tenant_id       = ${tenantId}
      AND  ptc.is_active       = true
    ORDER  BY ptc.sequence_no
  `.execute(db);

  const clauses = termResult.rows;

  // If no clauses, fall back to simple net_days term
  if (clauses.length === 0) {
    const simpleTerm = await sql<{ net_days: number; baseline_type: string; code: string; name: string }>`
      SELECT net_days, baseline_type, code, name
      FROM   master.payment_term
      WHERE  id = ${paymentTermId} AND tenant_id = ${tenantId}
      LIMIT  1
    `.execute(db);

    const term = simpleTerm.rows[0];
    if (!term) return null;

    let base: Date;
    switch (term.baseline_type) {
      case "posting_date":  base = postingDate; break;
      case "received_date": base = receivedDate ?? invoiceDate; break;
      default:              base = invoiceDate; break;
    }
    const dueDate = addDays(base, Number(term.net_days) || 0);

    return {
      baseline_date: base,
      due_date:      dueDate,
      term_snapshot: { code: term.code, name: term.name, net_days: term.net_days, baseline_type: term.baseline_type },
      pta_rows:      [],
    };
  }

  // Extract term header from first clause row
  const header = clauses[0]!;
  const termSnapshot: Record<string, unknown> = {
    code:          header.term_code,
    name:          header.term_name,
    net_days:      header.term_net_days,
    baseline_type: header.term_baseline_type,
    clauses:       clauses.map(c => ({
      clause_type: c.clause_type, sequence_no: c.sequence_no,
      net_days: c.net_days, discount_days: c.discount_days,
      discount_pct: c.discount_pct, amount_pct: c.amount_pct,
      baseline_type: c.baseline_type,
    })),
  };

  // ── Create a payment_term_application row per clause ────────────────────────
  let primaryDueDate: Date | null = null;
  let primaryBaseline: Date | null = null;
  const ptaIds: string[] = [];
  const now = new Date();

  for (const clause of clauses) {
    const base     = resolveBase(clause, invoiceDate, postingDate, receivedDate);
    const dueDate  = addDays(base, Number(clause.net_days) || 0);
    const clauseAmt = clause.amount_pct
      ? (invoiceAmount * Number(clause.amount_pct)) / 100
      : null;

    // Insert PTA row
    const ptaResult = await sql<{ id: string }>`
      INSERT INTO document.payment_term_application (
        tenant_id, purchase_invoice_id, payment_term_id, clause_id,
        clause_type, sequence_no,
        baseline_date, due_date,
        amount, discount_pct, discount_days,
        status, created_by, created_at
      ) VALUES (
        ${tenantId}, ${invoiceId}, ${paymentTermId}, ${clause.id},
        ${clause.clause_type}, ${clause.sequence_no},
        ${base}, ${dueDate},
        ${clauseAmt ?? null}, ${clause.discount_pct ?? null}, ${clause.discount_days ?? null},
        'open', ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
      )
      ON CONFLICT (tenant_id, purchase_invoice_id, clause_id) DO UPDATE
        SET baseline_date = EXCLUDED.baseline_date,
            due_date      = EXCLUDED.due_date,
            updated_at    = now()
      RETURNING id
    `.execute(db);

    if (ptaResult.rows[0]) {
      ptaIds.push(ptaResult.rows[0].id);
    }

    // The 'net' clause drives the primary due date
    if (clause.clause_type === "net") {
      primaryDueDate  = dueDate;
      primaryBaseline = base;
    }
  }

  // If no explicit 'net' clause, use the last clause's due date
  if (!primaryDueDate && clauses.length > 0) {
    const last = clauses[clauses.length - 1]!;
    primaryBaseline = resolveBase(last, invoiceDate, postingDate, receivedDate);
    primaryDueDate  = addDays(primaryBaseline, Number(last.net_days) || 0);
  }

  return {
    baseline_date: primaryBaseline,
    due_date:      primaryDueDate,
    term_snapshot: termSnapshot,
    pta_rows:      ptaIds,
  };
}
