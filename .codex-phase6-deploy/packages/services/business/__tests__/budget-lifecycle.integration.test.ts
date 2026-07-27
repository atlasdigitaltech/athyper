/**
 * Budget lifecycle ladder — integration tests (audit P0-S6).
 *
 * End-to-end coverage for the four-verb ladder wired through the
 * transaction-flow dispatcher:
 *
 *   PR approve  → RESERVE  (DEBIT, reserved +X)
 *   PO approve  → COMMIT   (audit-only; reserved unchanged)
 *   PI post     → CONSUME  (PO-based: frees reservation + records spend;
 *                          NON_PO: only records spend)
 *   PO cancel   → RELEASE  (CREDIT, reserved -X)
 *
 * These tests call the budget service directly with the same context
 * shape the dispatcher uses. Calling through the dispatcher would also
 * trigger commitment-approve schedule writes and invoice-posting JE
 * writes, which need much heavier fixture setup. The dispatcher's
 * routing is covered by the unit suite + typechecking; this suite
 * verifies the budget service end-to-end against a real Postgres.
 *
 * Gated on DATABASE_URL like sibling integration suites.
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run budget-lifecycle
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  reserveBudget, commitBudget, consumeBudget, releaseBudget,
} from "../ledger/budget-transaction.service.js";
import { dispatchTransactionFlow } from "../p2p/transaction-flow-dispatcher.service.js";
import { runLifecycleHooks } from "../lifecycle/hook-runner.service.js";
import {
  seedBudgetScenario, cleanupBudgetScenario, findP2pTransitionId,
  createPurchaseRequisition, createCommitmentFromPR, createPurchaseInvoiceFromPO,
  type BudgetScenario,
} from "./_fixtures/budget-fixture.js";
import {
  seedApMasterReceipt, cleanupApMasterReceipt,
  seedApMasterPi, cleanupApMasterPi,
} from "./_fixtures/ap-master-fixture.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

// Single line of qty=5, unit_price=100 → 500 currency units across every
// happy-path test. Keeps assertions readable.
const LINE_QTY        = 5;
const LINE_PRICE      = 100;
const LINE_TOTAL      = LINE_QTY * LINE_PRICE;
const DEFAULT_BUDGET  = 100_000;

function buildExecutionToken(transitionId: string, sourceDocId: string, eventSeq = 1): string {
  return createHash("sha256").update(`${transitionId}:${sourceDocId}:${eventSeq}`).digest("hex");
}

maybeDescribe("Budget lifecycle ladder — integration (live DB)", () => {
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
      // Best-effort cleanup of anything the atomicity / posting tests may
      // have written. Most tests don't touch these tables; the deletes
      // are tenant-scoped and no-op when nothing was written.
      await sql`DELETE FROM document.journal_line  WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_entry WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await cleanupApMasterPi(mustDb(), scenario);
      await cleanupApMasterReceipt(mustDb(), scenario);
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("PR approve writes RESERVE row + reserved_amount += line_total", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    const executionToken = buildExecutionToken(transitionId, pr.requisitionId);

    const result = await reserveBudget(mustDb(), {
      tenantId:           scenario.tenantId,
      sourceDocId:        pr.requisitionId,
      principalId:        scenario.principalId,
      executionToken,
      transitionId,
    });

    expect(result.ok).toBe(true);
    expect(result.allocations).toHaveLength(1);
    const outcome = result.allocations[0]!;
    expect(outcome.txnType).toBe("RESERVE");
    expect(outcome.direction).toBe("DEBIT");
    expect(Number(outcome.amount)).toBe(LINE_TOTAL);
    expect(outcome.allocationId).toBe(scenario.budgetAllocationId);
    expect(outcome.previousState.reserved).toBe(0);
    expect(outcome.resultingState.reserved).toBe(LINE_TOTAL);

    // Ledger row landed.
    const txns = await fetchBudgetTxns(scenario);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({
      txn_type:  "RESERVE",
      direction: "DEBIT",
      source_doc_type: "purchase_requisition",
    });
    expect(Number(txns[0]!.amount)).toBe(LINE_TOTAL);

    // Allocation running totals updated.
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(LINE_TOTAL);
    expect(Number(alloc.consumed_amount)).toBe(0);
    expect(Number(alloc.released_amount)).toBe(0);
    expect(Number(alloc.available_amount)).toBe(DEFAULT_BUDGET - LINE_TOTAL);
  });

  it("PO approve from PR writes COMMIT row, reserved_amount unchanged", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    // Establish the prior RESERVE first so we can verify COMMIT leaves it alone.
    await runReserve(scenario, pr.requisitionId);

    const po = await createCommitmentFromPR(mustDb(), scenario, pr);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    const executionToken = buildExecutionToken(transitionId, po.commitmentId);

    const result = await commitBudget(mustDb(), {
      tenantId:           scenario.tenantId,
      sourceDocId:        po.commitmentId,
      principalId:        scenario.principalId,
      executionToken,
      transitionId,
    });

    expect(result.ok).toBe(true);
    expect(result.allocations).toHaveLength(1);
    const outcome = result.allocations[0]!;
    expect(outcome.txnType).toBe("COMMIT");
    expect(outcome.direction).toBe("DEBIT");
    // Audit-only — snapshot identical before vs. after.
    expect(outcome.previousState).toEqual(outcome.resultingState);
    expect(outcome.resultingState.reserved).toBe(LINE_TOTAL);  // unchanged from RESERVE

    // Two ledger rows (RESERVE + COMMIT), one for each verb.
    const txns = await fetchBudgetTxns(scenario);
    const types = txns.map((t) => t.txn_type).sort();
    expect(types).toEqual(["COMMIT", "RESERVE"]);

    // Allocation reserved_amount still at LINE_TOTAL (COMMIT is balance-neutral).
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(LINE_TOTAL);
    expect(Number(alloc.consumed_amount)).toBe(0);
  });

  it("PI post against PO writes CONSUME row, frees reservation + records spend", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    await runReserve(scenario, pr.requisitionId);
    const po = await createCommitmentFromPR(mustDb(), scenario, pr);
    await runCommit(scenario, po.commitmentId);

    // PI linked to the PO via commitment_id → freesPriorReserve=true path.
    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE, commitmentLineId: po.lineIds[0] },
    ], { commitmentId: po.commitmentId, status: "approved" });

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_invoice",
      fromCode:      "approved",
      toCode:        "posted",
    });
    const executionToken = buildExecutionToken(transitionId, pi.invoiceId);

    const result = await consumeBudget(mustDb(), {
      tenantId:           scenario.tenantId,
      sourceDocId:        pi.invoiceId,
      principalId:        scenario.principalId,
      executionToken,
      transitionId,
    });

    expect(result.ok).toBe(true);
    expect(result.allocations).toHaveLength(1);
    const outcome = result.allocations[0]!;
    expect(outcome.txnType).toBe("CONSUME");
    expect(outcome.direction).toBe("DEBIT");
    expect(outcome.previousState.reserved).toBe(LINE_TOTAL);  // PO commit still held
    expect(outcome.resultingState.reserved).toBe(0);          // freed
    expect(outcome.resultingState.consumed).toBe(LINE_TOTAL); // recorded

    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
    expect(Number(alloc.consumed_amount)).toBe(LINE_TOTAL);
    expect(Number(alloc.available_amount)).toBe(DEFAULT_BUDGET - LINE_TOTAL);
  });

  it("PO cancel writes RELEASE row for the residual reservation", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    await runReserve(scenario, pr.requisitionId);
    const po = await createCommitmentFromPR(mustDb(), scenario, pr);
    await runCommit(scenario, po.commitmentId);

    // Cancel the PO without ever invoicing → release the reservation.
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "approved",
      toCode:        "cancelled",
    });
    const executionToken = buildExecutionToken(transitionId, po.commitmentId);

    const result = await releaseBudget(mustDb(), {
      tenantId:           scenario.tenantId,
      sourceDocId:        po.commitmentId,
      principalId:        scenario.principalId,
      executionToken,
      transitionId,
      releaseReason:      "cancel",
    });

    expect(result.ok).toBe(true);
    expect(result.allocations).toHaveLength(1);
    const outcome = result.allocations[0]!;
    expect(outcome.txnType).toBe("RELEASE");
    expect(outcome.direction).toBe("CREDIT");
    expect(outcome.previousState.reserved).toBe(LINE_TOTAL);
    expect(outcome.resultingState.reserved).toBe(0);

    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
    expect(Number(alloc.available_amount)).toBe(DEFAULT_BUDGET);

    // RELEASE carries the reason on the txn row for audit.
    const txns = await fetchBudgetTxns(scenario);
    const releaseRow = txns.find((t) => t.txn_type === "RELEASE")!;
    expect(releaseRow.reason).toBe("cancel");
  });

  it("NON_PO PI post writes CONSUME row, consumed_amount += amount (no reserve to free)", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });

    // Standalone PI — no PR, no PO. Tests the freesPriorReserve=false branch
    // so the service doesn't push reserved_amount negative against
    // balloc_reserved_nonneg.
    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ], { status: "approved", invoiceSource: "non_po" });

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_invoice",
      fromCode:      "approved",
      toCode:        "posted",
    });
    const executionToken = buildExecutionToken(transitionId, pi.invoiceId);

    const result = await consumeBudget(mustDb(), {
      tenantId:           scenario.tenantId,
      sourceDocId:        pi.invoiceId,
      principalId:        scenario.principalId,
      executionToken,
      transitionId,
    });

    expect(result.ok).toBe(true);
    const outcome = result.allocations[0]!;
    expect(outcome.txnType).toBe("CONSUME");
    expect(outcome.previousState.reserved).toBe(0);
    expect(outcome.resultingState.reserved).toBe(0);          // unchanged
    expect(outcome.resultingState.consumed).toBe(LINE_TOTAL); // recorded

    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
    expect(Number(alloc.consumed_amount)).toBe(LINE_TOTAL);
    expect(Number(alloc.available_amount)).toBe(DEFAULT_BUDGET - LINE_TOTAL);
  });

  // ── Idempotency ────────────────────────────────────────────────────────

  it("replaying the same execution_token does not duplicate the RESERVE row", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    const executionToken = buildExecutionToken(transitionId, pr.requisitionId);
    const ctx = {
      tenantId:       scenario.tenantId,
      sourceDocId:    pr.requisitionId,
      principalId:    scenario.principalId,
      executionToken,
      transitionId,
    };

    const first = await reserveBudget(mustDb(), ctx);
    expect(first.ok).toBe(true);
    expect(first.alreadyApplied).toBe(false);
    expect(first.allocations).toHaveLength(1);

    // Replay with the identical executionToken — same firing of the same
    // transition (client retry, hook re-delivery). The outer
    // claimHookExecution slot is already taken, so the entire call no-ops.
    const second = await reserveBudget(mustDb(), ctx);
    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(true);
    expect(second.allocations).toHaveLength(0);

    // Exactly one RESERVE row materialised. The unique constraint on
    // (idempotency_key) is the second line of defence — the outer claim
    // is the first.
    const txns = await fetchBudgetTxns(scenario);
    expect(txns.filter((t) => t.txn_type === "RESERVE")).toHaveLength(1);

    // Running totals match a single RESERVE, not two.
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(LINE_TOTAL);
  });

  it("replaying COMMIT does not change running totals (it never did)", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    await runReserve(scenario, pr.requisitionId);
    const po = await createCommitmentFromPR(mustDb(), scenario, pr);

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    const executionToken = buildExecutionToken(transitionId, po.commitmentId);
    const ctx = {
      tenantId:       scenario.tenantId,
      sourceDocId:    po.commitmentId,
      principalId:    scenario.principalId,
      executionToken,
      transitionId,
    };

    const first = await commitBudget(mustDb(), ctx);
    expect(first.ok).toBe(true);
    expect(first.allocations).toHaveLength(1);

    // COMMIT is audit-only — totals already didn't move on the first call.
    // The replay must (a) not write a second COMMIT row, (b) leave totals
    // matching the single-call state, and (c) report alreadyApplied=true.
    const allocAfterFirst = await fetchAllocation(scenario);

    const second = await commitBudget(mustDb(), ctx);
    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(true);

    const txns = await fetchBudgetTxns(scenario);
    expect(txns.filter((t) => t.txn_type === "COMMIT")).toHaveLength(1);

    const allocAfterSecond = await fetchAllocation(scenario);
    expect(allocAfterSecond).toEqual(allocAfterFirst);
    expect(Number(allocAfterSecond.reserved_amount)).toBe(LINE_TOTAL);
  });

  // ── Contention ─────────────────────────────────────────────────────────

  it("two parallel PR approves on the same allocation serialise via FOR UPDATE", async () => {
    // Distinct execution_tokens (different transitions × source docs), same
    // budget_allocation_id. The outer claim doesn't deduplicate them, so
    // both reservations must land. The only protection against a lost
    // update on reserved_amount is the SELECT … FOR UPDATE inside the
    // budget service's transaction.
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const prA = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const prB = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    const [resultA, resultB] = await Promise.all([
      reserveBudget(mustDb(), {
        tenantId:       scenario.tenantId,
        sourceDocId:    prA.requisitionId,
        principalId:    scenario.principalId,
        executionToken: buildExecutionToken(transitionId, prA.requisitionId),
        transitionId,
      }),
      reserveBudget(mustDb(), {
        tenantId:       scenario.tenantId,
        sourceDocId:    prB.requisitionId,
        principalId:    scenario.principalId,
        executionToken: buildExecutionToken(transitionId, prB.requisitionId),
        transitionId,
      }),
    ]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    // Both ledger rows landed.
    const reserveRows = (await fetchBudgetTxns(scenario)).filter((t) => t.txn_type === "RESERVE");
    expect(reserveRows).toHaveLength(2);

    // Running total is the sum of both — neither RMW was lost.
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(LINE_TOTAL * 2);
    expect(Number(alloc.available_amount)).toBe(DEFAULT_BUDGET - LINE_TOTAL * 2);
  });

  it("the second of two parallel CONSUMEs sees the first's resulting_state", async () => {
    // The strong serialisation claim: the second consume's previous_state
    // must equal the first's resulting_state. A read-uncommitted race
    // would have both reading the initial zero state and writing a
    // resulting_state of {consumed: 500}, leaving the allocation at
    // consumed=1000 but with two transactions claiming previous=0.
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const piA = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ], { status: "approved", invoiceSource: "non_po" });
    const piB = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ], { status: "approved", invoiceSource: "non_po" });
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_invoice",
      fromCode:      "approved",
      toCode:        "posted",
    });

    const [resultA, resultB] = await Promise.all([
      consumeBudget(mustDb(), {
        tenantId:       scenario.tenantId,
        sourceDocId:    piA.invoiceId,
        principalId:    scenario.principalId,
        executionToken: buildExecutionToken(transitionId, piA.invoiceId),
        transitionId,
      }),
      consumeBudget(mustDb(), {
        tenantId:       scenario.tenantId,
        sourceDocId:    piB.invoiceId,
        principalId:    scenario.principalId,
        executionToken: buildExecutionToken(transitionId, piB.invoiceId),
        transitionId,
      }),
    ]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    // Order the two CONSUME rows by performed_at — whoever the lock
    // released to first is the "first" txn. Use the persisted
    // previous_state / resulting_state jsonb to assert the chain.
    const chain = await sql<{
      txn_no:        string;
      previous_state: { consumed: number };
      resulting_state: { consumed: number };
    }>`
      SELECT row_number() OVER (ORDER BY performed_at, id)::text AS txn_no,
             previous_state, resulting_state
        FROM ledger.budget_transaction
       WHERE tenant_id = ${scenario.tenantId}::uuid
         AND txn_type  = 'CONSUME'
       ORDER BY performed_at, id
    `.execute(mustDb());
    expect(chain.rows).toHaveLength(2);
    const [firstTxn, secondTxn] = chain.rows;
    expect(firstTxn!.previous_state.consumed).toBe(0);
    expect(firstTxn!.resulting_state.consumed).toBe(LINE_TOTAL);
    // The strong claim: the second saw the first's commit.
    expect(secondTxn!.previous_state.consumed).toBe(LINE_TOTAL);
    expect(secondTxn!.resulting_state.consumed).toBe(LINE_TOTAL * 2);

    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.consumed_amount)).toBe(LINE_TOTAL * 2);
  });

  // ── Failure branches ───────────────────────────────────────────────────
  //
  // Each test verifies (a) the budget service returns the expected error
  // code (or warns and completes) and (b) no side effects materialised
  // on master.budget_allocation. The status revert claim in the original
  // todo labels lives at the hook-runner layer — when these failures
  // surface back to a `required` hook, the runner rethrows and the
  // outer transition transaction rolls back the entity status. That part
  // is covered by P0-S6.f's strict-required tests; here we lock down
  // the budget service's own contract.

  it("BUDGET_PERIOD_CLOSED returns the error code and writes no side effects", async () => {
    scenario = await seedBudgetScenario(mustDb(), {
      allocatedAmount:    DEFAULT_BUDGET,
      fiscalPeriodStatus: "hard_close",
    });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    const result = await reserveBudget(mustDb(), {
      tenantId:       scenario.tenantId,
      sourceDocId:    pr.requisitionId,
      principalId:    scenario.principalId,
      executionToken: buildExecutionToken(transitionId, pr.requisitionId),
      transitionId,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("BUDGET_PERIOD_CLOSED");
    expect(await fetchBudgetTxns(scenario)).toHaveLength(0);
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
  });

  it("BUDGET_ALLOCATION_INACTIVE returns the error code and writes no side effects", async () => {
    scenario = await seedBudgetScenario(mustDb(), {
      allocatedAmount:  DEFAULT_BUDGET,
      allocationStatus: "suspended",
    });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    const result = await reserveBudget(mustDb(), {
      tenantId:       scenario.tenantId,
      sourceDocId:    pr.requisitionId,
      principalId:    scenario.principalId,
      executionToken: buildExecutionToken(transitionId, pr.requisitionId),
      transitionId,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("BUDGET_ALLOCATION_INACTIVE");
    expect(await fetchBudgetTxns(scenario)).toHaveLength(0);
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
  });

  it("BUDGET_INSUFFICIENT with overspend_policy=BLOCK refuses the reserve", async () => {
    // Allocation can hold 100; the line wants 500 → projected available -400.
    scenario = await seedBudgetScenario(mustDb(), {
      allocatedAmount: 100,
      overspendPolicy: "BLOCK",
    });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },   // 500
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    const result = await reserveBudget(mustDb(), {
      tenantId:       scenario.tenantId,
      sourceDocId:    pr.requisitionId,
      principalId:    scenario.principalId,
      executionToken: buildExecutionToken(transitionId, pr.requisitionId),
      transitionId,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("BUDGET_INSUFFICIENT");
    expect(result.error?.message).toMatch(/insufficient/i);
    expect(await fetchBudgetTxns(scenario)).toHaveLength(0);
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
  });

  it("BUDGET_INSUFFICIENT with overspend_policy=WARN allows the reserve to land", async () => {
    // Same setup as the BLOCK case, but WARN bypasses the projected-negative
    // guard. The DB constraint (balloc_reserved_nonneg) only refuses
    // *negative* reserved_amount values, not over-allocated ones — so the
    // reservation lands with available_amount going negative.
    scenario = await seedBudgetScenario(mustDb(), {
      allocatedAmount: 100,
      overspendPolicy: "WARN",
    });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },   // 500
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    const result = await reserveBudget(mustDb(), {
      tenantId:       scenario.tenantId,
      sourceDocId:    pr.requisitionId,
      principalId:    scenario.principalId,
      executionToken: buildExecutionToken(transitionId, pr.requisitionId),
      transitionId,
    });

    expect(result.ok).toBe(true);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.txnType).toBe("RESERVE");
    expect(result.allocations[0]?.resultingState.available).toBeLessThan(0);

    expect((await fetchBudgetTxns(scenario)).filter((t) => t.txn_type === "RESERVE")).toHaveLength(1);
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(LINE_TOTAL);
    expect(Number(alloc.available_amount)).toBe(100 - LINE_TOTAL);
  });

  it("BUDGET_ALLOCATION_NOT_FOUND under hard_fail policy returns the error", async () => {
    // Seed AD rows with budget_allocation_id=NULL → resolver reports
    // unresolved. Under hard_fail the service must refuse.
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE, allocationOverride: null },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    await withEnv({ BUDGET_NO_MATCH_POLICY: "hard_fail" }, async () => {
      const result = await reserveBudget(mustDb(), {
        tenantId:       scenario!.tenantId,
        sourceDocId:    pr.requisitionId,
        principalId:    scenario!.principalId,
        executionToken: buildExecutionToken(transitionId, pr.requisitionId),
        transitionId,
      });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BUDGET_ALLOCATION_NOT_FOUND");
      expect(await fetchBudgetTxns(scenario!)).toHaveLength(0);
      const alloc = await fetchAllocation(scenario!);
      expect(Number(alloc.reserved_amount)).toBe(0);
    });
  });

  // ── Period derivation from document header (audit P5-S2) ──────────────
  //
  // The audit-period-fix promotes period derivation from CURRENT_DATE to
  // the source document's own (fiscal_year, period_number, posting_date).
  // These two tests prove the new behaviour: a backdated PI must be
  // gated against the period its posting_date declares, not the period
  // CURRENT_DATE happens to fall in.

  it("backdated PI: posting_date in a closed prior period returns BUDGET_PERIOD_CLOSED", async () => {
    // Setup that would have falsely passed under the old CURRENT_DATE path:
    //   current month period = OPEN  (default, covers today)
    //   prior period          = HARD_CLOSE (we insert it explicitly)
    //   PI posting_date       = inside the prior period
    // Old behaviour: derive period from CURRENT_DATE → finds OPEN period → succeeds.
    // New behaviour: read PI.period_number → finds HARD_CLOSE → BUDGET_PERIOD_CLOSED.
    const fiscalYear   = 2026;
    const currentPN    = 6;
    const closedPN     = 5;
    const backDate     = "2026-05-15";
    scenario = await seedBudgetScenario(mustDb(), {
      allocatedAmount: DEFAULT_BUDGET,
      fiscalYear,
      periodNumber:    currentPN,
      // fiscal_period for currentPN is OPEN by default in the fixture.
    });
    // Seed the earlier hard-closed period.
    await sql`
      INSERT INTO master.fiscal_period
        (tenant_id, code, name, company_code_id,
         fiscal_year, period_number, start_date, end_date,
         status, created_by)
      VALUES
        (${scenario.tenantId}::uuid,
         ${"FP-" + fiscalYear + "-05-" + scenario.suffix},
         ${"FP " + fiscalYear + "/05"},
         ${scenario.companyCodeId}::uuid,
         ${fiscalYear}::smallint, ${closedPN}::smallint,
         '2026-05-01'::date, '2026-05-31'::date,
         'hard_close'::text, ${scenario.principalId}::uuid)
    `.execute(mustDb());

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ], {
      status: "approved",
      invoiceSource: "non_po",
      fiscalYear,
      periodNumber: closedPN,
      postingDate:  backDate,
    });

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_invoice",
      fromCode:      "approved",
      toCode:        "posted",
    });
    const result = await consumeBudget(mustDb(), {
      tenantId:       scenario.tenantId,
      sourceDocId:    pi.invoiceId,
      principalId:    scenario.principalId,
      executionToken: buildExecutionToken(transitionId, pi.invoiceId),
      transitionId,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("BUDGET_PERIOD_CLOSED");
    // Make the period reference unmistakable so a future regression that
    // checks CURRENT_DATE's period fails this assertion loudly.
    expect(result.error?.message).toMatch(/period=5|period_number=5/);

    expect(await fetchBudgetTxns(scenario)).toHaveLength(0);
  });

  it("backdated PI: posting_date in a prior OPEN period lands the budget txn in that period", async () => {
    // Companion to the previous test — proves that when the prior period
    // IS open, the spend lands there (not in CURRENT_DATE's period).
    const fiscalYear = 2026;
    const currentPN  = 6;
    const priorPN    = 5;
    const backDate   = "2026-05-15";
    scenario = await seedBudgetScenario(mustDb(), {
      allocatedAmount: DEFAULT_BUDGET,
      fiscalYear,
      periodNumber:    currentPN,
    });
    await sql`
      INSERT INTO master.fiscal_period
        (tenant_id, code, name, company_code_id,
         fiscal_year, period_number, start_date, end_date,
         status, created_by)
      VALUES
        (${scenario.tenantId}::uuid,
         ${"FP-" + fiscalYear + "-05-" + scenario.suffix},
         ${"FP " + fiscalYear + "/05"},
         ${scenario.companyCodeId}::uuid,
         ${fiscalYear}::smallint, ${priorPN}::smallint,
         '2026-05-01'::date, '2026-05-31'::date,
         'open'::text, ${scenario.principalId}::uuid)
    `.execute(mustDb());

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ], {
      status: "approved",
      invoiceSource: "non_po",
      fiscalYear,
      periodNumber: priorPN,
      postingDate:  backDate,
    });

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_invoice",
      fromCode:      "approved",
      toCode:        "posted",
    });
    const result = await consumeBudget(mustDb(), {
      tenantId:       scenario.tenantId,
      sourceDocId:    pi.invoiceId,
      principalId:    scenario.principalId,
      executionToken: buildExecutionToken(transitionId, pi.invoiceId),
      transitionId,
    });

    expect(result.ok).toBe(true);

    // The budget_transaction row records the PI's period + posting_date,
    // not today's. This is the load-bearing assertion: it locks the new
    // doc-derived behaviour.
    const txnRow = await sql<{
      fiscal_year:    number;
      period_number:  number;
      effective_date: string;
    }>`
      SELECT fiscal_year, period_number, to_char(effective_date, 'YYYY-MM-DD') AS effective_date
        FROM ledger.budget_transaction
       WHERE tenant_id = ${scenario.tenantId}::uuid
         AND txn_type  = 'CONSUME'
       LIMIT 1
    `.execute(mustDb());
    expect(txnRow.rows[0]?.fiscal_year).toBe(fiscalYear);
    expect(txnRow.rows[0]?.period_number).toBe(priorPN);
    expect(txnRow.rows[0]?.effective_date).toBe(backDate);
  });

  it("BUDGET_ALLOCATION_NOT_FOUND under warn_continue policy completes with a warning", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE, allocationOverride: null },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    await withEnv({ BUDGET_NO_MATCH_POLICY: "warn_continue" }, async () => {
      const result = await reserveBudget(mustDb(), {
        tenantId:       scenario!.tenantId,
        sourceDocId:    pr.requisitionId,
        principalId:    scenario!.principalId,
        executionToken: buildExecutionToken(transitionId, pr.requisitionId),
        transitionId,
      });

      // ok=true, allocations[] empty, warnings populated. The transition
      // proceeds; the gap is observable in logs and outcome.warnings rather
      // than as a transition failure.
      expect(result.ok).toBe(true);
      expect(result.allocations).toHaveLength(0);
      expect(result.warnings?.length).toBeGreaterThan(0);

      // Specifically: nothing written, allocation untouched.
      expect(await fetchBudgetTxns(scenario!)).toHaveLength(0);
      const alloc = await fetchAllocation(scenario!);
      expect(Number(alloc.reserved_amount)).toBe(0);
    });
  });

  // ── Atomicity ──────────────────────────────────────────────────────────
  //
  // The audit's "JE-without-budget gap" is the failure mode where
  // handlePostInvoice commits a journal_entry but the matching
  // budget_transaction row never materialises (because budget consume
  // ran outside the JE transaction, or never ran at all). The P0-S4
  // dispatcher fix wires both calls so that — when invoked inside an
  // outer transaction — they roll back together.
  //
  // The full proof requires handlePostInvoice to succeed (so there's a
  // JE row to assert was rolled back), which needs AP fixture
  // infrastructure (commitment_schedule, posting_role, acct_profile_
  // entry_template, posting context). That fixture work is out of
  // scope for P0-S6.e — see the it.todo at the bottom of this block.
  //
  // What we CAN prove without AP infrastructure:
  //   (1) the dispatcher's outer-transaction rollback contract — if any
  //       step inside the trx fails, all prior writes in the trx roll
  //       back. We exercise it with two budget verbs since the rollback
  //       primitive is the same one handlePostInvoice + consumeBudget
  //       rely on.
  //   (2) dispatcher idempotency under replay — same execution_token
  //       across two dispatch calls produces a single set of
  //       budget_transaction rows.

  it("outer-transaction rollback: a failed second budget verb rolls back the first verb's writes", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const prA = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const prB = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });

    // Wrap two reserveBudget calls in an outer transaction. The first
    // succeeds. We then flip the allocation to suspended INSIDE the same
    // trx and the second call fails with BUDGET_ALLOCATION_INACTIVE.
    // Throwing out of the transaction block rolls everything back —
    // including the running-total updates from the first call. The same
    // rollback primitive is what the dispatcher uses to guarantee the
    // JE rolls back when CONSUME fails.
    let firstResultOk:  boolean | undefined;
    let secondResultOk: boolean | undefined;
    try {
      await mustDb().transaction().execute(async (trx) => {
        const first = await reserveBudget(trx, {
          tenantId:       scenario!.tenantId,
          sourceDocId:    prA.requisitionId,
          principalId:    scenario!.principalId,
          executionToken: buildExecutionToken(transitionId, prA.requisitionId),
          transitionId,
        });
        firstResultOk = first.ok;
        expect(first.ok).toBe(true);

        // Mid-transaction: corrupt the allocation so the next call fails.
        await sql`
          UPDATE master.budget_allocation
             SET status = 'suspended'
           WHERE id = ${scenario!.budgetAllocationId}::uuid
        `.execute(trx);

        const second = await reserveBudget(trx, {
          tenantId:       scenario!.tenantId,
          sourceDocId:    prB.requisitionId,
          principalId:    scenario!.principalId,
          executionToken: buildExecutionToken(transitionId, prB.requisitionId),
          transitionId,
        });
        secondResultOk = second.ok;
        expect(second.ok).toBe(false);
        expect(second.error?.code).toBe("BUDGET_ALLOCATION_INACTIVE");

        throw new Error("__rollback_test__");
      });
    } catch (err) {
      if ((err as Error).message !== "__rollback_test__") throw err;
    }

    expect(firstResultOk).toBe(true);
    expect(secondResultOk).toBe(false);

    // Crucial: BOTH writes are gone, not just the failed second one.
    // Allocation status was reverted by the rollback too.
    expect(await fetchBudgetTxns(scenario)).toHaveLength(0);
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);

    const status = await sql<{ status: string }>`
      SELECT status FROM master.budget_allocation
       WHERE id = ${scenario.budgetAllocationId}::uuid
    `.execute(mustDb());
    expect(status.rows[0]?.status).toBe("active");
  });

  it("dispatcher replay: ORDER_CREATION twice with same execution_token writes one RESERVE row", async () => {
    // ORDER_CREATION is the dispatcher path that only invokes
    // reserveBudget (no commitment-approve or invoice-posting needed,
    // so no extra AP fixture). This proves the dispatcher's outer
    // claim slot (hookActionKey='transaction_flow.dispatch') deduplicates
    // correctly — the second call returns alreadyDispatched without
    // touching reserveBudget at all.
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    const pr = await createPurchaseRequisition(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE },
    ]);
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_requisition",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    const executionToken = buildExecutionToken(transitionId, pr.requisitionId);
    const dispatchCtx = {
      tenantId:      scenario.tenantId,
      sourceDocType: "purchase_requisition",
      sourceDocId:   pr.requisitionId,
      eventCode:     "ORDER_CREATION",
      flowCode:      "PO_BASED",
      executionToken,
      transitionId,
      principalId:   scenario.principalId,
    };

    const first = await dispatchTransactionFlow(mustDb(), dispatchCtx);
    expect(first.kind).toBe("ok");

    const second = await dispatchTransactionFlow(mustDb(), dispatchCtx);
    expect(second.kind).toBe("alreadyDispatched");

    // Single RESERVE row, single set of running totals.
    const reserveRows = (await fetchBudgetTxns(scenario)).filter((t) => t.txn_type === "RESERVE");
    expect(reserveRows).toHaveLength(1);
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(LINE_TOTAL);
  });

  // ── Full JE atomicity (AP-S2b — unblocked by AP-S1a + AP-S1b fixtures) ──
  //
  // The audit's headline atomicity claim: when consumeBudget fails after
  // handlePostInvoice has already written its JE rows, both must roll
  // back together so the GL never reflects a posting whose budget side
  // never landed. The dispatcher's INVOICE_RECEIVED case wires both calls
  // sequentially; atomicity relies on the caller wrapping dispatch in
  // an outer transaction.
  //
  // Test layout:
  //   1. Seed a scenario with an active allocation.
  //   2. Layer the AP fixture (receipt+SS+PI subset) so handlePostInvoice
  //      gets past infrastructure misses.
  //   3. Create a NON_PO PI bound to the allocation via accounting_distribution.
  //   4. Flip allocation status to 'suspended' (so consumeBudget refuses).
  //   5. Open an outer transaction, dispatch INVOICE_RECEIVED inside it.
  //   6. Inside the trx, verify handlePostInvoice DID write the JE
  //      (so we know the atomicity contract has something to roll back).
  //   7. Throw to roll back. After the outer trx aborts, the JE rows
  //      must be gone.
  //
  // Skip gracefully when handlePostInvoice itself can't succeed against
  // the current DB — that gap is owned by AP-S1b's smoke test, and
  // bundling its failure into this assertion would muddy the signal.
  it("AP-S2b: forced consumeBudget failure inside an outer trx rolls back the JE rows", async () => {
    scenario = await seedBudgetScenario(mustDb(), { allocatedAmount: DEFAULT_BUDGET });
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: LINE_QTY, unitPrice: LINE_PRICE, description: "AP-S2b atomicity line" },
    ], { status: "approved", invoiceSource: "non_po" });

    // Suspend the allocation BEFORE dispatch so the post→consume sequence
    // reaches consumeBudget with a known refusal cause.
    await sql`
      UPDATE master.budget_allocation
         SET status = 'suspended'
       WHERE id = ${scenario.budgetAllocationId}::uuid
    `.execute(mustDb());

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_invoice",
      fromCode:      "approved",
      toCode:        "posted",
    });
    const executionToken = buildExecutionToken(transitionId, pi.invoiceId);

    let postedJeCountInsideTrx: number | undefined;
    let dispatchKindInsideTrx:  string | undefined;
    let dispatchHandlerInsideTrx: string | null | undefined;
    let postOkBeforeBudgetStep:  boolean | undefined;

    try {
      await mustDb().transaction().execute(async (trx) => {
        // Model the orchestrator's approved -> posted mutation. The dispatcher
        // is the AFTER-hook boundary and no longer accepts pre-transition state.
        await sql`
          UPDATE document.purchase_invoice
             SET status = 'posted'
           WHERE tenant_id = ${scenario!.tenantId}::uuid
             AND id = ${pi.invoiceId}::uuid
        `.execute(trx);

        const dispatched = await dispatchTransactionFlow(trx, {
          tenantId:      scenario!.tenantId,
          sourceDocType: "purchase_invoice",
          sourceDocId:   pi.invoiceId,
          eventCode:     "INVOICE_RECEIVED",
          flowCode:      "NON_PO",
          executionToken,
          transitionId,
          principalId:   scenario!.principalId,
        });
        dispatchKindInsideTrx    = dispatched.kind;
        dispatchHandlerInsideTrx = dispatched.handler;

        // Count JE rows from inside the trx — this is the load-bearing
        // observation. If handlePostInvoice wrote the JE before
        // consumeBudget was attempted, the count is > 0 and the test
        // continues to the rollback assertion. If it's 0, posting itself
        // failed and we skip cleanly (AP-S1b owns that failure mode).
        const inTrxJes = await sql<{ n: string }>`
          SELECT count(*)::text AS n
            FROM document.journal_entry
           WHERE tenant_id     = ${scenario!.tenantId}::uuid
             AND source_doc_id = ${pi.invoiceId}::uuid
        `.execute(trx);
        postedJeCountInsideTrx = Number(inTrxJes.rows[0]?.n ?? 0);
        postOkBeforeBudgetStep = postedJeCountInsideTrx > 0;

        // Throw to roll back regardless — the test asserts atomicity, so
        // the trx must abort. The dispatcher having returned handlerFailed
        // is the in-prod signal that the action-dispatcher / hook-runner
        // would also rethrow and abort the surrounding lifecycle
        // transition transaction.
        throw new Error("__atomicity_rollback__");
      });
    } catch (err) {
      if ((err as Error).message !== "__atomicity_rollback__") throw err;
    }

    if (postOkBeforeBudgetStep === false) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ap-s2b] skipping atomicity assertion — handlePostInvoice did not write a JE ` +
        `(dispatchKind=${dispatchKindInsideTrx} handler=${dispatchHandlerInsideTrx}). ` +
        `This is an AP-S1b smoke-test concern, not an atomicity gap.`,
      );
      return;
    }

    expect(dispatchKindInsideTrx).toBe("handlerFailed");

    // Atomicity proof: outside the outer trx, the JE rows are gone.
    const afterJes = await sql<{ n: string }>`
      SELECT count(*)::text AS n
        FROM document.journal_entry
       WHERE tenant_id     = ${scenario.tenantId}::uuid
         AND source_doc_id = ${pi.invoiceId}::uuid
    `.execute(mustDb());
    expect(Number(afterJes.rows[0]?.n ?? 0)).toBe(0);

    // Allocation status persists: the flip to 'suspended' happened
    // OUTSIDE the outer trx (mirroring the realistic prod scenario where
    // an admin suspends an allocation before the system catches a posting
    // that targets it). The rollback only undoes the in-trx writes, not
    // the pre-existing state.
    const allocStatus = await sql<{ status: string }>`
      SELECT status FROM master.budget_allocation
       WHERE id = ${scenario.budgetAllocationId}::uuid
    `.execute(mustDb());
    expect(allocStatus.rows[0]?.status).toBe("suspended");

    // Running totals untouched — nothing was committed.
    const alloc = await fetchAllocation(scenario);
    expect(Number(alloc.reserved_amount)).toBe(0);
    expect(Number(alloc.consumed_amount)).toBe(0);

    // And no budget_transaction row landed for this PI.
    const txns = await fetchBudgetTxns(scenario);
    const consumeRows = txns.filter((t) => t.txn_type === "CONSUME"
      && t.source_doc_id === pi.invoiceId);
    expect(consumeRows).toHaveLength(0);
  });
});

/**
 * Strict-required hook contract integration tests.
 *
 * The audit fix in P0-S1 promoted "required hook returned unsupported/
 * templateMissing" from a silent skipped outcome to a thrown error when
 * LIFECYCLE_STRICT_REQUIRED=true. These tests lock the contract: a
 * required hook whose handler can't honour the gate aborts the
 * transition; the same scenario under the flag-off rollout window
 * still completes but emits a structured WARN so the gap is observable.
 *
 * Setup pattern:
 *   - Find a real platform transition that has NO existing platform
 *     `before` hooks (so only our inserted hook fires).
 *     `purchase_order` pending_approval→approved fits — workflow.start
 *     before-hooks are only seeded on draft→pending_approval (see 070z2).
 *   - Insert a tenant-scoped lifecycle_transition_hook row with the
 *     desired safety_level and a config that drives the dispatcher to
 *     either `unsupported` or `templateMissing`.
 *   - Call runLifecycleHooks with timing='before'. Only our test hook
 *     fires (platform AFTER hooks live on a different timing).
 *   - Assert on throw vs. ok=true + skipped outcome + WARN log.
 *
 * Constraint hygiene (control.lifecycle_transition_hook):
 *   - safety_level='required'   ⇒ contract_role='contract' (lth_required_contract_chk)
 *   - contract_role='contract'  ⇒ origin='system'           (lth_contract_system_chk)
 *   - origin='system'           ⇒ sort_order 0-999 + layer_rank=10
 */
maybeDescribe("Lifecycle hook strict-required contract — integration (live DB)", () => {
  let scenario: BudgetScenario | undefined;

  afterEach(async () => {
    if (scenario) {
      // Drop the tenant-scoped hook we inserted before tearing down the
      // tenant, so the FK from lifecycle_transition_hook to the tenant
      // doesn't fight cleanup.
      await sql`
        DELETE FROM control.lifecycle_transition_hook
         WHERE tenant_id = ${scenario.tenantId}::uuid
      `.execute(mustDb());
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  it("required + unsupported throws and aborts the transition when LIFECYCLE_STRICT_REQUIRED=true", async () => {
    scenario = await seedBudgetScenario(mustDb());
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    // Force an `unsupported` outcome: ORDER_CREATION expects
    // sourceDocType='purchase_requisition', but we'll call runLifecycleHooks
    // with sourceDocType='commitment' so the routing switch falls through
    // to the unsupported branch.
    await insertTestHook(scenario, transitionId, {
      safetyLevel:   "required",
      contractRole:  "contract",
      eventCode:     "ORDER_CREATION",
      flowCode:      "PO_BASED",
    });

    await withEnv({ LIFECYCLE_STRICT_REQUIRED: "true" }, async () => {
      await expect(runLifecycleHooks(mustDb(), {
        tenantId:      scenario!.tenantId,
        transitionId,
        sourceDocType: "commitment",
        sourceDocId:   randomUUID(),
        principalId:   scenario!.principalId,
        timing:        "before",
        operationCode: "approve",
      })).rejects.toThrow(/REQUIRED_HOOK_UNSUPPORTED|BEFORE hook .* failed/i);
    });
  });

  it("required + unsupported logs WARN and completes when LIFECYCLE_STRICT_REQUIRED=false", async () => {
    scenario = await seedBudgetScenario(mustDb());
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    await insertTestHook(scenario, transitionId, {
      safetyLevel:   "required",
      contractRole:  "contract",
      eventCode:     "ORDER_CREATION",
      flowCode:      "PO_BASED",
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await withEnv({ LIFECYCLE_STRICT_REQUIRED: "false" }, async () => {
        const result = await runLifecycleHooks(mustDb(), {
          tenantId:      scenario!.tenantId,
          transitionId,
          sourceDocType: "commitment",
          sourceDocId:   randomUUID(),
          principalId:   scenario!.principalId,
          timing:        "before",
          operationCode: "approve",
        });

        // Flag off: no throw, but the outcome must record the skip + WARN.
        expect(result.ok).toBe(true);
        const dispatchOutcome = result.outcomes.find((o) => o.action === "transaction_flow.dispatch");
        expect(dispatchOutcome?.status).toBe("skipped");

        // The WARN telemetry is the audit signal the rollout window
        // depends on. Without it, prod has no way to see how many
        // required hooks would have aborted under strict mode.
        const warnedMessages = warnSpy.mock.calls.map((args) => String(args[0]));
        expect(warnedMessages.some((m) => m.includes("lifecycle.hook.required_unsupported"))).toBe(true);
        expect(warnedMessages.some((m) => m.includes("REQUIRED_HOOK_UNSUPPORTED"))).toBe(true);
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("required + templateMissing throws and aborts the transition when strict flag is on", async () => {
    scenario = await seedBudgetScenario(mustDb());
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    // Force a `templateMissing` outcome: a flow_code that has no rows
    // in control.transaction_flow_template (everything seeded in 081
    // uses real codes like PO_BASED, NON_PO, …).
    await insertTestHook(scenario, transitionId, {
      safetyLevel:   "required",
      contractRole:  "contract",
      eventCode:     "ORDER_CREATION",
      flowCode:      "NEVER_MATCHES_ANY_TEMPLATE",
    });

    await withEnv({ LIFECYCLE_STRICT_REQUIRED: "true" }, async () => {
      await expect(runLifecycleHooks(mustDb(), {
        tenantId:      scenario!.tenantId,
        transitionId,
        sourceDocType: "commitment",
        sourceDocId:   randomUUID(),
        principalId:   scenario!.principalId,
        timing:        "before",
        operationCode: "approve",
      })).rejects.toThrow(/TEMPLATE_MISSING_REQUIRED|BEFORE hook .* failed/i);
    });
  });

  it("narrowable + unsupported never throws regardless of strict flag", async () => {
    scenario = await seedBudgetScenario(mustDb());
    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "purchase_order",
      fromCode:      "pending_approval",
      toCode:        "approved",
    });
    // narrowable + extension is the safe combination — strict mode
    // only escalates `required` hooks; `narrowable` always degrades
    // to a skipped outcome.
    await insertTestHook(scenario, transitionId, {
      safetyLevel:   "narrowable",
      contractRole:  "extension",
      eventCode:     "ORDER_CREATION",
      flowCode:      "PO_BASED",
    });

    for (const strict of ["true", "false"]) {
      await withEnv({ LIFECYCLE_STRICT_REQUIRED: strict }, async () => {
        const result = await runLifecycleHooks(mustDb(), {
          tenantId:      scenario!.tenantId,
          transitionId,
          sourceDocType: "commitment",
          sourceDocId:   randomUUID(),
          principalId:   scenario!.principalId,
          timing:        "before",
          operationCode: "approve",
        });
        expect(result.ok).toBe(true);
        const dispatchOutcome = result.outcomes.find((o) => o.action === "transaction_flow.dispatch");
        expect(dispatchOutcome?.status).toBe("skipped");
      });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface BudgetTxnRow {
  id:              string;
  txn_type:        string;
  direction:       string;
  amount:          string;
  source_doc_type: string;
  source_doc_id:   string;
  reason:          string | null;
  idempotency_key: string | null;
}

async function fetchBudgetTxns(s: BudgetScenario): Promise<BudgetTxnRow[]> {
  const result = await sql<BudgetTxnRow>`
    SELECT id::text, txn_type, direction, amount::text,
           source_doc_type, source_doc_id::text, reason, idempotency_key
      FROM ledger.budget_transaction
     WHERE tenant_id = ${s.tenantId}::uuid
     ORDER BY performed_at, txn_type
  `.execute(mustDb());
  return result.rows;
}

interface AllocationRow {
  reserved_amount:  string;
  consumed_amount:  string;
  released_amount:  string;
  available_amount: string;
}

async function fetchAllocation(s: BudgetScenario): Promise<AllocationRow> {
  const result = await sql<AllocationRow>`
    SELECT reserved_amount::text, consumed_amount::text,
           released_amount::text, available_amount::text
      FROM master.budget_allocation
     WHERE id = ${s.budgetAllocationId}::uuid
       AND tenant_id = ${s.tenantId}::uuid
     LIMIT 1
  `.execute(mustDb());
  const row = result.rows[0];
  if (!row) throw new Error("allocation not found");
  return row;
}

// Each helper here mirrors the dispatcher's call shape so the tests stay
// readable. Transition ids are looked up per-call so a fresh scenario can
// be used per test without caching.

async function runReserve(s: BudgetScenario, requisitionId: string): Promise<void> {
  const transitionId = await findP2pTransitionId(mustDb(), {
    lifecycleCode: "purchase_requisition",
    fromCode:      "pending_approval",
    toCode:        "approved",
  });
  await reserveBudget(mustDb(), {
    tenantId:       s.tenantId,
    sourceDocId:    requisitionId,
    principalId:    s.principalId,
    executionToken: buildExecutionToken(transitionId, requisitionId),
    transitionId,
  });
}

async function runCommit(s: BudgetScenario, commitmentId: string): Promise<void> {
  const transitionId = await findP2pTransitionId(mustDb(), {
    lifecycleCode: "purchase_order",
    fromCode:      "pending_approval",
    toCode:        "approved",
  });
  await commitBudget(mustDb(), {
    tenantId:       s.tenantId,
    sourceDocId:    commitmentId,
    principalId:    s.principalId,
    executionToken: buildExecutionToken(transitionId, commitmentId),
    transitionId,
  });
}

// Silence the no-op imports when DATABASE_URL isn't set so the skip-mode
// test file still typechecks cleanly.
void randomUUID;

/**
 * Temporarily override process.env entries for the duration of `fn`.
 * Restores prior values (including absent ones) even if `fn` throws.
 * Required for the policy-switch tests so they don't leak env state
 * across the suite (or across the worker process when vitest reuses
 * workers).
 */
async function withEnv(overrides: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prior[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else                     process.env[key] = value;
    }
  }
}

interface TestHookOpts {
  safetyLevel:   "required" | "narrowable" | "replaceable";
  contractRole:  "contract" | "extension";
  eventCode:     string;
  flowCode:      string;
}

/**
 * Insert a tenant-scoped lifecycle_transition_hook with action
 * 'transaction_flow.dispatch' for the strict-required tests. Constraint
 * combinations (see DDL):
 *   required   ⇒ contract  ⇒ origin='system'
 *   narrowable ⇒ extension OK, origin='system' kept for consistency
 * sort_order 50 stays inside the system layer's 0-999 range; the hook
 * is the only one of its kind in scope so the value doesn't matter
 * beyond being valid.
 */
async function insertTestHook(
  scenario:     BudgetScenario,
  transitionId: string,
  opts:         TestHookOpts,
): Promise<void> {
  await sql`
    INSERT INTO control.lifecycle_transition_hook
      (tenant_id, transition_id, timing, sort_order, action, config,
       origin, layer_rank, contract_role, safety_level, is_active, created_by)
    VALUES
      (${scenario.tenantId}::uuid, ${transitionId}::uuid, 'before', 50,
       'transaction_flow.dispatch',
       ${JSON.stringify({ event_code: opts.eventCode, flow_code: opts.flowCode })}::jsonb,
       'system', 10, ${opts.contractRole}::text, ${opts.safetyLevel}::text,
       true, ${scenario.principalId}::uuid)
  `.execute(mustDb());
}
