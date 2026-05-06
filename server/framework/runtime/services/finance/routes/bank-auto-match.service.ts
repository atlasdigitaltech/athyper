/**
 * Bank Auto-Match Service — Phase 5
 *
 * Three-tier matching engine that correlates bank_statement_line rows against
 * payment_entry rows for a given bank account:
 *
 *   T1 — Exact reference match (confidence 0.99)
 *        payment_reference or bank_reference = bank_statement_line.reference_number
 *   T2 — Amount + date window match (confidence 0.90)
 *        |amount| matches payment_amount; posting_date within ±3 days of transaction_date
 *   T3 — Near-match / open case (confidence 0.70)
 *        Amount matches within tolerance; date within ±7 days — creates an open
 *        bank_recon_case for manual review
 *
 * For each matched pair the service:
 *   1. Creates a bank_recon_case (case_type = exact_match / amount_match / near_match)
 *   2. Creates bank_recon_case_line rows (side=payment + side=statement)
 *   3. Updates bank_statement_line.recon_status = 'matched' (or 'exception')
 *   4. Updates payment_entry.cleared_date + payment_entry.bank_statement_line_id
 *
 * payment_entry.status stays 'posted' — reconciliation state is expressed through
 * cleared_date, bank_statement_line_id and bank_recon_case_line rows only.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoMatchInput {
  tenantId:      string;
  bankAccountId: string;
  companyCodeId: string;
  statementId:   string;
  createdBy:     string;
}

export interface AutoMatchResult {
  tier1Matched: number;
  tier2Matched: number;
  tier3Open:    number;
  unmatched:    number;
}

// Internal row shapes
interface StatementLine {
  id:               string;
  line_no:          number;
  transaction_date: string;
  description:      string;
  reference_number: string | null;
  amount:           string;  // numeric from DB as string
  recon_status:     string;
}

interface PaymentEntry {
  id:                string;
  payment_amount:    string;
  payment_direction: string;
  payment_reference: string | null;
  bank_reference:    string | null;
  posting_date:      string;
  value_date:        string;
  cleared_date:      string | null;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runAutoMatch(
  db:    AnyDb,
  input: AutoMatchInput,
): Promise<AutoMatchResult> {
  const result: AutoMatchResult = { tier1Matched: 0, tier2Matched: 0, tier3Open: 0, unmatched: 0 };

  // Load unmatched statement lines for this statement
  const stmtLines = await db
    .selectFrom("document.bank_statement_line as bsl")
    .select([
      "bsl.id", "bsl.line_no", "bsl.transaction_date",
      "bsl.description", "bsl.reference_number", "bsl.amount", "bsl.recon_status",
    ])
    .where("bsl.tenant_id",       "=", input.tenantId)
    .where("bsl.bank_statement_id","=", input.statementId)
    .where("bsl.recon_status",    "=", "unmatched")
    .execute() as StatementLine[];

  if (stmtLines.length === 0) return result;

  // Load uncleared posted payments for this bank account
  const payments = await db
    .selectFrom("document.payment_entry as pe")
    .select([
      "pe.id", "pe.payment_amount", "pe.payment_direction",
      "pe.payment_reference", "pe.bank_reference",
      "pe.posting_date", "pe.value_date", "pe.cleared_date",
    ])
    .where("pe.tenant_id",       "=", input.tenantId)
    .where("pe.bank_account_id", "=", input.bankAccountId)
    .where("pe.is_posted",       "=", true)
    .where("pe.cleared_date",    "is", null)
    .where("pe.status",          "not in", ["reversed", "voided", "cancelled"])
    .execute() as PaymentEntry[];

  const matchedPaymentIds = new Set<string>();
  const matchedLineIds    = new Set<string>();

  // Build reference index from payments
  const payByRef = new Map<string, PaymentEntry[]>();
  for (const p of payments) {
    for (const ref of [p.payment_reference, p.bank_reference]) {
      if (ref?.trim()) {
        const key = ref.trim().toLowerCase();
        if (!payByRef.has(key)) payByRef.set(key, []);
        payByRef.get(key)!.push(p);
      }
    }
  }

  // T1: Exact reference match
  for (const line of stmtLines) {
    if (!line.reference_number?.trim()) continue;
    const key = line.reference_number.trim().toLowerCase();
    const candidates = payByRef.get(key) ?? [];
    const lineAmt = parseFloat(line.amount);

    for (const pay of candidates) {
      if (matchedPaymentIds.has(pay.id)) continue;
      const payAmt = signedPaymentAmount(pay);
      if (!amountsMatch(lineAmt, payAmt, 0.001)) continue;

      await createMatchCase(db, input, "exact_match", 0.99, line, pay, 0);
      matchedPaymentIds.add(pay.id);
      matchedLineIds.add(line.id);
      result.tier1Matched++;
      break;
    }
  }

  // T2: Amount + date window (±3 days)
  const unmatchedLines2 = stmtLines.filter((l) => !matchedLineIds.has(l.id));
  for (const line of unmatchedLines2) {
    const lineAmt  = parseFloat(line.amount);
    const lineDt   = new Date(line.transaction_date).getTime();
    let   best: PaymentEntry | null = null;
    let   bestDiff = Infinity;

    for (const pay of payments) {
      if (matchedPaymentIds.has(pay.id)) continue;
      const payAmt = signedPaymentAmount(pay);
      if (!amountsMatch(lineAmt, payAmt, 0.001)) continue;
      const payDt = new Date(pay.posting_date).getTime();
      const dayDiff = Math.abs((lineDt - payDt) / 86_400_000);
      if (dayDiff <= 3 && dayDiff < bestDiff) { best = pay; bestDiff = dayDiff; }
    }

    if (best) {
      await createMatchCase(db, input, "amount_match", 0.90, line, best, 0);
      matchedPaymentIds.add(best.id);
      matchedLineIds.add(line.id);
      result.tier2Matched++;
    }
  }

  // T3: Near-match (±5% amount, ±7 days) — creates open case for manual review
  const unmatchedLines3 = stmtLines.filter((l) => !matchedLineIds.has(l.id));
  for (const line of unmatchedLines3) {
    const lineAmt = parseFloat(line.amount);
    const lineDt  = new Date(line.transaction_date).getTime();
    let   best: PaymentEntry | null = null;
    let   bestScore = 0;

    for (const pay of payments) {
      if (matchedPaymentIds.has(pay.id)) continue;
      const payAmt = signedPaymentAmount(pay);
      if (!amountsMatch(lineAmt, payAmt, 0.05)) continue;  // within 5%
      const payDt  = new Date(pay.posting_date).getTime();
      const dayDiff = Math.abs((lineDt - payDt) / 86_400_000);
      if (dayDiff > 7) continue;
      const score = 0.70 - (dayDiff / 100) - (Math.abs(lineAmt - payAmt) / (Math.abs(lineAmt) + 1));
      if (score > bestScore) { best = pay; bestScore = score; }
    }

    if (best) {
      const diff = parseFloat(line.amount) - signedPaymentAmount(best);
      await createMatchCase(db, input, "near_match", Math.min(0.70, bestScore), line, best, diff);
      matchedPaymentIds.add(best.id);
      matchedLineIds.add(line.id);
      result.tier3Open++;
    } else {
      result.unmatched++;
    }
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function signedPaymentAmount(pay: PaymentEntry): number {
  const amt = parseFloat(pay.payment_amount);
  // OUTBOUND payments reduce the bank account (negative from account's perspective)
  return pay.payment_direction === "OUTBOUND" ? -amt : amt;
}

function amountsMatch(lineAmt: number, payAmt: number, tolerancePct: number): boolean {
  if (Math.abs(payAmt) < 0.001) return Math.abs(lineAmt) < 0.001;
  return Math.abs(lineAmt - payAmt) / Math.abs(payAmt) <= tolerancePct;
}

async function createMatchCase(
  db:         AnyDb,
  input:      AutoMatchInput,
  caseType:   string,
  confidence: number,
  line:       StatementLine,
  pay:        PaymentEntry,
  diffAmount: number,
): Promise<void> {
  const status = caseType === "near_match" ? "open" : "matched";

  // Generate case number: RC-{YYYYMMDD}-{short id}
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const shortId  = Math.random().toString(36).slice(2, 7).toUpperCase();
  const caseNumber = `RC-${datePart}-${shortId}`;

  const currencyCode = "USD"; // resolved from bank account at runtime in real impl

  const caseRow = await sql<{ id: string }>`
    INSERT INTO document.bank_recon_case
      (tenant_id, company_code_id, bank_account_id,
       case_number, case_type, confidence_score, status,
       difference_amount, currency_code,
       matched_at, created_at, created_by)
    VALUES (
      ${input.tenantId}::uuid, ${input.companyCodeId}::uuid, ${input.bankAccountId}::uuid,
      ${caseNumber}, ${caseType}, ${confidence}, ${status},
      ${diffAmount}, ${currencyCode},
      ${status === "matched" ? "now()" : null},
      now(), ${input.createdBy}::uuid
    )
    RETURNING id
  `.execute(db);

  const caseId = caseRow.rows[0]?.id;
  if (!caseId) return;

  // Payment side line
  await sql`
    INSERT INTO document.bank_recon_case_line
      (tenant_id, bank_recon_case_id, side, payment_entry_id, amount, created_at, created_by)
    VALUES (
      ${input.tenantId}::uuid, ${caseId}::uuid,
      'payment', ${pay.id}::uuid, ${Math.abs(parseFloat(pay.payment_amount))},
      now(), ${input.createdBy}::uuid
    )
  `.execute(db);

  // Statement side line
  await sql`
    INSERT INTO document.bank_recon_case_line
      (tenant_id, bank_recon_case_id, side, bank_statement_line_id, amount, created_at, created_by)
    VALUES (
      ${input.tenantId}::uuid, ${caseId}::uuid,
      'statement', ${line.id}::uuid, ${Math.abs(parseFloat(line.amount))},
      now(), ${input.createdBy}::uuid
    )
  `.execute(db);

  // Update bank_statement_line
  const newReconStatus = caseType === "near_match" ? "exception" : "matched";
  await db
    .updateTable("document.bank_statement_line")
    .set({ recon_status: newReconStatus, recon_case_id: caseId, updated_at: sql`now()` })
    .where("id", "=", line.id)
    .execute();

  // Update payment_entry: set cleared_date + bank_statement_line_id
  // status stays 'posted' — reconciliation state is carried by cleared_date alone
  if (caseType !== "near_match") {
    await db
      .updateTable("document.payment_entry")
      .set({
        cleared_date:          line.transaction_date,
        bank_statement_line_id: line.id,
        updated_at:            sql`now()`,
      })
      .where("id", "=", pay.id)
      .execute();
  }
}
