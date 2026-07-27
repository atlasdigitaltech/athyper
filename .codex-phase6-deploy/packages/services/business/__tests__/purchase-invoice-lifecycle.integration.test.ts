/**
 * Purchase Invoice Full Lifecycle Integration Test
 *
 * Tests the complete AP invoice lifecycle against a live PostgreSQL database:
 *   draft → (add line) → lifecycle transition → approved
 *       → lifecycle transition → posted → posting hook (GL JE created)
 *       → create payment → submit payment → approved
 *       → post payment → posted → invoice fully_paid
 *
 * Run with a real DB:
 *   DATABASE_URL=postgres://... pnpm vitest run purchase-invoice-lifecycle
 *
 * All data is isolated to a fresh UUID tenant and cleaned up in `finally`.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Kysely, PostgresDialect, sql, type RawBuilder } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  handleAddInvoiceLine,
  handlePostInvoice,
  handleSubmitPayment,
  handlePostPayment,
} from "@athyper/svc-business";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

// Phase 1 red characterization contracts run even when the live-DB scenario
// below is skipped. They turn green only after PI has one transition owner.
describe("Purchase Invoice lifecycle ownership characterization", () => {
  const actionDispatcher = readFileSync(resolve(
    process.cwd(),
    "packages/services/records/routes/action-dispatcher.route.ts",
  ), "utf8");
  const transactionDispatcher = readFileSync(resolve(
    process.cwd(),
    "packages/services/business/p2p/transaction-flow-dispatcher.service.ts",
  ), "utf8");
  const lifecycleRegistry = readFileSync(resolve(
    process.cwd(),
    "packages/services/records/routes/lifecycle-command.registry.ts",
  ), "utf8");

  it.each([
    ["submit", "submit_for_approval", "handleSubmitForApproval"],
    ["post", "post_invoice", "handlePostInvoice"],
    ["reverse", "reverse_invoice", "handleReverseInvoice"],
  ] as const)("routes PI %s through the lifecycle orchestrator exactly once", (operationCode, flowCode, directHandler) => {
    expect(lifecycleRegistry).toMatch(
      new RegExp(`entityCode:\\s*"purchase_invoice"[\\s\\S]*?operationCode:\\s*"${operationCode}"[\\s\\S]*?allowedFlowCodes:\\s*\\["${flowCode}"\\]`),
    );
    const commandBranchStart = actionDispatcher.indexOf("if (lifecycleCommand) {");
    const commandBranchEnd = actionDispatcher.indexOf(
      "const lifecycleTransition = await resolveLifecycleTransitionForAction",
      commandBranchStart,
    );
    const commandBranch = actionDispatcher.slice(commandBranchStart, commandBranchEnd);
    expect(commandBranch.match(/executeLifecycleTransition\(/g)?.length ?? 0).toBe(1);
    expect(actionDispatcher).not.toContain(`${directHandler}(`);
  });

  it("has one PI posting entry point and one transaction-flow execution", () => {
    expect(actionDispatcher.includes("handlePostInvoice(")).toBe(false);
    expect(transactionDispatcher.match(/handlePostInvoice\(/g)?.length ?? 0).toBe(1);
    expect(transactionDispatcher).toContain('hookActionKey:      "transaction_flow.dispatch"');
  });
});

// ── Scenario shape ────────────────────────────────────────────────────────────

interface PiLifecycleScenario {
  // Tenant graph
  tenantId:        string;
  principalId:     string;
  legalEntityId:   string;
  companyCodeId:   string;
  // GL infrastructure
  ledgerBookId:    string;
  chartId:         string;
  expenseAccountId: string;
  apAccountId:     string;
  bankAccountId:   string;
  fiscalPeriodId:  string;
  // Supplier
  businessPartnerId: string;
  supplierId:        string;
  // AP invoice
  invoiceId:       string;
  // Payment
  paymentMethodId: string;
}

// ── Database init ─────────────────────────────────────────────────────────────

let db: Kysely<unknown> | undefined;

maybeDescribe("Purchase Invoice — full lifecycle (draft → fully_paid)", () => {
  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool =
      (pgModule.default as { Pool?: unknown } | undefined)?.Pool ??
      (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("pg package required for integration tests");

    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString: LIVE_DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });

    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    await sql`select 1`.execute(db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("walks the full purchase invoice lifecycle end-to-end", async () => {
    const scenario = await seedScenario();
    try {
      await runLifecycle(scenario);
    } finally {
      await cleanupScenario(scenario);
    }
  });
});

// ── Full lifecycle runner ─────────────────────────────────────────────────────

async function runLifecycle(s: PiLifecycleScenario): Promise<void> {
  const anyDb = mustDb() as Kysely<Record<string, unknown>>;

  // ── Step 1: Invoice must start in draft ───────────────────────────────────
  const initial = await queryInvoice(s);
  expect(initial.status).toBe("draft");
  expect(Number(initial.line_count ?? 0)).toBe(0);

  // ── Step 2: Add a line ────────────────────────────────────────────────────
  const addResult = await handleAddInvoiceLine(
    anyDb,
    s.tenantId,
    s.invoiceId,
    s.principalId,
    {
      item_description: "IT Services — Integration Test",
      uom_code:         "EA",
      quantity:         1,
      unit_price:       500,
    },
  );
  expect(addResult.status).toBe(201);
  expect(addResult.body["ok"]).toBe(true);

  const afterLine = await queryInvoice(s);
  expect(Number(afterLine.line_count ?? 0)).toBe(1);

  // ── Step 3: Simulate the lifecycle-owned approval boundary ───────────────
  // The records suite covers orchestration. This business fixture starts at
  // the financial AFTER-hook boundary.
  await sql`
    update document.purchase_invoice
       set status = 'approved',
           approved_by = ${s.principalId}::uuid,
           approved_at = now()
     where tenant_id = ${s.tenantId}::uuid
       and id = ${s.invoiceId}::uuid
  `.execute(mustDb());

  const afterSubmit = await queryInvoice(s);
  expect(afterSubmit.status).toBe("approved");
  expect(afterSubmit.approved_by).toBe(s.principalId);

  // ── Step 4: Lifecycle transition, then AFTER-hook materialization ─────────
  await sql`
    update document.purchase_invoice
       set status = 'posted'
     where tenant_id = ${s.tenantId}::uuid
       and id = ${s.invoiceId}::uuid
  `.execute(mustDb());

  const postResult = await handlePostInvoice(
    anyDb,
    s.tenantId,
    s.invoiceId,
    s.principalId,
    {},
    undefined,
    undefined,
    {
      executionMode: "lifecycle_hook",
      executionToken: `test:post:${s.invoiceId}`,
      transitionId: "00000000-0000-0000-0000-000000000001",
      transitionEventSeq: 1,
    },
  );
  expect(postResult.status).toBe(200);
  expect(postResult.body["ok"]).toBe(true);
  const jeId = postResult.body["journal_entry_id"] as string;
  expect(jeId).toBeTruthy();

  const afterPost = await queryInvoice(s);
  expect(afterPost.status).toBe("posted");
  expect(afterPost.is_posted).toBe(true);
  expect(afterPost.ap_je_id).toBe(jeId);

  // Assert journal entry created with Dr Expense and Cr AP lines
  const je = await executeFirstOrThrow(sql<{ id: string; status: string }>`
    select id, status
    from document.journal_entry
    where id = ${jeId}::uuid and tenant_id = ${s.tenantId}::uuid
  `);
  expect(je.status).toBe("posted");

  const jeLines = await sql<{
    line_no:               number;
    gl_account_id:         string;
    transaction_debit:     string;
    transaction_credit:    string;
  }>`
    select line_no, gl_account_id,
           transaction_debit::text, transaction_credit::text
    from document.journal_line
    where journal_entry_id = ${jeId}::uuid and tenant_id = ${s.tenantId}::uuid
    order by line_no
  `.execute(mustDb());

  expect(jeLines.rows.length).toBeGreaterThanOrEqual(2);

  const drLine = jeLines.rows.find((r) => Number(r.transaction_debit) > 0);
  const crLine = jeLines.rows.find((r) => Number(r.transaction_credit) > 0);

  expect(drLine).toBeDefined();
  expect(crLine).toBeDefined();
  expect(drLine!.gl_account_id).toBe(s.expenseAccountId);
  expect(crLine!.gl_account_id).toBe(s.apAccountId);

  // ── Step 5: Create a payment entry (direct SQL) ───────────────────────────
  const paymentId = randomUUID();
  const paymentNo = `PAY-INT-${Date.now()}`;
  const payableAmount = Number(afterPost.payable_amount ?? afterPost.total_amount ?? 500);

  await sql`
    insert into document.payment_entry (
      id, tenant_id, code, name, company_code_id, payment_number,
      supplier_id, supplier_name, payment_method_id, document_date, posting_date,
      value_date, currency_code, base_currency_code, payment_amount,
      fiscal_year, period_number, status, created_by
    ) values (
      ${paymentId}::uuid,
      ${s.tenantId}::uuid,
      ${`PMT-INT-${paymentId.slice(-8)}`},
      'Integration Test Payment',
      ${s.companyCodeId}::uuid,
      ${paymentNo},
      ${s.supplierId}::uuid,
      'Integration Test Supplier',
      ${s.paymentMethodId}::uuid,
      current_date, current_date,
      current_date,
      'USD', 'USD',
      ${payableAmount},
      ${new Date().getFullYear()},
      ${new Date().getMonth() + 1},
      'draft',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // net_payment_amount is GENERATED (allocated - discount - wht - advance - retention)
  await sql`
    insert into document.payment_entry_allocation (
      tenant_id, payment_entry_id, line_no,
      purchase_invoice_id, currency_code, allocated_amount,
      discount_amount, withholding_tax_amount,
      created_by
    ) values (
      ${s.tenantId}::uuid,
      ${paymentId}::uuid,
      1,
      ${s.invoiceId}::uuid,
      'USD',
      ${payableAmount},
      0, 0,
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // ── Step 6: Submit payment (no workflow_definition for our tenant → approved) ──
  const submitPayResult = await handleSubmitPayment(
    anyDb,
    s.tenantId,
    paymentId,
    s.principalId,
  );
  expect(submitPayResult.status).toBe(200);
  // handleSubmitPayment returns { paymentId, status } — no ok field
  expect(["approved", "pending_approval"]).toContain(submitPayResult.body["status"]);

  // Force to approved if a platform-wide workflow_definition for payment_entry exists
  // and routed this tenant to pending_approval.
  const afterPaySubmitStatus = submitPayResult.body["status"] as string;
  if (afterPaySubmitStatus === "pending_approval") {
    await sql`
      update document.payment_entry
         set status = 'approved', updated_at = now()
       where id = ${paymentId}::uuid and tenant_id = ${s.tenantId}::uuid
    `.execute(mustDb());
  }

  // ── Step 7: Post payment → invoice fully_paid ────────────────────────────
  const postPayResult = await handlePostPayment(
    anyDb,
    s.tenantId,
    paymentId,
    s.principalId,
  );
  expect(postPayResult.status).toBe(200);
  // handlePostPayment returns { paymentId, jeId, jeNumber, status } — no ok field
  expect(postPayResult.body["status"]).toBe("posted");
  const payJeId = postPayResult.body["jeId"] as string;
  expect(payJeId).toBeTruthy();

  const afterPayPost = await sql<{ status: string; is_posted: boolean }>`
    select status, is_posted
    from document.payment_entry
    where id = ${paymentId}::uuid and tenant_id = ${s.tenantId}::uuid
  `.execute(mustDb());
  expect(afterPayPost.rows[0]?.status).toBe("posted");
  expect(afterPayPost.rows[0]?.is_posted).toBe(true);

  // Invoice should now be fully_paid
  const afterFullPay = await queryInvoice(s);
  expect(["fully_paid", "partially_paid"]).toContain(afterFullPay.status);

  const paidAmount = Number(afterFullPay.paid_amount ?? 0);
  expect(paidAmount).toBeCloseTo(payableAmount, 2);
}

// ── Query helpers ─────────────────────────────────────────────────────────────

async function queryInvoice(s: PiLifecycleScenario): Promise<Record<string, unknown>> {
  return executeFirstOrThrow(sql<Record<string, unknown>>`
    select *
    from document.purchase_invoice
    where id = ${s.invoiceId}::uuid and tenant_id = ${s.tenantId}::uuid
  `);
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seedScenario(): Promise<PiLifecycleScenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);

  const s: PiLifecycleScenario = {
    tenantId:           randomUUID(),
    principalId:        randomUUID(),
    legalEntityId:      randomUUID(),
    companyCodeId:      randomUUID(),
    ledgerBookId:       randomUUID(),
    chartId:            randomUUID(),
    expenseAccountId:   randomUUID(),
    apAccountId:        randomUUID(),
    bankAccountId:      randomUUID(),
    fiscalPeriodId:     randomUUID(),
    businessPartnerId:  randomUUID(),
    supplierId:         randomUUID(),
    invoiceId:          randomUUID(),
    paymentMethodId:    randomUUID(),
  };

  await seedGlobalReferences();
  await seedTenantGraph(s, suffix);
  await seedGlInfrastructure(s, suffix);
  await seedInvoice(s, suffix);

  return s;
}

async function seedGlobalReferences(): Promise<void> {
  await sql`
    insert into shared.country (code, name, created_by)
    values ('US', 'United States', ${SYSTEM_ACTOR}::uuid)
    on conflict (code) do nothing
  `.execute(mustDb());

  await sql`
    insert into shared.currency (code, name, minor_units, created_by)
    values ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid)
    on conflict (code) do nothing
  `.execute(mustDb());
}

async function seedTenantGraph(s: PiLifecycleScenario, suffix: string): Promise<void> {
  await sql`
    insert into master.tenant (
      id, code, name, display_name, realm_key, tenant_type, status, created_by
    ) values (
      ${s.tenantId}::uuid,
      ${`pitest${suffix}`},
      ${`PI Lifecycle Test ${suffix}`},
      ${`PI Lifecycle Test ${suffix}`},
      'neon',
      'customer',
      'active',
      ${SYSTEM_ACTOR}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.principal (
      id, tenant_id, code, name, principal_type, status, created_by
    ) values (
      ${s.principalId}::uuid,
      ${s.tenantId}::uuid,
      ${`pi_actor_${suffix}`},
      'PI Test Actor',
      'user',
      'active',
      ${SYSTEM_ACTOR}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.legal_entity (
      id, tenant_id, code, name, entity_type, country_code,
      functional_currency, reporting_currency, status, created_by
    ) values (
      ${s.legalEntityId}::uuid,
      ${s.tenantId}::uuid,
      ${`LE${suffix}`},
      'PI Test Legal Entity',
      'standalone',
      'US',
      'USD',
      'USD',
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.company_code (
      id, tenant_id, code, name, legal_entity_id,
      functional_currency, country_code, status, created_by
    ) values (
      ${s.companyCodeId}::uuid,
      ${s.tenantId}::uuid,
      ${`CC${suffix}`},
      'PI Test Company',
      ${s.legalEntityId}::uuid,
      'USD',
      'US',
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());
}

async function seedGlInfrastructure(s: PiLifecycleScenario, suffix: string): Promise<void> {
  // Ledger book (statutory)
  await sql`
    insert into master.ledger_book (
      id, tenant_id, code, name, category,
      base_currency_code, is_primary, status, created_by
    ) values (
      ${s.ledgerBookId}::uuid,
      ${s.tenantId}::uuid,
      ${`LB${suffix}`},
      'PI Test Ledger Book',
      'statutory',
      'USD',
      true,
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.company_code_book_assignment (
      tenant_id, company_code_id, book_id, status, priority, created_by
    ) values (
      ${s.tenantId}::uuid,
      ${s.companyCodeId}::uuid,
      ${s.ledgerBookId}::uuid,
      'active',
      1,
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Chart of accounts
  await sql`
    insert into master.chart_of_account (
      id, tenant_id, code, name, status, created_by
    ) values (
      ${s.chartId}::uuid,
      ${s.tenantId}::uuid,
      ${`COA${suffix}`},
      'PI Test Chart',
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.company_code_chart_assignment (
      tenant_id, company_code_id, chart_of_account_id, status, created_by
    ) values (
      ${s.tenantId}::uuid,
      ${s.companyCodeId}::uuid,
      ${s.chartId}::uuid,
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // GL accounts: expense (for Dr side of AP invoice JE)
  // normal_balance NOT NULL; status='active' sets the GENERATED is_active=true
  await sql`
    insert into master.gl_account (
      id, tenant_id, chart_of_account_id,
      code, name, account_class, node_type, normal_balance,
      status, sort_order, created_by
    ) values (
      ${s.expenseAccountId}::uuid,
      ${s.tenantId}::uuid,
      ${s.chartId}::uuid,
      ${`EXP${suffix}`},
      'Test Expense Account',
      'expense',
      'posting',
      'debit',
      'active',
      10,
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // GL account: AP control (subledger_type='ap' → Cr side of invoice JE)
  await sql`
    insert into master.gl_account (
      id, tenant_id, chart_of_account_id,
      code, name, account_class, node_type, normal_balance, subledger_type,
      status, sort_order, created_by
    ) values (
      ${s.apAccountId}::uuid,
      ${s.tenantId}::uuid,
      ${s.chartId}::uuid,
      ${`AP${suffix}`},
      'Test AP Control Account',
      'liability',
      'posting',
      'credit',
      'ap',
      'active',
      20,
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // GL account: bank/cash (name contains 'bank' → fallback bank resolution for payment JE)
  await sql`
    insert into master.gl_account (
      id, tenant_id, chart_of_account_id,
      code, name, account_class, node_type, normal_balance,
      status, sort_order, created_by
    ) values (
      ${s.bankAccountId}::uuid,
      ${s.tenantId}::uuid,
      ${s.chartId}::uuid,
      ${`BANK${suffix}`},
      'Test Bank Account',
      'asset',
      'posting',
      'debit',
      'active',
      30,
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Fiscal period (status='open', covers today for both invoice creation and posting)
  const today    = new Date();
  const year     = today.getFullYear();
  const month    = today.getMonth() + 1;
  const start    = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay  = new Date(year, month, 0).getDate();
  const end      = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  await sql`
    insert into master.fiscal_period (
      id, tenant_id, company_code_id,
      code, name, fiscal_year, period_number,
      start_date, end_date, status, created_by
    ) values (
      ${s.fiscalPeriodId}::uuid,
      ${s.tenantId}::uuid,
      ${s.companyCodeId}::uuid,
      ${`FP${year}${String(month).padStart(2, "0")}${suffix}`},
      ${`${year}-${String(month).padStart(2, "0")}`},
      ${year},
      ${month},
      ${start}::date,
      ${end}::date,
      'open',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Book period status — the period gate trigger also checks governance.book_period_status;
  // a missing row defaults to 'future' which blocks JE insertion, so we open it explicitly.
  await sql`
    insert into governance.book_period_status (
      tenant_id, company_code_id, book_id, fiscal_year, period_number,
      status, opened_at, opened_by, created_by
    ) values (
      ${s.tenantId}::uuid,
      ${s.companyCodeId}::uuid,
      ${s.ledgerBookId}::uuid,
      ${year},
      ${month},
      'open',
      now(),
      ${s.principalId}::uuid,
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Business partner + supplier role (needed for the AP journal line party validation)
  await sql`
    insert into master.business_partner (
      id, tenant_id, code, name, partner_category, status, created_by
    ) values (
      ${s.businessPartnerId}::uuid,
      ${s.tenantId}::uuid,
      ${`BP${suffix}`},
      'Test Supplier BP',
      'organization',
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.supplier (
      id, tenant_id, business_partner_id, supplier_code, supplier_type, status, created_by
    ) values (
      ${s.supplierId}::uuid,
      ${s.tenantId}::uuid,
      ${s.businessPartnerId}::uuid,
      ${`SUP${suffix}`},
      'general',
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Payment method
  await sql`
    insert into master.payment_method (
      id, tenant_id, code, name, instrument_mode, direction, status, created_by
    ) values (
      ${s.paymentMethodId}::uuid,
      ${s.tenantId}::uuid,
      ${`PM${suffix}`},
      'Test Payment Method',
      'bank_transfer',
      'outbound',
      'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());
}

async function seedInvoice(s: PiLifecycleScenario, suffix: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  await sql`
    insert into document.purchase_invoice (
      id, tenant_id, code, name, company_code_id,
      code,
      invoice_source, invoice_type, match_type,
      supplier_id,
      supplier_invoice_number, supplier_invoice_date,
      document_date, posting_date, received_date,
      currency_code, base_currency_code,
      subtotal_amount, total_amount,
      fiscal_year, period_number,
      tax_mode, tax_mode_source,
      status, created_by
    ) values (
      ${s.invoiceId}::uuid,
      ${s.tenantId}::uuid,
      ${`PI-INT-${suffix}`},
      'Integration Test Invoice',
      ${s.companyCodeId}::uuid,
      ${`PI-INT-${suffix}`},
      'non_po',
      'standard',
      'no_match',
      ${s.supplierId}::uuid,
      ${`SINV-${suffix}`},
      ${today}::date,
      ${today}::date,
      ${today}::date,
      ${today}::date,
      'USD',
      'USD',
      500.00,
      500.00,
      ${new Date().getFullYear()},
      ${new Date().getMonth() + 1},
      'no_tax',
      'user_override',
      'draft',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanupScenario(s: PiLifecycleScenario): Promise<void> {
  const tid = s.tenantId;

  // Document layer — delete header first so FK CASCADE removes lines without
  // triggering the status-guard trigger on purchase_invoice_line
  await sql`delete from document.payment_entry_allocation where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from document.payment_entry            where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from document.accounting_distribution  where tenant_id = ${tid}::uuid`.execute(mustDb());
  // Delete JE header first — CASCADE removes lines without hitting the immutability guard trigger
  await sql`delete from document.journal_entry            where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from document.invoice_match_case       where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from document.purchase_invoice         where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from document.command_log              where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from document.workflow_request         where tenant_id = ${tid}::uuid`.execute(mustDb());

  // Observability / log
  await sql`delete from event.outbox                      where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from log.entity_lifecycle_log          where tenant_id = ${tid}::uuid`.execute(mustDb());

  // Master — GL infrastructure
  await sql`delete from governance.book_period_status     where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.fiscal_period              where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.payment_method             where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.supplier                   where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.business_partner           where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.gl_account                 where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.company_code_chart_assignment where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.chart_of_account           where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.company_code_book_assignment  where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.ledger_book                where tenant_id = ${tid}::uuid`.execute(mustDb());

  // Control — numbering counters seeded by the invoice number generator
  await sql`delete from control.entity_numbering_counter  where tenant_id = ${tid}::uuid`.execute(mustDb());

  // Master — tenant graph
  await sql`delete from master.company_code               where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.legal_entity               where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.principal                  where tenant_id = ${tid}::uuid`.execute(mustDb());
  await sql`delete from master.tenant                     where id        = ${tid}::uuid`.execute(mustDb());
}

// ── Utility ───────────────────────────────────────────────────────────────────

async function executeFirstOrThrow<T>(query: RawBuilder<T>): Promise<T> {
  const result = await query.execute(mustDb());
  const row = result.rows[0];
  if (!row) throw new Error("Expected query to return at least one row");
  return row;
}

function mustDb(): Kysely<unknown> {
  if (!db) throw new Error("Database not initialized — call beforeAll first");
  return db;
}
