import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationDescribe = process.env.RUN_FINANCE_INTEGRATION === "1" ? describe : describe.skip;

integrationDescribe("finance governance Stage 3-5 database contracts", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }) });
  });

  afterAll(async () => db?.destroy(), 30_000);

  it("seeds canonical cycles, executable tasks, and the Stage F rollout-aware posting gate", async () => {
    const { rows } = await sql<{
      tenant_count: number;
      canonical_opening_types: number;
      legacy_opening_types: number;
      readiness_types: number;
      executable_tasks: number;
      gate_enabled: boolean;
      trigger_count: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM master.tenant t WHERE t.status = 'active'
          AND EXISTS (SELECT 1 FROM master.company_code cc WHERE cc.tenant_id = t.id)) AS tenant_count,
        (SELECT count(*)::int FROM governance.cycle_type WHERE type_code = 'OPENING_BALANCE_MIGRATION') AS canonical_opening_types,
        (SELECT count(*)::int FROM governance.cycle_type WHERE type_code = 'OPENING_BALANCE') AS legacy_opening_types,
        (SELECT count(*)::int FROM governance.cycle_type WHERE type_code = 'FIN_SETUP_READINESS') AS readiness_types,
        (SELECT count(*)::int FROM governance.cycle_task_template WHERE completion_mode <> 'MANUAL' AND system_check_handler IS NOT NULL) AS executable_tasks,
        (SELECT is_enabled FROM control.feature_flag WHERE code = 'finance.posting_readiness_gate') AS gate_enabled,
        (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_je_finance_readiness_gate' AND NOT tgisinternal) AS trigger_count
    `.execute(db);
    const row = rows[0]!;
    expect(row.canonical_opening_types).toBe(row.tenant_count);
    expect(row.legacy_opening_types).toBe(0);
    expect(row.readiness_types).toBe(row.tenant_count);
    expect(row.executable_tasks).toBeGreaterThan(0);
    expect(row.gate_enabled).toBe(true);
    expect(row.trigger_count).toBe(1);
  });
});
