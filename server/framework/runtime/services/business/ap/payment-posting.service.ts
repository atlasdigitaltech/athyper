/**
 * Payment Posting Service — approved → posted
 *
 * handlePostPayment:
 *   Validates the payment is in 'approved' (or 'draft' for direct-post) status, then:
 *   1. Creates document.journal_entry (payment settlement header)
 *   2. Creates document.journal_line rows:
 *        DR  AP Control account      — clears the payable (per allocation)
 *        CR  Bank/Clearing account   — reduces cash
 *        CR  Discount Income         — if early payment discount was taken
 *        DR/CR FX Gain/Loss          — if payment currency differs from invoice currency
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

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

    const currentStatus = String(payment["status"] ?? "").toLowerCase();
    if (currentStatus !== "approved") {
      return {
        status: 422,
        body: {
          error: "INVALID_STATUS",
          message: `Payment is in '${currentStatus}' — payment must be in approved status before posting`,
        },
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

    // Load allocations
    const allocResult = await sql<{
      id: string;
      purchase_invoice_id: string | null;
      allocated_amount: string;
      discount_amount: string;
      withholding_tax_amount: string;
      net_payment_amount: string;
    }>`
      SELECT id, purchase_invoice_id, allocated_amount, discount_amount,
             withholding_tax_amount, net_payment_amount
      FROM document.payment_entry_allocation
      WHERE payment_entry_id = ${paymentId} AND tenant_id = ${tenantId}
      ORDER BY line_no
    `.execute(trx);

    const allocations = allocResult.rows;
    const totalDiscount   = allocations.reduce((s, a) => s + Number(a.discount_amount), 0);
    const totalAllocated  = allocations.reduce((s, a) => s + Number(a.allocated_amount), 0) || paymentAmount;

    // Resolve GL accounts
    const apControlId = await resolveApControlAccount(trx, tenantId, companyId);
    const bankGlId    = await resolveBankAccount(trx, tenantId, companyId, bankAccountId);
    const discountId  = totalDiscount > 0 ? await resolveDiscountAccount(trx, tenantId, companyId) : null;

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
        ${crypto.randomUUID()}, ${tenantId}, ${jeId},
        ${companyId}, ${bookId}, ${fiscalPeriodId}, ${fiscalYear}, ${periodNumber}, ${postingDate},
        1, ${apControlId},
        ${"AP Settlement — " + supplierName},
        ${currencyCode}, ${totalAllocated.toFixed(4)}, 0,
        ${baseCurrencyCode}, ${(totalAllocated * exchangeRate).toFixed(4)}, 0, ${exchangeRate},
        'ap', 'supplier', ${payment["supplier_id"] ?? null},
        ${principalId ?? V_SU}
      )
    `.execute(trx);

    // Line 2: CR Bank (cash out) — skip if entirely covered by discount
    const netCashOut = paymentAmount - totalDiscount;
    if (netCashOut > 0) {
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
          2, ${bankGlId},
          ${"Bank Payment — " + paymentNumber},
          ${currencyCode}, 0, ${netCashOut.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(netCashOut * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
    }

    // Line 3 (optional): CR Discount Income
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
          3, ${discountId},
          ${"Early Payment Discount — " + paymentNumber},
          ${currencyCode}, 0, ${totalDiscount.toFixed(4)},
          ${baseCurrencyCode}, 0, ${(totalDiscount * exchangeRate).toFixed(4)}, ${exchangeRate},
          ${principalId ?? V_SU}
        )
      `.execute(trx);
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

    // ── Update payment_entry ───────────────────────────────────────────────────
    await sql`
      UPDATE document.payment_entry
      SET
        status         = 'posted',
        is_posted      = true,
        posted_at      = ${now.toISOString()},
        posted_by      = ${principalId},
        payment_je_id  = ${jeId},
        updated_at     = ${now.toISOString()},
        updated_by     = ${principalId}
      WHERE id = ${paymentId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // ── Update invoice paid_amount / status from posted non-voided allocations ──
    // Only posted+non-voided payments count toward invoice settlement.
    // outstanding_amount is GENERATED ALWAYS AS STORED — not written here.
    const affectedInvoiceIds = [...new Set(
      allocations
        .map((a) => a.purchase_invoice_id)
        .filter((id): id is string => id != null),
    )];

    for (const invId of affectedInvoiceIds) {
      await sql`
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
      `.execute(trx);
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

  await sql`
    UPDATE document.payment_entry
    SET status = ${newStatus}, updated_at = now(), updated_by = ${principalId}
    WHERE id = ${paymentId} AND tenant_id = ${tenantId}
  `.execute(db);

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
    await sql`
      UPDATE document.payment_entry
      SET status       = 'voided',
          is_voided    = true,
          voided_at    = ${now.toISOString()},
          voided_by    = ${principalId},
          void_reason  = ${voidReason},
          updated_at   = ${now.toISOString()},
          updated_by   = ${principalId}
      WHERE id = ${paymentId} AND tenant_id = ${tenantId}
    `.execute(trx);

    // Recalculate outstanding_amount for each affected invoice
    for (const alloc of allocResult.rows) {
      if (!alloc.purchase_invoice_id) continue;
      const invId = alloc.purchase_invoice_id;
      await sql`
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
      `.execute(trx);
    }

    return { status: 200, body: { paymentId, status: "voided" } };
  });
}
