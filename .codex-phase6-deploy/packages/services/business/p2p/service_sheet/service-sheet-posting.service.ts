/**
 * Service Sheet Posting Service (Phase 5.2)
 *
 * Posts an approved service_sheet:
 *   1. Inserts journal_entry + journal_lines
 *        Dr Expense per service_sheet_line (resolved via
 *           commodity_category_buy_policy or chart fallback)
 *        Cr SES Clearing       (total — single line)
 *   2. Materialises gl_balance via postJournalGl() — single-source GL helper
 *   3. Writes ledger.commitment_fulfillment(kind='SES') per commitment_line
 *   4. Updates document.service_sheet: status='posted', accrual_je_id,
 *      is_posted, posted_at, posted_by
 *
 * Differences from receipt-posting:
 *   - No inventory_movement writes (services don't stock).
 *   - Clearing account subledger_type='ses_clearing' rather than 'gr_ir_clearing'.
 *   - All lines post to expense (no asset / inventory split).
 *
 * Idempotency contract is identical to receipt-posting (claim under
 * 'p2p.service_sheet.post', thread executionToken to postJournalGl).
 *
 * Reversal: handleReverseServiceSheet — compensating-JE handler that
 * mirrors the posting flow with sign flipped and restores trigger-synced
 * accepted_quantity via commitment_fulfillment(is_reversal=true). No
 * inventory_movement step (services don't stock).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { postJournalGl } from "../../ledger/post-journal-gl.service.js";
import { loadAndProjectComponentAccounting } from "../../pricing_component/component-accounting-loader.service.js";
import type { ComponentAccountingAllocation } from "../../pricing_component/component-accounting-resolver.service.js";
import {
  claimHookExecution, markHookCompleted, markHookFailed,
} from "../../ledger/idempotency.service.js";
import { reconcilePurchaseOrderFulfillment } from "../purchase_order/purchase-order-reconciliation.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ServiceSheetPostingCtx {
  tenantId:           string;
  serviceSheetId:     string;
  principalId:        string;
  executionToken:     string;
  transitionId:       string;
  transitionEventSeq?: number;
  remarks?:           string | null;
}

export interface ServiceSheetPostingResult {
  ok: boolean;
  jeId?:        string;
  rowsPosted?:  number;
  alreadyPosted?: boolean;
  error?:       { code: string; message: string };
}

interface ServiceSheetHeader {
  id:                       string;
  company_code_id:          string;
  commitment_id:            string;
  supplier_id:              string;
  service_sheet_number:     string;
  site_id:                  string | null;
  posting_date:             string;
  document_date:            string;
  service_period_from:      string;
  service_period_to:        string;
  fiscal_year:              number;
  period_number:            number;
  currency_code:            string;
  base_currency_code:       string;
  exchange_rate:            number | null;
  total_amount:             number;
  status:                   string;
  is_posted:                boolean;
}

interface ServiceSheetLine {
  id:                    string;
  line_no:               number;
  commitment_line_id:    string;
  item_id:               string | null;
  service_description:   string;
  uom_code:              string;
  quantity:              number;
  unit_price:            number;
  cost_center_id:        string | null;
  profit_center_id:      string | null;
  project_id:            string | null;
  site_id:               string | null;
  commodity_category_id: string | null;
}

export async function handlePostServiceSheet(
  db:  AnyDb,
  ctx: ServiceSheetPostingCtx,
): Promise<ServiceSheetPostingResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      "p2p.service_sheet.post",
    transitionId:       ctx.transitionId,
    sourceDocType:      "service_sheet",
    sourceDocId:        ctx.serviceSheetId,
    transitionEventSeq: ctx.transitionEventSeq,
    principalId:        ctx.principalId,
  });

  if (!claim) {
    return { ok: true, alreadyPosted: true };
  }

  const startedAt = Date.now();
  try {
    const execute = async (trx: AnyDb) => {
      // ── 1. Load + validate ────────────────────────────────────────────────
      const header = await loadServiceSheetHeader(trx, ctx.tenantId, ctx.serviceSheetId);
      if (!header) {
        return failure("SERVICE_SHEET_NOT_FOUND", "Service sheet not found.");
      }
      // Accept both 'approved' (route-handler call) and 'posted' (transition-
      // hook call where the transition already updated the status column).
      if (header.status !== "approved" && header.status !== "posted") {
        return failure(
          "SERVICE_SHEET_NOT_POSTABLE",
          `Service sheet must be 'approved' or 'posted' to run posting (currently '${header.status}').`,
        );
      }
      if (header.is_posted) {
        return failure("SERVICE_SHEET_ALREADY_POSTED", "Service sheet is already posted.");
      }

      const lines = await loadServiceSheetLines(trx, ctx.tenantId, ctx.serviceSheetId);
      if (lines.length === 0) {
        return failure("SERVICE_SHEET_NO_LINES", "Service sheet has no lines to post.");
      }

      // ── 2. Resolve posting infrastructure ────────────────────────────────
      const fp = await resolveFiscalPeriod(
        trx, ctx.tenantId, header.company_code_id,
        header.fiscal_year, header.period_number,
      );
      if (!fp) return failure("NO_OPEN_PERIOD", "No open fiscal period for the posting date.");

      const bookId = await resolveStatutoryBookId(trx, ctx.tenantId, header.company_code_id);
      if (!bookId) return failure("NO_LEDGER_BOOK", "No statutory ledger book assigned to this company.");

      const clearingAccountId = await resolveSubledgerAccount(
        trx, ctx.tenantId, header.company_code_id, "ses_clearing",
      );
      if (!clearingAccountId) {
        return failure(
          "NO_SES_CLEARING_ACCOUNT",
          "No SES clearing account found on this company's chart.",
        );
      }

      const exchangeRate = Number(header.exchange_rate ?? 1);
      const componentProjection = await loadAndProjectComponentAccounting(trx, {
        tenantId: ctx.tenantId, sourceDocType: "service_sheet_line", sourceDocId: ctx.serviceSheetId,
      });
      const projectedCostByLine = distributableCostByLine(componentProjection.allocations);

      // ── 3. Resolve per-line debit (expense) accounts ─────────────────────
      const linePostings: Array<{
        line:       ServiceSheetLine;
        accountId:  string;
        amount:     number;
        baseAmount: number;
      }> = [];

      for (const line of lines) {
        const accountId = await resolveExpenseAccount(
          trx, ctx.tenantId, header.company_code_id, line.commodity_category_id,
        );
        if (!accountId) {
          return failure(
            "NO_POSTING_ACCOUNT",
            `No expense account for service_sheet line ${line.line_no} (commodity_category_id=${line.commodity_category_id ?? "null"}).`,
          );
        }
        const amount     = projectedCostByLine.get(line.id)
          ?? Number(line.quantity) * Number(line.unit_price);
        const baseAmount = amount * exchangeRate;
        linePostings.push({ line, accountId, amount, baseAmount });
      }

      const totalAmount     = linePostings.reduce((sum, p) => sum + p.amount, 0);
      const totalBaseAmount = linePostings.reduce((sum, p) => sum + p.baseAmount, 0);

      // ── 4. Create journal_entry ──────────────────────────────────────────
      const jeNumber = await nextJeNumber(trx, ctx.tenantId, header.company_code_id);

      // See receipt-posting.service.ts JE INSERT for the schema fixes
      // (drop exchange_rate, add posted_at/posted_by to satisfy
      // je_posted_audit_chk).
      const jeResult = await sql<{ id: string }>`
        INSERT INTO document.journal_entry (
          tenant_id, je_number, company_code_id, book_id,
          source_doc_type, source_doc_id,
          fiscal_period_id, fiscal_year, period_number,
          document_date, posting_date,
          transaction_currency, base_currency,
          total_debit, total_credit,
          description, status,
          posted_at, posted_by,
          created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${jeNumber}::text,
          ${header.company_code_id}::uuid,
          ${bookId}::uuid,
          'service_sheet'::text,
          ${ctx.serviceSheetId}::uuid,
          ${fp.id}::uuid,
          ${header.fiscal_year}::smallint,
          ${header.period_number}::smallint,
          ${header.document_date}::date,
          ${header.posting_date}::date,
          ${header.currency_code}::char(3),
          ${header.base_currency_code}::char(3),
          ${totalBaseAmount}::numeric,
          ${totalBaseAmount}::numeric,
          ${ctx.remarks ?? `Service Sheet ${header.service_sheet_number}`}::text,
          'posted'::text,
          now(),
          ${ctx.principalId}::uuid,
          ${ctx.principalId}::uuid
        )
        RETURNING id
      `.execute(trx);
      const jeId = jeResult.rows[0]?.id;
      if (!jeId) return failure("JE_CREATE_FAILED", "Failed to create journal entry.");

      // ── 5. Insert journal_lines ──────────────────────────────────────────
      let lineNo = 10;
      for (const p of linePostings) {
        await insertJournalLine(trx, {
          tenantId:        ctx.tenantId,
          jeId,
          lineNo,
          companyCodeId:   header.company_code_id,
          bookId,
          fiscalPeriodId:  fp.id,
          fiscalYear:      header.fiscal_year,
          periodNumber:    header.period_number,
          postingDate:     header.posting_date,
          glAccountId:     p.accountId,
          txnCurrency:     header.currency_code,
          baseCurrency:    header.base_currency_code,
          exchangeRate,
          isDebit:         true,
          txnAmount:       p.amount,
          baseAmount:      p.baseAmount,
          description:     `Service Sheet ${header.service_sheet_number} line ${p.line.line_no} — ${p.line.service_description}`,
          costCenterId:    p.line.cost_center_id,
          profitCenterId:  p.line.profit_center_id,
          projectId:       p.line.project_id,
          sourceDocLineId: p.line.id,
          createdBy:       ctx.principalId,
        });
        lineNo += 10;
      }

      await insertJournalLine(trx, {
        tenantId:        ctx.tenantId,
        jeId,
        lineNo,
        companyCodeId:   header.company_code_id,
        bookId,
        fiscalPeriodId:  fp.id,
        fiscalYear:      header.fiscal_year,
        periodNumber:    header.period_number,
        postingDate:     header.posting_date,
        glAccountId:     clearingAccountId,
        txnCurrency:     header.currency_code,
        baseCurrency:    header.base_currency_code,
        exchangeRate,
        isDebit:         false,
        txnAmount:       totalAmount,
        baseAmount:      totalBaseAmount,
        description:     `SES clearing — Service Sheet ${header.service_sheet_number}`,
        costCenterId:    null,
        profitCenterId:  null,
        projectId:       null,
        sourceDocLineId: null,
        createdBy:       ctx.principalId,
      });

      // ── 6. Materialise GL via single-source helper ───────────────────────
      const glResult = await postJournalGl(trx, {
        tenantId:           ctx.tenantId,
        jeId,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        sourceDocType:      "service_sheet",
        sourceDocId:        ctx.serviceSheetId,
        transitionEventSeq: ctx.transitionEventSeq,
        principalId:        ctx.principalId,
      });

      // ── 7. commitment_fulfillment(SERVICE_RECEIPT) — one row per line ──
      for (const p of linePostings) {
        await sql`
          INSERT INTO ledger.commitment_fulfillment (
            tenant_id, commitment_id,
            fulfillment_type,
            reference_doc_type, reference_doc_id, reference_line_id,
            currency_code, base_currency_code,
            amount, base_amount, exchange_rate,
            fiscal_year, period_number, fulfillment_date,
            metadata,
            created_by
          ) VALUES (
            ${ctx.tenantId}::uuid,
            ${header.commitment_id}::uuid,
            'SERVICE_RECEIPT'::text,
            'service_sheet'::text,
            ${ctx.serviceSheetId}::uuid,
            ${p.line.id}::uuid,
            ${header.currency_code}::char(3),
            ${header.base_currency_code}::char(3),
            ${p.amount}::numeric,
            ${p.baseAmount}::numeric,
            ${exchangeRate}::numeric,
            ${header.fiscal_year}::smallint,
            ${header.period_number}::smallint,
            ${header.posting_date}::date,
            ${JSON.stringify({
              commitment_line_id:     p.line.commitment_line_id,
              service_sheet_line_id:  p.line.id,
              accepted_quantity:      p.line.quantity,
            })}::jsonb,
            ${ctx.principalId}::uuid
          )
        `.execute(trx);
      }

      // ── 8. Update service_sheet header ───────────────────────────────────
      await sql`
        UPDATE document.service_sheet
           SET status            = 'posted',
               accrual_je_id     = ${jeId}::uuid,
               status_changed_at = now(),
               status_changed_by = ${ctx.principalId}::uuid,
               updated_at        = now(),
               updated_by        = ${ctx.principalId}::uuid,
               row_version       = row_version + 1
         WHERE id        = ${ctx.serviceSheetId}::uuid
           AND tenant_id = ${ctx.tenantId}::uuid
      `.execute(trx);

      await reconcilePurchaseOrderFulfillment(trx, ctx.tenantId, header.commitment_id, ctx.principalId);
      return success(jeId, glResult.rowsPosted);
    };
    const result = (db as { isTransaction?: boolean }).isTransaction === true
      ? await execute(db)
      : await db.transaction().execute((trx) => execute(trx));

    const duration = Date.now() - startedAt;
    if (result.ok) {
      await markHookCompleted(db, claim.id, undefined, duration);
    } else {
      await markHookFailed(db, claim.id, result.error!.code, result.error!.message, duration);
    }
    return result;
  } catch (err) {
    const duration = Date.now() - startedAt;
    const code     = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "SERVICE_SHEET_POSTING_FAILED";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function failure(code: string, message: string): ServiceSheetPostingResult {
  return { ok: false, error: { code, message } };
}

function success(jeId: string, rowsPosted: number): ServiceSheetPostingResult {
  return { ok: true, jeId, rowsPosted, alreadyPosted: false };
}

async function loadServiceSheetHeader(
  db: AnyDb, tenantId: string, sshId: string,
): Promise<ServiceSheetHeader | null> {
  const result = await sql<ServiceSheetHeader>`
    SELECT id, company_code_id, commitment_id, supplier_id, service_sheet_number,
           (SELECT MIN(sl.site_id::text) FROM document.service_sheet_line sl WHERE sl.service_sheet_id = service_sheet.id AND sl.tenant_id = service_sheet.tenant_id) AS site_id,
           posting_date, service_date AS document_date,
           service_period_from, service_period_to,
           fiscal_year, period_number,
           currency_code, base_currency_code, exchange_rate,
           total_amount, status, (accrual_je_id IS NOT NULL) AS is_posted
      FROM document.service_sheet
     WHERE id        = ${sshId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function loadServiceSheetLines(
  db: AnyDb, tenantId: string, sshId: string,
): Promise<ServiceSheetLine[]> {
  // Accounting dimensions cascade from the parent commitment header (PO).
  // service_sheet_line no longer carries cost_center/profit_center/project;
  // commodity_category_id stays line-grain on commitment_line.
  // site_id is logistical, stays on the SES line.
  const result = await sql<ServiceSheetLine>`
    SELECT sshl.id, sshl.line_no, sshl.commitment_line_id,
           sshl.item_id, sshl.item_description AS service_description, sshl.uom_code,
           sshl.quantity, sshl.unit_price,
           cmt.cost_center_id, cmt.profit_center_id, cmt.project_id,
           sshl.site_id,
           cl.commodity_category_id
      FROM document.service_sheet_line sshl
      LEFT JOIN document.commitment_line cl
             ON cl.id        = sshl.commitment_line_id
            AND cl.tenant_id = sshl.tenant_id
      LEFT JOIN document.commitment cmt
             ON cmt.id        = cl.commitment_id
            AND cmt.tenant_id = cl.tenant_id
     WHERE sshl.tenant_id        = ${tenantId}::uuid
       AND sshl.service_sheet_id = ${sshId}::uuid
     ORDER BY sshl.line_no
  `.execute(db);
  return result.rows;
}

async function resolveFiscalPeriod(
  db: AnyDb, tenantId: string, companyCodeId: string,
  fiscalYear: number, periodNumber: number,
): Promise<{ id: string; fiscal_year: number; period_number: number } | null> {
  const result = await sql<{ id: string; fiscal_year: number; period_number: number }>`
    SELECT id, fiscal_year, period_number
      FROM master.fiscal_period
     WHERE tenant_id        = ${tenantId}::uuid
       AND company_code_id  = ${companyCodeId}::uuid
       AND fiscal_year      = ${fiscalYear}::smallint
       AND period_number    = ${periodNumber}::smallint
       AND status           = 'open'
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function resolveStatutoryBookId(
  db: AnyDb, tenantId: string, companyCodeId: string,
): Promise<string | null> {
  // See receipt-posting.service.ts:resolveStatutoryBookId for the
  // schema mismatch this fix addresses. master.ledger_book carries
  // category/is_primary; the company linkage runs through
  // company_code_book_assignment.
  const result = await sql<{ id: string }>`
    SELECT b.id
      FROM master.ledger_book b
      JOIN master.company_code_book_assignment ba
        ON ba.book_id   = b.id
       AND ba.tenant_id = b.tenant_id
     WHERE b.tenant_id          = ${tenantId}::uuid
       AND ba.company_code_id   = ${companyCodeId}::uuid
       AND b.category           = 'statutory'
       AND b.status             = 'active'
       AND ba.status            = 'active'
       AND ba.effective_from    <= CURRENT_DATE
       AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)
     ORDER BY b.is_primary DESC, ba.priority DESC
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
}

async function resolveSubledgerAccount(
  db: AnyDb, tenantId: string, companyCodeId: string, subledgerType: string,
): Promise<string | null> {
  const result = await sql<{ id: string }>`
    SELECT ga.id
      FROM master.gl_account ga
      JOIN master.company_code_chart_assignment cca
        ON cca.chart_of_account_id = ga.chart_of_account_id
       AND cca.tenant_id            = ga.tenant_id
       AND cca.company_code_id      = ${companyCodeId}::uuid
       AND cca.status               = 'active'
     WHERE ga.tenant_id      = ${tenantId}::uuid
       AND ga.subledger_type = ${subledgerType}::text
       AND ga.is_active      = true
       AND ga.node_type      = 'posting'
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
}

async function resolveExpenseAccount(
  db: AnyDb, tenantId: string, companyCodeId: string,
  commodityCategoryId: string | null,
): Promise<string | null> {
  if (commodityCategoryId) {
    const policy = await sql<{ id: string }>`
      SELECT ga.id
        FROM control.commodity_category_buy_policy p
        JOIN master.gl_account ga
          ON ga.id        = p.default_gl_account_id
         AND ga.tenant_id = p.tenant_id
         AND ga.is_active = true
         AND ga.node_type = 'posting'
        JOIN master.company_code_chart_assignment cca
          ON cca.chart_of_account_id = ga.chart_of_account_id
         AND cca.tenant_id           = ga.tenant_id
         AND cca.company_code_id     = ${companyCodeId}::uuid
         AND cca.status              = 'active'
       WHERE p.tenant_id              = ${tenantId}::uuid
         AND p.commodity_category_id  = ${commodityCategoryId}::uuid
         AND p.mapping_mode           = 'ALLOW'
         AND p.is_active              = true
         AND p.default_gl_account_id IS NOT NULL
         AND (p.scope_type = 'TENANT'
              OR (p.scope_type = 'COMPANY' AND p.scope_id = ${companyCodeId}::uuid))
         AND p.effective_from <= current_date
         AND (p.effective_to IS NULL OR p.effective_to >= current_date)
       ORDER BY CASE p.scope_type WHEN 'COMPANY' THEN 0 WHEN 'TENANT' THEN 1 ELSE 2 END,
                p.is_default DESC, p.sort_order, p.updated_at DESC NULLS LAST
       LIMIT 1
    `.execute(db);
    if (policy.rows[0]) return policy.rows[0].id;
  }

  const result = await sql<{ id: string }>`
    SELECT ga.id
      FROM master.gl_account ga
      JOIN master.company_code_chart_assignment cca
        ON cca.chart_of_account_id = ga.chart_of_account_id
       AND cca.tenant_id           = ga.tenant_id
       AND cca.company_code_id     = ${companyCodeId}::uuid
       AND cca.status              = 'active'
     WHERE ga.tenant_id     = ${tenantId}::uuid
       AND ga.account_class = 'expense'
       AND ga.is_active     = true
       AND ga.node_type     = 'posting'
     ORDER BY ga.sort_order, ga.code
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
}

async function nextJeNumber(
  db: AnyDb, tenantId: string, companyCodeId: string,
): Promise<string> {
  const result = await sql<{ next_number: string }>`
    SELECT control.fn_next_entity_number(
      ${tenantId}::uuid,
      'journal_entry'::text,
      'document_no'::text,
      ${companyCodeId}::uuid
    ) AS next_number
  `.execute(db);
  return result.rows[0]?.next_number ?? `JE-AUTO-${Date.now()}`;
}

async function insertJournalLine(
  db: AnyDb,
  args: {
    tenantId:        string;
    jeId:            string;
    lineNo:          number;
    companyCodeId:   string;
    bookId:          string;
    fiscalPeriodId:  string;
    fiscalYear:      number;
    periodNumber:    number;
    postingDate:     string;
    glAccountId:     string;
    txnCurrency:     string;
    baseCurrency:    string;
    exchangeRate:    number;
    isDebit:         boolean;
    txnAmount:       number;
    baseAmount:      number;
    description:     string;
    costCenterId:    string | null;
    profitCenterId:  string | null;
    projectId:       string | null;
    sourceDocLineId: string | null;
    createdBy:       string;
  },
): Promise<void> {
  const txnDebit  = args.isDebit ? args.txnAmount  : 0;
  const txnCredit = args.isDebit ? 0               : args.txnAmount;
  const baseDebit  = args.isDebit ? args.baseAmount : 0;
  const baseCredit = args.isDebit ? 0               : args.baseAmount;
  await sql`
    INSERT INTO document.journal_line (
      tenant_id, journal_entry_id, line_no, gl_account_id,
      company_code_id, book_id,
      fiscal_period_id, fiscal_year, period_number, posting_date,
      transaction_currency, transaction_debit, transaction_credit,
      base_currency, base_debit, base_credit, exchange_rate,
      description,
      cost_center_id, profit_center_id, project_id,
      source_doc_line_id,
      created_by
    ) VALUES (
      ${args.tenantId}::uuid,
      ${args.jeId}::uuid,
      ${args.lineNo}::smallint,
      ${args.glAccountId}::uuid,
      ${args.companyCodeId}::uuid,
      ${args.bookId}::uuid,
      ${args.fiscalPeriodId}::uuid,
      ${args.fiscalYear}::smallint,
      ${args.periodNumber}::smallint,
      ${args.postingDate}::date,
      ${args.txnCurrency}::char(3),
      ${txnDebit}::numeric,
      ${txnCredit}::numeric,
      ${args.baseCurrency}::char(3),
      ${baseDebit}::numeric,
      ${baseCredit}::numeric,
      ${args.exchangeRate}::numeric,
      ${args.description}::text,
      ${args.costCenterId}::uuid,
      ${args.profitCenterId}::uuid,
      ${args.projectId}::uuid,
      ${args.sourceDocLineId}::uuid,
      ${args.createdBy}::uuid
    )
  `.execute(db);
}

// ──────────────────────────────────────────────────────────────────────────────
// Reversal (audit AP-S3)
// ──────────────────────────────────────────────────────────────────────────────
//
// Direct structural adaptation of handleReverseReceipt minus the inventory
// step (services don't stock). See receipt-posting.service.ts for the
// rationale on each step.
//
// JE shape (sign-flipped from handlePostServiceSheet):
//   Dr SES Clearing      (total — single line)
//   Cr Expense           per service_sheet_line
//
// Reversal-period policy: same AP-Q1 default — CURRENT_DATE's open period.
//
// Idempotency: claims hookActionKey='p2p.service_sheet.reverse'.

function distributableCostByLine(rows: ComponentAccountingAllocation[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!["BASE_COST", "COST_REDUCTION", "COST_ADDITION", "NONRECOVERABLE_TAX"].includes(row.componentBucket)) continue;
    const sign = row.componentBucket === "COST_REDUCTION" ? -1 : 1;
    result.set(row.sourceLineId, (result.get(row.sourceLineId) ?? 0) + sign * row.amount);
  }
  return result;
}

export async function handleReverseServiceSheet(
  db:  AnyDb,
  ctx: ServiceSheetPostingCtx,
): Promise<ServiceSheetPostingResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      "p2p.service_sheet.reverse",
    transitionId:       ctx.transitionId,
    sourceDocType:      "service_sheet",
    sourceDocId:        ctx.serviceSheetId,
    transitionEventSeq: ctx.transitionEventSeq,
    principalId:        ctx.principalId,
  });

  if (!claim) {
    return { ok: true, alreadyPosted: true };
  }

  const startedAt = Date.now();
  try {
    const execute = async (trx: AnyDb) => {
      // ── 1. Load + validate ────────────────────────────────────────────────
      const header = await loadServiceSheetHeader(trx, ctx.tenantId, ctx.serviceSheetId);
      if (!header) return failure("SERVICE_SHEET_NOT_FOUND", "Service sheet not found.");

      if (header.status !== "posted" && header.status !== "reversed") {
        return failure(
          "SERVICE_SHEET_NOT_REVERSIBLE",
          `Service sheet must be 'posted' or 'reversed' to run reversal (currently '${header.status}').`,
        );
      }
      if (!header.is_posted) {
        return failure(
          "SERVICE_SHEET_NOT_REVERSIBLE",
          "Service sheet is not posted — nothing to reverse.",
        );
      }
      const accrualJeId = await loadAccrualJeId(trx, ctx.tenantId, ctx.serviceSheetId);
      if (!accrualJeId) {
        return failure("SERVICE_SHEET_HAS_NO_JE", "Service sheet has no accrual_je_id; cannot build compensating JE.");
      }
      if (await reversalJeExists(trx, ctx.tenantId, accrualJeId)) {
        return failure("SERVICE_SHEET_ALREADY_REVERSED", "Service sheet has already been reversed.");
      }

      const lines = await loadServiceSheetLines(trx, ctx.tenantId, ctx.serviceSheetId);
      if (lines.length === 0) {
        return failure("SERVICE_SHEET_NO_LINES", "Service sheet has no lines — nothing to reverse.");
      }

      // ── 2. Resolve reversal-period posting infrastructure ────────────────
      const reversalPeriod = await resolveCurrentOpenPeriod(
        trx, ctx.tenantId, header.company_code_id,
      );
      if (!reversalPeriod) {
        return failure(
          "NO_OPEN_PERIOD",
          "No open fiscal period covers CURRENT_DATE for the service sheet's company.",
        );
      }

      const bookId = await resolveStatutoryBookId(trx, ctx.tenantId, header.company_code_id);
      if (!bookId) return failure("NO_LEDGER_BOOK", "No statutory ledger book assigned to this company.");

      const clearingAccountId = await resolveSubledgerAccount(
        trx, ctx.tenantId, header.company_code_id, "ses_clearing",
      );
      if (!clearingAccountId) {
        return failure(
          "NO_SES_CLEARING_ACCOUNT",
          "No SES clearing account found on this company's chart.",
        );
      }

      const exchangeRate = Number(header.exchange_rate ?? 1);
      const componentProjection = await loadAndProjectComponentAccounting(trx, {
        tenantId: ctx.tenantId, sourceDocType: "service_sheet_line", sourceDocId: ctx.serviceSheetId,
      });
      const projectedCostByLine = distributableCostByLine(componentProjection.allocations);

      // ── 3. Per-line expense accounts (mirror the original resolution) ────
      const linePostings: Array<{
        line:       ServiceSheetLine;
        accountId:  string;
        amount:     number;
        baseAmount: number;
      }> = [];
      for (const line of lines) {
        const accountId = await resolveExpenseAccount(
          trx, ctx.tenantId, header.company_code_id, line.commodity_category_id,
        );
        if (!accountId) {
          return failure(
            "NO_POSTING_ACCOUNT",
            `No expense account for service_sheet line ${line.line_no} (commodity_category_id=${line.commodity_category_id ?? "null"}).`,
          );
        }
        const amount     = projectedCostByLine.get(line.id)
          ?? Number(line.quantity) * Number(line.unit_price);
        const baseAmount = amount * exchangeRate;
        linePostings.push({ line, accountId, amount, baseAmount });
      }
      const totalAmount     = linePostings.reduce((sum, p) => sum + p.amount, 0);
      const totalBaseAmount = linePostings.reduce((sum, p) => sum + p.baseAmount, 0);

      // ── 4. Create compensating journal_entry ─────────────────────────────
      const jeNumber     = await nextJeNumber(trx, ctx.tenantId, header.company_code_id);
      const reversalDate = await currentDateIso(trx);

      const jeResult = await sql<{ id: string }>`
        INSERT INTO document.journal_entry (
          tenant_id, je_number, company_code_id, book_id,
          source_doc_type, source_doc_id,
          fiscal_period_id, fiscal_year, period_number,
          document_date, posting_date,
          transaction_currency, base_currency,
          total_debit, total_credit,
          description, status,
          is_reversal, reversal_of_id,
          posted_at, posted_by,
          created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${jeNumber}::text,
          ${header.company_code_id}::uuid,
          ${bookId}::uuid,
          'service_sheet'::text,
          ${ctx.serviceSheetId}::uuid,
          ${reversalPeriod.id}::uuid,
          ${reversalPeriod.fiscal_year}::smallint,
          ${reversalPeriod.period_number}::smallint,
          ${reversalDate}::date,
          ${reversalDate}::date,
          ${header.currency_code}::char(3),
          ${header.base_currency_code}::char(3),
          ${totalBaseAmount}::numeric,
          ${totalBaseAmount}::numeric,
          ${ctx.remarks ?? `Reversal of Service Sheet ${header.service_sheet_number}`}::text,
          'posted'::text,
          true,
          ${accrualJeId}::uuid,
          now(),
          ${ctx.principalId}::uuid,
          ${ctx.principalId}::uuid
        )
        RETURNING id
      `.execute(trx);
      const jeId = jeResult.rows[0]?.id;
      if (!jeId) return failure("JE_CREATE_FAILED", "Failed to create compensating journal entry.");

      // ── 5. Insert reversal journal_lines (sign-flipped from posting) ─────
      // Dr SES Clearing for the total (one line, first), then Cr per-line
      // expense. The forward posting was Dr Expense / Cr Clearing.
      let lineNo = 10;
      await insertJournalLine(trx, {
        tenantId:        ctx.tenantId,
        jeId,
        lineNo,
        companyCodeId:   header.company_code_id,
        bookId,
        fiscalPeriodId:  reversalPeriod.id,
        fiscalYear:      reversalPeriod.fiscal_year,
        periodNumber:    reversalPeriod.period_number,
        postingDate:     reversalDate,
        glAccountId:     clearingAccountId,
        txnCurrency:     header.currency_code,
        baseCurrency:    header.base_currency_code,
        exchangeRate,
        isDebit:         true,
        txnAmount:       totalAmount,
        baseAmount:      totalBaseAmount,
        description:     `SES clearing reversal — Service Sheet ${header.service_sheet_number}`,
        costCenterId:    null,
        profitCenterId:  null,
        projectId:       null,
        sourceDocLineId: null,
        createdBy:       ctx.principalId,
      });
      lineNo += 10;

      for (const p of linePostings) {
        await insertJournalLine(trx, {
          tenantId:        ctx.tenantId,
          jeId,
          lineNo,
          companyCodeId:   header.company_code_id,
          bookId,
          fiscalPeriodId:  reversalPeriod.id,
          fiscalYear:      reversalPeriod.fiscal_year,
          periodNumber:    reversalPeriod.period_number,
          postingDate:     reversalDate,
          glAccountId:     p.accountId,
          txnCurrency:     header.currency_code,
          baseCurrency:    header.base_currency_code,
          exchangeRate,
          isDebit:         false,
          txnAmount:       p.amount,
          baseAmount:      p.baseAmount,
          description:     `Reversal of Service Sheet ${header.service_sheet_number} line ${p.line.line_no} — ${p.line.service_description}`,
          costCenterId:    p.line.cost_center_id,
          profitCenterId:  p.line.profit_center_id,
          projectId:       p.line.project_id,
          sourceDocLineId: p.line.id,
          createdBy:       ctx.principalId,
        });
        lineNo += 10;
      }

      // ── 6. Materialise GL ────────────────────────────────────────────────
      const glResult = await postJournalGl(trx, {
        tenantId:           ctx.tenantId,
        jeId,
        executionToken:     ctx.executionToken,
        transitionId:       ctx.transitionId,
        sourceDocType:      "service_sheet",
        sourceDocId:        ctx.serviceSheetId,
        transitionEventSeq: ctx.transitionEventSeq,
        principalId:        ctx.principalId,
      });

      // ── 7. commitment_fulfillment reversal rows ──────────────────────────
      // One per service_sheet_line — pointed at the original SERVICE_RECEIPT
      // fulfillment row so the trigger that maintains accepted_quantity
      // sees the offset and restores the cached qty.
      for (const p of linePostings) {
        const originalFulfillmentId = await findOriginalServiceSheetFulfillment(
          trx, ctx.tenantId, header.commitment_id, ctx.serviceSheetId, p.line.id,
        );
        await sql`
          INSERT INTO ledger.commitment_fulfillment (
            tenant_id, commitment_id,
            fulfillment_type,
            reference_doc_type, reference_doc_id, reference_line_id,
            currency_code, base_currency_code,
            amount, base_amount, exchange_rate,
            fiscal_year, period_number, fulfillment_date,
            is_reversal, reverses_id,
            metadata,
            created_by
          ) VALUES (
            ${ctx.tenantId}::uuid,
            ${header.commitment_id}::uuid,
            'SERVICE_RECEIPT'::text,
            'service_sheet'::text,
            ${ctx.serviceSheetId}::uuid,
            ${p.line.id}::uuid,
            ${header.currency_code}::char(3),
            ${header.base_currency_code}::char(3),
            ${p.amount}::numeric,
            ${p.baseAmount}::numeric,
            ${exchangeRate}::numeric,
            ${reversalPeriod.fiscal_year}::smallint,
            ${reversalPeriod.period_number}::smallint,
            ${reversalDate}::date,
            true,
            ${originalFulfillmentId}::uuid,
            ${JSON.stringify({
              commitment_line_id:    p.line.commitment_line_id,
              service_sheet_line_id: p.line.id,
              accepted_quantity:     p.line.quantity,
              reversal_of_je_id:     accrualJeId,
            })}::jsonb,
            ${ctx.principalId}::uuid
          )
        `.execute(trx);
      }

      // ── 8. Stamp the service_sheet header ────────────────────────────────
      // status flips to 'reversed' (ssh_status_chk allows it); is_posted
      // stays true so the audit trail records the SS was actually posted
      // before reversal.
      await sql`
        UPDATE document.service_sheet
           SET status            = 'reversed',
               status_changed_at = now(),
               status_changed_by = ${ctx.principalId}::uuid,
               updated_at        = now(),
               updated_by        = ${ctx.principalId}::uuid,
               row_version       = row_version + 1
         WHERE id        = ${ctx.serviceSheetId}::uuid
           AND tenant_id = ${ctx.tenantId}::uuid
      `.execute(trx);

      await reconcilePurchaseOrderFulfillment(trx, ctx.tenantId, header.commitment_id, ctx.principalId);
      return success(jeId, glResult.rowsPosted);
    };
    const result = (db as { isTransaction?: boolean }).isTransaction === true
      ? await execute(db)
      : await db.transaction().execute((trx) => execute(trx));

    const duration = Date.now() - startedAt;
    if (result.ok) {
      await markHookCompleted(db, claim.id, undefined, duration);
    } else {
      await markHookFailed(db, claim.id, result.error!.code, result.error!.message, duration);
    }
    return result;
  } catch (err) {
    const duration = Date.now() - startedAt;
    const code     = err instanceof Error && "code" in err
      ? String((err as { code: unknown }).code)
      : "SERVICE_SHEET_REVERSAL_FAILED";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Reversal helpers
// ──────────────────────────────────────────────────────────────────────────────

async function loadAccrualJeId(
  db: AnyDb, tenantId: string, serviceSheetId: string,
): Promise<string | null> {
  const result = await sql<{ accrual_je_id: string | null }>`
    SELECT accrual_je_id::text AS accrual_je_id
      FROM document.service_sheet
     WHERE id = ${serviceSheetId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.accrual_je_id ?? null;
}

async function reversalJeExists(
  db: AnyDb, tenantId: string, accrualJeId: string,
): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM document.journal_entry
       WHERE tenant_id = ${tenantId}::uuid
         AND reversal_of_id = ${accrualJeId}::uuid
    ) AS exists
  `.execute(db);
  return result.rows[0]?.exists === true;
}

async function resolveCurrentOpenPeriod(
  db: AnyDb, tenantId: string, companyCodeId: string,
): Promise<{ id: string; fiscal_year: number; period_number: number } | null> {
  const result = await sql<{ id: string; fiscal_year: number; period_number: number }>`
    SELECT id, fiscal_year, period_number
      FROM master.fiscal_period
     WHERE tenant_id        = ${tenantId}::uuid
       AND company_code_id  = ${companyCodeId}::uuid
       AND CURRENT_DATE BETWEEN start_date AND end_date
       AND status           = 'open'
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function currentDateIso(db: AnyDb): Promise<string> {
  const result = await sql<{ d: string }>`
    SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d
  `.execute(db);
  return result.rows[0]?.d ?? new Date().toISOString().slice(0, 10);
}

async function findOriginalServiceSheetFulfillment(
  db: AnyDb, tenantId: string, commitmentId: string,
  serviceSheetId: string, serviceSheetLineId: string,
): Promise<string | null> {
  const result = await sql<{ id: string }>`
    SELECT id::text
      FROM ledger.commitment_fulfillment
     WHERE tenant_id         = ${tenantId}::uuid
       AND commitment_id     = ${commitmentId}::uuid
       AND reference_doc_id  = ${serviceSheetId}::uuid
       AND reference_line_id = ${serviceSheetLineId}::uuid
       AND is_reversal       = false
     ORDER BY created_at
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
}
