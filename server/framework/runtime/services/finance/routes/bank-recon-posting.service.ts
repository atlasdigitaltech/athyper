/**
 * Bank Recon Posting Service — Phase 5
 *
 * Creates the adjustment JE when a bank_recon_case is signed off.
 *
 * Applicable case types:
 *   bank_charge    — fee deducted by bank not in books:
 *                    Dr Bank Charges Expense  / Cr Bank Account GL
 *   fx_difference  — FX settlement difference:
 *                    difference_amount > 0: Dr FX Loss   / Cr Bank Account GL
 *                    difference_amount < 0: Dr Bank Account GL / Cr FX Gain
 *   exact_match    — no JE needed (difference_amount = 0)
 *   amount_match   — no JE needed (difference_amount = 0)
 *   near_match     — JE optional; only posted if |difference_amount| > 0
 *   exception      — no JE; marked for manual follow-up
 *
 * GL account lookup:
 *   Bank account GL: master.bank_account_house_config.gl_account_id
 *   Bank charges:    resolved from control.acct_profile_config posting roles
 *                    (posting_role = 'bank_charges_expense') — falls back to
 *                    a hard-coded account_code query if no profile exists.
 *   FX Gain/Loss:    resolved from posting roles 'fx_gain' / 'fx_loss'.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostReconAdjustmentInput {
  tenantId:      string;
  companyCodeId: string;
  bankAccountId: string;
  reconCaseId:   string;
  postedBy:      string;
  postingDate:   string;  // YYYY-MM-DD
  fiscalYear:    number;
  periodNumber:  number;
  bookId:        string;
}

export interface PostReconAdjustmentResult {
  jeId:         string | null;  // null when no JE is needed
  caseType:     string;
  differenceAmt: number;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function postReconAdjustment(
  db:    AnyDb,
  input: PostReconAdjustmentInput,
): Promise<PostReconAdjustmentResult> {
  // Load recon case
  const recon = await db
    .selectFrom("document.bank_recon_case as brc")
    .select([
      "brc.case_type", "brc.difference_amount", "brc.currency_code",
      "brc.status", "brc.case_number",
    ])
    .where("brc.id",        "=", input.reconCaseId)
    .where("brc.tenant_id", "=", input.tenantId)
    .executeTakeFirst() as {
      case_type: string; difference_amount: string; currency_code: string;
      status: string; case_number: string;
    } | undefined;

  if (!recon) throw new Error(`Recon case ${input.reconCaseId} not found`);
  if (recon.status === "signed_off") return { jeId: null, caseType: recon.case_type, differenceAmt: 0 };

  const diffAmt = parseFloat(recon.difference_amount);

  // No JE for zero-difference matched cases
  if (
    (recon.case_type === "exact_match" || recon.case_type === "amount_match") &&
    Math.abs(diffAmt) < 0.0001
  ) {
    await signOffCase(db, input, null);
    return { jeId: null, caseType: recon.case_type, differenceAmt: diffAmt };
  }

  if (recon.case_type === "exception") {
    // Exception cases never auto-post
    return { jeId: null, caseType: recon.case_type, differenceAmt: diffAmt };
  }

  if (Math.abs(diffAmt) < 0.0001) {
    await signOffCase(db, input, null);
    return { jeId: null, caseType: recon.case_type, differenceAmt: diffAmt };
  }

  // Resolve GL accounts
  const bankGlId = await resolveBankGlAccount(db, input.tenantId, input.bankAccountId);
  if (!bankGlId) throw new Error("Bank account has no house config GL account — configure master.bank_account_house_config");

  let adjGlId: string | null;
  if (recon.case_type === "bank_charge") {
    adjGlId = await resolvePostingRoleAccount(db, input.tenantId, input.companyCodeId, "bank_charges_expense")
      ?? await fallbackAccountByClass(db, input.tenantId, "EXPENSE", "bank_charges");
    if (!adjGlId) throw new Error("No GL account found for bank_charges_expense posting role");
  } else {
    // fx_difference or near_match
    const role = diffAmt > 0 ? "fx_loss" : "fx_gain";
    adjGlId = await resolvePostingRoleAccount(db, input.tenantId, input.companyCodeId, role)
      ?? await fallbackAccountByClass(db, input.tenantId, "OTHER", role);
    if (!adjGlId) throw new Error(`No GL account found for ${role} posting role`);
  }

  // TypeScript: at this point adjGlId is guaranteed non-null (throws above)
  const adjAccountId = adjGlId!;

  // Build JE
  const absAmt = Math.abs(diffAmt);
  const jeDescription = recon.case_type === "bank_charge"
    ? `Bank charge — recon case ${recon.case_number}`
    : `FX ${diffAmt > 0 ? "loss" : "gain"} — recon case ${recon.case_number}`;

  const jeResult = await sql<{ id: string }>`
    INSERT INTO document.journal_entry
      (tenant_id, company_code_id, book_id,
       je_type, je_source, reference_number, description,
       posting_date, document_date, fiscal_year, period_number,
       currency_code, status, is_balanced,
       created_at, created_by)
    VALUES (
      ${input.tenantId}::uuid, ${input.companyCodeId}::uuid, ${input.bookId}::uuid,
      'BANK_RECON', 'BANK_RECON', ${recon.case_number}, ${jeDescription},
      ${input.postingDate}::date, ${input.postingDate}::date,
      ${input.fiscalYear}, ${input.periodNumber},
      ${recon.currency_code}, 'posted', true,
      now(), ${input.postedBy}::uuid
    )
    RETURNING id
  `.execute(db);

  const jeId = jeResult.rows[0]?.id;
  if (!jeId) throw new Error("Failed to insert adjustment JE");

  // JE lines
  // bank_charge:    Dr bank_charges_expense / Cr bank account
  // fx_loss:        Dr fx_loss              / Cr bank account  (diffAmt > 0 → books > bank)
  // fx_gain:        Dr bank account         / Cr fx_gain       (diffAmt < 0 → bank > books)
  let drAccountId: string;
  let crAccountId: string;

  if (recon.case_type === "bank_charge" || diffAmt > 0) {
    drAccountId = adjAccountId;
    crAccountId = bankGlId;
  } else {
    drAccountId = bankGlId;
    crAccountId = adjAccountId;
  }

  await sql`
    INSERT INTO document.journal_line
      (tenant_id, journal_entry_id, line_no, description,
       gl_account_id, posting_side,
       currency_code, amount, base_amount,
       created_at)
    VALUES
      (${input.tenantId}::uuid, ${jeId}::uuid, 10, ${jeDescription},
       ${drAccountId}::uuid, 'DEBIT',
       ${recon.currency_code}, ${absAmt}, ${absAmt},
       now()),
      (${input.tenantId}::uuid, ${jeId}::uuid, 20, ${jeDescription},
       ${crAccountId}::uuid, 'CREDIT',
       ${recon.currency_code}, ${absAmt}, ${absAmt},
       now())
  `.execute(db);

  await signOffCase(db, input, jeId);

  return { jeId, caseType: recon.case_type, differenceAmt: diffAmt };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signOffCase(db: AnyDb, input: PostReconAdjustmentInput, jeId: string | null): Promise<void> {
  await db
    .updateTable("document.bank_recon_case")
    .set({
      status:          "signed_off",
      sign_off_je_id:  jeId,
      signed_off_at:   sql`now()`,
      signed_off_by:   input.postedBy,
      updated_at:      sql`now()`,
    })
    .where("id",        "=", input.reconCaseId)
    .where("tenant_id", "=", input.tenantId)
    .execute();
}

async function resolveBankGlAccount(
  db: AnyDb, tenantId: string, bankAccountId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("master.bank_account_house_config as hc")
    .innerJoin("master.bank_account_link as bal", "bal.id", "hc.bank_account_link_id")
    .select("hc.gl_account_id")
    .where("bal.tenant_id",      "=", tenantId)
    .where("bal.bank_account_id","=", bankAccountId)
    .where("hc.gl_account_id",   "is not", null)
    .limit(1)
    .executeTakeFirst() as { gl_account_id: string } | undefined;
  return row?.gl_account_id ?? null;
}

async function resolvePostingRoleAccount(
  db: AnyDb, tenantId: string, companyCodeId: string, role: string,
): Promise<string | null> {
  const row = await sql<{ gl_account_id: string }>`
    SELECT pr.gl_account_id
      FROM control.posting_role_assignment pr
     WHERE pr.tenant_id       = ${tenantId}::uuid
       AND pr.company_code_id = ${companyCodeId}::uuid
       AND pr.posting_role    = ${role}
       AND pr.is_active       = true
     ORDER BY pr.effective_from DESC
     LIMIT 1
  `.execute(db);
  return row.rows[0]?.gl_account_id ?? null;
}

async function fallbackAccountByClass(
  db: AnyDb, tenantId: string, accountClass: string, nameLike: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("master.gl_account as ga")
    .select("ga.id")
    .where("ga.tenant_id",    "=", tenantId)
    .where("ga.account_class","=", accountClass)
    .where("ga.name",         "ilike", `%${nameLike}%`)
    .where("ga.is_active",    "=", true)
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}
