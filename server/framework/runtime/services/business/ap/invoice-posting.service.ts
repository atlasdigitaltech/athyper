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
  isAsset:         boolean,
): Promise<string | null> {

  // 1. Spend category → posting role → account
  if (spendCategoryId) {
    const scResult = await sql<{ account_id: string }>`
      SELECT pra.account_id
      FROM   control.posting_role_assignment pra
      JOIN   master.spend_category sc ON sc.posting_role_id = pra.posting_role_id
      WHERE  sc.id = ${spendCategoryId}
        AND  sc.tenant_id = ${tenantId}
        AND  pra.company_code_id = ${companyId}
        AND  pra.is_active = true
        AND  pra.account_side = 'debit'
      LIMIT  1
    `.execute(db);
    if (scResult.rows[0]) return scResult.rows[0].account_id;
  }

  // 2. Business intent → posting role → account
  if (businessIntentId) {
    const biResult = await sql<{ account_id: string }>`
      SELECT pra.account_id
      FROM   control.posting_role_assignment pra
      JOIN   master.business_intent bi ON bi.posting_role_id = pra.posting_role_id
      WHERE  bi.id = ${businessIntentId}
        AND  bi.tenant_id = ${tenantId}
        AND  pra.company_code_id = ${companyId}
        AND  pra.is_active = true
        AND  pra.account_side = 'debit'
      LIMIT  1
    `.execute(db);
    if (biResult.rows[0]) return biResult.rows[0].account_id;
  }

  // 3. Asset or expense default from company
  const defaultCol = isAsset ? "default_asset_account_id" : "default_expense_account_id";
  const ccResult = await sql<{ account_id: string }>`
    SELECT ${sql.raw(defaultCol)} AS account_id
    FROM   master.company_code
    WHERE  id = ${companyId} AND tenant_id = ${tenantId}
    LIMIT  1
  `.execute(db);

  return ccResult.rows[0]?.account_id ?? null;
}

async function resolveApControlAccount(
  db:        AnyDb,
  tenantId:  string,
  companyId: string,
): Promise<string | null> {
  const result = await sql<{ account_id: string }>`
    SELECT pra.account_id
    FROM   control.posting_role_assignment pra
    JOIN   control.posting_role pr ON pr.id = pra.posting_role_id
    WHERE  pr.code           = 'ap_control'
      AND  pr.tenant_id      = ${tenantId}
      AND  pra.company_code_id = ${companyId}
      AND  pra.is_active     = true
      AND  pra.account_side  = 'credit'
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

  const remarks = typeof body["remarks"] === "string" ? body["remarks"] : undefined;

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
    const postingDate = invoice["posting_date"] ? new Date(String(invoice["posting_date"])) : now;
    const fpResult = await sql<{ id: string; fiscal_year: number; period_number: number }>`
      SELECT id, fiscal_year, period_number
      FROM   master.fiscal_period
      WHERE  tenant_id  = ${tenantId}
        AND  start_date <= ${postingDate}
        AND  end_date   >= ${postingDate}
        AND  is_closed  = false
      ORDER  BY start_date DESC
      LIMIT  1
    `.execute(trx);

    const fp = fpResult.rows[0];
    if (!fp) {
      return { status: 422, body: { error: "NO_OPEN_PERIOD", message: "No open fiscal period for the invoice posting date" } };
    }

    // ── Create journal_entry ──────────────────────────────────────────────
    const jeCode = await nextJeCode(trx, tenantId, companyId);

    const totalPayable = Number(invoice["payable_amount"] ?? invoice["total_amount"] ?? 0);
    const totalBase    = totalPayable * exchangeRate;

    const jeResult = await sql<{ id: string }>`
      INSERT INTO document.journal_entry (
        tenant_id, code, name, company_code_id,
        source_doc_type, source_doc_id,
        entry_type, fiscal_period_id, posting_date,
        currency_code, base_currency_code, exchange_rate,
        debit_total, credit_total,
        description, status,
        created_by, created_at
      ) VALUES (
        ${tenantId}, ${jeCode},
        ${"AP Invoice — " + String(invoice["invoice_number"] ?? "")},
        ${companyId},
        'purchase_invoice', ${invoiceId},
        'invoice', ${fp.id}, ${postingDate},
        ${currencyCode}, ${baseCurrencyCode}, ${exchangeRate},
        ${totalPayable}, ${totalPayable},
        ${remarks ?? ("AP Invoice " + String(invoice["invoice_number"] ?? ""))},
        'posted',
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
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
            message: `No posting account found for line ${line.line_no} (${line.item_description}). Configure spend_category or business_intent posting rules.`,
          },
        };
      }

      const lineNetBase  = Number(line.net_amount) * exchangeRate;
      const lineTaxBase  = Number(line.tax_amount) * exchangeRate;
      const debitAmount  = Number(line.net_amount) + Number(line.tax_amount);
      const debitBase    = lineNetBase + lineTaxBase;

      await sql`
        INSERT INTO document.journal_line (
          tenant_id, journal_entry_id, line_no, account_id,
          company_code_id,
          debit_amount, credit_amount, base_debit, base_credit,
          currency_code, base_currency_code, exchange_rate,
          description,
          cost_center_id, profit_center_id, project_id,
          source_doc_type, source_doc_id, source_line_id,
          subledger_type, subledger_id,
          posting_date, fiscal_period_id,
          created_by, created_at
        ) VALUES (
          ${tenantId}, ${jeId}, ${lineSeq}, ${debitAccount},
          ${companyId},
          ${debitAmount}, 0, ${debitBase}, 0,
          ${currencyCode}, ${baseCurrencyCode}, ${exchangeRate},
          ${line.item_description},
          ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
          'purchase_invoice', ${invoiceId}, ${line.id},
          'supplier', ${invoice["supplier_id"] ?? null},
          ${postingDate}, ${fp.id},
          ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
        )
      `.execute(trx);

      // Write accounting_distribution
      await sql`
        INSERT INTO document.accounting_distribution (
          tenant_id, journal_entry_id, journal_line_no,
          source_doc_type, source_doc_id, source_line_id,
          account_id, debit_amount, credit_amount,
          cost_center_id, profit_center_id, project_id,
          spend_category_id, business_intent_id,
          created_by, created_at
        ) VALUES (
          ${tenantId}, ${jeId}, ${lineSeq},
          'purchase_invoice', ${invoiceId}, ${line.id},
          ${debitAccount}, ${debitAmount}, 0,
          ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
          ${line.spend_category_id ?? null}, ${line.business_intent_id ?? null},
          ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
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
        tenant_id, journal_entry_id, line_no, account_id,
        company_code_id,
        debit_amount, credit_amount, base_debit, base_credit,
        currency_code, base_currency_code, exchange_rate,
        description,
        source_doc_type, source_doc_id,
        subledger_type, subledger_id,
        posting_date, fiscal_period_id,
        created_by, created_at
      ) VALUES (
        ${tenantId}, ${jeId}, ${lineSeq}, ${apControlAccountId},
        ${companyId},
        0, ${totalPayable}, 0, ${totalBase},
        ${currencyCode}, ${baseCurrencyCode}, ${exchangeRate},
        ${"AP Control — " + String(invoice["supplier_name"] ?? String(invoice["supplier_id"] ?? ""))},
        'purchase_invoice', ${invoiceId},
        'supplier', ${invoice["supplier_id"] ?? null},
        ${postingDate}, ${fp.id},
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
      )
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

  const remarks = typeof body["remarks"] === "string" ? body["remarks"] : "Invoice reversal";

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
      WHERE  tenant_id  = ${tenantId}
        AND  start_date <= ${now}
        AND  end_date   >= ${now}
        AND  is_closed  = false
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
        tenant_id, code, name, company_code_id,
        source_doc_type, source_doc_id,
        entry_type, fiscal_period_id, posting_date,
        currency_code, base_currency_code, exchange_rate,
        debit_total, credit_total,
        description, status,
        created_by, created_at
      )
      SELECT
        tenant_id, ${revJeCode},
        'Reversal — ' || name, company_code_id,
        source_doc_type, source_doc_id,
        'reversal', ${fp.id}, ${now},
        currency_code, base_currency_code, ${exchangeRate},
        ${totalPayable}, ${totalPayable},
        ${remarks}, 'posted',
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
      FROM document.journal_entry WHERE id = ${originalJeId}
      RETURNING id
    `.execute(trx);

    const revJeId = revJeResult.rows[0]?.id;
    if (!revJeId) return { status: 500, body: { error: "REVERSAL_JE_FAILED" } };

    // Mirror all lines with swapped debit/credit
    await sql`
      INSERT INTO document.journal_line (
        tenant_id, journal_entry_id, line_no, account_id, company_code_id,
        debit_amount, credit_amount, base_debit, base_credit,
        currency_code, base_currency_code, exchange_rate,
        description, cost_center_id, profit_center_id, project_id,
        source_doc_type, source_doc_id, source_line_id,
        subledger_type, subledger_id,
        posting_date, fiscal_period_id,
        created_by, created_at
      )
      SELECT
        tenant_id, ${revJeId}, line_no, account_id, company_code_id,
        credit_amount, debit_amount, base_credit, base_debit,
        currency_code, base_currency_code, exchange_rate,
        'Reversal — ' || description, cost_center_id, profit_center_id, project_id,
        source_doc_type, source_doc_id, source_line_id,
        subledger_type, subledger_id,
        ${now}, ${fp.id},
        ${principalId ?? "00000000-0000-0000-0000-000000000000"}, ${now}
      FROM document.journal_line WHERE journal_entry_id = ${originalJeId}
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
