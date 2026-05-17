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
 *   1. Line's commodity_category + business_intent -> commodity_category_buy_policy
 *   2. Line's commodity_category default buy policy
 *   3. Company chart fallback expense account
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { matchInvoice } from "./invoice-match.service.js";
import { updatePartyBalanceOnPosting } from "./advance-balance.service.js";
import { postInvoiceTaxCalculations, reverseInvoiceTaxCalculations } from "./tax-calculation.service.js";
import { deriveApInvoiceProfile } from "./acct-profile-derivation.service.js";
import { buildJeLinesFromProfile } from "./journal-from-profile.service.js";
import type { InvoiceLineCtx, InvoiceCtx, PostingCtx } from "./journal-from-profile.service.js";
import { withDomainSpan } from "../../shared/tracing.js";

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
  commodityCategoryId: string | null,
  businessIntentId: string | null,
  _isAsset:        boolean,
): Promise<string | null> {

  if (commodityCategoryId) {
    const policyResult = await sql<{ account_id: string }>`
      WITH policy_candidates AS (
        SELECT
          p.default_gl_account_id AS account_id,
          CASE WHEN p.business_intent_id = ${businessIntentId}::uuid THEN 0 ELSE 1 END AS intent_rank,
          CASE p.scope_type WHEN 'COMPANY' THEN 0 WHEN 'TENANT' THEN 1 ELSE 2 END AS scope_rank,
          p.is_default,
          p.sort_order,
          p.updated_at,
          p.created_at
        FROM control.commodity_category_buy_policy p
        WHERE p.tenant_id = ${tenantId}::uuid
          AND p.commodity_category_id = ${commodityCategoryId}::uuid
          AND p.mapping_mode = 'ALLOW'
          AND p.is_active = true
          AND p.default_gl_account_id IS NOT NULL
          AND (
            p.scope_type = 'TENANT'
            OR (p.scope_type = 'COMPANY' AND p.scope_id = ${companyId}::uuid)
          )
          AND (
            (${businessIntentId}::uuid IS NOT NULL AND (p.business_intent_id = ${businessIntentId}::uuid OR p.is_default = true))
            OR (${businessIntentId}::uuid IS NULL AND p.is_default = true)
          )
          AND p.effective_from <= current_date
          AND (p.effective_to IS NULL OR p.effective_to >= current_date)
      )
      SELECT ga.id AS account_id
      FROM policy_candidates pc
      JOIN master.gl_account ga
        ON ga.tenant_id = ${tenantId}::uuid
       AND ga.id = pc.account_id
       AND ga.is_active = true
       AND ga.node_type = 'posting'
      JOIN master.company_code_chart_assignment cca
        ON cca.tenant_id = ${tenantId}::uuid
       AND cca.company_code_id = ${companyId}::uuid
       AND cca.chart_of_account_id = ga.chart_of_account_id
       AND cca.status = 'active'
      ORDER BY pc.intent_rank, pc.scope_rank, pc.is_default DESC, pc.sort_order, pc.updated_at DESC NULLS LAST, pc.created_at DESC
      LIMIT 1
    `.execute(db);
    if (policyResult.rows[0]) return policyResult.rows[0].account_id;
  }

  // Fallback: first posting-type expense account on the company's active chart
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

async function resolveWhtPayableAccount(
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
      AND  ga.subledger_type = 'wht_payable'
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
  return withDomainSpan("finance.invoice.post", {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    actor_id: principalId ?? "system",
    operation: "post_invoice",
  }, async (span) => {
    const result = await handlePostInvoiceInner(db, tenantId, invoiceId, principalId, body, logger);
    span.setAttribute("result.status_code", result.status);
    const error = result.body["error"];
    if (typeof error === "string") span.setAttribute("result.error", error);
    const journalEntryId = result.body["journal_entry_id"];
    if (typeof journalEntryId === "string") span.setAttribute("journal_entry_id", journalEntryId);
    return result;
  });
}

async function handlePostInvoiceInner(
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
    const invoiceType     = String(invoice["invoice_type"] ?? "standard");
    // AP sign convention: credit_note = supplier credit memo (reduces liability);
    // debit_note = buyer-issued debit memo to supplier (also reduces AP liability).
    // Both invert the JE: DR AP Control / CR Expense instead of DR Expense / CR AP Control.
    const isCreditNote    = invoice["is_credit_note"] === true
                            || invoiceType === "credit_note"
                            || invoiceType === "debit_note";
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
      commodity_category_id: string | null; business_intent_id: string | null;
      cost_center_id: string | null; profit_center_id: string | null; project_id: string | null;
      is_asset: boolean; asset_category_id: string | null;
      commitment_line_id: string | null;
    }>`
      SELECT id, line_no, item_description, quantity, unit_price, net_amount,
             tax_amount, withholding_tax_amount,
             commodity_category_id, business_intent_id,
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

    // Resolve WHT payable amount and account (required when any line carries WHT)
    const totalWhtAmount = Math.abs(Number(invoice["withholding_tax_amount"] ?? 0));
    const totalWhtBase   = totalWhtAmount * exchangeRate;
    let whtPayableAccountId: string | null = null;
    if (totalWhtAmount > 0) {
      whtPayableAccountId = await resolveWhtPayableAccount(trx, tenantId, companyId);
      if (!whtPayableAccountId) {
        return {
          status: 422,
          body: {
            error:   "NO_WHT_PAYABLE_ACCOUNT",
            message: "Invoice has withholding tax but no WHT Payable GL account (subledger_type='wht_payable') is configured for this company",
          },
        };
      }
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

    // Resolve ledger book for AP postings. company.default_ledger_book_id may
    // point at a management book, so only use it when it is an active statutory
    // assignment; otherwise fall back to the active statutory assignment.
    const bookRes = await sql<{ book_id: string }>`
      SELECT COALESCE(
        (SELECT cc.default_ledger_book_id
         FROM   master.company_code cc
         JOIN   master.company_code_book_assignment dba
                ON dba.tenant_id       = cc.tenant_id
               AND dba.company_code_id = cc.id
               AND dba.book_id         = cc.default_ledger_book_id
               AND dba.status          = 'active'
         JOIN   master.ledger_book dlb
                ON dlb.id        = cc.default_ledger_book_id
               AND dlb.tenant_id = cc.tenant_id
         WHERE  cc.id        = ${companyId}
           AND  cc.tenant_id = ${tenantId}
           AND  dlb.category = 'statutory'
           AND  dlb.status   = 'active'
         LIMIT  1),
        (SELECT ba.book_id
         FROM   master.company_code_book_assignment ba
         JOIN   master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
         WHERE  ba.tenant_id      = ${tenantId}
           AND  ba.company_code_id = ${companyId}
           AND  ba.status         = 'active'
           AND  lb.category       = 'statutory'
           AND  lb.status         = 'active'
         ORDER  BY ba.priority ASC
         LIMIT  1)
      ) AS book_id
    `.execute(trx);
    const bookId = bookRes.rows[0]?.book_id ?? null;
    if (!bookId) {
      return { status: 422, body: { error: "NO_LEDGER_BOOK", message: "No statutory ledger book assigned to this company" } };
    }

    // ── Create journal_entry ──────────────────────────────────────────────
    const jeCode = await nextJeCode(trx, tenantId, companyId);

    // Math.abs: payable_amount can be negative for credit notes; JE amounts must be non-negative.
    const totalPayable = Math.abs(Number(invoice["payable_amount"] ?? invoice["total_amount"] ?? 0));
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

    // ── JE line generation: profile-driven path with legacy fallback ─────────
    //
    // Phase 4: try the accounting-profile engine first.  If the tenant has no
    // matching profile seeded, or account resolution fails (e.g. COA not
    // configured for input-tax-recoverable), fall back to the legacy
    // hard-coded Dr Expense / Cr AP / Cr WHT path.

    const pId = principalId ?? "00000000-0000-0000-0000-000000000000";

    // Dominant intent = business_intent_id of the line with the largest |net_amount|.
    // Used by deriveApInvoiceProfile (Step 1) to route OPEX → AP_NON_PO_STANDARD
    // vs CAPEX → AP_NON_PO_CAPEX via intent_to_accounting_profile_rule.
    const dominantIntentId: string | null = lines.reduce<{ id: string | null; amt: number }>(
      (best, line) => {
        const amt = Math.abs(Number(line.net_amount));
        return amt > best.amt ? { id: line.business_intent_id, amt } : best;
      },
      { id: null, amt: 0 },
    ).id;

    const derivedProfile = await deriveApInvoiceProfile(
      trx, tenantId, invoiceSource, invoiceType, dominantIntentId,
    );

    // Build the invoice + posting context objects required by the profile engine
    const invoiceCtx: InvoiceCtx = {
      totalAmount:      Math.abs(Number(invoice["total_amount"]   ?? 0)),
      payableAmount:    Math.abs(Number(invoice["payable_amount"] ?? invoice["total_amount"] ?? 0)),
      taxAmount:        Math.abs(Number(invoice["tax_amount"]     ?? 0)),
      whtAmount:        totalWhtAmount,
      retentionAmount:  Math.abs(Number(invoice["retention_amount"] ?? 0)),
      currencyCode,
      baseCurrencyCode,
      exchangeRate,
      supplierId:       String(invoice["supplier_id"]   ?? ""),
      supplierName:     String(invoice["supplier_name"] ?? String(invoice["supplier_id"] ?? "")),
      isCreditNote,
      invoiceType,
    };

    const postingCtx: PostingCtx = {
      tenantId,
      companyId,
      bookId,
      fiscalPeriodId: fp.id,
      fiscalYear:     fp.fiscal_year,
      periodNumber:   fp.period_number,
      postingDate,
      principalId:    pId,
      jeId,
    };

    const lineCtxArr: InvoiceLineCtx[] = lines.map(l => ({
      id:               l.id,
      lineNo:           l.line_no,
      description:      l.item_description,
      netAmount:        Number(l.net_amount),
      taxAmount:        Number(l.tax_amount),
      whtAmount:        Number(l.withholding_tax_amount),
      spendCategoryId:  l.commodity_category_id,
      businessIntentId: l.business_intent_id,
      costCenterId:     l.cost_center_id,
      profitCenterId:   l.profit_center_id,
      projectId:        l.project_id,
    }));

    const profileResult = derivedProfile
      ? await buildJeLinesFromProfile(trx, derivedProfile, invoiceCtx, lineCtxArr, postingCtx)
      : null;

    if (profileResult) {
      // ── Profile-driven JE lines ─────────────────────────────────────────
      for (const jl of profileResult.jeLines) {
        const txnDebit  = jl.postingSide === "DEBIT"  ? jl.amount     : 0;
        const txnCredit = jl.postingSide === "CREDIT" ? jl.amount     : 0;
        const baseDebit  = jl.postingSide === "DEBIT"  ? jl.baseAmount : 0;
        const baseCredit = jl.postingSide === "CREDIT" ? jl.baseAmount : 0;

        await sql`
          INSERT INTO document.journal_line (
            tenant_id, journal_entry_id, line_no, gl_account_id,
            company_code_id, book_id,
            fiscal_period_id, fiscal_year, period_number, posting_date,
            transaction_currency, transaction_debit, transaction_credit,
            base_currency, base_debit, base_credit, exchange_rate,
            description,
            subledger_type, party_type, party_id,
            cost_center_id, profit_center_id, project_id,
            source_doc_line_id,
            created_by
          ) VALUES (
            ${tenantId}, ${jeId}, ${jl.lineNo}, ${jl.glAccountId},
            ${companyId}, ${bookId},
            ${fp.id}, ${fp.fiscal_year}, ${fp.period_number}, ${postingDate},
            ${currencyCode}, ${txnDebit}, ${txnCredit},
            ${baseCurrencyCode}, ${baseDebit}, ${baseCredit}, ${exchangeRate},
            ${jl.description},
            ${jl.subledgerType ?? null}, ${jl.partyType ?? null}, ${jl.partyId ?? null},
            ${jl.costCenterId ?? null}, ${jl.profitCenterId ?? null}, ${jl.projectId ?? null},
            ${jl.sourceDocLineId ?? null},
            ${pId}
          )
        `.execute(trx);
      }

      // Per-line side effects (independent of JE generation path)
      for (const line of lines) {
        const distAccountId = profileResult.lineAccountMap.get(line.id);
        if (distAccountId) {
          const lineAmount = Math.abs(Number(line.net_amount) + Number(line.tax_amount));
          await sql`
            INSERT INTO document.accounting_distribution (
              tenant_id,
              source_doc_type, source_doc_id, source_line_id,
              distribution_no, distribution_basis, split_pct,
              distributed_amount, currency_code,
              account_source, gl_account_id,
              business_intent_id, commodity_category_id,
              cost_center_id, profit_center_id, project_id,
              created_by
            ) VALUES (
              ${tenantId},
              'PURCHASE_INVOICE_LINE', ${invoiceId}, ${line.id},
              1, 'PERCENT', 100,
              ${lineAmount}, ${currencyCode},
              'FIXED', ${distAccountId},
              ${line.business_intent_id ?? null}, ${line.commodity_category_id ?? null},
              ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
              ${pId}
            )
            ON CONFLICT DO NOTHING
          `.execute(trx);
        }

        if (line.commitment_line_id) {
          await sql`
            UPDATE document.commitment_line
               SET invoiced_quantity = COALESCE(invoiced_quantity, 0) + ${Number(line.quantity)},
                   updated_at = now()
             WHERE id = ${line.commitment_line_id} AND tenant_id = ${tenantId}
          `.execute(trx);
        }

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
              ${pId}, ${now},
              'posted',
              ${pId}, ${now}
            FROM master.asset a
            JOIN master.asset_book ab ON ab.asset_id = a.id AND ab.tenant_id = ${tenantId}
            WHERE a.tenant_id = ${tenantId}
              AND a.asset_class_id = ${line.asset_category_id}
              AND a.source_invoice_line_id = ${line.id}
            LIMIT 1
          `.execute(trx);
        }
      }

    } else {
      // ── Legacy path (hard-coded Dr/Cr construction) ─────────────────────
      // Used when no accounting profile is found for the tenant/source/type,
      // or when account resolution fails (e.g. input-tax GL not configured).
      //
      // Produces: DR Expense(+Tax) per line / CR AP Control / CR WHT Payable.

      let lineSeq = 10;

      for (const line of lines) {
        const debitAccount = await resolvePostingAccount(
          trx, tenantId, companyId,
          line.commodity_category_id,
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
        // Math.abs: credit-note lines may be negative; JE amounts are always non-negative.
        const lineAmount   = Math.abs(Number(line.net_amount) + Number(line.tax_amount));
        const lineBase     = Math.abs(lineNetBase + lineTaxBase);
        // Standard: DR expense / CR AP.  Credit note: DR AP / CR expense (inverted).
        const lineDebit    = isCreditNote ? 0 : lineAmount;
        const lineCredit   = isCreditNote ? lineAmount : 0;
        const lineBaseDebit  = isCreditNote ? 0 : lineBase;
        const lineBaseCredit = isCreditNote ? lineBase : 0;

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
            ${currencyCode}, ${lineDebit}, ${lineCredit},
            ${baseCurrencyCode}, ${lineBaseDebit}, ${lineBaseCredit}, ${exchangeRate},
            ${line.item_description},
            ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
            ${line.id},
            ${pId}
          )
        `.execute(trx);

        await sql`
          INSERT INTO document.accounting_distribution (
            tenant_id,
            source_doc_type, source_doc_id, source_line_id,
            distribution_no, distribution_basis, split_pct,
            distributed_amount, currency_code,
            account_source, gl_account_id,
            business_intent_id, commodity_category_id,
            cost_center_id, profit_center_id, project_id,
            created_by
          ) VALUES (
            ${tenantId},
            'PURCHASE_INVOICE_LINE', ${invoiceId}, ${line.id},
            1, 'PERCENT', 100,
            ${lineAmount}, ${currencyCode},
            'FIXED', ${debitAccount},
            ${line.business_intent_id ?? null}, ${line.commodity_category_id ?? null},
            ${line.cost_center_id ?? null}, ${line.profit_center_id ?? null}, ${line.project_id ?? null},
            ${pId}
          )
          ON CONFLICT DO NOTHING
        `.execute(trx);

        lineSeq += 10;

        if (line.commitment_line_id) {
          await sql`
            UPDATE document.commitment_line
               SET invoiced_quantity = COALESCE(invoiced_quantity, 0) + ${Number(line.quantity)},
                   updated_at = now()
             WHERE id = ${line.commitment_line_id} AND tenant_id = ${tenantId}
          `.execute(trx);
        }

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
              ${pId}, ${now},
              'posted',
              ${pId}, ${now}
            FROM master.asset a
            JOIN master.asset_book ab ON ab.asset_id = a.id AND ab.tenant_id = ${tenantId}
            WHERE a.tenant_id = ${tenantId}
              AND a.asset_class_id = ${line.asset_category_id}
              AND a.source_invoice_line_id = ${line.id}
            LIMIT 1
          `.execute(trx);
        }
      }

      // Legacy: CR AP Control
      const apDebit      = isCreditNote ? totalPayable : 0;
      const apCredit     = isCreditNote ? 0 : totalPayable;
      const apBaseDebit  = isCreditNote ? totalBase : 0;
      const apBaseCredit = isCreditNote ? 0 : totalBase;
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
          ${currencyCode}, ${apDebit}, ${apCredit},
          ${baseCurrencyCode}, ${apBaseDebit}, ${apBaseCredit}, ${exchangeRate},
          ${"AP Control — " + String(invoice["supplier_name"] ?? String(invoice["supplier_id"] ?? ""))},
          'ap',
          'supplier', ${invoice["supplier_id"] ?? null},
          ${pId}
        )
      `.execute(trx);

      // Legacy: CR WHT Payable
      if (totalWhtAmount > 0 && whtPayableAccountId) {
        const whtDebit      = isCreditNote ? totalWhtAmount : 0;
        const whtCredit     = isCreditNote ? 0 : totalWhtAmount;
        const whtBaseDebit  = isCreditNote ? totalWhtBase : 0;
        const whtBaseCredit = isCreditNote ? 0 : totalWhtBase;
        lineSeq += 10;
        await sql`
          INSERT INTO document.journal_line (
            tenant_id, journal_entry_id, line_no, gl_account_id,
            company_code_id, book_id,
            fiscal_period_id, fiscal_year, period_number, posting_date,
            transaction_currency, transaction_debit, transaction_credit,
            base_currency, base_debit, base_credit, exchange_rate,
            description,
            created_by
          ) VALUES (
            ${tenantId}, ${jeId}, ${lineSeq}, ${whtPayableAccountId},
            ${companyId}, ${bookId},
            ${fp.id}, ${fp.fiscal_year}, ${fp.period_number}, ${postingDate},
            ${currencyCode}, ${whtDebit}, ${whtCredit},
            ${baseCurrencyCode}, ${whtBaseDebit}, ${whtBaseCredit}, ${exchangeRate},
            'WHT Payable',
            ${pId}
          )
        `.execute(trx);
      }
    } // end legacy path

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

    // Phase 2: update party advance/retention balance on posting (non-PO invoices only).
    // PO-based invoices track commitment_line exposure; non-PO uses party_advance_balance.
    const supplierId = String(invoice["supplier_id"] ?? "");
    if (invoiceSource !== "po_based" && invoiceSource !== "contract_based" && supplierId) {
      await updatePartyBalanceOnPosting(
        trx, tenantId, invoiceId, supplierId, companyId,
        currencyCode, 1, principalId, logger,
      );
    }

    // Phase 3: write ledger.tax_calculation, invoice_tax_snapshot, tax_credit_movement.
    if (bookId) {
      await postInvoiceTaxCalculations(
        trx, tenantId, companyId, bookId, invoiceId, principalId,
        currencyCode, exchangeRate, fp.fiscal_year, fp.period_number, jeId,
      );
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

    // Phase 2: reverse party advance/retention balance for non-PO invoices (sign = -1)
    const revSource     = String(invoice["invoice_source"] ?? "non_po");
    const revSupplierId = String(invoice["supplier_id"]    ?? "");
    const revCompanyId  = String(invoice["company_code_id"] ?? "");
    const revCurrency   = String(invoice["currency_code"]   ?? "");
    if (revSource !== "po_based" && revSource !== "contract_based" && revSupplierId) {
      await updatePartyBalanceOnPosting(
        trx, tenantId, invoiceId, revSupplierId, revCompanyId,
        revCurrency, -1, principalId, logger,
      );
    }

    // Phase 3: write reversal rows into tax_calculation and tax_credit_movement.
    await reverseInvoiceTaxCalculations(trx, tenantId, invoiceId, principalId, revJeId);

    logger?.info("ap_invoice_reversed", { tenantId, invoiceId, revJeId });
    return {
      status: 201,
      body:   { ok: true, record: updated.rows[0], reversal_journal_entry_id: revJeId, journal_entry_code: revJeCode },
    };
  });
}
