/**
 * Service-driven P2P chain fixture.
 *
 * The fixture deliberately begins at a valid active PO precondition supplied
 * by a dedicated integration tenant. It creates no audit, snapshot, budget,
 * journal, outbox, or allocation outcomes directly; every such row must be
 * produced by the creation/lifecycle services invoked below.
 */
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeLifecycleTransition } from "../../records/lifecycle/execute-lifecycle-transition.js";
import { createPaymentFromInvoice } from "../ap/payment_entry/payment-from-invoice.service.js";
import { runLifecycleHooks } from "../lifecycle/hook-runner.service.js";
import { createInvoiceFromReceipt } from "../p2p/purchase_invoice/invoice-from-receipt.service.js";
import { createReceiptFromCommitment } from "../p2p/receipt/receipt-from-commitment.service.js";

const DATABASE_URL = process.env["P2P_CHAIN_INTEGRATION_DATABASE_URL"];
const maybeDescribe = DATABASE_URL ? describe : describe.skip;
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface Preconditions {
  tenantId: string;
  companyCodeId: string;
  commitmentId: string;
  commitmentLineId: string;
  siteId: string;
  warehouseId: string;
  paymentMethodId: string;
  currencyCode: string;
  remainingQuantity: number;
}

let db: AnyDb | undefined;

maybeDescribe("completed PO -> receipt -> PI -> payment service fixture", () => {
  let precondition: Preconditions;

  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool = (pgModule.default as { Pool?: unknown } | undefined)?.Pool
      ?? (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("pg package is required for the P2P chain fixture");
    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10_000,
    });
    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    precondition = await selectValidPrecondition(mustDb());
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("drives the chain through runtime services and owns every resulting side effect", async () => {
    const quantity = Math.max(1, Math.min(precondition.remainingQuantity / 2, 2));

    const receiptCreated = await createReceiptFromCommitment(mustDb(), {
      tenantId: precondition.tenantId,
      principalId: SYSTEM_ACTOR,
      commitmentId: precondition.commitmentId,
      companyCodeId: precondition.companyCodeId,
      receivingSiteId: precondition.siteId,
      receivingWarehouseId: precondition.warehouseId,
      receiptNumber: `RCP-CHAIN-${Date.now()}`,
      fiscalYear: 2026,
      periodNumber: 6,
      baseCurrencyCode: precondition.currencyCode,
      documentDate: "2026-06-15",
      lineAcceptances: [{
        commitmentLineId: precondition.commitmentLineId,
        acceptedQty: quantity,
        rejectedQty: 0,
      }],
    });
    expect(receiptCreated.ok).toBe(true);
    if (!receiptCreated.ok) return;

    const receiptTransitions = [];
    for (const target of ["pending_approval", "approved", "posted"]) {
      receiptTransitions.push(await transitionTo("receipt", receiptCreated.receiptId, target));
    }

    const receiptLine = await sql<{ id: string }>`
      SELECT id::text FROM document.receipt_line
       WHERE tenant_id = ${precondition.tenantId}::uuid
         AND receipt_id = ${receiptCreated.receiptId}::uuid
       ORDER BY line_no LIMIT 1
    `.execute(mustDb());
    expect(receiptLine.rows[0]).toBeDefined();

    const invoiceCreated = await createInvoiceFromReceipt(mustDb(), {
      tenantId: precondition.tenantId,
      principalId: SYSTEM_ACTOR,
      receiptId: receiptCreated.receiptId,
      companyCodeId: precondition.companyCodeId,
      supplierInvoiceNumber: `SUP-CHAIN-${Date.now()}`,
      supplierInvoiceDate: "2026-06-20",
      documentDate: "2026-06-20",
      invoiceNumber: `PI-CHAIN-${Date.now()}`,
      fiscalYear: 2026,
      periodNumber: 6,
      baseCurrencyCode: precondition.currencyCode,
      lineSelections: [{ receiptLineId: receiptLine.rows[0]!.id, quantity }],
    });
    expect(invoiceCreated.ok).toBe(true);
    if (!invoiceCreated.ok) return;

    const invoiceTransitions = [];
    for (const target of ["pending_approval", "approved", "posted"]) {
      invoiceTransitions.push(await transitionTo("purchase_invoice", invoiceCreated.invoiceId, target));
    }

    const invoice = await sql<{ payable_amount: string }>`
      SELECT payable_amount::text FROM document.purchase_invoice
       WHERE id = ${invoiceCreated.invoiceId}::uuid
    `.execute(mustDb());
    const payableAmount = Number(invoice.rows[0]?.payable_amount ?? 0);
    expect(payableAmount).toBeGreaterThan(0);

    const paymentCreated = await createPaymentFromInvoice(mustDb(), {
      tenantId: precondition.tenantId,
      principalId: SYSTEM_ACTOR,
      companyCodeId: precondition.companyCodeId,
      paymentMethodId: precondition.paymentMethodId,
      documentDate: "2026-06-25",
      paymentNumber: `PAY-CHAIN-${Date.now()}`,
      fiscalYear: 2026,
      periodNumber: 6,
      baseCurrencyCode: precondition.currencyCode,
      allocations: [{ invoiceId: invoiceCreated.invoiceId, allocatedAmount: payableAmount }],
    });
    expect(paymentCreated.ok).toBe(true);
    if (!paymentCreated.ok) return;

    const paymentTransitions = [];
    for (const target of ["pending_approval", "approved", "posted", "transmitted", "cleared"]) {
      paymentTransitions.push(await transitionTo("payment_entry", paymentCreated.paymentId, target));
    }

    const releaseTransition = await transitionTo(
      "purchase_order", precondition.commitmentId, "closed",
    );
    const allTransitions = [
      ...receiptTransitions,
      ...invoiceTransitions,
      ...paymentTransitions,
      releaseTransition,
    ];
    const finalTransition = allTransitions.at(-1)!;
    const replay = await runLifecycleHooks(mustDb(), {
      tenantId: precondition.tenantId,
      transitionId: finalTransition.transitionId,
      sourceDocType: "purchase_order",
      sourceDocId: precondition.commitmentId,
      principalId: SYSTEM_ACTOR,
      timing: "after",
      transitionEventSeq: Number(finalTransition.record["row_version"]),
      fromStatus: finalTransition.fromStatus,
      toStatus: finalTransition.toStatus,
      operationCode: finalTransition.operationCode,
      strictRequired: true,
    });
    expect(replay.outcomes.some((outcome) => outcome.status === "alreadyDone")).toBe(true);

    const facts = await sql<{
      commitment_status: string; commitment_version: string;
      receipt_status: string; receipt_version: string;
      invoice_status: string; invoice_version: string;
      payment_status: string; payment_version: string;
      allocation_count: string; activity_count: string; snapshot_count: string;
      outbox_count: string; journal_count: string; execution_count: string;
      budget_reserve_count: string; budget_commit_count: string;
      budget_consume_count: string; budget_release_count: string;
    }>`
      SELECT
        c.status AS commitment_status, c.row_version::text AS commitment_version,
        r.status AS receipt_status, r.row_version::text AS receipt_version,
        pi.status AS invoice_status, pi.row_version::text AS invoice_version,
        pe.status AS payment_status, pe.row_version::text AS payment_version,
        (SELECT count(*) FROM document.payment_entry_allocation a
          WHERE a.payment_entry_id = pe.id AND a.purchase_invoice_id = pi.id)::text AS allocation_count,
        (SELECT count(*) FROM log.activity_log a
          WHERE a.tenant_id = r.tenant_id
            AND a.entity_id IN (c.id, r.id, pi.id, pe.id))::text AS activity_count,
        (SELECT count(*) FROM snapshot.document_snapshot s
          WHERE s.tenant_id = r.tenant_id
            AND s.entity_id IN (c.id, r.id, pi.id, pe.id))::text AS snapshot_count,
        (SELECT count(*) FROM event.outbox o
          WHERE o.tenant_id = r.tenant_id
            AND o.entity_id IN (c.id, r.id, pi.id, pe.id))::text AS outbox_count,
        (SELECT count(*) FROM finance.journal_entry je
          WHERE je.tenant_id = r.tenant_id
            AND coalesce(to_jsonb(je)->>'source_document_id', to_jsonb(je)->>'source_doc_id')
                IN (c.id::text, r.id::text, pi.id::text, pe.id::text))::text AS journal_count,
        (SELECT count(*) FROM control.lifecycle_transition_execution e
          WHERE e.tenant_id = r.tenant_id
            AND e.source_doc_id IN (c.id, r.id, pi.id, pe.id))::text AS execution_count,
        (SELECT count(*) FROM ledger.budget_transaction bt
          WHERE bt.tenant_id = r.tenant_id AND upper(to_jsonb(bt)->>'transaction_type') = 'RESERVE')::text AS budget_reserve_count,
        (SELECT count(*) FROM ledger.budget_transaction bt
          WHERE bt.tenant_id = r.tenant_id AND upper(to_jsonb(bt)->>'transaction_type') = 'COMMIT')::text AS budget_commit_count,
        (SELECT count(*) FROM ledger.budget_transaction bt
          WHERE bt.tenant_id = r.tenant_id AND upper(to_jsonb(bt)->>'transaction_type') = 'CONSUME')::text AS budget_consume_count,
        (SELECT count(*) FROM ledger.budget_transaction bt
          WHERE bt.tenant_id = r.tenant_id AND upper(to_jsonb(bt)->>'transaction_type') = 'RELEASE')::text AS budget_release_count
      FROM document.receipt r
      JOIN document.commitment c ON c.id = r.commitment_id
      JOIN document.purchase_invoice pi ON pi.commitment_id = r.commitment_id
      JOIN document.payment_entry_allocation pea ON pea.purchase_invoice_id = pi.id
      JOIN document.payment_entry pe ON pe.id = pea.payment_entry_id
      WHERE r.id = ${receiptCreated.receiptId}::uuid
        AND pi.id = ${invoiceCreated.invoiceId}::uuid
        AND pe.id = ${paymentCreated.paymentId}::uuid
    `.execute(mustDb());

    const row = facts.rows[0]!;
    expect(row.commitment_status).toBe("closed");
    expect(row.receipt_status).toBe("posted");
    expect(row.invoice_status).toBe("posted");
    expect(row.payment_status).toBe("cleared");
    expect(Number(row.commitment_version)).toBeGreaterThan(1);
    expect(Number(row.receipt_version)).toBeGreaterThan(1);
    expect(Number(row.invoice_version)).toBeGreaterThan(1);
    expect(Number(row.payment_version)).toBeGreaterThan(1);
    expect(Number(row.allocation_count)).toBe(1);
    expect(Number(row.activity_count)).toBeGreaterThanOrEqual(allTransitions.length);
    expect(Number(row.snapshot_count)).toBeGreaterThan(0);
    expect(Number(row.outbox_count)).toBeGreaterThanOrEqual(allTransitions.length);
    expect(Number(row.journal_count)).toBeGreaterThanOrEqual(3);
    expect(Number(row.execution_count)).toBeGreaterThanOrEqual(allTransitions.length * 3);
    expect(Number(row.budget_reserve_count)).toBeGreaterThan(0);
    expect(Number(row.budget_commit_count)).toBeGreaterThan(0);
    expect(Number(row.budget_consume_count)).toBeGreaterThan(0);
    expect(Number(row.budget_release_count)).toBeGreaterThan(0);
  });
});

function mustDb(): AnyDb {
  if (!db) throw new Error("P2P chain database is not initialized");
  return db;
}

async function transitionTo(entityCode: string, recordId: string, toStatus: string) {
  const table = entityCode === "receipt"
    ? "document.receipt"
    : entityCode === "purchase_invoice"
      ? "document.purchase_invoice"
      : entityCode === "purchase_order"
        ? "document.commitment"
        : "document.payment_entry";
  const current = await sql<{ status: string; row_version: number }>`
    SELECT status, row_version FROM ${sql.table(table)}
     WHERE id = ${recordId}::uuid
  `.execute(mustDb());
  const transition = await sql<{ operation_code: string }>`
    SELECT lt.operation_code
      FROM control.entity_lifecycle el
      JOIN control.lifecycle_transition lt ON lt.lifecycle_id = el.lifecycle_id AND lt.is_active
      JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
      JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
     WHERE el.entity_name = ${entityCode}
       AND (el.tenant_id IS NULL OR el.tenant_id = ${preconditionTenant()}::uuid)
       AND fs.code = ${current.rows[0]?.status ?? ""}
       AND ts.code = ${toStatus}
     ORDER BY el.tenant_id NULLS LAST, el.priority, lt.id
     LIMIT 1
  `.execute(mustDb());
  expect(transition.rows[0], `${entityCode} ${current.rows[0]?.status}->${toStatus}`).toBeDefined();
  const result = await executeLifecycleTransition({
    db: mustDb(),
    tenantId: preconditionTenant(),
    entityCode,
    recordId,
    operationCode: transition.rows[0]!.operation_code,
    principalId: SYSTEM_ACTOR,
    operationPayload: {
      expected_row_version: Number(current.rows[0]!.row_version),
      reason: "P2P completed-chain integration fixture",
      posting_date: "2026-06-25",
    },
    expectedCurrentStatus: current.rows[0]!.status,
  });
  return { ...result, operationCode: transition.rows[0]!.operation_code };
}

let selectedTenantId = "";
function preconditionTenant(): string {
  if (!selectedTenantId) throw new Error("P2P chain precondition tenant is unavailable");
  return selectedTenantId;
}

async function selectValidPrecondition(database: AnyDb): Promise<Preconditions> {
  const result = await sql<Preconditions>`
    SELECT c.tenant_id::text AS "tenantId",
           c.company_code_id::text AS "companyCodeId",
           c.id::text AS "commitmentId",
           cl.id::text AS "commitmentLineId",
           coalesce(cl.site_id, site.id)::text AS "siteId",
           coalesce(cl.warehouse_id, wh.id)::text AS "warehouseId",
           pm.id::text AS "paymentMethodId",
           c.base_currency_code::text AS "currencyCode",
           (cl.quantity - cl.received_quantity - cl.released_quantity)::float8 AS "remainingQuantity"
      FROM document.commitment c
      JOIN document.commitment_line cl ON cl.commitment_id = c.id AND cl.tenant_id = c.tenant_id
      JOIN LATERAL (SELECT id FROM master.site WHERE tenant_id = c.tenant_id AND status = 'active' ORDER BY created_at LIMIT 1) site ON true
      JOIN LATERAL (SELECT id FROM master.warehouse WHERE tenant_id = c.tenant_id AND status = 'active' ORDER BY created_at LIMIT 1) wh ON true
      JOIN LATERAL (SELECT id FROM master.payment_method WHERE tenant_id = c.tenant_id AND status = 'active' ORDER BY created_at LIMIT 1) pm ON true
     WHERE c.commitment_type = 'purchase_order' AND c.status = 'active'
       AND cl.status = 'open'
       AND cl.quantity - cl.received_quantity - cl.released_quantity > 0
     ORDER BY c.created_at
     LIMIT 1
  `.execute(database);
  const row = result.rows[0];
  if (!row) {
    throw new Error("P2P_CHAIN_INTEGRATION_DATABASE_URL has no valid active PO precondition");
  }
  selectedTenantId = row.tenantId;
  return row;
}
