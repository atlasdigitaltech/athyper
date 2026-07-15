/**
 * Receipt Posting Service (Phase 5.2)
 *
 * Posts an approved receipt:
 *   1. Inserts journal_entry + journal_lines
 *        Dr Inventory / Expense per receipt_line (resolved via
 *           commodity_category_buy_policy or chart fallback)
 *        Cr GR/IR Clearing       (total — single line)
 *   2. Materialises gl_balance via postJournalGl() — single-source GL helper
 *   3. Writes ledger.commitment_fulfillment(kind='GRN') per commitment_line
 *   4. Writes ledger.inventory_movement(RECEIPT) per stocked line + upserts
 *      ledger.inventory_balance
 *   5. Updates document.receipt: status='posted', accrual_je_id, is_posted,
 *      posted_at, posted_by
 *
 * Idempotency:
 *   The caller (Phase 5.3 dispatcher) passes an executionToken derived from
 *   the lifecycle transition. The posting service claims a slot under
 *   hookActionKey='p2p.receipt.post' and threads the same executionToken into
 *   postJournalGl() (which claims 'ledger.materialize_gl_balance') and into
 *   each ledger.* materialise helper, so retries are no-ops at every layer.
 *
 * Reversal: handleReverseReceipt — compensating-JE handler that mirrors
 * the posting flow with sign flipped, restores trigger-synced quantities
 * via commitment_fulfillment(is_reversal=true), writes the offsetting
 * inventory_movement(REVERSAL), and stamps the receipt with
 * status='reversed'. See the function body for the full step list.
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

export interface ReceiptPostingCtx {
  tenantId:           string;
  receiptId:          string;
  principalId:        string;
  executionToken:     string;
  transitionId:       string;
  transitionEventSeq?: number;
  remarks?:           string | null;
}

export interface ReceiptPostingResult {
  ok: boolean;
  jeId?:        string;
  rowsPosted?:  number;
  alreadyPosted?: boolean;
  error?:       { code: string; message: string };
}

interface ReceiptHeader {
  id:                  string;
  company_code_id:     string;
  commitment_id:       string;
  supplier_id:         string;
  receipt_number:      string;
  receiving_site_id:   string | null;
  receiving_warehouse_id: string | null;
  posting_date:        string;
  document_date:       string;
  fiscal_year:         number;
  period_number:       number;
  currency_code:       string;
  base_currency_code:  string;
  exchange_rate:       number | null;
  total_amount:        number;
  status:              string;
  is_posted:           boolean;
}

interface ReceiptLine {
  id:                   string;
  line_no:              number;
  commitment_line_id:   string;
  item_id:              string;
  item_description:     string;
  uom_code:             string;
  received_quantity:    number;
  accepted_quantity:    number;
  unit_price:           number;
  warehouse_id:         string;
  // Accounting dimensions cascade from the parent commitment header — line
  // tables no longer carry these columns. NULL when the commitment header
  // has none set; posting JE lines will be undimensioned in that case.
  cost_center_id:       string | null;
  profit_center_id:     string | null;
  project_id:           string | null;
  asset_class_id:       string | null;
  commodity_category_id: string | null;
}

export async function handlePostReceipt(
  db:  AnyDb,
  ctx: ReceiptPostingCtx,
): Promise<ReceiptPostingResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      "p2p.receipt.post",
    transitionId:       ctx.transitionId,
    sourceDocType:      "receipt",
    sourceDocId:        ctx.receiptId,
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
      const header = await loadReceiptHeader(trx, ctx.tenantId, ctx.receiptId);
      if (!header) {
        return failure("RECEIPT_NOT_FOUND", "Receipt not found.");
      }
      // Accept both 'approved' (route-handler call) and 'posted' (transition-
      // hook call where the transition already updated the status column).
      // is_posted is the authoritative gate for whether the work has run.
      if (header.status !== "approved" && header.status !== "posted") {
        return failure(
          "RECEIPT_NOT_POSTABLE",
          `Receipt must be 'approved' or 'posted' to run posting (currently '${header.status}').`,
        );
      }
      if (header.is_posted) {
        return failure("RECEIPT_ALREADY_POSTED", "Receipt is already posted.");
      }

      const lines = await loadReceiptLines(trx, ctx.tenantId, ctx.receiptId);
      if (lines.length === 0) {
        return failure("RECEIPT_NO_LINES", "Receipt has no lines to post.");
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
        trx, ctx.tenantId, header.company_code_id, "gr_ir_clearing",
      );
      if (!clearingAccountId) {
        return failure(
          "NO_GR_IR_CLEARING_ACCOUNT",
          "No GR/IR clearing account found on this company's chart.",
        );
      }

      const exchangeRate = Number(header.exchange_rate ?? 1);
      const componentProjection = await loadAndProjectComponentAccounting(trx, {
        tenantId: ctx.tenantId, sourceDocType: "receipt_line", sourceDocId: ctx.receiptId,
      });
      const projectedCostByLine = distributableCostByLine(componentProjection.allocations);

      // ── 3. Resolve per-line debit accounts ───────────────────────────────
      const linePostings: Array<{
        line:      ReceiptLine;
        accountId: string;
        amount:    number;
        baseAmount: number;
      }> = [];

      for (const line of lines) {
        const accountId = await resolveInventoryOrExpenseAccount(
          trx, ctx.tenantId, header.company_code_id,
          line.commodity_category_id, line.asset_class_id !== null,
        );
        if (!accountId) {
          return failure(
            "NO_POSTING_ACCOUNT",
            `No posting account for receipt line ${line.line_no} (commodity_category_id=${line.commodity_category_id ?? "null"}).`,
          );
        }
        const amount     = projectedCostByLine.get(line.id)
          ?? Number(line.accepted_quantity) * Number(line.unit_price);
        const baseAmount = amount * exchangeRate;
        linePostings.push({ line, accountId, amount, baseAmount });
      }

      const totalAmount     = linePostings.reduce((sum, p) => sum + p.amount, 0);
      const totalBaseAmount = linePostings.reduce((sum, p) => sum + p.baseAmount, 0);

      // ── 4. Create journal_entry ──────────────────────────────────────────
      const jeNumber = await nextJeNumber(trx, ctx.tenantId, header.company_code_id);

      // Audit fixture sprint: prior INSERT carried `exchange_rate` (not a
      // column on document.journal_entry — exchange_rate lives on journal_
      // line) and set status='posted' without posted_at/posted_by, which
      // violates je_posted_audit_chk. Both fixed below; posted_at + posted_by
      // are stamped at INSERT so the row is constraint-clean.
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
          'receipt'::text,
          ${ctx.receiptId}::uuid,
          ${fp.id}::uuid,
          ${header.fiscal_year}::smallint,
          ${header.period_number}::smallint,
          ${header.document_date}::date,
          ${header.posting_date}::date,
          ${header.currency_code}::char(3),
          ${header.base_currency_code}::char(3),
          ${totalBaseAmount}::numeric,
          ${totalBaseAmount}::numeric,
          ${ctx.remarks ?? `Receipt ${header.receipt_number}`}::text,
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
          lineNo:          lineNo,
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
          description:     `Receipt ${header.receipt_number} line ${p.line.line_no} — ${p.line.item_description}`,
          costCenterId:    p.line.cost_center_id,
          profitCenterId:  p.line.profit_center_id,
          projectId:       p.line.project_id,
          sourceDocLineId: p.line.id,
          createdBy:       ctx.principalId,
        });
        lineNo += 10;
      }

      // Single credit line — Cr GR/IR Clearing for the total
      await insertJournalLine(trx, {
        tenantId:        ctx.tenantId,
        jeId,
        lineNo:          lineNo,
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
        description:     `GR/IR clearing — Receipt ${header.receipt_number}`,
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
        sourceDocType:      "receipt",
        sourceDocId:        ctx.receiptId,
        transitionEventSeq: ctx.transitionEventSeq,
        principalId:        ctx.principalId,
      });

      // ── 7. commitment_fulfillment(GRN) — one row per line ──────────────
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
            'GRN'::text,
            'receipt'::text,
            ${ctx.receiptId}::uuid,
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
              commitment_line_id: p.line.commitment_line_id,
              receipt_line_id:    p.line.id,
              accepted_quantity:  p.line.accepted_quantity,
            })}::jsonb,
            ${ctx.principalId}::uuid
          )
        `.execute(trx);
      }

      // ── 8. inventory_movement(RECEIPT) per stocked line ─────────────────
      //
      // Audit fixture sprint: prior INSERT referenced columns that don't
      // exist on ledger.inventory_movement:
      //   movement_kind         → no such column
      //   total_cost            → total_value is GENERATED (quantity * unit_cost)
      //   source_doc_type/id    → actual columns are ref_doc_type / ref_doc_id
      //   source_line_id        → no such column; ref-line link lives in
      //                           metadata if needed
      //   performed_by missing  → NOT NULL with no default
      //   posted_at without posted_by → violates im_posting_pair_chk
      //
      // posted_at/posted_by are intentionally left NULL — the comment on
      // the table says they're enriched once within the same posting txn.
      // The reference_je_id linkage to the AP JE is established by the
      // matched invoice, not here.
      for (const p of linePostings) {
        if (p.line.asset_class_id) continue;  // asset lines skip inventory_movement; capitalisation runs from AP invoice posting via AD.asset_id
        await sql`
          INSERT INTO ledger.inventory_movement (
            tenant_id, company_code_id,
            item_id, warehouse_id,
            movement_type,
            quantity, unit_cost,
            currency_code,
            ref_doc_type, ref_doc_id,
            performed_at, performed_by,
            metadata,
            created_by
          ) VALUES (
            ${ctx.tenantId}::uuid,
            ${header.company_code_id}::uuid,
            ${p.line.item_id}::uuid,
            ${p.line.warehouse_id}::uuid,
            'RECEIPT'::text,
            ${p.line.accepted_quantity}::numeric,
            ${p.line.unit_price}::numeric,
            ${header.currency_code}::char(3),
            'receipt'::text,
            ${ctx.receiptId}::uuid,
            now(),
            ${ctx.principalId}::uuid,
            ${JSON.stringify({ receipt_line_id: p.line.id })}::jsonb,
            ${ctx.principalId}::uuid
          )
        `.execute(trx);
      }

      // ── 9. Update receipt header ─────────────────────────────────────────
      await sql`
        UPDATE document.receipt
           SET status        = 'posted',
               accrual_je_id = ${jeId}::uuid,
               status_changed_at = now(),
               status_changed_by = ${ctx.principalId}::uuid,
               updated_at    = now(),
               updated_by    = ${ctx.principalId}::uuid,
               row_version   = row_version + 1
         WHERE id        = ${ctx.receiptId}::uuid
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
      : "RECEIPT_POSTING_FAILED";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function failure(code: string, message: string): ReceiptPostingResult {
  return { ok: false, error: { code, message } };
}

function success(jeId: string, rowsPosted: number): ReceiptPostingResult {
  return { ok: true, jeId, rowsPosted, alreadyPosted: false };
}

async function loadReceiptHeader(
  db: AnyDb, tenantId: string, receiptId: string,
): Promise<ReceiptHeader | null> {
  const result = await sql<ReceiptHeader>`
    SELECT id, company_code_id, commitment_id, supplier_id, code AS receipt_number,
           (SELECT MIN(rl.site_id::text) FROM document.receipt_line rl WHERE rl.receipt_id = receipt.id AND rl.tenant_id = receipt.tenant_id) AS receiving_site_id,
           (SELECT MIN(rl.warehouse_id::text) FROM document.receipt_line rl WHERE rl.receipt_id = receipt.id AND rl.tenant_id = receipt.tenant_id) AS receiving_warehouse_id,
           posting_date, received_date AS document_date, fiscal_year, period_number,
           currency_code, base_currency_code, exchange_rate,
           total_amount, status, (accrual_je_id IS NOT NULL) AS is_posted
      FROM document.receipt
     WHERE id        = ${receiptId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function loadReceiptLines(
  db: AnyDb, tenantId: string, receiptId: string,
): Promise<ReceiptLine[]> {
  // Accounting dimensions cascade from the parent commitment header (PO).
  // commitment_line and receipt_line no longer carry these columns; the
  // commitment header is the defaulting source. commodity_category_id is
  // line-grain on commitment_line — it stays.
  const result = await sql<ReceiptLine>`
    SELECT rcpl.id, rcpl.line_no, rcpl.commitment_line_id,
           rcpl.item_id, rcpl.item_description, rcpl.uom_code,
           rcpl.received_quantity, rcpl.accepted_quantity, rcpl.unit_price,
           rcpl.warehouse_id,
           cmt.cost_center_id, cmt.profit_center_id, cmt.project_id,
           rcpl.asset_class_id,
           cl.commodity_category_id
      FROM document.receipt_line rcpl
      LEFT JOIN document.commitment_line cl
             ON cl.id        = rcpl.commitment_line_id
            AND cl.tenant_id = rcpl.tenant_id
      LEFT JOIN document.commitment cmt
             ON cmt.id        = cl.commitment_id
            AND cmt.tenant_id = cl.tenant_id
     WHERE rcpl.tenant_id = ${tenantId}::uuid
       AND rcpl.receipt_id = ${receiptId}::uuid
     ORDER BY rcpl.line_no
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
  // master.ledger_book is tenant-level with category/is_primary; the
  // company linkage runs through company_code_book_assignment. The prior
  // shape of this query (book_type='statutory', is_default=true,
  // company_code_id=...) referenced columns that don't exist on the
  // table — handlePostReceipt would have errored at the SQL layer the
  // first time it was actually invoked. Uncovered during the AP fixture
  // sprint (P5-S3 follow-up).
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

async function resolveInventoryOrExpenseAccount(
  db: AnyDb, tenantId: string, companyCodeId: string,
  commodityCategoryId: string | null, isAsset: boolean,
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

  // Fallback: first inventory account if stocked, else expense
  const accountClass = isAsset ? "asset" : "expense";
  const result = await sql<{ id: string }>`
    SELECT ga.id
      FROM master.gl_account ga
      JOIN master.company_code_chart_assignment cca
        ON cca.chart_of_account_id = ga.chart_of_account_id
       AND cca.tenant_id           = ga.tenant_id
       AND cca.company_code_id     = ${companyCodeId}::uuid
       AND cca.status              = 'active'
     WHERE ga.tenant_id     = ${tenantId}::uuid
       AND ga.account_class = ${accountClass}::text
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
// Reversal (audit AP-S2a)
// ──────────────────────────────────────────────────────────────────────────────
//
// Posts the compensating journal entry that undoes the original receipt
// posting, restores commitment_line.received_quantity via a
// commitment_fulfillment reversal row, decrements inventory via an
// inventory_movement REVERSAL row, and stamps the receipt with
// status='reversed'.
//
// JE shape (sign-flipped from handlePostReceipt):
//   Dr GR/IR Clearing      (total — single line)
//   Cr Inventory/Expense   per receipt_line (resolved through the same
//                          buy-policy / chart-fallback path as the original)
//
// Reversal-period policy (AP-Q1 default — pending finance sign-off):
//   The reversal JE + commitment_fulfillment + inventory_movement all
//   land in CURRENT_DATE's open period for the receipt's company.
//   If finance later wants reversals to post back into the original
//   period (when still open), thread the originalHeader.posting_date
//   into resolveFiscalPeriod instead of using CURRENT_DATE here.
//
// Idempotency: claims hookActionKey='p2p.receipt.reverse' under the
// lifecycle transition's execution token. Replay of the same transition
// returns alreadyPosted=true without writing duplicate ledger rows.
//
// Refusals:
//   RECEIPT_NOT_FOUND                — bad source_doc_id
//   RECEIPT_NOT_REVERSIBLE           — receipt isn't in a reversible status
//   RECEIPT_ALREADY_REVERSED         — status='reversed' or is_reversal=true
//   RECEIPT_HAS_NO_JE                — accrual_je_id is NULL (was never posted)
//   NO_LEDGER_BOOK / NO_OPEN_PERIOD  — same as forward posting
//   NO_GR_IR_CLEARING_ACCOUNT        — same
//   NO_POSTING_ACCOUNT               — same

function distributableCostByLine(rows: ComponentAccountingAllocation[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!["BASE_COST", "COST_REDUCTION", "COST_ADDITION", "NONRECOVERABLE_TAX"].includes(row.componentBucket)) continue;
    const sign = row.componentBucket === "COST_REDUCTION" ? -1 : 1;
    result.set(row.sourceLineId, (result.get(row.sourceLineId) ?? 0) + sign * row.amount);
  }
  return result;
}

export async function handleReverseReceipt(
  db:  AnyDb,
  ctx: ReceiptPostingCtx,
): Promise<ReceiptPostingResult> {
  const claim = await claimHookExecution(db, {
    tenantId:           ctx.tenantId,
    executionToken:     ctx.executionToken,
    hookActionKey:      "p2p.receipt.reverse",
    transitionId:       ctx.transitionId,
    sourceDocType:      "receipt",
    sourceDocId:        ctx.receiptId,
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
      const header = await loadReceiptHeader(trx, ctx.tenantId, ctx.receiptId);
      if (!header) return failure("RECEIPT_NOT_FOUND", "Receipt not found.");

      // Accept both 'posted' (route-handler call) and 'reversed' (transition-
      // hook call where the lifecycle already advanced the status). is_posted
      // is the authoritative "has been posted" gate; status='reversed' with
      // is_posted=true is the "needs reversal work" mid-transition state.
      if (header.status !== "posted" && header.status !== "reversed") {
        return failure(
          "RECEIPT_NOT_REVERSIBLE",
          `Receipt must be 'posted' or 'reversed' to run reversal (currently '${header.status}').`,
        );
      }
      if (!header.is_posted) {
        return failure(
          "RECEIPT_NOT_REVERSIBLE",
          "Receipt is not posted — nothing to reverse.",
        );
      }
      const accrualJeId = await loadAccrualJeId(trx, ctx.tenantId, ctx.receiptId);
      if (!accrualJeId) {
        return failure("RECEIPT_HAS_NO_JE", "Receipt has no accrual_je_id; cannot build compensating JE.");
      }
      if (await reversalJeExists(trx, ctx.tenantId, accrualJeId)) {
        // The receipt header may still show is_posted=true even after a
        // prior reversal landed (because we don't flip is_posted on the
        // original; only the status moves to 'reversed'). The deterministic
        // signal is whether a JE with reversal_of_id=accrualJeId exists.
        return failure("RECEIPT_ALREADY_REVERSED", "Receipt has already been reversed.");
      }

      const lines = await loadReceiptLines(trx, ctx.tenantId, ctx.receiptId);
      if (lines.length === 0) {
        return failure("RECEIPT_NO_LINES", "Receipt has no lines — nothing to reverse.");
      }

      // ── 2. Resolve reversal-period posting infrastructure ────────────────
      const reversalPeriod = await resolveCurrentOpenPeriod(
        trx, ctx.tenantId, header.company_code_id,
      );
      if (!reversalPeriod) {
        return failure(
          "NO_OPEN_PERIOD",
          "No open fiscal period covers CURRENT_DATE for the receipt's company.",
        );
      }

      const bookId = await resolveStatutoryBookId(trx, ctx.tenantId, header.company_code_id);
      if (!bookId) return failure("NO_LEDGER_BOOK", "No statutory ledger book assigned to this company.");

      const clearingAccountId = await resolveSubledgerAccount(
        trx, ctx.tenantId, header.company_code_id, "gr_ir_clearing",
      );
      if (!clearingAccountId) {
        return failure(
          "NO_GR_IR_CLEARING_ACCOUNT",
          "No GR/IR clearing account found on this company's chart.",
        );
      }

      const exchangeRate = Number(header.exchange_rate ?? 1);
      const componentProjection = await loadAndProjectComponentAccounting(trx, {
        tenantId: ctx.tenantId, sourceDocType: "receipt_line", sourceDocId: ctx.receiptId,
      });
      const projectedCostByLine = distributableCostByLine(componentProjection.allocations);

      // ── 3. Per-line posting accounts (mirror the original resolution) ────
      const linePostings: Array<{
        line:       ReceiptLine;
        accountId:  string;
        amount:     number;
        baseAmount: number;
      }> = [];
      for (const line of lines) {
        const accountId = await resolveInventoryOrExpenseAccount(
          trx, ctx.tenantId, header.company_code_id,
          line.commodity_category_id, line.asset_class_id !== null,
        );
        if (!accountId) {
          return failure(
            "NO_POSTING_ACCOUNT",
            `No posting account for receipt line ${line.line_no} (commodity_category_id=${line.commodity_category_id ?? "null"}).`,
          );
        }
        const amount     = projectedCostByLine.get(line.id)
          ?? Number(line.accepted_quantity) * Number(line.unit_price);
        const baseAmount = amount * exchangeRate;
        linePostings.push({ line, accountId, amount, baseAmount });
      }
      const totalAmount     = linePostings.reduce((sum, p) => sum + p.amount, 0);
      const totalBaseAmount = linePostings.reduce((sum, p) => sum + p.baseAmount, 0);

      // ── 4. Create compensating journal_entry ─────────────────────────────
      const jeNumber    = await nextJeNumber(trx, ctx.tenantId, header.company_code_id);
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
          'receipt'::text,
          ${ctx.receiptId}::uuid,
          ${reversalPeriod.id}::uuid,
          ${reversalPeriod.fiscal_year}::smallint,
          ${reversalPeriod.period_number}::smallint,
          ${reversalDate}::date,
          ${reversalDate}::date,
          ${header.currency_code}::char(3),
          ${header.base_currency_code}::char(3),
          ${totalBaseAmount}::numeric,
          ${totalBaseAmount}::numeric,
          ${ctx.remarks ?? `Reversal of Receipt ${header.receipt_number}`}::text,
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
      // Dr GR/IR Clearing for the total (one line, first), then Cr per-line
      // expense/inventory for the corresponding amount. The original
      // posting was Dr Expense / Cr Clearing, so the reversal swaps sides.
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
        description:     `GR/IR clearing reversal — Receipt ${header.receipt_number}`,
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
          description:     `Reversal of Receipt ${header.receipt_number} line ${p.line.line_no} — ${p.line.item_description}`,
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
        sourceDocType:      "receipt",
        sourceDocId:        ctx.receiptId,
        transitionEventSeq: ctx.transitionEventSeq,
        principalId:        ctx.principalId,
      });

      // ── 7. commitment_fulfillment reversal rows ──────────────────────────
      // One per receipt_line — pointed at the original fulfillment row so
      // the trigger that maintains commitment_line.received_quantity sees
      // the offset and restores the cached qty.
      for (const p of linePostings) {
        const originalFulfillmentId = await findOriginalFulfillment(
          trx, ctx.tenantId, header.commitment_id, ctx.receiptId, p.line.id,
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
            'GRN'::text,
            'receipt'::text,
            ${ctx.receiptId}::uuid,
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
              commitment_line_id: p.line.commitment_line_id,
              receipt_line_id:    p.line.id,
              accepted_quantity:  p.line.accepted_quantity,
              reversal_of_je_id:  accrualJeId,
            })}::jsonb,
            ${ctx.principalId}::uuid
          )
        `.execute(trx);
      }

      // ── 8. inventory_movement REVERSAL rows per stocked line ─────────────
      // movement_type='REVERSAL' + reversal_of_id is required by im_reversal_ref_chk.
      // Quantity is signed negative (since the original RECEIPT was positive).
      for (const p of linePostings) {
        if (p.line.asset_class_id) continue;  // asset lines didn't write inventory in the forward path
        const originalMovementId = await findOriginalReceiptMovement(
          trx, ctx.tenantId, ctx.receiptId, p.line.id, p.line.item_id, p.line.warehouse_id,
        );
        if (!originalMovementId) {
          return failure(
            "INVENTORY_MOVEMENT_NOT_FOUND",
            `Original inventory_movement for receipt line ${p.line.line_no} not found; cannot write reversal.`,
          );
        }
        await sql`
          INSERT INTO ledger.inventory_movement (
            tenant_id, company_code_id,
            item_id, warehouse_id,
            movement_type,
            quantity, unit_cost,
            currency_code,
            ref_doc_type, ref_doc_id,
            reversal_of_id,
            performed_at, performed_by,
            metadata,
            created_by
          ) VALUES (
            ${ctx.tenantId}::uuid,
            ${header.company_code_id}::uuid,
            ${p.line.item_id}::uuid,
            ${p.line.warehouse_id}::uuid,
            'REVERSAL'::text,
            ${-Number(p.line.accepted_quantity)}::numeric,
            ${p.line.unit_price}::numeric,
            ${header.currency_code}::char(3),
            'receipt'::text,
            ${ctx.receiptId}::uuid,
            ${originalMovementId}::uuid,
            now(),
            ${ctx.principalId}::uuid,
            ${JSON.stringify({ receipt_line_id: p.line.id, reversal_of_je_id: accrualJeId })}::jsonb,
            ${ctx.principalId}::uuid
          )
        `.execute(trx);
      }

      // ── 9. Stamp the receipt header ──────────────────────────────────────
      // status flips to 'reversed' (the rcp_status_chk allows it); we leave
      // is_posted=true so the audit trail records the receipt was actually
      // posted before reversal. is_reversal stays false — that flag is
      // reserved for receipts that are themselves "credit receipts"
      // mirroring an original, which isn't the model used here.
      await sql`
        UPDATE document.receipt
           SET status            = 'reversed',
               status_changed_at = now(),
               status_changed_by = ${ctx.principalId}::uuid,
               updated_at        = now(),
               updated_by        = ${ctx.principalId}::uuid,
               row_version       = row_version + 1
         WHERE id        = ${ctx.receiptId}::uuid
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
      : "RECEIPT_REVERSAL_FAILED";
    const message  = err instanceof Error ? err.message : String(err);
    await markHookFailed(db, claim.id, code, message, duration);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Reversal helpers
// ──────────────────────────────────────────────────────────────────────────────

async function loadAccrualJeId(
  db: AnyDb, tenantId: string, receiptId: string,
): Promise<string | null> {
  const result = await sql<{ accrual_je_id: string | null }>`
    SELECT accrual_je_id::text AS accrual_je_id
      FROM document.receipt
     WHERE id = ${receiptId}::uuid
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

async function findOriginalFulfillment(
  db: AnyDb, tenantId: string, commitmentId: string,
  receiptId: string, receiptLineId: string,
): Promise<string | null> {
  const result = await sql<{ id: string }>`
    SELECT id::text
      FROM ledger.commitment_fulfillment
     WHERE tenant_id        = ${tenantId}::uuid
       AND commitment_id    = ${commitmentId}::uuid
       AND reference_doc_id = ${receiptId}::uuid
       AND reference_line_id = ${receiptLineId}::uuid
       AND is_reversal      = false
     ORDER BY created_at
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
}

async function findOriginalReceiptMovement(
  db: AnyDb, tenantId: string, receiptId: string,
  receiptLineId: string, itemId: string, warehouseId: string,
): Promise<string | null> {
  // The forward inventory_movement INSERT references ref_doc_id=receiptId
  // but does NOT store receipt_line_id in a queryable column (it lives in
  // metadata). We need the per-line link to set reversal_of_id correctly,
  // so we filter by (item, warehouse) to disambiguate when multiple
  // receipt lines share the same receipt.
  const result = await sql<{ id: string }>`
    SELECT id::text
      FROM ledger.inventory_movement
     WHERE tenant_id    = ${tenantId}::uuid
       AND movement_type = 'RECEIPT'
       AND ref_doc_type = 'receipt'
       AND ref_doc_id   = ${receiptId}::uuid
       AND item_id      = ${itemId}::uuid
       AND warehouse_id = ${warehouseId}::uuid
       AND (metadata->>'receipt_line_id')::text = ${receiptLineId}::text
     ORDER BY performed_at
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.id ?? null;
}
