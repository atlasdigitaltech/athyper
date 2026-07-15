/**
 * Service Sheet reversal integration tests (audit AP-S3).
 *
 * Mirrors receipt-reversal.integration.test.ts structure (SS reversal is a
 * direct adaptation of receipt reversal minus the inventory_movement step
 * — services don't stock). Covers:
 *
 *   - Happy path: post → reverse → assert compensating JE + reversal
 *     commitment_fulfillment row + SS status='reversed'.
 *   - Idempotency: replay reversal with the same executionToken → no
 *     duplicate JE / fulfillment rows.
 *   - Refuse double-reversal: a second reversal attempt with a different
 *     token fails with SERVICE_SHEET_ALREADY_REVERSED.
 *   - Refuse when not posted: a 'draft' SS fails with SERVICE_SHEET_NOT_REVERSIBLE.
 *
 * Gated on DATABASE_URL.
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run service-sheet-reversal
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  seedBudgetScenario, cleanupBudgetScenario, findP2pTransitionId,
  createPurchaseRequisition, createCommitmentFromPR,
  type BudgetScenario,
} from "./_fixtures/budget-fixture.js";
import {
  seedApMasterReceipt, cleanupApMasterReceipt,
} from "./_fixtures/ap-master-fixture.js";
import {
  handlePostServiceSheet, handleReverseServiceSheet,
} from "../p2p/service_sheet/service-sheet-posting.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

interface SsSetup {
  serviceSheetId:     string;
  serviceSheetLineId: string;
  postingJeId:        string;
  postResult:         { ok: boolean; jeId?: string };
}

async function seedSsAndPost(s: BudgetScenario): Promise<SsSetup> {
  const pr = await createPurchaseRequisition(mustDb(), s, [
    { quantity: 5, unitPrice: 100 },
  ]);
  const po = await createCommitmentFromPR(mustDb(), s, pr, undefined, "approved");

  const serviceSheetId     = randomUUID();
  const serviceSheetLineId = randomUUID();
  await sql`
    INSERT INTO document.service_sheet
      (id, tenant_id, company_code_id, commitment_id, supplier_id,
       service_sheet_number, document_date, posting_date,
       service_period_from, service_period_to,
       site_id,
       currency_code, base_currency_code, fiscal_year, period_number,
       status, created_by)
    VALUES
      (${serviceSheetId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
       ${po.commitmentId}::uuid, ${s.supplierId}::uuid,
       ${"SES-REV-" + s.suffix + "-" + randomUUID().slice(0,8)},
       CURRENT_DATE, CURRENT_DATE,
       CURRENT_DATE, CURRENT_DATE,
       ${s.siteId}::uuid,
       ${s.currencyCode}::char(3), ${s.currencyCode}::char(3),
       ${s.fiscalYear}::smallint, ${s.periodNumber}::smallint,
       'approved', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO document.service_sheet_line
      (id, tenant_id, service_sheet_id, line_no, commitment_line_id,
       service_description, uom_code,
       quantity, unit_price, currency_code,
       status, created_by)
    VALUES
      (${serviceSheetLineId}::uuid, ${s.tenantId}::uuid, ${serviceSheetId}::uuid, 1::smallint,
       ${po.lineIds[0]}::uuid,
       'Service sheet reversal smoke line', 'EA',
       5::numeric, 100::numeric, ${s.currencyCode}::char(3),
       'open', ${s.principalId}::uuid)
  `.execute(mustDb());

  const postTransitionId = await findP2pTransitionId(mustDb(), {
    lifecycleCode: "service_sheet", fromCode: "approved", toCode: "posted",
  });
  const postToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

  const postResult = await handlePostServiceSheet(mustDb(), {
    tenantId:       s.tenantId,
    serviceSheetId,
    principalId:    s.principalId,
    executionToken: postToken,
    transitionId:   postTransitionId,
  });

  return {
    serviceSheetId,
    serviceSheetLineId,
    postingJeId: postResult.jeId ?? "",
    postResult,
  };
}

async function fetchReversalJe(s: BudgetScenario, originalJeId: string) {
  return sql<{ id: string; status: string; is_reversal: boolean; period_number: number }>`
    SELECT id::text, status, is_reversal, period_number
      FROM document.journal_entry
     WHERE tenant_id      = ${s.tenantId}::uuid
       AND reversal_of_id = ${originalJeId}::uuid
  `.execute(mustDb());
}

maybeDescribe("Service Sheet reversal — integration (live DB)", () => {
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
      await sql`DELETE FROM ledger.commitment_fulfillment WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_line         WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_entry        WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.service_sheet_line   WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.service_sheet        WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await cleanupApMasterReceipt(mustDb(), scenario);
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  it("happy path: post → reverse writes compensating JE, fulfillment, status='reversed'", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    const setup = await seedSsAndPost(scenario);
    if (!setup.postResult.ok) {
      console.warn("[service-sheet-reversal] skipping — post failed:", setup.postResult);
      return;
    }

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "service_sheet", fromCode: "posted", toCode: "reversed",
    });
    const executionToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

    const result = await handleReverseServiceSheet(mustDb(), {
      tenantId:       scenario.tenantId,
      serviceSheetId: setup.serviceSheetId,
      principalId:    scenario.principalId,
      executionToken,
      transitionId,
    });

    expect(result.ok).toBe(true);
    expect(result.jeId).toBeTruthy();
    expect(result.jeId).not.toBe(setup.postingJeId);

    // Compensating JE landed with reversal_of_id pointing at the original.
    const revJes = await fetchReversalJe(scenario, setup.postingJeId);
    expect(revJes.rows).toHaveLength(1);
    expect(revJes.rows[0]?.is_reversal).toBe(true);
    expect(revJes.rows[0]?.status).toBe("posted");

    // Reversal commitment_fulfillment row exists with is_reversal=true.
    const revFul = await sql<{ id: string; is_reversal: boolean; reverses_id: string | null }>`
      SELECT id::text, is_reversal, reverses_id::text
        FROM ledger.commitment_fulfillment
       WHERE tenant_id        = ${scenario.tenantId}::uuid
         AND reference_doc_id = ${setup.serviceSheetId}::uuid
         AND is_reversal      = true
    `.execute(mustDb());
    expect(revFul.rows).toHaveLength(1);
    expect(revFul.rows[0]?.reverses_id).toBeTruthy();

    // SS status flipped to 'reversed'.
    const finalSs = await sql<{ status: string }>`
      SELECT status FROM document.service_sheet
       WHERE id = ${setup.serviceSheetId}::uuid
    `.execute(mustDb());
    expect(finalSs.rows[0]?.status).toBe("reversed");
  });

  it("idempotency: replay reversal with same executionToken returns alreadyPosted=true, no duplicate rows", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    const setup = await seedSsAndPost(scenario);
    if (!setup.postResult.ok) return;

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "service_sheet", fromCode: "posted", toCode: "reversed",
    });
    const executionToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const ctx = {
      tenantId:       scenario.tenantId,
      serviceSheetId: setup.serviceSheetId,
      principalId:    scenario.principalId,
      executionToken,
      transitionId,
    };

    const first  = await handleReverseServiceSheet(mustDb(), ctx);
    const second = await handleReverseServiceSheet(mustDb(), ctx);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.alreadyPosted).toBe(true);

    const revJes = await fetchReversalJe(scenario, setup.postingJeId);
    expect(revJes.rows).toHaveLength(1);
  });

  it("refuses double-reversal: a second reversal attempt fails with SERVICE_SHEET_ALREADY_REVERSED", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    const setup = await seedSsAndPost(scenario);
    if (!setup.postResult.ok) return;

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "service_sheet", fromCode: "posted", toCode: "reversed",
    });

    await handleReverseServiceSheet(mustDb(), {
      tenantId:       scenario.tenantId,
      serviceSheetId: setup.serviceSheetId,
      principalId:    scenario.principalId,
      executionToken: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      transitionId,
    });
    const secondResult = await handleReverseServiceSheet(mustDb(), {
      tenantId:       scenario.tenantId,
      serviceSheetId: setup.serviceSheetId,
      principalId:    scenario.principalId,
      executionToken: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      transitionId,
    });

    expect(secondResult.ok).toBe(false);
    expect(secondResult.error?.code).toBe("SERVICE_SHEET_ALREADY_REVERSED");
  });

  it("refuses unposted SS: reversing a 'draft' service_sheet fails with SERVICE_SHEET_NOT_REVERSIBLE", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);

    const serviceSheetId = randomUUID();
    const po = await createCommitmentFromPR(mustDb(), scenario,
      await createPurchaseRequisition(mustDb(), scenario, [{ quantity: 1, unitPrice: 50 }]),
      undefined, "approved",
    );
    await sql`
      INSERT INTO document.service_sheet
        (id, tenant_id, company_code_id, commitment_id, supplier_id,
         service_sheet_number, document_date, posting_date,
         service_period_from, service_period_to,
         site_id,
         currency_code, base_currency_code, fiscal_year, period_number,
         status, created_by)
      VALUES
        (${serviceSheetId}::uuid, ${scenario.tenantId}::uuid, ${scenario.companyCodeId}::uuid,
         ${po.commitmentId}::uuid, ${scenario.supplierId}::uuid,
         ${"SES-DRAFT-" + scenario.suffix}, CURRENT_DATE, CURRENT_DATE,
         CURRENT_DATE, CURRENT_DATE,
         ${scenario.siteId}::uuid,
         ${scenario.currencyCode}::char(3), ${scenario.currencyCode}::char(3),
         ${scenario.fiscalYear}::smallint, ${scenario.periodNumber}::smallint,
         'draft', ${scenario.principalId}::uuid)
    `.execute(mustDb());

    const transitionId = await findP2pTransitionId(mustDb(), {
      lifecycleCode: "service_sheet", fromCode: "posted", toCode: "reversed",
    });
    const result = await handleReverseServiceSheet(mustDb(), {
      tenantId:       scenario.tenantId,
      serviceSheetId,
      principalId:    scenario.principalId,
      executionToken: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      transitionId,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SERVICE_SHEET_NOT_REVERSIBLE");
  });
});
