/**
 * AP purchase invoice — PO-based posting with matching (Workstream B).
 *
 * Cases (per plan v3 §2):
 *   B-1 Happy path        — PR → approved PO w/ schedules → posted receipt
 *                            → PI bound to PO → dispatch INVOICE_MATCHED.
 *   B-2 Quantity over     — PI qty > receipt_line.received_quantity →
 *                            full rollback contract.
 *   B-3 Price variance    — PI unit_price > commitment.unit_price × (1+tol)
 *                            → full rollback contract.
 *   B-4 Idempotency       — replay INVOICE_MATCHED with same execution_token
 *                            → exactly one JE / one invoice_match_case /
 *                              single commitment_line.invoiced_quantity bump.
 *
 * Gated on DATABASE_URL.
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";

import {
  seedBudgetScenario, cleanupBudgetScenario,
  createPurchaseRequisition, createApprovedCommitmentWithSchedules,
  createPurchaseInvoiceFromPO, findP2pTransitionId,
  type BudgetScenario,
} from "./_fixtures/budget-fixture.js";
import {
  seedApMasterReceipt, cleanupApMasterReceipt,
  seedApMasterPi, cleanupApMasterPi,
  seedApMasterMatching, cleanupApMasterMatching,
} from "./_fixtures/ap-master-fixture.js";
import { dispatchTransactionFlow } from "../p2p/transaction-flow-dispatcher.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

interface ReceiptSetup {
  receiptId:      string;
  receiptLineId:  string;
}

/**
 * Minimal receipt + receipt_line tied to the first PO line. Simulates a
 * posted receipt so matchInvoice can read receipt_line.received_quantity
 * — we don't call handlePostReceipt to avoid coupling B's tests to the
 * receipt-posting smoke (covered separately by AP-S1a).
 */
async function createApprovedReceipt(
  s: BudgetScenario,
  commitmentId: string,
  commitmentLineId: string,
  receivedQty: number,
  unitPrice: number,
): Promise<ReceiptSetup> {
  const receiptId     = randomUUID();
  const receiptLineId = randomUUID();
  await sql`
    INSERT INTO document.receipt
      (id, tenant_id, company_code_id, commitment_id, supplier_id,
       receipt_number, document_date, posting_date,
       receiving_site_id, receiving_warehouse_id,
       currency_code, base_currency_code, fiscal_year, period_number,
       status, is_posted, posted_at, posted_by,
       created_by)
    VALUES
      (${receiptId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       ${commitmentId}::uuid, ${s.supplierId}::uuid,
       ${"RCP-POB-" + s.suffix + "-" + randomUUID().slice(0,8)},
       CURRENT_DATE, CURRENT_DATE,
       ${s.siteId}::uuid, ${s.warehouseId}::uuid,
       ${s.currencyCode}::char(3), ${s.currencyCode}::char(3),
       ${s.fiscalYear}::smallint, ${s.periodNumber}::smallint,
       'posted', true, now(), ${s.principalId}::uuid,
       ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO document.receipt_line
      (id, tenant_id, receipt_id, line_no, commitment_line_id,
       item_id, item_description, uom_code,
       received_quantity, accepted_quantity, unit_price, currency_code,
       warehouse_id, status, created_by)
    VALUES
      (${receiptLineId}::uuid, ${s.tenantId}::uuid, ${receiptId}::uuid, 1::smallint,
       ${commitmentLineId}::uuid,
       ${s.itemId}::uuid, 'PO-based line', 'EA',
       ${receivedQty}::numeric, ${receivedQty}::numeric, ${unitPrice}::numeric,
       ${s.currencyCode}::char(3),
       ${s.warehouseId}::uuid, 'open', ${s.principalId}::uuid)
  `.execute(mustDb());

  return { receiptId, receiptLineId };
}

interface DispatchInputs {
  invoiceId:      string;
  executionToken: string;
  transitionId:   string;
}

async function buildDispatchInputs(invoiceId: string): Promise<DispatchInputs> {
  const transitionId = await findP2pTransitionId(mustDb(), {
    lifecycleCode: "purchase_invoice",
    fromCode:      "approved",
    toCode:        "posted",
  });
  const executionToken = createHash("sha256")
    .update(`${transitionId}:${invoiceId}:1`)
    .digest("hex");
  // transaction_flow.dispatch is an AFTER hook: model the lifecycle-owned
  // approved -> posted transition before invoking it directly in this test.
  await sql`
    UPDATE document.purchase_invoice
       SET status = 'posted'
     WHERE id = ${invoiceId}::uuid
  `.execute(mustDb());
  return { invoiceId, executionToken, transitionId };
}

interface CountResult { n: string }

async function countJournalEntries(s: BudgetScenario, invoiceId: string): Promise<number> {
  const r = await sql<CountResult>`
    SELECT count(*)::text AS n
      FROM document.journal_entry
     WHERE tenant_id     = ${s.tenantId}::uuid
       AND source_doc_id = ${invoiceId}::uuid
  `.execute(mustDb());
  return Number(r.rows[0]?.n ?? 0);
}

async function readMatchCase(s: BudgetScenario, invoiceId: string) {
  const r = await sql<{
    status:           string;
    match_result:     string;
    has_exceptions:   boolean;
  }>`
    SELECT status, match_result, has_exceptions
      FROM document.invoice_match_case
     WHERE tenant_id          = ${s.tenantId}::uuid
       AND purchase_invoice_id = ${invoiceId}::uuid
  `.execute(mustDb());
  return r.rows;
}

async function readInvoicedQty(s: BudgetScenario, commitmentLineId: string): Promise<number> {
  const r = await sql<{ q: string }>`
    SELECT COALESCE(invoiced_quantity, 0)::text AS q
      FROM document.commitment_line
     WHERE id        = ${commitmentLineId}::uuid
       AND tenant_id = ${s.tenantId}::uuid
  `.execute(mustDb());
  return Number(r.rows[0]?.q ?? 0);
}

async function readInvoiceMatchStatus(s: BudgetScenario, invoiceId: string): Promise<string | null> {
  const r = await sql<{ match_status: string | null }>`
    SELECT match_status
      FROM document.purchase_invoice
     WHERE id        = ${invoiceId}::uuid
       AND tenant_id = ${s.tenantId}::uuid
  `.execute(mustDb());
  return r.rows[0]?.match_status ?? null;
}

maybeDescribe("AP PI — PO-based posting with matching (live DB)", () => {
  let scenario: BudgetScenario | undefined;

  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool =
      (pgModule.default as { Pool?: unknown } | undefined)?.Pool ??
      (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("pg package required for integration tests");
    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString:        LIVE_DATABASE_URL,
      max:                     3,
      idleTimeoutMillis:       5_000,
      connectionTimeoutMillis: 10_000,
    });
    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    await sql`select 1`.execute(db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  afterEach(async () => {
    if (scenario) {
      await sql`DELETE FROM document.match_exception           WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.invoice_match_case        WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM ledger.commitment_fulfillment      WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM ledger.commitment_schedule         WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_line              WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_entry             WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.purchase_invoice_line     WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.purchase_invoice          WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.receipt_line              WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.receipt                   WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.schedule_line             WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await cleanupApMasterMatching(mustDb(), scenario);
      await cleanupApMasterPi(mustDb(), scenario);
      await cleanupApMasterReceipt(mustDb(), scenario);
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  // ── B-1: Happy path ──────────────────────────────────────────────────────
  it("B-1: INVOICE_MATCHED through dispatcher writes JE + invoice_match_case + bumps invoiced_quantity", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);
    await seedApMasterMatching(mustDb(), scenario);

    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100 },
    ]);
    const po = await createApprovedCommitmentWithSchedules(mustDb(), scenario, pr);
    const receipt = await createApprovedReceipt(
      scenario, po.commitmentId, po.lineIds[0]!, 5, 100,
    );

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100, commitmentLineId: po.lineIds[0]! },
    ], { status: "approved", invoiceSource: "po_based", commitmentId: po.commitmentId });

    // Stamp receipt_line_id on the PI line for the three-way match path.
    await sql`
      UPDATE document.purchase_invoice_line
         SET receipt_line_id = ${receipt.receiptLineId}::uuid
       WHERE id = ${pi.lineIds[0]}::uuid
    `.execute(mustDb());

    const inv = await buildDispatchInputs(pi.invoiceId);
    const qtyBefore = await readInvoicedQty(scenario, po.lineIds[0]!);

    const dispatched = await dispatchTransactionFlow(mustDb(), {
      tenantId:      scenario.tenantId,
      sourceDocType: "purchase_invoice",
      sourceDocId:   pi.invoiceId,
      eventCode:     "INVOICE_MATCHED",
      flowCode:      "PO_BASED",
      executionToken: inv.executionToken,
      transitionId:   inv.transitionId,
      principalId:    scenario.principalId,
    });

    if (dispatched.kind !== "ok") {
      // eslint-disable-next-line no-console
      console.warn("[B-1] dispatcher did not succeed:", dispatched);
    }
    expect(dispatched.kind).toBe("ok");
    expect(await countJournalEntries(scenario, pi.invoiceId)).toBeGreaterThanOrEqual(1);

    // invoice_match_case row stamped — status='completed', match_result is
    // one of the success values, no exceptions.
    const cases = await readMatchCase(scenario, pi.invoiceId);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.status).toBe("completed");
    expect(["matched", "matched_with_tolerance"]).toContain(cases[0]!.match_result);
    expect(cases[0]!.has_exceptions).toBe(false);

    // purchase_invoice.match_status flipped.
    expect(await readInvoiceMatchStatus(scenario, pi.invoiceId)).toBe("fully_matched");

    // commitment_line.invoiced_quantity incremented by PI line qty.
    expect(await readInvoicedQty(scenario, po.lineIds[0]!)).toBe(qtyBefore + 5);
  });

  // ── B-2: Quantity over receipt → full rollback ──────────────────────────
  it("B-2: PI qty > receipt_line.received_quantity refuses with full rollback", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);
    await seedApMasterMatching(mustDb(), scenario);

    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: 10, unitPrice: 100 },
    ]);
    const po = await createApprovedCommitmentWithSchedules(mustDb(), scenario, pr);
    // Receipt received only 5 of the 10 ordered.
    const receipt = await createApprovedReceipt(
      scenario, po.commitmentId, po.lineIds[0]!, 5, 100,
    );

    // PI invoices 10 — more than received.
    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 10, unitPrice: 100, commitmentLineId: po.lineIds[0]! },
    ], { status: "approved", invoiceSource: "po_based", commitmentId: po.commitmentId });

    await sql`
      UPDATE document.purchase_invoice_line
         SET receipt_line_id = ${receipt.receiptLineId}::uuid
       WHERE id = ${pi.lineIds[0]}::uuid
    `.execute(mustDb());

    const qtyBefore = await readInvoicedQty(scenario, po.lineIds[0]!);
    const inv = await buildDispatchInputs(pi.invoiceId);

    const dispatched = await dispatchTransactionFlow(mustDb(), {
      tenantId:      scenario.tenantId,
      sourceDocType: "purchase_invoice",
      sourceDocId:   pi.invoiceId,
      eventCode:     "INVOICE_MATCHED",
      flowCode:      "PO_BASED",
      executionToken: inv.executionToken,
      transitionId:   inv.transitionId,
      principalId:    scenario.principalId,
    });

    expect(dispatched.kind).toBe("handlerFailed");

    // Full-rollback contract:
    //   - no JE rows
    //   - if invoice_match_case row exists, it doesn't claim success
    //   - commitment_line.invoiced_quantity unchanged
    //   - purchase_invoice.match_status not 'fully_matched'
    expect(await countJournalEntries(scenario, pi.invoiceId)).toBe(0);

    const cases = await readMatchCase(scenario, pi.invoiceId);
    if (cases.length > 0) {
      expect(["matched", "matched_with_tolerance"]).not.toContain(cases[0]!.match_result);
      expect(cases[0]!.has_exceptions).toBe(true);
    }
    expect(await readInvoicedQty(scenario, po.lineIds[0]!)).toBe(qtyBefore);
    expect(await readInvoiceMatchStatus(scenario, pi.invoiceId)).not.toBe("fully_matched");
  });

  // ── B-3: Price variance over tolerance → full rollback ──────────────────
  it("B-3: PI unit_price 10% over commitment unit_price (tolerance 5%) refuses", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);
    // Tighten the price tolerance to 5%.
    await seedApMasterMatching(mustDb(), scenario, { priceTolerance: 5 });

    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100 },
    ]);
    const po = await createApprovedCommitmentWithSchedules(mustDb(), scenario, pr);
    const receipt = await createApprovedReceipt(
      scenario, po.commitmentId, po.lineIds[0]!, 5, 100,
    );

    // PI unit_price = 110 vs commitment 100 → 10% variance, over 5% tolerance.
    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 110, commitmentLineId: po.lineIds[0]! },
    ], { status: "approved", invoiceSource: "po_based", commitmentId: po.commitmentId });

    await sql`
      UPDATE document.purchase_invoice_line
         SET receipt_line_id = ${receipt.receiptLineId}::uuid
       WHERE id = ${pi.lineIds[0]}::uuid
    `.execute(mustDb());

    const qtyBefore = await readInvoicedQty(scenario, po.lineIds[0]!);
    const inv = await buildDispatchInputs(pi.invoiceId);

    const dispatched = await dispatchTransactionFlow(mustDb(), {
      tenantId:      scenario.tenantId,
      sourceDocType: "purchase_invoice",
      sourceDocId:   pi.invoiceId,
      eventCode:     "INVOICE_MATCHED",
      flowCode:      "PO_BASED",
      executionToken: inv.executionToken,
      transitionId:   inv.transitionId,
      principalId:    scenario.principalId,
    });

    expect(dispatched.kind).toBe("handlerFailed");
    expect(await countJournalEntries(scenario, pi.invoiceId)).toBe(0);
    expect(await readInvoicedQty(scenario, po.lineIds[0]!)).toBe(qtyBefore);
    expect(await readInvoiceMatchStatus(scenario, pi.invoiceId)).not.toBe("fully_matched");
  });

  // ── B-4: Idempotency under replay ───────────────────────────────────────
  it("B-4: replay INVOICE_MATCHED produces exactly one JE / one match_case / single qty bump", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);
    await seedApMasterMatching(mustDb(), scenario);

    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100 },
    ]);
    const po = await createApprovedCommitmentWithSchedules(mustDb(), scenario, pr);
    const receipt = await createApprovedReceipt(
      scenario, po.commitmentId, po.lineIds[0]!, 5, 100,
    );

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100, commitmentLineId: po.lineIds[0]! },
    ], { status: "approved", invoiceSource: "po_based", commitmentId: po.commitmentId });

    await sql`
      UPDATE document.purchase_invoice_line
         SET receipt_line_id = ${receipt.receiptLineId}::uuid
       WHERE id = ${pi.lineIds[0]}::uuid
    `.execute(mustDb());

    const qtyBefore = await readInvoicedQty(scenario, po.lineIds[0]!);
    const inv = await buildDispatchInputs(pi.invoiceId);
    const ctx = {
      tenantId:      scenario.tenantId,
      sourceDocType: "purchase_invoice",
      sourceDocId:   pi.invoiceId,
      eventCode:     "INVOICE_MATCHED",
      flowCode:      "PO_BASED",
      executionToken: inv.executionToken,
      transitionId:   inv.transitionId,
      principalId:    scenario.principalId,
    } as const;

    const first  = await dispatchTransactionFlow(mustDb(), ctx);
    const second = await dispatchTransactionFlow(mustDb(), ctx);

    expect(first.kind).toBe("ok");
    expect(second.kind).toBe("alreadyDispatched");

    // Exactly one JE, exactly one match_case, single qty bump.
    expect(await countJournalEntries(scenario, pi.invoiceId)).toBe(1);
    const cases = await readMatchCase(scenario, pi.invoiceId);
    expect(cases).toHaveLength(1);
    expect(await readInvoicedQty(scenario, po.lineIds[0]!)).toBe(qtyBefore + 5);
  });
});
