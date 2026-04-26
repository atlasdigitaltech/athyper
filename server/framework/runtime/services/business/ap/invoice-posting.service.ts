/**
 * Invoice Posting Service — flow:post_invoice | flow:reverse_invoice
 *
 * handlePostInvoice:
 *   Validates the invoice is approved, runs matching pre-flight, then:
 *   1. Creates document.journal_entry (AP entry header)
 *   2. Creates document.journal_line rows:
 *        DR  Expense/Asset account per line (from posting_role config or accounting_distribution)
 *        CR  AP Control account (from posting_role 'ap_control')
 *   3. Creates document.accounting_distribution rows linking each line to the JE
 *   4. Updates commitment_line.invoiced_quantity for PO-based lines
 *   5. Creates document.asset_transaction for is_asset lines
 *   6. Updates invoice: status → 'posted', ap_je_id, is_posted, posted_at/by
 *
 * handleReverseInvoice:
 *   Creates a credit-note (reversal) invoice that mirrors this invoice with
 *   all amounts negated. status → 'reversed' on the original.
 *
 * Posting account resolution:
 *   1. Line's spend_category → control.posting_role → account mapping
 *   2. Line's business_intent → control.posting_role mapping
 *   3. Company default expense account (master.company_code.default_expense_account_id)
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { matchInvoice } from "./invoice-match.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface HandlerResult {
  status: number;
  body:   Record<string, unknown>;
}

// ── Account resolution ────────────────────────────────────────────────────────

async function resolvePostingAccount(
  db:              AnyDb,
  tenantId:        string,
  companyId:       string,
  spendCategoryId: string | null,
  businessIntentId: string | null,
  _isAsset:        boolean,
): Promise<string | null> {

  // 1. Spend category → default_intent_id → business_intent.default_gl_account_id
  if (spendCategoryId) {
    const scResult = await sql<{ account_id: string }>`
      SELECT bi.default_gl_account_id AS account_id
      FROM   master.spend_category sc
      JOIN   master.business_intent bi ON bi.id = sc.default_intent_id
      WHERE  sc.id        = ${spendCategoryId}
        AND  sc.tenant_id = ${tenantId}
        AND  bi.default_gl_account_id IS NOT NULL
      LIMIT  1
    `.execute(db);
    if (scResult.rows[0]) return scResult.rows[0].account_id;
  }

  // 2. Business intent → default_gl_account_id
  if (businessIntentId) {
    const biResult = await sql<{ account_id: string }>`
      SELECT default_gl_account_id AS account_id
      FROM   master.business_intent
      WHERE  id        = ${businessIntentId}
        AND  tenant_id = ${tenantId}
        AND  default_gl_account_id IS NOT NULL
      LIMIT  1
    `.execute(db);
    if (biResult.rows[0]) return biResult.rows[0].account_id;
  }

  // 3. Fallback: first posting-type expense account on the company's active chart
  const fallbackResult = await sql<{ account_id: string }>`
    SELECT ga.id AS account_id
    FROM   master.gl_account ga
    JOIN   master.company_code_chart_assignment cca
           ON  cca.chart_of_account_id = ga.chart_of_account_id
           AND cca.tenant_id           = ${tenantId}
           AND cca.company_code_id     = ${companyId}
           AND cca.status              = 'active'
    WHERE  ga.tenant_id     = ${tenantId}
      AND  ga.account_class = 'expense'
      AND  ga.is_active     = true
      AND  ga.node_type     = 'posting'
    ORDER  BY ga.sort_order, ga.code
    LIMIT  1
  `.execute(db);
  if (fallbackResult.rows[0]) return fallbackResult.rows[0].account_id;

  return null;
}

async function resolveApControlAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  // Find the AP subledger account from the company's operating chart assignment.
  // subledger_type = 'ap' identifies the trade payables control account (IFRS-L-AP-TRADE).
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

// ── JE code generation ─────────────────────────────────────────────────────────

async function nextJeCode(db: AnyDb, tenantId: string, companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const num = await sql<{ n: number }>`
    SELECT master.fn_next_document_number(
      ${tenantId}::uuid, ${companyId}::uuid, 'journal_entry', ${year}::smallint
    ) AS n
  `.execute(db);
  return String(num.rows[0]?.n ?? `JE-${year}-${Date.now()}`);
}

// ── Post invoice ──────────────────────────────────────────────────────────────

export async function handlePostInvoice(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string | null,
  body:        Record<string, unknown>,
  logger?:     { info(e: string, f?: Record<string, unknown>): void; warn(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  const remarks = typeof body["remarks"] === "string" ? body["remarks"]
    : typeof body["notes"] === "string" ? body["notes"] : undefined;

  return db.transaction().execute(async (trx) => {

    // Load + lock invoice
    const invResult = await sql<Record<string, unknown>>`
      SELECT * FROM document.purchase_invoice
      WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
      LIMIT 1 FOR UPDATE
    `.execute(trx);

    const invoice = invResult.rows[0];
    if (!invoice) return { status: 404, body: { error: "INVOICE_NOT_FOUND" } };

    const currentStatus = String(invoice["status"] ?? "").toLowerCase();
    if (currentStatus !== "approved") {
      return {
        status: 422,
        body: { error: "INVALID_STATUS", message: `Invoice is in '${currentStatus}' — only approved invoices can be posted` },
      };
    }

    // Must have lines
    const lineCount = Number(invoice["line_count"] ?? 0);
    if (lineCount === 0) {
      return { status: 422, body: { error: "NO_LINES", message: "Invoice has no lines to post" } };
    }

    const companyId       = String(invoice["company_code_id"] ?? "");
    const currencyCode    = String(invoice["currency_code"] ?? "");
    const baseCurrencyCode = String(invoice["base_currency_code"] ?? currencyCode);
    const exchangeRate    = Number(invoice["exchange_rate"] ?? 1) || 1;
    const invoiceSource   = String(invoice["invoice_source"] ?? "non_po");
    const now             = new Date();

    // Run matching (for PO-based — informational pre-flight, not blocking unless exception)
    if (invoiceSource === "po_based" || invoiceSource === "contract_based") {
      const matchResult = await matchInvoice(trx, tenantId, invoiceId, principalId, logger);
      if (matchResult.invoiceStatus === "match_exception") {
        return {
          status: 422,
          body: {
            error:       "MATCH_EXCEPTION",
            message:     "Invoice has unresolved matching exceptions. Resolve exceptions before posting.",
            exceptions:  matchResult.exceptions,
          },
        };
      }
    }

    // Load lines
    const linesResult = await sql<{
      id: string; line_no: number; item_description: string;
      quantity: number; unit_price: number; net_amount: number;
      tax_amount: number; withholding_tax_amount: number;
      spend_category_id: string | null; business_intent_id: string | null;
      cost_center_id: string | null; profit_center_id: string | null; project_id: string | null;
      is_asset: boolean; asset_category_id: string | null;
      commitment_line_id: string | null;
    }>`
      SELECT id, line_no, item_description, quantity, unit_price, net_amount,
             tax_amount, withholding_tax_amount,
             spend_category_id, business_intent_id,
             cost_center_id, profit_center_id, project_id,
             is_asset, asset_category_id, commitment_line_id
      FROM   document.purchase_invoice_line
      WHERE  purchase_invoice_id = ${invoiceId} AND tenant_id = ${tenantId}
      ORDER  BY line_no
    `.execute(trx);

    const lines = linesResult.rows;

    // Resolve AP Control account
    const apControlAccountId = await resolveApControlAccount(trx, tenantId, companyId);
    if (!apControlAccountId) {
      return {
        status: 422,
        body: { error: "NO_AP_CONTROL_ACCOUNT", message: "No AP Control posting role account configured for this company" },
      };
    }

    // Resolve fiscal period for posting_date
    // Priority: body.posting_date → invoice.posting_date → now
    const bodyDate = body["posting_date"] as string | undefined;
    const postingDate = bodyDate
      ? new Date(bodyDate)
      : invoice["posting_date"] ? new Date(String(invoice["posting_date"])) : now;
    const fpResult = await sql<{ id: string; fiscal_year: number; period_number: number }>`
      SELECT id, fiscal_year, period_number
      FROM   master.fiscal_period
      WHERE  tenant_id       = ${tenantId}
        AND  company_code_id = ${companyId}
        AND  start_date     <= ${postingDate}
        AND  end_date       >= ${postingDate}
        AND  status         IN ('open', 'soft_close')
      ORDER  BY start_date DESC
      LIMIT  1
    `.execute(trx);

    const fp = fpResult.rows[0];
    if (!fp) {
      return { status: 422, body: { error: "NO_OPEN_PERIOD", message: "No open fiscal period for the invoice posting date" } };
    }

    // Resolve ledger book: prefer company.default_ledger_book_id, fall back to
    // highest-priority statutory assignment from company_code_book_assignment.
    const bookRes = await sql<{ book_id: string }>`
      SELECT COALESCE(
        cc.default_ledger_book_id,
        (SELECT ba.book_id
         FROM   master.company_code_book_assignment ba
         JOIN   master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
         WHERE  ba.tenant_id      = ${tenantId}
           AND  ba.company_code_id = ${companyId}
           AND  ba.status         = 'active'
           AND  lb.category       = 'statutory'
           AND  lb.status         = 'active'
         ORDER  BY ba.priority DESC
         LIMIT  1)
      ) AS book_id
      FROM   master.company_code cc
      WHERE  cc.id = ${companyId} AND cc.tenant_id = ${tenantId}
    `.execute(trx);
    const bookId = bookRes.rows[0]?.book_id ?? null;
    if (!bookId) {
      return { status: 422, body: { error: "NO_LEDGER_BOOK", message: "No statutory ledger book assigned to this company" } };
    }

    // ── Create journal_entry ──────────────────────────────────────────────
    const jeCode = await nextJeCode(trx, tenantId, companyId);

    const totalPayable = Number(invoice["payable_amount"] ?? invoice["total_amount"] ?? 0);
    const totalBase    = totalPayable * exchangeRate;

    const jeResult = await sql<{ id: string }>`
      INSERT INTO document.journal_entry (
        tenant_id, je_number, company_code_id, book_id,
        source_doc_type, source_doc_id,
        fiscal_period_id, fiscal_year, period_number,
        document_date, posting_date,
        transaction_currency, base_currency,
        total_debit, total_credit,
        description, status,
        created_by
      ) VALUES (
        ${tenantId}, ${jeCode}, ${companyId}, ${bookId},
        'purchase_invoice', ${invoiceId},
        ${fp.id}, ${fp.fiscal_year}, ${fp.period_number},
        ${postingDate}, ${postingDate},
        ${currencyCode}, ${baseCurrencyCode},
        0, 0,
        ${remarks ?? ("AP Invoice " + String(invoice["invoice_number"] ?? ""))},
        'draft',
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}
      )
      RETURNING id
    `.execute(trx);

    const jeId = jeResult.rows[0]?.id;
    if (!jeId) return { status: 500, body: { error: "JE_CREATE_FAILED" } };

    // ── Create journal_lines: one DR per invoice line + one CR for AP Control ─
    let lineSeq = 10;

    for (const line of lines) {
      const debitAccount = await resolvePostingAccount(
        trx, tenantId, companyId,
        line.spend_category_id,
        line.business_intent_id,
        line.is_asset,
      );

      if (!debitAccount) {
        return {
          status: 422,
          body: {
            error:   "NO_EXPENSE_ACCOUNT",
            message: `No expense GL account found for line ${line.line_no} (${line.item_description}). Assign a spend_category, business_intent, or ensure the company chart has at least one active posting-type expense account.`,
          },
        };
      }

      const lineNetBase  = Number(line.net_amount) * exchangeRate;
      const lineTaxBase  = Number(line.tax_amount) * exchangeRate;
      const debitAmount  = Number(line.net_amount) + Number(line.tax_amount);
      const debitBase    = lineNetBase + lineTaxBase;

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
          ${tenantId}, ${jeId}, ${lineSeq}, ${debitAccount},
          ${companyId}, ${bookId},
          ${fp.id}, ${fp.fiscal_year}, ${fp.period_number}, ${postingDate},
          ${currencyCode}, ${debitAmount}, 0,
          ${baseCurrencyCode}, ${debitBase}, 0, ${exchangeRate},
          ${line.item_description},
          ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
          ${line.id},
          ${principalId ?? "00000000-0000-0000-0000-000000000000"}
        )
      `.execute(trx);

      // Write accounting_distribution
      await sql`
        INSERT INTO document.accounting_distribution (
          tenant_id,
          source_doc_type, source_doc_id, source_line_id,
          distribution_no, distribution_basis, split_pct,
          distributed_amount, currency_code,
          account_source, gl_account_id,
          business_intent_id, spend_category_id,
          cost_center_id, profit_center_id, project_id,
          created_by
        ) VALUES (
          ${tenantId},
          'PURCHASE_INVOICE_LINE', ${invoiceId}, ${line.id},
          1, 'PERCENT', 100,
          ${debitAmount}, ${currencyCode},
          'FIXED', ${debitAccount},
          ${line.business_intent_id ?? null}, ${line.spend_category_id ?? null},
          ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
          ${principalId ?? "00000000-0000-0000-0000-000000000000"}
        )
        ON CONFLICT DO NOTHING
      `.execute(trx);

      lineSeq += 10;

      // ── Update commitment_line.invoiced_quantity ──────────────────────
      if (line.commitment_line_id) {
        await sql`
          UPDATE document.commitment_line
             SET invoiced_quantity = COALESCE(invoiced_quantity, 0) + ${Number(line.quantity)},
                 updated_at = now()
           WHERE id = ${line.commitment_line_id} AND tenant_id = ${tenantId}
        `.execute(trx);
      }

      // ── Create asset_transaction for capital lines ────────────────────
      if (line.is_asset && line.asset_category_id) {
        await sql`
          INSERT INTO document.asset_transaction (
            tenant_id, company_code_id,
            asset_id, asset_book_id, book_type, txn_type,
            amount, currency_code,
            effective_date, fiscal_year, period_number,
            reference_je_id,
            performed_by, performed_at,
            status, created_by, created_at
          )
          SELECT
            ${tenantId}, ${companyId},
            a.id, ab.id, ab.book_type, 'capitalize',
            ${Number(line.net_amount)}, ${currencyCode},
            ${postingDate}, ${fp.fiscal_year}, ${fp.period_number},
            ${jeId},
            ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now},
            'posted',
            ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
          FROM master.asset a
          JOIN master.asset_book ab ON ab.asset_id = a.id AND ab.tenant_id = ${tenantId}
          WHERE a.tenant_id = ${tenantId}
            AND a.asset_class_id = ${line.asset_category_id}
            AND a.source_invoice_line_id = ${line.id}
          LIMIT 1
        `.execute(trx);
      }
    }

    // CR: AP Control — credit the full payable amount
    await sql`
      INSERT INTO document.journal_line (
        tenant_id, journal_entry_id, line_no, gl_account_id,
        company_code_id, book_id,
        fiscal_period_id, fiscal_year, period_number, posting_date,
        transaction_currency, transaction_debit, transaction_credit,
        base_currency, base_debit, base_credit, exchange_rate,
        description,
        subledger_type,
        party_type, party_id,
        created_by
      ) VALUES (
        ${tenantId}, ${jeId}, ${lineSeq}, ${apControlAccountId},
        ${companyId}, ${bookId},
        ${fp.id}, ${fp.fiscal_year}, ${fp.period_number}, ${postingDate},
        ${currencyCode}, 0, ${totalPayable},
        ${baseCurrencyCode}, 0, ${totalBase}, ${exchangeRate},
        ${"AP Control — " + String(invoice["supplier_name"] ?? String(invoice["supplier_id"] ?? ""))},
        'ap',
        'supplier', ${invoice["supplier_id"] ?? null},
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}
      )
    `.execute(trx);

    // ── Transition JE: draft → created (validates balance, caches totals) ────────
    await sql`
      UPDATE document.journal_entry
         SET status = 'created'
       WHERE id = ${jeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // ── Transition JE: created → posted ──────────────────────────────────────
    await sql`
      UPDATE document.journal_entry
         SET status     = 'posted',
             posted_at  = ${now},
             posted_by  = ${principalId ?? "00000000-0000-0000-0000-000000000000"}
       WHERE id = ${jeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // ── Update invoice: posted ────────────────────────────────────────────
    const updated = await sql<Record<string, unknown>>`
      UPDATE document.purchase_invoice
         SET status            = 'posted',
             ap_je_id          = ${jeId},
             is_posted         = true,
             posted_at         = ${now},
             posted_by         = ${principalId},
             fiscal_year       = ${fp.fiscal_year},
             period_number     = ${fp.period_number},
             status_changed_at = ${now},
             status_changed_by = ${principalId},
             updated_at        = ${now},
             updated_by        = ${principalId}
       WHERE id = ${invoiceId} AND tenant_id = ${tenantId} AND status = 'approved'
       RETURNING *
    `.execute(trx);

    if (!updated.rows[0]) {
      return { status: 409, body: { error: "CONFLICT", message: "Invoice was modified concurrently — please retry" } };
    }

    logger?.info("ap_invoice_posted", { tenantId, invoiceId, jeId, jeCode });
    return { status: 200, body: { ok: true, record: updated.rows[0], journal_entry_id: jeId, journal_entry_code: jeCode } };
  });
}


// ── Reverse invoice ───────────────────────────────────────────────────────────

export async function handleReverseInvoice(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string | null,
  body:        Record<string, unknown>,
  logger?:     { info(e: string, f?: Record<string, unknown>): void; warn(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  const remarks = typeof body["remarks"] === "string" ? body["remarks"]
    : typeof body["notes"] === "string" ? body["notes"] : "Invoice reversal";

  return db.transaction().execute(async (trx) => {

    // Lock original
    const invResult = await sql<Record<string, unknown>>`
      SELECT * FROM document.purchase_invoice
      WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
      LIMIT 1 FOR UPDATE
    `.execute(trx);

    const invoice = invResult.rows[0];
    if (!invoice) return { status: 404, body: { error: "INVOICE_NOT_FOUND" } };

    const currentStatus = String(invoice["status"] ?? "").toLowerCase();
    if (currentStatus !== "posted") {
      return {
        status: 422,
        body: { error: "INVALID_STATUS", message: `Only posted invoices can be reversed (current: '${currentStatus}')` },
      };
    }

    const now      = new Date();
    const companyId = String(invoice["company_code_id"] ?? "");

    // Fiscal period for reversal posting date
    const fpResult = await sql<{ id: string; fiscal_year: number; period_number: number }>`
      SELECT id, fiscal_year, period_number
      FROM   master.fiscal_period
      WHERE  tenant_id       = ${tenantId}
        AND  company_code_id = ${companyId}
        AND  start_date     <= ${now}
        AND  end_date       >= ${now}
        AND  status         IN ('open', 'soft_close')
      ORDER  BY start_date DESC
      LIMIT  1
    `.execute(trx);

    const fp = fpResult.rows[0];
    if (!fp) return { status: 422, body: { error: "NO_OPEN_PERIOD", message: "No open fiscal period for reversal" } };

    // Create reversal JE (mirror of original AP JE with negated amounts)
    const originalJeId = invoice["ap_je_id"] as string | null;
    if (!originalJeId) {
      return { status: 422, body: { error: "NO_JE", message: "Original posting journal entry not found" } };
    }

    const revJeCode = await nextJeCode(trx, tenantId, companyId);
    const totalPayable = Number(invoice["payable_amount"] ?? 0);
    const exchangeRate = Number(invoice["exchange_rate"] ?? 1) || 1;

    const revJeResult = await sql<{ id: string }>`
      INSERT INTO document.journal_entry (
        tenant_id, je_number, company_code_id, book_id,
        source_doc_type, source_doc_id,
        fiscal_period_id, fiscal_year, period_number,
        document_date, posting_date,
        transaction_currency, base_currency,
        total_debit, total_credit,
        description, is_reversal, reversal_of_id, status,
        created_by
      )
      SELECT
        tenant_id, ${revJeCode}, company_code_id, book_id,
        source_doc_type, source_doc_id,
        ${fp.id}, ${fp.fiscal_year}, ${fp.period_number},
        ${now}::date, ${now}::date,
        transaction_currency, base_currency,
        0, 0,
        ${remarks}, true, ${originalJeId}, 'draft',
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}
      FROM document.journal_entry WHERE id = ${originalJeId}
      RETURNING id
    `.execute(trx);

    const revJeId = revJeResult.rows[0]?.id;
    if (!revJeId) return { status: 500, body: { error: "REVERSAL_JE_FAILED" } };

    // Mirror all lines with swapped debit/credit
    await sql`
      INSERT INTO document.journal_line (
        tenant_id, journal_entry_id, line_no, gl_account_id,
        company_code_id, book_id,
        fiscal_period_id, fiscal_year, period_number, posting_date,
        transaction_currency, transaction_debit, transaction_credit,
        base_currency, base_debit, base_credit, exchange_rate,
        description, cost_center_id, profit_center_id, project_id,
        source_doc_line_id,
        subledger_type, party_type, party_id,
        created_by
      )
      SELECT
        tenant_id, ${revJeId}, line_no, gl_account_id,
        company_code_id, book_id,
        ${fp.id}, ${fp.fiscal_year}, ${fp.period_number}, ${now}::date,
        transaction_currency, transaction_credit, transaction_debit,
        base_currency, base_credit, base_debit, exchange_rate,
        'Reversal — ' || COALESCE(description, ''), cost_center_id, profit_center_id, project_id,
        source_doc_line_id,
        subledger_type, party_type, party_id,
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}
      FROM document.journal_line WHERE journal_entry_id = ${originalJeId}
    `.execute(trx);

    // Transition reversal JE: draft → created (validates balance) → posted
    await sql`
      UPDATE document.journal_entry SET status = 'created'
       WHERE id = ${revJeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    await sql`
      UPDATE document.journal_entry
         SET status    = 'posted',
             posted_at = ${now},
             posted_by = ${principalId ?? "00000000-0000-0000-0000-000000000000"}
       WHERE id = ${revJeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // Mark the original JE as reversed
    await sql`
      UPDATE document.journal_entry
         SET status         = 'reversed',
             reversed_by_id = ${revJeId}
       WHERE id = ${originalJeId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // Update original invoice → reversed
    const updated = await sql<Record<string, unknown>>`
      UPDATE document.purchase_invoice
         SET status            = 'reversed',
             status_changed_at = ${now},
             status_changed_by = ${principalId},
             updated_at        = ${now},
             updated_by        = ${principalId}
       WHERE id = ${invoiceId} AND tenant_id = ${tenantId} AND status = 'posted'
       RETURNING *
    `.execute(trx);

    if (!updated.rows[0]) {
      return { status: 409, body: { error: "CONFLICT", message: "Invoice was modified concurrently" } };
    }

    logger?.info("ap_invoice_reversed", { tenantId, invoiceId, revJeId });
    return {
      status: 201,
      body:   { ok: true, record: updated.rows[0], reversal_journal_entry_id: revJeId, journal_entry_code: revJeCode },
    };
  });
}
