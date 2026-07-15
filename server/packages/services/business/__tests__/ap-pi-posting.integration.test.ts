/**
 * AP purchase invoice posting smoke test (audit AP-S1b deliverable).
 *
 * Drives `handlePostInvoice` end-to-end against the live DB using the
 * receipt+SS subset + the PI extension of the AP master fixture. The
 * smoke test exercises the **legacy fallback path** (not the Phase 4
 * accounting_profile engine):
 *
 *   - No master.accounting_profile / control.acct_profile_config row is
 *     seeded → deriveApInvoiceProfile returns null → invoice-posting
 *     uses the legacy hardcoded Dr Expense / Cr AP Control flow.
 *   - The AP control account is resolved through
 *     master.gl_account.subledger_type='ap'.
 *   - The per-line expense account is resolved through
 *     control.commodity_category_buy_policy + the budget fixture's
 *     gl_account.
 *
 * Gated on DATABASE_URL like the other AP integration tests.
 *
 * What this proves:
 *   - The combined fixture (budget + AP receipt + AP PI) seeds enough
 *     infrastructure for handlePostInvoice's legacy path to succeed.
 *   - Any remaining failure is either a real posting-service bug (good
 *     signal — surface it for fixing) or a deeper trigger/invariant
 *     issue the fixture doesn't cover yet.
 *
 * Out of scope:
 *   - PO-based PI (would require commitment_schedule + matching setup;
 *     covered by the future JE-atomicity test once AP-S1b grows).
 *   - WHT handling (would need a tax_group + WHT account; smoke test
 *     uses zero-tax lines).
 *   - Accounting-profile-engine path (filed as a future fixture
 *     extension).
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run ap-pi-posting
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  seedBudgetScenario, cleanupBudgetScenario,
  createPurchaseInvoiceFromPO,
  type BudgetScenario,
} from "./_fixtures/budget-fixture.js";
import {
  seedApMasterReceipt, cleanupApMasterReceipt,
  seedApMasterPi, cleanupApMasterPi,
} from "./_fixtures/ap-master-fixture.js";
import { handlePostInvoice } from "../ap/purchase_invoice/invoice-posting.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

function lifecycleHookCtx(invoiceId: string) {
  return {
    executionMode: "lifecycle_hook" as const,
    executionToken: `test:post:${invoiceId}`,
    transitionId: "00000000-0000-0000-0000-000000000001",
    transitionEventSeq: 1,
  };
}

maybeDescribe("AP purchase invoice posting — smoke test against live DB", () => {
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
      // JE rows the posting service writes when it succeeds.
      await sql`DELETE FROM document.journal_line  WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_entry WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.purchase_invoice_line WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.purchase_invoice      WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await cleanupApMasterPi(mustDb(), scenario);
      await cleanupApMasterReceipt(mustDb(), scenario);
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  it("handlePostInvoice (NON_PO, legacy path): fixture provides enough infrastructure to reach posting body", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);

    // NON_PO PI keeps matching out of the picture (only PO-based PIs run
    // through matchInvoice). Zero-tax lines skip the WHT path.
    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100, description: "AP smoke line" },
    ], {
      status: "approved",
      invoiceSource: "non_po",
    });

    // The orchestrator owns approved -> posted. Exercise the materialization
    // handler at its lifecycle AFTER-hook boundary.
    await sql`
      UPDATE document.purchase_invoice
         SET status = 'posted'
       WHERE tenant_id = ${scenario.tenantId}::uuid
         AND id = ${pi.invoiceId}::uuid
    `.execute(mustDb());

    const result = await handlePostInvoice(
      mustDb(),
      scenario.tenantId,
      pi.invoiceId,
      scenario.principalId,
      {},                              // empty body
      undefined,                       // logger
      undefined,                       // lifecycleSync
      lifecycleHookCtx(pi.invoiceId),  // lifecycle AFTER-hook context
    );

    // AP-S1b scope: prove infrastructure is sufficient. We tolerate a
    // failure that originates inside the posting body itself (e.g. a
    // trigger that needs extra state we haven't fixtured) since AP-S1b
    // is the first end-to-end PI-posting smoke test. We do NOT tolerate
    // failures that mean the fixture skipped a master row.
    const infrastructureMisses = new Set<string>([
      "INVOICE_NOT_FOUND",
      "NO_LINES",
      "NO_LEDGER_BOOK",
      "NO_OPEN_PERIOD",
      "NO_AP_CONTROL_ACCOUNT",
      "NO_EXPENSE_ACCOUNT",
    ]);

    const errorCode = typeof result.body["error"] === "string"
      ? String(result.body["error"])
      : undefined;

    if (result.status >= 200 && result.status < 300) {
      // Success — the fixture is sufficient.
      expect(result.body["journal_entry_id"]).toBeTruthy();
    } else {
      // Failure — surface the detail and refuse to pass if it's an
      // infrastructure miss the fixture should have covered.
      // eslint-disable-next-line no-console
      console.warn(
        `[ap-pi-smoke] handlePostInvoice failed: status=${result.status} code=${errorCode} body=${JSON.stringify(result.body)}`,
      );
      expect(errorCode ? infrastructureMisses.has(errorCode) : false).toBe(false);
    }
  });
});
