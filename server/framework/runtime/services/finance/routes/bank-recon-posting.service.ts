/**
 * Bank reconciliation adjustment posting.
 *
 * Creates the adjustment JE when a bank_recon_case is signed off.
 * Cases with no difference are only marked signed off; bank_charge,
 * fx_difference, and near_match cases with a non-zero difference post a
 * balanced journal entry using the canonical journal_entry/journal_line schema.
 */

import { sql, type Kysely } from "kysely";
import { resolveFxRate } from "../../shared/fx-rate.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const SYSTEM_PRINCIPAL_UUID = "00000000-0000-0000-0000-000000000000";

export interface PostReconAdjustmentInput {
  tenantId:      string;
  companyCodeId: string;
  bankAccountId: string;
  reconCaseId:   string;
  postedBy:      string;
  postingDate:   string;
  fiscalYear:    number;
  periodNumber:  number;
  bookId:        string;
}

export interface PostReconAdjustmentResult {
  jeId:          string | null;
  caseType:      string;
  differenceAmt: number;
}

interface ReconCaseRow {
  case_type: string;
  difference_amount: string;
  currency_code: string;
  status: string;
  case_number: string;
}

export async function postReconAdjustment(
  db:    AnyDb,
  input: PostReconAdjustmentInput,
): Promise<PostReconAdjustmentResult> {
  return db.transaction().execute(async (trx) => {
    const reconResult = await sql<ReconCaseRow>`
      SELECT brc.case_type,
             brc.difference_amount,
             brc.currency_code,
             brc.status,
             brc.case_number
        FROM document.bank_recon_case brc
       WHERE brc.id = ${input.reconCaseId}::uuid
         AND brc.tenant_id = ${input.tenantId}::uuid
       LIMIT 1
       FOR UPDATE
    `.execute(trx);

    const recon = reconResult.rows[0];
    if (!recon) throw new Error(`Recon case ${input.reconCaseId} not found`);
    if (recon.status === "signed_off") {
      return { jeId: null, caseType: recon.case_type, differenceAmt: 0 };
    }

    const diffAmt = Number(recon.difference_amount);
    if (!Number.isFinite(diffAmt)) throw new Error("Recon case difference amount is invalid");

    if (
      ((recon.case_type === "exact_match" || recon.case_type === "amount_match") && Math.abs(diffAmt) < 0.0001) ||
      Math.abs(diffAmt) < 0.0001
    ) {
      await signOffCase(trx, input, null);
      return { jeId: null, caseType: recon.case_type, differenceAmt: diffAmt };
    }

    if (recon.case_type === "exception") {
      return { jeId: null, caseType: recon.case_type, differenceAmt: diffAmt };
    }

    const actorId = input.postedBy || SYSTEM_PRINCIPAL_UUID;
    const bankGlId = await resolveBankGlAccount(trx, input.tenantId, input.companyCodeId, input.bankAccountId);
    if (!bankGlId) {
      throw new Error("Bank account has no active house-bank GL account mapping");
    }

    const bookCode = await resolveBookCode(trx, input.tenantId, input.bookId);
    const adjGlId = await resolveAdjustmentAccount(trx, input, recon.case_type, diffAmt, bookCode);
    if (!adjGlId) {
      throw new Error(`No GL account found for bank reconciliation case type ${recon.case_type}`);
    }

    const fiscalPeriodId = await resolveFiscalPeriod(trx, input);
    if (!fiscalPeriodId) {
      throw new Error(`Fiscal period ${input.fiscalYear}/${input.periodNumber} was not found`);
    }

    const baseCurrency = await resolveCompanyCurrency(trx, input.tenantId, input.companyCodeId);
    const jeNumber = await nextJeCode(trx, input.tenantId, input.companyCodeId, input.postingDate);
    const absAmt = Math.abs(diffAmt);
    const fxRate = await resolveAdjustmentFxRate(trx, input.tenantId, recon.currency_code, baseCurrency, input.postingDate);
    const exchangeRate = recon.currency_code === baseCurrency ? null : fxRate;
    const baseAbsAmt = absAmt * fxRate;
    const description = recon.case_type === "bank_charge"
      ? `Bank charge - recon case ${recon.case_number}`
      : `Bank reconciliation difference - recon case ${recon.case_number}`;

    let drAccountId: string;
    let crAccountId: string;

    if (recon.case_type === "bank_charge" || diffAmt > 0) {
      drAccountId = adjGlId;
      crAccountId = bankGlId;
    } else {
      drAccountId = bankGlId;
      crAccountId = adjGlId;
    }

    const jeResult = await sql<{ id: string }>`
      INSERT INTO document.journal_entry (
        tenant_id, company_code_id, book_id, fiscal_period_id,
        fiscal_year, period_number, je_number,
        document_date, posting_date,
        source_doc_type, source_doc_id,
        transaction_currency, base_currency,
        total_debit, total_credit, line_count,
        description, status, created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${input.companyCodeId}::uuid, ${input.bookId}::uuid, ${fiscalPeriodId}::uuid,
        ${input.fiscalYear}, ${input.periodNumber}, ${jeNumber},
        ${input.postingDate}::date, ${input.postingDate}::date,
        'bank_recon', ${input.reconCaseId}::uuid,
        ${recon.currency_code}, ${baseCurrency},
        0, 0, 0,
        ${description}, 'draft', ${actorId}::uuid
      )
      RETURNING id
    `.execute(trx);

    const jeId = jeResult.rows[0]?.id;
    if (!jeId) throw new Error("Failed to create bank reconciliation adjustment JE");

    await insertJournalLine(trx, input, {
      jeId,
      lineNo: 1,
      glAccountId: drAccountId,
      description,
      transactionCurrency: recon.currency_code,
      transactionDebit: absAmt,
      transactionCredit: 0,
      baseCurrency,
      baseDebit: baseAbsAmt,
      baseCredit: 0,
      exchangeRate,
      actorId,
    });

    await insertJournalLine(trx, input, {
      jeId,
      lineNo: 2,
      glAccountId: crAccountId,
      description,
      transactionCurrency: recon.currency_code,
      transactionDebit: 0,
      transactionCredit: absAmt,
      baseCurrency,
      baseDebit: 0,
      baseCredit: baseAbsAmt,
      exchangeRate,
      actorId,
    });

    await sql`
      UPDATE document.journal_entry
         SET status = 'created',
             updated_at = now(),
             updated_by = ${actorId}::uuid
       WHERE id = ${jeId}::uuid
         AND tenant_id = ${input.tenantId}::uuid
    `.execute(trx);

    await sql`
      UPDATE document.journal_entry
         SET status = 'posted',
             posted_at = now(),
             posted_by = ${actorId}::uuid,
             updated_at = now(),
             updated_by = ${actorId}::uuid
       WHERE id = ${jeId}::uuid
         AND tenant_id = ${input.tenantId}::uuid
    `.execute(trx);

    await signOffCase(trx, input, jeId);
    return { jeId, caseType: recon.case_type, differenceAmt: diffAmt };
  });
}

async function insertJournalLine(
  db: AnyDb,
  input: PostReconAdjustmentInput,
  line: {
    jeId: string;
    lineNo: number;
    glAccountId: string;
    description: string;
    transactionCurrency: string;
    transactionDebit: number;
    transactionCredit: number;
    baseCurrency: string;
    baseDebit: number;
    baseCredit: number;
    exchangeRate: number | null;
    actorId: string;
  },
): Promise<void> {
  await sql`
    INSERT INTO document.journal_line (
      id, tenant_id, journal_entry_id,
      company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
      line_no, gl_account_id, description,
      transaction_currency, transaction_debit, transaction_credit,
      base_currency, base_debit, base_credit, exchange_rate,
      created_by
    ) VALUES (
      ${crypto.randomUUID()}, ${input.tenantId}::uuid, ${line.jeId}::uuid,
      ${input.companyCodeId}::uuid, ${input.bookId}::uuid,
      (SELECT fiscal_period_id FROM document.journal_entry WHERE id = ${line.jeId}::uuid AND tenant_id = ${input.tenantId}::uuid),
      ${input.fiscalYear}, ${input.periodNumber}, ${input.postingDate}::date,
      ${line.lineNo}, ${line.glAccountId}::uuid, ${line.description},
      ${line.transactionCurrency}, ${line.transactionDebit.toFixed(4)}, ${line.transactionCredit.toFixed(4)},
      ${line.baseCurrency}, ${line.baseDebit.toFixed(4)}, ${line.baseCredit.toFixed(4)}, ${line.exchangeRate},
      ${line.actorId}::uuid
    )
  `.execute(db);
}

async function signOffCase(db: AnyDb, input: PostReconAdjustmentInput, jeId: string | null): Promise<void> {
  await db
    .updateTable("document.bank_recon_case")
    .set({
      status:         "signed_off",
      sign_off_je_id: jeId,
      signed_off_at:  sql`now()`,
      signed_off_by:  input.postedBy || SYSTEM_PRINCIPAL_UUID,
      updated_at:     sql`now()`,
    })
    .where("id", "=", input.reconCaseId)
    .where("tenant_id", "=", input.tenantId)
    .execute();
}

async function resolveBankGlAccount(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  bankAccountId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("master.bank_account_house_config as hc")
    .innerJoin("master.bank_account_link as bal", (join) =>
      join.onRef("bal.id", "=", "hc.bank_account_link_id").onRef("bal.tenant_id", "=", "hc.tenant_id"),
    )
    .select("hc.gl_account_id")
    .where("bal.tenant_id", "=", tenantId)
    .where("bal.owner_type", "=", "company_code")
    .where("bal.owner_id", "=", companyCodeId)
    .where("bal.bank_account_id", "=", bankAccountId)
    .where("hc.status", "=", "active")
    .where("hc.gl_account_id", "is not", null)
    .orderBy("hc.is_default_disbursement", "desc")
    .orderBy("bal.is_primary", "desc")
    .orderBy("hc.priority", "asc")
    .limit(1)
    .executeTakeFirst() as { gl_account_id: string } | undefined;
  return row?.gl_account_id ?? null;
}

async function resolveAdjustmentAccount(
  db: AnyDb,
  input: PostReconAdjustmentInput,
  caseType: string,
  diffAmt: number,
  bookCode: string,
): Promise<string | null> {
  if (caseType === "bank_charge") {
    return await resolvePostingRoleAccount(db, input.tenantId, input.companyCodeId, "bank_fee", bookCode, input.postingDate)
      ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "expense", "bank")
      ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "expense", "charge")
      ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "expense", "fee");
  }

  if (diffAmt > 0) {
    return await resolvePostingRoleAccount(db, input.tenantId, input.companyCodeId, "fx_loss", bookCode, input.postingDate)
      ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "expense", "fx")
      ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "expense", "foreign exchange")
      ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "expense", "exchange");
  }

  return await resolvePostingRoleAccount(db, input.tenantId, input.companyCodeId, "fx_gain", bookCode, input.postingDate)
    ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "income", "fx")
    ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "income", "foreign exchange")
    ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "income", "exchange")
    ?? await fallbackAccountByClass(db, input.tenantId, input.companyCodeId, "income", "gain");
}

async function resolvePostingRoleAccount(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  role: string,
  bookCode: string,
  postingDate: string,
): Promise<string | null> {
  try {
    const row = await sql<{ account_id: string | null }>`
      SELECT control.resolve_posting_role_account(
        ${tenantId}::uuid,
        ${role},
        ${companyCodeId}::uuid,
        ${bookCode},
        ${postingDate}::date
      ) AS account_id
    `.execute(db);
    return row.rows[0]?.account_id ?? null;
  } catch {
    return null;
  }
}

async function fallbackAccountByClass(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  accountClass: string,
  nameLike: string,
): Promise<string | null> {
  const pattern = `%${nameLike}%`;
  const row = await sql<{ id: string }>`
    SELECT ga.id
      FROM master.gl_account ga
      JOIN master.company_code_chart_assignment cca
        ON cca.tenant_id = ga.tenant_id
       AND cca.chart_of_account_id = ga.chart_of_account_id
       AND cca.company_code_id = ${companyCodeId}::uuid
       AND cca.status = 'active'
     WHERE ga.tenant_id = ${tenantId}::uuid
       AND ga.account_class = ${accountClass}
       AND ga.is_active = true
       AND ga.node_type = 'posting'
       AND (ga.name ILIKE ${pattern} OR ga.code ILIKE ${pattern})
     ORDER BY ga.sort_order NULLS LAST, ga.code
     LIMIT 1
  `.execute(db);
  return row.rows[0]?.id ?? null;
}

async function resolveFiscalPeriod(db: AnyDb, input: PostReconAdjustmentInput): Promise<string | null> {
  const row = await db
    .selectFrom("master.fiscal_period")
    .select("id")
    .where("tenant_id", "=", input.tenantId)
    .where("company_code_id", "=", input.companyCodeId)
    .where("fiscal_year", "=", input.fiscalYear)
    .where("period_number", "=", input.periodNumber)
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

async function resolveCompanyCurrency(db: AnyDb, tenantId: string, companyCodeId: string): Promise<string> {
  const row = await db
    .selectFrom("master.company_code")
    .select("functional_currency")
    .where("tenant_id", "=", tenantId)
    .where("id", "=", companyCodeId)
    .limit(1)
    .executeTakeFirst() as { functional_currency: string } | undefined;
  return row?.functional_currency ?? "USD";
}

async function resolveAdjustmentFxRate(
  db: AnyDb,
  tenantId: string,
  transactionCurrency: string,
  baseCurrency: string,
  postingDate: string,
): Promise<number> {
  const fxRate = await resolveFxRate(db, {
    tenantId,
    fromCurrency: transactionCurrency,
    toCurrency: baseCurrency,
    asOf: postingDate,
    rateType: "SPOT",
  });
  if (!fxRate.rate || fxRate.rate <= 0) {
    throw new Error(`FX rate not found for ${transactionCurrency}/${baseCurrency} on ${postingDate}`);
  }
  return fxRate.rate;
}

async function resolveBookCode(db: AnyDb, tenantId: string, bookId: string): Promise<string> {
  const row = await db
    .selectFrom("master.ledger_book")
    .select("code")
    .where("tenant_id", "=", tenantId)
    .where("id", "=", bookId)
    .limit(1)
    .executeTakeFirst() as { code: string } | undefined;
  return row?.code ?? "statutory";
}

async function nextJeCode(db: AnyDb, tenantId: string, companyCodeId: string, postingDate: string): Promise<string> {
  const year = new Date(postingDate).getFullYear();
  try {
    const row = await sql<{ n: string }>`
      SELECT control.next_entity_number(
        ${tenantId}::uuid,
        'journal_entry',
        'document_no',
        ${companyCodeId}::uuid,
        NULL,
        NULL,
        NULL,
        ${postingDate}::date
      ) AS n
    `.execute(db);
    return String(row.rows[0]?.n ?? `JE-BR-${year}-${Date.now()}`);
  } catch {
    return `JE-BR-${year}-${Date.now()}`;
  }
}
