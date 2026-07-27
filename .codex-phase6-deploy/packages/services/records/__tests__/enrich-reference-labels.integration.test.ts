/**
 * Reference-label enricher — DB integration test (Phase 6).
 *
 * Exercises `enrichWithReferenceLabels` against a live PostgreSQL with
 * the canonical seed loaded. Confirms the contract end-to-end through:
 *
 *   1. `discoverReferenceFields` reads control.entity_field rows that
 *      declare reference_config.target_entity for accounting_distribution.
 *   2. `resolveTargetTable` looks up master.gl_account / cost_center via
 *      control.entity → information_schema and detects tenant_id columns.
 *   3. `fetchTargetLabels` batches one SELECT per target and returns
 *      label/code values keyed by id.
 *   4. The row projection attaches both `${name}_id_label` and
 *      `${base}_label` (+ `_code` companions) without overwriting any
 *      pre-existing non-blank value.
 *
 * Skipped when DATABASE_URL is not set — same gating as the other
 * integration suites under svc-business/__tests__.
 *
 * Run:
 *   DATABASE_URL=postgres://... pnpm vitest run enrich-reference-labels.integration
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  seedBudgetScenario, cleanupBudgetScenario,
  type BudgetScenario,
} from "../../business/__tests__/_fixtures/budget-fixture.js";
import { enrichWithReferenceLabels } from "../enrich-reference-labels.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;
function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

/**
 * Insert a synthetic AD row pointing at the scenario's gl_account /
 * cost_center / budget_allocation. We bypass the normal write services
 * because we want to test enrichment, not authorship.
 */
async function insertAdRow(
  scenario: BudgetScenario,
  overrides: { glAccountId?: string | null; costCenterId?: string | null } = {},
): Promise<string> {
  const distId = randomUUID();
  await sql`
    INSERT INTO document.accounting_distribution (
      id, tenant_id,
      source_doc_type, source_doc_id, source_line_id,
      distribution_no, distribution_basis,
      split_pct, distributed_amount, currency_code,
      account_source, gl_account_id,
      cost_center_id, budget_allocation_id,
      created_by
    ) VALUES (
      ${distId}::uuid, ${scenario.tenantId}::uuid,
      'purchase_invoice_line', ${randomUUID()}::uuid, ${randomUUID()}::uuid,
      1, 'PERCENT',
      100, 100, ${scenario.currencyCode},
      'OVERRIDE', ${overrides.glAccountId === undefined ? scenario.glAccountId : overrides.glAccountId}::uuid,
      ${overrides.costCenterId === undefined ? scenario.costCenterId : overrides.costCenterId}::uuid,
      ${scenario.budgetAllocationId}::uuid,
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());
  return distId;
}

async function readGlAccountName(scenario: BudgetScenario): Promise<{ name: string; code: string }> {
  const row = await sql<{ name: string; code: string }>`
    SELECT name, code FROM master.gl_account
     WHERE id = ${scenario.glAccountId}::uuid
     LIMIT 1
  `.execute(mustDb());
  if (!row.rows[0]) throw new Error("seeded gl_account not found");
  return row.rows[0];
}

async function readCostCenterName(scenario: BudgetScenario): Promise<{ name: string; code: string }> {
  const row = await sql<{ name: string; code: string }>`
    SELECT name, code FROM master.cost_center
     WHERE id = ${scenario.costCenterId}::uuid
     LIMIT 1
  `.execute(mustDb());
  if (!row.rows[0]) throw new Error("seeded cost_center not found");
  return row.rows[0];
}

maybeDescribe("enrichWithReferenceLabels — live DB integration", () => {
  let scenario: BudgetScenario | undefined;

  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool =
      (pgModule.default as { Pool?: unknown } | undefined)?.Pool ??
      (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("pg required for integration tests");
    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString:        LIVE_DATABASE_URL,
      max:                     3,
      idleTimeoutMillis:       5_000,
      connectionTimeoutMillis: 10_000,
    });
    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    await sql`SELECT 1`.execute(mustDb());
  });

  afterAll(async () => {
    await db?.destroy();
  });

  afterEach(async () => {
    if (scenario) {
      await sql`DELETE FROM document.accounting_distribution WHERE tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
      await cleanupBudgetScenario(mustDb(), scenario);
      scenario = undefined;
    }
  });

  it("attaches gl_account_label + cost_center_label from seeded master rows", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await insertAdRow(scenario);
    const expectedGl = await readGlAccountName(scenario);
    const expectedCc = await readCostCenterName(scenario);

    const rawRows = await sql<Record<string, unknown>>`
      SELECT * FROM document.accounting_distribution
       WHERE tenant_id = ${scenario.tenantId}::uuid
    `.execute(mustDb());

    const enriched = await enrichWithReferenceLabels(mustDb(), {
      entityCode: "accounting_distribution",
      tenantId:   scenario.tenantId,
      rows:       rawRows.rows,
    });

    expect(enriched).toHaveLength(1);
    const row = enriched[0]!;
    expect(row["gl_account_id_label"]).toBe(expectedGl.name);
    expect(row["gl_account_label"]).toBe(expectedGl.name);
    expect(row["gl_account_id_code"]).toBe(expectedGl.code);
    expect(row["gl_account_code"]).toBe(expectedGl.code);
    expect(row["cost_center_id_label"]).toBe(expectedCc.name);
    expect(row["cost_center_label"]).toBe(expectedCc.name);
  });

  it("leaves companion keys undefined when FK points at a non-existent target", async () => {
    scenario = await seedBudgetScenario(mustDb());
    // Insert with FK to a UUID that doesn't exist in master.gl_account.
    // Cost-center null tests both branches: null FK skipped entirely, and
    // a non-null FK that fails resolution also stays undefined (so any
    // client-side picker fallback that resolves via /api/lookup keeps
    // working — see assignIfBlank comment for the contract).
    await insertAdRow(scenario, {
      glAccountId:  "00000000-0000-0000-0000-000000000099",
      costCenterId: null,
    });

    const rawRows = await sql<Record<string, unknown>>`
      SELECT * FROM document.accounting_distribution
       WHERE tenant_id = ${scenario.tenantId}::uuid
    `.execute(mustDb());

    const enriched = await enrichWithReferenceLabels(mustDb(), {
      entityCode: "accounting_distribution",
      tenantId:   scenario.tenantId,
      rows:       rawRows.rows,
    });
    const row = enriched[0]!;

    // gl_account_id is non-null but points nowhere → companion stays undefined
    expect(row).not.toHaveProperty("gl_account_label");
    expect(row).not.toHaveProperty("gl_account_id_label");

    // cost_center_id is null FK → never resolved → companion stays undefined
    expect(row).not.toHaveProperty("cost_center_label");
    expect(row).not.toHaveProperty("cost_center_id_label");
  });

  it("does not overwrite a pre-existing companion label (snapshot-restore safe)", async () => {
    scenario = await seedBudgetScenario(mustDb());
    await insertAdRow(scenario);

    const rawRows = await sql<Record<string, unknown>>`
      SELECT * FROM document.accounting_distribution
       WHERE tenant_id = ${scenario.tenantId}::uuid
    `.execute(mustDb());
    // Caller pre-fills a stale label (simulates snapshot-restore path).
    rawRows.rows[0]!["gl_account_label"] = "SnapshottedName";

    const enriched = await enrichWithReferenceLabels(mustDb(), {
      entityCode: "accounting_distribution",
      tenantId:   scenario.tenantId,
      rows:       rawRows.rows,
    });
    expect(enriched[0]!["gl_account_label"]).toBe("SnapshottedName");
    // Mirror companion still gets a fresh value from DB.
    const expectedGl = await readGlAccountName(scenario);
    expect(enriched[0]!["gl_account_id_label"]).toBe(expectedGl.name);
  });
});
