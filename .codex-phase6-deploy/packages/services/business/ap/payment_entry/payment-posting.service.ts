/**
 * Payment Posting Service — approved → posted
 *
 * handlePostPayment:
 *   Validates the payment is in 'approved' (or 'draft' for direct-post) status, then:
 *   1. Creates document.journal_entry (payment settlement header)
 *   2. Creates document.journal_line rows (H6 v1.2 — full decomposition):
 *        DR  AP Control account      — clears the payable (per allocated_amount)
 *        CR  Bank/Clearing account   — reduces cash by net_payment_amount
 *        CR  Discount Income         — if early payment discount was taken
 *        CR  Withholding Tax Payable — if WHT was deducted at settlement
 *        CR  Advance Prepaid (asset) — if advance recovery was applied
 *        CR  Retention Payable       — if retention was held back
 *        DR/CR FX Gain/Loss          — if payment currency differs from invoice currency
 *      Net cash out = allocated - discount - WHT - advance_recovery - retention
 *      = SUM(payment_entry_allocation.net_payment_amount)
 *   3. Updates payment_entry: status → 'posted', payment_je_id, is_posted, posted_at/by
 *   4. Marks each allocated invoice as fully/partially paid
 *
 * Account resolution order:
 *   AP Control  → master.gl_account WHERE subledger_type = 'ap' AND node_type = 'posting'
 *   Bank        → master.bank_account_link.gl_account_id linked to the company
 *   Fallback    → company default bank gl account
 *
 * handleSubmitPayment:  draft → pending_approval (or → approved for no-workflow tenants)
 * handleVoidPayment:    posted → voided (creates reversal JE)
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { syncBusinessLifecycle, type BusinessLifecycleSyncHook } from "../../lifecycle/lifecycle-sync-hook.js";
import { createHash } from "node:crypto";
import { postJournalGl } from "../../ledger/post-journal-gl.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/**
 * Optional dispatch context. Passed by transaction-flow-dispatcher when this
 * service is invoked via the SETTLEMENT hook; omitted by the existing route
 * callers. When omitted, postJournalGl synthesises an execution token from
 * the JE id so retries on the route-handler path stay idempotent.
 */
export interface PaymentPostingDispatchCtx {
  executionToken:     string;
  transitionId:       string;
  transitionEventSeq?: number;
}

const PAYMENT_POSTING_SENTINEL_TRANSITION_ID = "00000000-0000-0000-0000-000000000000";

function synthPaymentExecutionToken(jeId: string): string {
  return createHash("sha256").update(`je-post:${jeId}`).digest("hex");
}

interface HandlerResult {
  status: number;
  body:   Record<string, unknown>;
}

// ── Account resolution ────────────────────────────────────────────────────────

async function resolveApControlAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  const result = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id      = ${tenantId}
      AND  ga.subledger_type = 'ap'
      AND  ga.is_active      = true
      AND  ga.node_type      = 'posting'
    LIMIT  1
  `.execute(db);
  return result.rows[0]?.account_id ?? null;
}

async function resolveBankAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
  bankAccountId: string | null,
): Promise<string | null> {
  // 1. Explicit bank_account_id → check metadata for a gl_account_id hint
  //    (bank_account_link has no gl_account_id column; optional metadata convention)
  if (bankAccountId) {
    const house = await sql<{ account_id: string }>`
      SELECT hc.gl_account_id AS account_id
      FROM   master.bank_account_link bal
      JOIN   master.bank_account ba
             ON ba.tenant_id = bal.tenant_id
            AND ba.id        = bal.bank_account_id
      JOIN   master.bank_account_house_config hc
             ON hc.tenant_id            = bal.tenant_id
            AND hc.bank_account_link_id = bal.id
      WHERE  bal.tenant_id       = ${tenantId}
        AND  bal.owner_type      = 'company_code'
        AND  bal.owner_id        = ${companyId}
        AND  bal.bank_account_id = ${bankAccountId}
        AND  ba.status           = 'active'
        AND  hc.status           = 'active'
        AND  hc.is_disbursement_enabled = true
        AND  (bal.effective_until IS NULL OR bal.effective_until >= CURRENT_DATE)
      ORDER  BY hc.is_default_disbursement DESC, bal.is_primary DESC, hc.priority ASC
      LIMIT  1
    `.execute(db);
    const houseGlId = house.rows[0]?.account_id;
    if (houseGlId) return houseGlId;

    const ba = await sql<{ gl_meta: string | null }>`
      SELECT metadata->>'gl_account_id' AS gl_meta
      FROM   master.bank_account
      WHERE  id = ${bankAccountId} AND tenant_id = ${tenantId} AND status = 'active'
      LIMIT  1
    `.execute(db);
    const glId = ba.rows[0]?.gl_meta;
    if (glId) return glId;
  }

  // 2. Find cash/bank GL account from the company's assigned chart.
  //    COA uses account_class='asset', node_type='posting' — no subledger_type='bank'.
  //    Prefer accounts with 'bank' in name, then 'operating cash', exclude petty/transit/restricted.
  const result = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id     = ${tenantId}
      AND  ga.account_class = 'asset'
      AND  ga.is_active     = true
      AND  ga.node_type     = 'posting'
      AND  (ga.name ILIKE '%bank%' OR ga.name ILIKE '%operating cash%' OR ga.name ILIKE '%cash%')
      AND  ga.name NOT ILIKE '%charge%'
      AND  ga.name NOT ILIKE '%petty%'
      AND  ga.name NOT ILIKE '%transit%'
      AND  ga.name NOT ILIKE '%restrict%'
      AND  ga.name NOT ILIKE '%escrow%'
    ORDER BY
      (ga.name ILIKE '%bank%')           DESC,
      (ga.name ILIKE '%operating%')      DESC,
      ga.sort_order NULLS LAST,
      ga.code
    LIMIT  1
  `.execute(db);
  return result.rows[0]?.account_id ?? null;
}

async function resolveDiscountAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  const result = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id     = ${tenantId}
      AND  ga.account_class = 'income'
      AND  ga.is_active     = true
      AND  ga.node_type     = 'posting'
      AND  ga.code          ILIKE '%discount%'
    ORDER  BY ga.code
    LIMIT  1
  `.execute(db);
  return result.rows[0]?.account_id ?? null;
}

// ── H6 v1.2: Additional resolvers for payment-time deductions ────────────────

async function resolveWhtPayableAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  // WHT payable: liability account whose code references withholding/WHT/TDS
  const result = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id     = ${tenantId}
      AND  ga.account_class = 'liability'
      AND  ga.is_active     = true
      AND  ga.node_type     = 'posting'
      AND  (ga.code ILIKE '%withhold%' OR ga.code ILIKE '%wht%' OR ga.code ILIKE '%tds%'
            OR ga.name ILIKE '%withhold%' OR ga.name ILIKE '%TDS%')
    ORDER  BY ga.code
    LIMIT  1
  `.execute(db);
  return result.rows[0]?.account_id ?? null;
}

async function resolveAdvancePrepaidAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  // Advance to supplier sits as an asset (prepayment); recovery CR reduces that asset.
  const result = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id     = ${tenantId}
      AND  ga.account_class = 'asset'
      AND  ga.is_active     = true
      AND  ga.node_type     = 'posting'
      AND  (ga.code ILIKE '%advance%' OR ga.code ILIKE '%prepaid%'
            OR ga.name ILIKE '%advance to supplier%' OR ga.name ILIKE '%vendor advance%' OR ga.name ILIKE '%prepayment%')
    ORDER  BY ga.code
    LIMIT  1
  `.execute(db);
  return result.rows[0]?.account_id ?? null;
}

async function resolveRetentionPayableAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  // Retention payable: liability account holding back amounts pending warranty/completion.
  const result = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id     = ${tenantId}
      AND  ga.account_class = 'liability'
      AND  ga.is_active     = true
      AND  ga.node_type     = 'posting'
      AND  (ga.code ILIKE '%retention%' OR ga.name ILIKE '%retention%')
    ORDER  BY ga.code
    LIMIT  1
  `.execute(db);
  return result.rows[0]?.account_id ?? null;
}

// ── JE number generation ──────────────────────────────────────────────────────

async function nextJeCode(db: AnyDb, tenantId: string, companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const num = await sql<{ n: string }>`
      SELECT control.next_entity_number(
        ${tenantId}::uuid,
        'journal_entry',
        'document_no',
        ${companyId}::uuid,
        NULL,
        NULL,
        NULL,
        CURRENT_DATE
      ) AS n
    `.execute(db);
    return String(num.rows[0]?.n ?? `JE-PMT-${year}-${Date.now()}`);
  } catch {
    return `JE-PMT-${year}-${Date.now()}`;
  }
}

// ── Post payment ──────────────────────────────────────────────────────────────

export async function handlePostPayment(
  db:          AnyDb,
  tenantId:    string,
  paymentId:   string,
  principalId: string | null,
  logger?:     { info(e: string, f?: Record<string, unknown>): void; warn(e: string, f?: Record<string, unknown>): void },
  lifecycleSync?: BusinessLifecycleSyncHook,
  dispatchCtx?: PaymentPostingDispatchCtx,
): Promise<HandlerResult> {

  return db.transaction().execute(async (trx) => {

    // Load + lock payment
    const pmtResult = await sql<Record<string, unknown>>`
      SELECT * FROM document.payment_entry
      WHERE id = ${paymentId} AND tenant_id = ${tenantId}
      LIMIT 1 FOR UPDATE
    `.execute(trx);

    const payment = pmtResult.rows[0];
    if (!payment) return { status: 404, body: { error: "PAYMENT_NOT_FOUND" } };

    // Accept both 'approved' (route-handler path) and 'posted' (transition-
    // hook path where the action-dispatcher has already updated status
    // before AFTER hooks fire). is_posted is the authoritative gate.
    const currentStatus = String(payment["status"] ?? "").toLowerCase();
    const isAlreadyPosted = Boolean(payment["is_posted"]);
    if (currentStatus !== "approved" && currentStatus !== "posted") {
      return {
        status: 422,
        body: {
          error: "INVALID_STATUS",
          message: `Payment is in '${currentStatus}' — must be 'approved' or 'posted' to run posting`,
        },
      };
    }
    if (isAlreadyPosted) {
      return {
        status: 422,
        body: { error: "ALREADY_POSTED", message: "Payment is already posted." },
      };
    }

    if (payment["is_posted"]) {
      return { status: 422, body: { error: "ALREADY_POSTED", message: "Payment is already posted" } };
    }

    const companyId        = String(payment["company_code_id"] ?? "");
    const currencyCode     = String(payment["currency_code"] ?? "");
    const baseCurrencyCode = String(payment["base_currency_code"] ?? currencyCode);
    const exchangeRate     = Number(payment["exchange_rate"] ?? 1) || 1;
    const paymentAmount    = Number(payment["payment_amount"] ?? 0);
    const baseAmount       = Number(payment["base_amount"] ?? paymentAmount * exchangeRate);
    const bankAccountId    = payment["bank_account_id"] as string | null;
    const supplierName     = String(payment["supplier_name"] ?? "");
    const paymentNumber    = String(payment["payment_number"] ?? paymentId);
    const rawPostingDate   = payment["posting_date"];
    const postingDate      = rawPostingDate instanceof Date
      ? rawPostingDate.toISOString().slice(0, 10)
      : typeof rawPostingDate === "string"
      ? rawPostingDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const fiscalYear       = Number(payment["fiscal_year"] ?? new Date().getFullYear());
    const periodNumber     = Number(payment["period_number"] ?? (new Date().getMonth() + 1));
    const now              = new Date();

    // Load allocations (H6 v1.2 — include all reduction columns)
    const allocResult = await sql<{
      id: string;
      purchase_invoice_id: string | null;
      allocated_amount: string;
      discount_amount: string;
      withholding_tax_amount: string;
      advance_recovery_amount: string;
      retention_amount: string;
      net_payment_amount: string;
    }>`
      SELECT id, purchase_invoice_id, allocated_amount, discount_amount,
             withholding_tax_amount, advance_recovery_amount, retention_amount,
             net_payment_amount
      FROM document.payment_entry_allocation
      WHERE payment_entry_id = ${paymentId} AND tenant_id = ${tenantId}
      ORDER BY line_no
    `.execute(trx);

    const allocations = allocResult.rows;
    const totalDiscount       = allocations.reduce((s, a) => s + Number(a.discount_amount), 0);
    const totalWithholding    = allocations.reduce((s, a) => s + Number(a.withholding_tax_amount), 0);
    const totalAdvanceRecover = allocations.reduce((s, a) => s + Number(a.advance_recovery_amount), 0);
    const totalRetention      = allocations.reduce((s, a) => s + Number(a.retention_amount), 0);
    const totalAllocated      = allocations.reduce((s, a) => s + Number(a.allocated_amount), 0) || paymentAmount;
    // Cash out = allocated - all deductions = SUM(net_payment_amount)
    const totalNetCashOut     = totalAllocated - totalDiscount - totalWithholding - totalAdvanceRecover - totalRetention;

    // Resolve GL accounts
    const apControlId       = await resolveApControlAccount(trx, tenantId, companyId);
    const bankGlId          = await resolveBankAccount(trx, tenantId, companyId, bankAccountId);
    const discountId        = totalDiscount       > 0 ? await resolveDiscountAccount(trx, tenantId, companyId)        : null;
    const whtPayableId      = totalWithholding    > 0 ? await resolveWhtPayableAccount(trx, tenantId, companyId)      : null;
    const advancePrepaidId  = totalAdvanceRecover > 0 ? await resolveAdvancePrepaidAccount(trx, tenantId, companyId)  : null;
    const retentionPayableId = totalRetention     > 0 ? await resolveRetentionPayableAccount(trx, tenantId, companyId) : null;

    // HF-5: hard 422 when a non-zero reduction has no GL account configured.
    // Earlier behavior was logger.warn + continue, which left the JE unbalanced
    // and surfaced as a generic insertion error downstream. Now: fail early with
    // a clear actionable message naming each missing account.
    const accountErrors: Array<{ field: string; message: string }> = [];
    if (totalWithholding > 0 && !whtPayableId) {
      accountErrors.push({
        field:   "wht_payable_account",
        message: `Total withholding of ${totalWithholding.toFixed(2)} requires a withholding tax payable GL account (account_class='liability', code/name matching 'withhold', 'WHT', or 'TDS') configured for this company.`,
      });
    }
    if (totalAdvanceRecover > 0 && !advancePrepaidId) {
      accountErrors.push({
        field:   "advance_prepaid_account",
        message: `Total advance recovery of ${totalAdvanceRecover.toFixed(2)} requires a vendor advance / prepaid asset GL account (account_class='asset', code/name matching 'advance' or 'prepaid') configured for this company.`,
      });
    }
    if (totalRetention > 0 && !retentionPayableId) {
      accountErrors.push({
        field:   "retention_payable_account",
        message: `Total retention of ${totalRetention.toFixed(2)} requires a retention payable GL account (account_class='liability', code/name matching 'retention') configured for this company.`,
      });
    }
    if (accountErrors.length > 0) {
      logger?.warn("payment_post_missing_reduction_accounts", { tenantId, paymentId, accountErrors });
      return {
        status: 422,
        body: {
          error:   "MISSING_GL_ACCOUNT_FOR_REDUCTIONS",
          message: "Payment cannot be posted: required GL accounts for one or more allocation reductions are not configured. Fix the chart of accounts, then retry.",
          errors:  accountErrors,
        },
      };
    }

    if (!apControlId) {
      return { status: 422, body: { error: "NO_AP_CONTROL_ACCOUNT", message: "Cannot find AP control GL account for this company" } };
    }
    if (!bankGlId) {
      return { status: 422, body: { error: "NO_BANK_ACCOUNT", message: "Cannot find bank GL account for this company" } };
    }

    // Resolve ledger book
    const bookResult = await sql<{ book_id: string }>`
      SELECT ba.book_id
      FROM   master.company_code_book_assignment ba
      JOIN   master.ledger_book lb ON lb.id = ba.book_id
      WHERE  ba.tenant_id       = ${tenantId}
        AND  ba.company_code_id = ${companyId}
        AND  ba.status          = 'active'
        AND  lb.category        = 'statutory'
      ORDER  BY ba.priority ASC
      LIMIT  1
    `.execute(trx);
    const bookId = bookResult.rows[0]?.book_id ?? null;

    // Resolve fiscal period id
    const fpResult = await sql<{ id: string }>`
      SELECT id FROM master.fiscal_period
      WHERE  tenant_id       = ${tenantId}
        AND  company_code_id = ${companyId}
        AND  fiscal_year     = ${fiscalYear}
        AND  period_number   = ${periodNumber}
      LIMIT  1
    `.execute(trx);
    const fiscalPeriodId = fpResult.rows[0]?.id ?? null;

    // ── Create JE header (draft — lines inserted next, then transitioned) ────────
    const jeCode = await nextJeCode(trx, tenantId, companyId);
    const V_SU = "00000000-0000-0000-0000-000000000000";

    const jeResult = await sql<{ id: string }>`
      INSERT INTO document.journal_entry (
        tenant_id, company_code_id, book_id,
        je_number, description,
        document_date, posting_date, fiscal_period_id, fiscal_year, period_number,
        transaction_currency, base_currency,
        total_debit, total_credit,
        source_doc_type, source_doc_id,
        status, created_by
      ) VALUES (
        ${tenantId}, ${companyId}, ${bookId},
        ${jeCode},
        ${"Payment Settlement — " + paymentNumber + " — " + supplierName},
        ${postingDate}, ${postingDate}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber},
        ${currencyCode}, ${baseCurrencyCode},
        0, 0,
        'payment_entry', ${paymentId},
        'draft', ${principalId ?? V_SU}
      )
      RETURNING id
    `.execute(trx);

    const jeId = jeResult.rows[0]?.id;
    if (!jeId) return { status: 500, body: { error: "JE_CREATE_FAILED" } };

    // ── Create JE lines ────────────────────────────────────────────────────────
    // Line 1: DR AP Control (clears payable)
    // HF2-6: pre-generate the JL id so we can emit journal_line_reference rows
    // linking this AP-clearing JL back to each individual PEA after the insert.
    const apControlJlId = crypto.randomUUID();
    await sql`
      INSERT INTO document.journal_line (
        id, tenant_id, journal_entry_id,
        company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
        line_no, gl_account_id, description,
        transaction_currency, transaction_debit, transaction_credit,
        base_currency, base_debit, base_credit, exchange_rate,
        subledger_type, party_type, party_id,
        created_by
      ) VALUES (
        ${apControlJlId}, ${tenantId}, ${jeId},
        ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
        1, ${apControlId},
        ${"AP Settlement — " + supplierName},
        ${currencyCode}, ${totalAllocated.toFixed(4)}, 0,
        ${baseCurrencyCode}, ${(totalAllocated * exchangeRate).toFixed(4)}, 0, ${exchangeRate},
        'ap', 'supplier', ${payment["supplier_id"] ?? null},
        ${principalId ?? V_SU}
      )
    `.execute(trx);

    // HF2-6: emit one journal_line_reference per allocation, linking the AP
    // Control JL back to each PEA. JLR column shape (verified against schema):
    //   ref_type        - free text discriminator, here 'payment_allocation'
    //   ref_doc_type    - logical parent type, here 'payment_entry'
    //   ref_doc_id      - parent payment_entry id
    //   ref_doc_line_id - the specific allocation id
    //   allocated_amount, currency_code, base_amount - allocation amounts
    //   is_full_settlement - true when net_payment_amount == allocated_amount
    //                        AND the invoice is now fully paid (best-effort here:
    //                        we only know per-allocation; PI rollup decides).
    // Unique index on (tenant, jl, ref_doc_type, ref_doc_id, ref_doc_line_id) so
    // re-posting the same PE is a no-op via ON CONFLICT DO NOTHING.
    for (const a of allocations) {
      const allocAmt = Number(a.allocated_amount);
      if (allocAmt <= 0) continue;   // jlr_amount_pos_chk requires > 0
      await sql`
        INSERT INTO document.journal_line_reference (
          tenant_id, journal_line_id,
          ref_type, ref_doc_type, ref_doc_id, ref_doc_line_id,
          allocated_amount, currency_code, base_amount,
          description, created_by
        ) VALUES (
          ${tenantId}, ${apControlJlId},
          'payment_allocation', 'payment_entry', ${paymentId}, ${a.id},
          ${allocAmt.toFixed(4)}, ${currencyCode}, ${(allocAmt * exchangeRate).toFixed(4)},
          ${"AP Settlement allocation — " + paymentNumber},
          ${principalId ?? V_SU}
        )
        ON CONFLICT (tenant_id, journal_line_id, ref_doc_type, ref_doc_id,
                     COALESCE(ref_doc_line_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO NOTHING
      `.execute(trx);
    }

    // Line 2: CR Bank (actual cash out = SUM(net_payment_amount))
    let nextLineNo = 2;
    if (totalNetCashOut > 0) {
      await sql`
        INSERT INTO document.journal_line (
          id, tenant_id, journal_entry_id,
          company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
          line_no, gl_account_id, description,
          transaction_currency, transaction_debit, transaction_credit,
          base_currency, base_debit, base_credit, exchange_rate,
          created_by
        ) VALUES (
          ${crypto.randomUUID()}, ${tenantId}, ${jeId},
          ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
          ${nextLineNo}, ${bankGlId},
          ${"Bank Payment — " + paymentNumber},
          ${currencyCode}, 0, ${totalNetCashOut.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(totalNetCashOut * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
      nextLineNo++;
    }

    // Line N: CR Discount Income (optional)
    if (totalDiscount > 0 && discountId) {
      await sql`
        INSERT INTO document.journal_line (
          id, tenant_id, journal_entry_id,
          company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
          line_no, gl_account_id, description,
          transaction_currency, transaction_debit, transaction_credit,
          base_currency, base_debit, base_credit, exchange_rate,
          created_by
        ) VALUES (
          ${crypto.randomUUID()}, ${tenantId}, ${jeId},
          ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
          ${nextLineNo}, ${discountId},
          ${"Early Payment Discount — " + paymentNumber},
          ${currencyCode}, 0, ${totalDiscount.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(totalDiscount * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
      nextLineNo++;
    }

    // Line N: CR Withholding Tax Payable (H6 v1.2)
    if (totalWithholding > 0 && whtPayableId) {
      await sql`
        INSERT INTO document.journal_line (
          id, tenant_id, journal_entry_id,
          company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
          line_no, gl_account_id, description,
          transaction_currency, transaction_debit, transaction_credit,
          base_currency, base_debit, base_credit, exchange_rate,
          created_by
        ) VALUES (
          ${crypto.randomUUID()}, ${tenantId}, ${jeId},
          ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
          ${nextLineNo}, ${whtPayableId},
          ${"Withholding Tax — " + paymentNumber},
          ${currencyCode}, 0, ${totalWithholding.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(totalWithholding * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
      nextLineNo++;
    }

    // Line N: CR Advance Prepaid (asset reduction) — recovery applied (H6 v1.2)
    if (totalAdvanceRecover > 0 && advancePrepaidId) {
      await sql`
        INSERT INTO document.journal_line (
          id, tenant_id, journal_entry_id,
          company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
          line_no, gl_account_id, description,
          transaction_currency, transaction_debit, transaction_credit,
          base_currency, base_debit, base_credit, exchange_rate,
          created_by
        ) VALUES (
          ${crypto.randomUUID()}, ${tenantId}, ${jeId},
          ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
          ${nextLineNo}, ${advancePrepaidId},
          ${"Advance Recovery — " + paymentNumber},
          ${currencyCode}, 0, ${totalAdvanceRecover.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(totalAdvanceRecover * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
      nextLineNo++;
    }

    // Line N: CR Retention Payable (H6 v1.2)
    if (totalRetention > 0 && retentionPayableId) {
      await sql`
        INSERT INTO document.journal_line (
          id, tenant_id, journal_entry_id,
          company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
          line_no, gl_account_id, description,
          transaction_currency, transaction_debit, transaction_credit,
          base_currency, base_debit, base_credit, exchange_rate,
          created_by
        ) VALUES (
          ${crypto.randomUUID()}, ${tenantId}, ${jeId},
          ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
          ${nextLineNo}, ${retentionPayableId},
          ${"Retention Withheld — " + paymentNumber},
          ${currencyCode}, 0, ${totalRetention.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(totalRetention * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
      nextLineNo++;
    }

    // ── Transition JE: draft → created (validates balance, caches totals) ────────
    await sql`
      UPDATE document.journal_entry
         SET status = 'created'
       WHERE id = ${jeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // ── Transition JE: created → posted ──────────────────────────────────────
    await sql`
      UPDATE document.journal_entry
         SET status    = 'posted',
             posted_at = ${now.toISOString()},
             posted_by = ${principalId ?? V_SU}
       WHERE id = ${jeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // ── Materialise gl_balance via single-source helper (Phase 5.4 R6) ───
    await postJournalGl(trx, {
      tenantId,
      jeId,
      executionToken:     dispatchCtx?.executionToken     ?? synthPaymentExecutionToken(jeId),
      transitionId:       dispatchCtx?.transitionId       ?? PAYMENT_POSTING_SENTINEL_TRANSITION_ID,
      transitionEventSeq: dispatchCtx?.transitionEventSeq,
      sourceDocType:      "payment_entry",
      sourceDocId:        paymentId,
      principalId:        principalId ?? null,
    });

    // ── Update payment_entry ───────────────────────────────────────────────────
    const updatedPayment = await sql<Record<string, unknown>>`
      UPDATE document.payment_entry
      SET
        status         = 'posted',
        is_posted      = true,
        posted_at      = ${now.toISOString()},
        posted_by      = ${principalId},
        payment_je_id  = ${jeId},
        updated_at     = ${now.toISOString()},
        updated_by     = ${principalId}
      WHERE id        = ${paymentId}
        AND tenant_id = ${tenantId}
        AND is_posted = false
        AND status IN ('approved', 'posted')
      RETURNING *
    `.execute(trx);

    const updatedPaymentRow = updatedPayment.rows[0];
    if (!updatedPaymentRow) {
      return { status: 409, body: { error: "CONFLICT", message: "Payment was modified concurrently. Please retry." } };
    }

    await syncBusinessLifecycle(lifecycleSync, {
      db: trx,
      tenantId,
      entityName: "payment_entry",
      entityId: paymentId,
      status: "posted",
      actorId: principalId,
      payload: updatedPaymentRow,
    });

    // ── Update invoice paid_amount / status from posted non-voided allocations ──
    // Only posted+non-voided payments count toward invoice settlement.
    // outstanding_amount is GENERATED ALWAYS AS STORED — not written here.
    const affectedInvoiceIds = [...new Set(
      allocations
        .map((a) => a.purchase_invoice_id)
        .filter((id): id is string => id != null),
    )];

    for (const invId of affectedInvoiceIds) {
      const updatedInvoice = await sql<Record<string, unknown>>`
        WITH posted_sum AS (
          SELECT COALESCE(SUM(pea.allocated_amount), 0) AS total_paid
            FROM document.payment_entry_allocation pea
            JOIN document.payment_entry             pe  ON pe.id = pea.payment_entry_id
                                                        AND pe.tenant_id = pea.tenant_id
           WHERE pea.purchase_invoice_id = ${invId}
             AND pea.tenant_id           = ${tenantId}
             AND pe.status               = 'posted'
             AND pe.is_voided            = false
        )
        UPDATE document.purchase_invoice pi
           SET paid_amount = ps.total_paid,
               status      = CASE
                 WHEN ps.total_paid >= COALESCE(pi.payable_amount, pi.total_amount) THEN 'fully_paid'
                 WHEN ps.total_paid > 0                                             THEN 'partially_paid'
                 ELSE pi.status
               END,
               updated_at  = now()
          FROM posted_sum ps
         WHERE pi.id        = ${invId}
           AND pi.tenant_id = ${tenantId}
         RETURNING pi.*
      `.execute(trx);

      const updatedInvoiceRow = updatedInvoice.rows[0];
      if (updatedInvoiceRow && typeof updatedInvoiceRow["status"] === "string") {
        await syncBusinessLifecycle(lifecycleSync, {
          db: trx,
          tenantId,
          entityName: "purchase_invoice",
          entityId: invId,
          status: updatedInvoiceRow["status"],
          actorId: principalId,
          payload: updatedInvoiceRow,
        });
      }
    }

    logger?.info("payment_posted", { paymentId, jeId, companyId });

    return {
      status: 200,
      body: {
        paymentId,
        jeId,
        jeNumber: jeCode,
        status: "posted",
      },
    };
  });
}

// ── Submit payment (draft → pending_approval | approved) ──────────────────────

export async function handleSubmitPayment(
  db:          AnyDb,
  tenantId:    string,
  paymentId:   string,
  principalId: string | null,
  _logger?:    { info(e: string, f?: Record<string, unknown>): void },
  lifecycleSync?: BusinessLifecycleSyncHook,
): Promise<HandlerResult> {

  const result = await sql<{ id: string; status: string; workflow_request_id: string | null }>`
    SELECT id, status, workflow_request_id
    FROM document.payment_entry
    WHERE id = ${paymentId} AND tenant_id = ${tenantId}
    LIMIT 1
  `.execute(db);

  const payment = result.rows[0];
  if (!payment) return { status: 404, body: { error: "PAYMENT_NOT_FOUND" } };
  if (payment.status !== "draft") {
    return { status: 422, body: { error: "INVALID_STATUS", message: `Cannot submit — payment is '${payment.status}'` } };
  }

  // Check if a workflow definition is configured for payment_entry.
  // workflow_template has no entity_id — routing goes via control.workflow_definition.
  // If no active definition exists, advance directly to 'approved' (no-workflow tenant).
  const V_NIL = "00000000-0000-0000-0000-000000000000";
  const wfResult = await sql<{ id: string }>`
    SELECT id
    FROM   control.workflow_definition
    WHERE  entity_type = 'payment_entry'
      AND  is_active   = true
      AND  (tenant_id = ${tenantId}::uuid OR tenant_id = ${V_NIL}::uuid)
    LIMIT  1
  `.execute(db);

  const newStatus = wfResult.rows[0] ? "pending_approval" : "approved";

  const updatedPaymentRow = await db.transaction().execute(async (trx) => {
    const updatedPayment = await sql<Record<string, unknown>>`
      UPDATE document.payment_entry
      SET status = ${newStatus}, updated_at = now(), updated_by = ${principalId}
      WHERE id = ${paymentId} AND tenant_id = ${tenantId} AND status = 'draft'
      RETURNING *
    `.execute(trx);

    const row = updatedPayment.rows[0];
    if (!row) return null;

    await syncBusinessLifecycle(lifecycleSync, {
      db: trx,
      tenantId,
      entityName: "payment_entry",
      entityId: paymentId,
      status: newStatus,
      actorId: principalId,
      payload: row,
    });
    return row;
  });

  if (!updatedPaymentRow) {
    return { status: 409, body: { error: "CONFLICT", message: "Payment was modified concurrently. Please retry." } };
  }

  return { status: 200, body: { paymentId, status: newStatus } };
}

// ── Void payment ──────────────────────────────────────────────────────────────

export async function handleVoidPayment(
  db:          AnyDb,
  tenantId:    string,
  paymentId:   string,
  principalId: string | null,
  body:        Record<string, unknown>,
  logger?:     { info(e: string, f?: Record<string, unknown>): void; warn(e: string, f?: Record<string, unknown>): void },
  lifecycleSync?: BusinessLifecycleSyncHook,
  dispatchCtx?: PaymentPostingDispatchCtx,
): Promise<HandlerResult> {

  const voidReason = typeof body["reason"] === "string" ? body["reason"] : "Voided";

  return db.transaction().execute(async (trx) => {
    const pmtResult = await sql<Record<string, unknown>>`
      SELECT * FROM document.payment_entry
      WHERE id = ${paymentId} AND tenant_id = ${tenantId}
      LIMIT 1 FOR UPDATE
    `.execute(trx);

    const payment = pmtResult.rows[0];
    if (!payment) return { status: 404, body: { error: "PAYMENT_NOT_FOUND" } };

    const status = String(payment["status"] ?? "");
    if (!["draft", "approved", "posted"].includes(status)) {
      return { status: 422, body: { error: "INVALID_STATUS", message: `Cannot void a payment in '${status}' status` } };
    }

    const now = new Date();

    // If posted, reverse the GL journal entry
    if (status === "posted" && payment["payment_je_id"]) {
      const jeId     = String(payment["payment_je_id"]);
      const companyId = String(payment["company_code_id"] ?? "");
      const currencyCode = String(payment["currency_code"] ?? "");
      const exchangeRate = Number(payment["exchange_rate"] ?? 1) || 1;
      const paymentNumber = String(payment["payment_number"] ?? paymentId);
      const rawVoidDate   = payment["posting_date"];
      const postingDate   = rawVoidDate instanceof Date
        ? rawVoidDate.toISOString().slice(0, 10)
        : typeof rawVoidDate === "string"
        ? rawVoidDate.slice(0, 10)
        : now.toISOString().slice(0, 10);
      const fiscalYear    = Number(payment["fiscal_year"] ?? now.getFullYear());
      const periodNumber  = Number(payment["period_number"] ?? (now.getMonth() + 1));

      // Load original JE lines and reverse them
      const jeLines = await sql<{
        gl_account_id: string; line_no: number;
        transaction_debit: string; transaction_credit: string;
        base_debit: string; base_credit: string;
        description: string | null;
        subledger_type: string | null; party_type: string | null; party_id: string | null;
      }>`
        SELECT gl_account_id, line_no, transaction_debit, transaction_credit,
               base_debit, base_credit, description, subledger_type, party_type, party_id
        FROM document.journal_line WHERE journal_entry_id = ${jeId} AND tenant_id = ${tenantId}
        ORDER BY line_no
      `.execute(trx);

      if (jeLines.rows.length > 0) {
        const revJeCode = await nextJeCode(trx, tenantId, companyId);

        const fpResult = await sql<{ id: string }>`
          SELECT id FROM master.fiscal_period
          WHERE tenant_id = ${tenantId} AND company_code_id = ${companyId}
            AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
          LIMIT 1
        `.execute(trx);

        const revV_SU = "00000000-0000-0000-0000-000000000000";
        const baseCurrencyCodeVoid = String(payment["base_currency_code"] ?? currencyCode);
        const bookResultVoid = await sql<{ book_id: string }>`
          SELECT ba.book_id
          FROM   master.company_code_book_assignment ba
          JOIN   master.ledger_book lb ON lb.id = ba.book_id
          WHERE  ba.tenant_id       = ${tenantId}
            AND  ba.company_code_id = ${companyId}
            AND  ba.status          = 'active'
            AND  lb.category        = 'statutory'
          ORDER  BY ba.priority ASC
          LIMIT  1
        `.execute(trx);
        const bookIdVoid = bookResultVoid.rows[0]?.book_id ?? null;

        const revJeInsert = await sql<{ id: string }>`
          INSERT INTO document.journal_entry (
            tenant_id, company_code_id, book_id,
            je_number, description,
            document_date, posting_date, fiscal_period_id, fiscal_year, period_number,
            transaction_currency, base_currency,
            total_debit, total_credit,
            source_doc_type, source_doc_id,
            is_reversal, reversal_of_id,
            status, created_by
          ) VALUES (
            ${tenantId}, ${companyId}, ${bookIdVoid},
            ${revJeCode}, ${"Void — " + paymentNumber + " — " + voidReason},
            ${postingDate}, ${postingDate},
            ${fpResult.rows[0]?.id ?? null}, ${fiscalYear}, ${periodNumber},
            ${currencyCode}, ${baseCurrencyCodeVoid},
            0, 0,
            'payment_entry', ${paymentId},
            true, ${jeId},
            'draft', ${principalId ?? revV_SU}
          )
          RETURNING id
        `.execute(trx);
        const revJeDbId = revJeInsert.rows[0]?.id;
        if (!revJeDbId) {
          logger?.warn("payment_void_reversal_je_create_failed", { paymentId });
        } else {
          // Load original JE lines to copy base_currency + denormalized fields
          const jeHeader = await sql<{ base_currency: string; book_id: string | null; fiscal_period_id: string | null }>`
            SELECT base_currency, book_id, fiscal_period_id
            FROM document.journal_entry WHERE id = ${jeId} AND tenant_id = ${tenantId}
          `.execute(trx);
          const origBase     = jeHeader.rows[0]?.base_currency ?? baseCurrencyCodeVoid;
          const origBookId   = jeHeader.rows[0]?.book_id       ?? bookIdVoid;
          const origFpId     = jeHeader.rows[0]?.fiscal_period_id ?? (fpResult.rows[0]?.id ?? null);

          for (const [i, jl] of jeLines.rows.entries()) {
            await sql`
              INSERT INTO document.journal_line (
                id, tenant_id, journal_entry_id,
                company_code_id, book_id, fiscal_period_id, fiscal_year, period_number, posting_date,
                line_no, gl_account_id, description,
                transaction_currency, transaction_debit, transaction_credit,
                base_currency, base_debit, base_credit, exchange_rate,
                subledger_type, party_type, party_id,
                created_by
              ) VALUES (
                ${crypto.randomUUID()}, ${tenantId}, ${revJeDbId},
                ${companyId}, ${origBookId}, ${origFpId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
                ${i + 1}, ${jl.gl_account_id},
                ${"Reversal — " + (jl.description ?? "")},
                ${currencyCode}, ${jl.transaction_credit}, ${jl.transaction_debit},
                ${origBase}, ${jl.base_credit}, ${jl.base_debit}, ${exchangeRate},
                ${jl.subledger_type}, ${jl.party_type}, ${jl.party_id},
                ${principalId ?? revV_SU}
              )
            `.execute(trx);
          }

          // Transition reversal JE: draft → created → posted
          await sql`UPDATE document.journal_entry SET status = 'created' WHERE id = ${revJeDbId} AND tenant_id = ${tenantId}`.execute(trx);
          await sql`UPDATE document.journal_entry SET status = 'posted', posted_at = ${now.toISOString()}, posted_by = ${principalId ?? revV_SU} WHERE id = ${revJeDbId} AND tenant_id = ${tenantId}`.execute(trx);

          // Materialise gl_balance for the void reversal JE (review finding
          // P1 fix). Void / reversal flows must hit gl_balance so trial
          // balance and P&L reflect the compensating entries.
          await postJournalGl(trx, {
            tenantId,
            jeId:               revJeDbId,
            executionToken:     dispatchCtx?.executionToken     ?? synthPaymentExecutionToken(revJeDbId),
            transitionId:       dispatchCtx?.transitionId       ?? PAYMENT_POSTING_SENTINEL_TRANSITION_ID,
            transitionEventSeq: dispatchCtx?.transitionEventSeq,
            sourceDocType:      "payment_entry",
            sourceDocId:        paymentId,
            principalId:        principalId ?? null,
          });

          // Mark original JE as reversed
          await sql`UPDATE document.journal_entry SET status = 'reversed', reversed_by_id = ${revJeDbId} WHERE id = ${jeId} AND tenant_id = ${tenantId}`.execute(trx);

          logger?.info("payment_void_reversal_je_created", { paymentId, revJeId: revJeDbId });
        }
      }
    }

    // Restore invoice outstanding amounts by removing allocations
    const allocResult = await sql<{ purchase_invoice_id: string | null }>`
      SELECT DISTINCT purchase_invoice_id FROM document.payment_entry_allocation
      WHERE payment_entry_id = ${paymentId} AND tenant_id = ${tenantId}
        AND purchase_invoice_id IS NOT NULL
    `.execute(trx);

    // Update payment to voided
    const updatedPayment = await sql<Record<string, unknown>>`
      UPDATE document.payment_entry
      SET status       = 'voided',
          is_voided    = true,
          voided_at    = ${now.toISOString()},
          voided_by    = ${principalId},
          void_reason  = ${voidReason},
          updated_at   = ${now.toISOString()},
          updated_by   = ${principalId}
      WHERE id = ${paymentId} AND tenant_id = ${tenantId}
      RETURNING *
    `.execute(trx);

    const updatedPaymentRow = updatedPayment.rows[0];
    if (!updatedPaymentRow) {
      return { status: 409, body: { error: "CONFLICT", message: "Payment was modified concurrently. Please retry." } };
    }

    await syncBusinessLifecycle(lifecycleSync, {
      db: trx,
      tenantId,
      entityName: "payment_entry",
      entityId: paymentId,
      status: "voided",
      actorId: principalId,
      payload: updatedPaymentRow,
    });

    // Recalculate outstanding_amount for each affected invoice
    for (const alloc of allocResult.rows) {
      if (!alloc.purchase_invoice_id) continue;
      const invId = alloc.purchase_invoice_id;
      const updatedInvoice = await sql<Record<string, unknown>>`
        WITH alloc_sum AS (
          SELECT COALESCE(SUM(pea.allocated_amount), 0) AS total_paid
          FROM document.payment_entry_allocation pea
          JOIN document.payment_entry pe ON pe.id = pea.payment_entry_id
          WHERE pea.purchase_invoice_id = ${invId}
            AND pea.tenant_id           = ${tenantId}
            AND pe.status               = 'posted'
            AND pe.is_voided            = false
        )
        -- outstanding_amount is GENERATED ALWAYS AS STORED — not written here;
        -- it recalculates automatically when paid_amount changes.
        UPDATE document.purchase_invoice pi
        SET paid_amount = a.total_paid,
            status      = CASE
              WHEN a.total_paid <= 0 THEN
                CASE WHEN pi.status = 'fully_paid' OR pi.status = 'partially_paid'
                     THEN 'posted' ELSE pi.status END
              WHEN a.total_paid >= COALESCE(pi.payable_amount, pi.total_amount) THEN 'fully_paid'
              ELSE 'partially_paid'
            END
        FROM alloc_sum a
        WHERE pi.id = ${invId} AND pi.tenant_id = ${tenantId}
        RETURNING pi.*
      `.execute(trx);

      const updatedInvoiceRow = updatedInvoice.rows[0];
      if (updatedInvoiceRow && typeof updatedInvoiceRow["status"] === "string") {
        await syncBusinessLifecycle(lifecycleSync, {
          db: trx,
          tenantId,
          entityName: "purchase_invoice",
          entityId: invId,
          status: updatedInvoiceRow["status"],
          actorId: principalId,
          payload: updatedInvoiceRow,
        });
      }
    }

    return { status: 200, body: { paymentId, status: "voided" } };
  });
}
