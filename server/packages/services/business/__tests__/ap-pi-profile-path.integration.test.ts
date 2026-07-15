/**
 * AP purchase invoice — Phase 4 accounting-profile-engine integration tests
 * (audit Workstream A — A-T1 + A-T2 + A-T3 + A-T4).
 *
 * Coverage matrix (locked in plan v3):
 *
 *   A-T1: profile happy path (FROM_INTENT + POSTING_ROLE)
 *         - Dr line uses the INTENT-mapped GL (not category, not fallback)
 *         - account_source='PROFILE' on the AD row
 *   A-T2: intent-routing precedence (Step 1)
 *         - Two profiles seeded (OPEX + CAPEX); intent rule maps a CAPEX
 *           intent to the CAPEX profile
 *         - JE lands against the CAPEX profile's templates
 *   A-T3: credit-note inversion
 *         - Same fixture as A-T1 but invoice_type='credit_note',
 *           is_credit_note=true
 *         - Dr/Cr sides FLIPPED; JE.is_reversal=false
 *   A-T4: legacy coexistence
 *         - No profile seeded → handlePostInvoice falls back to legacy
 *         - account_source='FALLBACK' on the AD row
 *
 * Gated on DATABASE_URL. A-S0 assertion fires in beforeAll if the
 * blueprint DDL hasn't been applied.
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
  seedApMasterProfile, cleanupApMasterProfile,
  seedApMasterIntentMapping, cleanupApMasterIntentMapping,
  assertAccountingProfileTableExists,
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

async function enterPostedState(s: BudgetScenario, invoiceId: string): Promise<void> {
  await sql`
    UPDATE document.purchase_invoice
       SET status = 'posted'
     WHERE tenant_id = ${s.tenantId}::uuid
       AND id = ${invoiceId}::uuid
  `.execute(mustDb());
}

interface JeLineRow {
  gl_account_id:     string;
  transaction_debit: string;
  transaction_credit: string;
}

async function fetchJeLines(s: BudgetScenario, invoiceId: string): Promise<JeLineRow[]> {
  const result = await sql<JeLineRow>`
    SELECT jl.gl_account_id::text AS gl_account_id,
           jl.transaction_debit::text AS transaction_debit,
           jl.transaction_credit::text AS transaction_credit
      FROM document.journal_line jl
      JOIN document.journal_entry je
        ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
     WHERE jl.tenant_id     = ${s.tenantId}::uuid
       AND je.source_doc_id = ${invoiceId}::uuid
       AND je.source_doc_type = 'purchase_invoice'
     ORDER BY jl.line_no
  `.execute(mustDb());
  return result.rows;
}

async function fetchAdAccountSource(s: BudgetScenario, invoiceId: string): Promise<string | null> {
  const result = await sql<{ account_source: string }>`
    SELECT account_source
      FROM document.accounting_distribution
     WHERE tenant_id      = ${s.tenantId}::uuid
       AND source_doc_id  = ${invoiceId}::uuid
       AND source_doc_type = 'purchase_invoice_line'
     LIMIT 1
  `.execute(mustDb());
  return result.rows[0]?.account_source ?? null;
}

maybeDescribe("AP PI — Phase 4 profile-path integration (live DB)", () => {
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
    // A-S0 — fail fast with a clear message if the blueprint isn't applied.
    await assertAccountingProfileTableExists(db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  afterEach(async () => {
    if (scenario) {
      await sql`DELETE FROM document.journal_line  WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.journal_entry WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.purchase_invoice_line WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await sql`DELETE FROM document.purchase_invoice      WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await cleanupApMasterIntentMapping(mustDb(), scenario);
      await cleanupApMasterProfile(mustDb(), scenario);
      await cleanupApMasterPi(mustDb(), scenario);
      await cleanupApMasterReceipt(mustDb(), scenario);
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  // ── A-T1 — profile happy path ──────────────────────────────────────────
  it("A-T1: handlePostInvoice resolves Dr account through FROM_INTENT (not fallback)", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    const piSeed = await seedApMasterPi(mustDb(), scenario);
    const profileSeed = await seedApMasterProfile(mustDb(), scenario);
    const intent = await seedApMasterIntentMapping(mustDb(), scenario);

    // PI line carries the intent — that's what triggers the FROM_INTENT
    // resolver path inside buildJeLinesFromProfile.
    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100,
        description: "A-T1 intent-routed line",
        businessIntentId: intent.businessIntentId },
    ], { status: "approved", invoiceSource: "non_po" });

    await enterPostedState(scenario, pi.invoiceId);

    const result = await handlePostInvoice(
      mustDb(),
      scenario.tenantId,
      pi.invoiceId,
      scenario.principalId,
      {},
      undefined,
      undefined,
      lifecycleHookCtx(pi.invoiceId),
    );

    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
    expect(result.body["journal_entry_id"]).toBeTruthy();

    // Critical assertion — Dr line uses the INTENT GL, NOT the category
    // GL (s.glAccountId from the budget fixture) or the fallback GL.
    const jeLines = await fetchJeLines(scenario, pi.invoiceId);
    expect(jeLines.length).toBeGreaterThanOrEqual(2);

    const drLine = jeLines.find((l) => Number(l.transaction_debit) > 0);
    const crLine = jeLines.find((l) => Number(l.transaction_credit) > 0);
    expect(drLine).toBeDefined();
    expect(crLine).toBeDefined();

    expect(drLine!.gl_account_id).toBe(intent.intentGlId);
    expect(drLine!.gl_account_id).not.toBe(scenario.glAccountId);          // category default
    expect(drLine!.gl_account_id).not.toBe(profileSeed.fallbackGlId);      // template fallback
    expect(crLine!.gl_account_id).toBe(piSeed.apControlGlId);              // POSTING_ROLE → ap_trade_payable

    // AD row stamped with 'PROFILE' provenance.
    expect(await fetchAdAccountSource(scenario, pi.invoiceId)).toBe("PROFILE");
  });

  // ── A-T3 — credit-note inversion (shares A-T1's fixture, flips PI flags)
  it("A-T3: credit note inverts Dr/Cr sides; is_reversal stays false", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    const piSeed = await seedApMasterPi(mustDb(), scenario);
    await seedApMasterProfile(mustDb(), scenario);
    const intent = await seedApMasterIntentMapping(mustDb(), scenario);

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100, businessIntentId: intent.businessIntentId },
    ], {
      status: "approved",
      invoiceSource: "non_po",
      invoiceType: "credit_note",
      isCreditNote: true,
    });

    await enterPostedState(scenario, pi.invoiceId);

    const result = await handlePostInvoice(
      mustDb(), scenario.tenantId, pi.invoiceId, scenario.principalId, {},
      undefined, undefined, lifecycleHookCtx(pi.invoiceId),
    );

    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);

    const jeLines = await fetchJeLines(scenario, pi.invoiceId);
    const drLine = jeLines.find((l) => Number(l.transaction_debit) > 0);
    const crLine = jeLines.find((l) => Number(l.transaction_credit) > 0);
    expect(drLine).toBeDefined();
    expect(crLine).toBeDefined();

    // INVERTED: AP control on Dr side, intent expense on Cr side.
    expect(drLine!.gl_account_id).toBe(piSeed.apControlGlId);
    expect(crLine!.gl_account_id).toBe(intent.intentGlId);

    // JE.is_reversal stays false — credit notes are independent JEs, not
    // reversals of a prior posting.
    const je = await sql<{ is_reversal: boolean }>`
      SELECT is_reversal
        FROM document.journal_entry
       WHERE tenant_id     = ${scenario.tenantId}::uuid
         AND source_doc_id = ${pi.invoiceId}::uuid
       LIMIT 1
    `.execute(mustDb());
    expect(je.rows[0]?.is_reversal).toBe(false);
  });

  // ── A-T2 — intent routing precedence (Step 1 of deriveApInvoiceProfile)
  it("A-T2: intent_to_accounting_profile_rule routes CAPEX intent to CAPEX profile", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);

    // Two profiles seeded. OPEX is the fallback (Step 2 lookup would land
    // here); CAPEX is reachable only via the intent rule.
    const opexProfile = await seedApMasterProfile(mustDb(), scenario, {
      profileCode:     "AP_TEST_OPEX",
      fallbackGlCode:  `OPEX-FALLBACK-${scenario.suffix}`,
    });
    const capexProfile = await seedApMasterProfile(mustDb(), scenario, {
      profileCode:     "AP_TEST_CAPEX",
      fallbackGlCode:  `CAPEX-FALLBACK-${scenario.suffix}`,
    });

    const capexIntent = await seedApMasterIntentMapping(mustDb(), scenario, {
      intentDomain:  "CAPEX",
      intentGlCode:  `CAPEX-INTENT-${scenario.suffix}`,
      intentCode:    `INT-CAPEX-${scenario.suffix}`,
    });

    // intent_to_accounting_profile_rule: CAPEX intent → CAPEX profile.
    await sql`
      INSERT INTO control.intent_to_accounting_profile_rule
        (tenant_id, intent_id, resolved_profile_config_id,
         direction, flow_code, doc_type,
         priority, effective_from, is_active, created_by)
      VALUES
        (${scenario.tenantId}::uuid, ${capexIntent.businessIntentId}::uuid,
         ${capexProfile.acctProfileConfigId}::uuid,
         'INBOUND', 'NON_PO', 'STANDARD',
         10, CURRENT_DATE, true, ${scenario.principalId}::uuid)
    `.execute(mustDb());

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100,
        businessIntentId: capexIntent.businessIntentId },
    ], { status: "approved", invoiceSource: "non_po" });

    await enterPostedState(scenario, pi.invoiceId);

    const result = await handlePostInvoice(
      mustDb(), scenario.tenantId, pi.invoiceId, scenario.principalId, {},
      undefined, undefined, lifecycleHookCtx(pi.invoiceId),
    );
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);

    const jeLines = await fetchJeLines(scenario, pi.invoiceId);
    const drLine = jeLines.find((l) => Number(l.transaction_debit) > 0);
    expect(drLine).toBeDefined();

    // CAPEX intent's intent-mapped GL was used. The OPEX profile's
    // fallback GL was NOT used.
    expect(drLine!.gl_account_id).toBe(capexIntent.intentGlId);
    expect(drLine!.gl_account_id).not.toBe(opexProfile.fallbackGlId);
  });

  // ── A-T4 — legacy coexistence
  it("A-T4: with no profile seeded, AD records 'FALLBACK' (legacy path)", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await seedApMasterReceipt(mustDb(), scenario);
    await seedApMasterPi(mustDb(), scenario);
    // Deliberately NOT seeding a profile or intent mapping.

    const pi = await createPurchaseInvoiceFromPO(mustDb(), scenario, [
      { quantity: 5, unitPrice: 100 },
    ], { status: "approved", invoiceSource: "non_po" });

    await enterPostedState(scenario, pi.invoiceId);

    const result = await handlePostInvoice(
      mustDb(), scenario.tenantId, pi.invoiceId, scenario.principalId, {},
      undefined, undefined, lifecycleHookCtx(pi.invoiceId),
    );
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);

    expect(await fetchAdAccountSource(scenario, pi.invoiceId)).toBe("FALLBACK");
  });
});
