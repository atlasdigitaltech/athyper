import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationDescribe = process.env.RUN_FINANCE_INTEGRATION === "1" ? describe : describe.skip;

integrationDescribe("Finance Setup Phase 2 Stage C database contract", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 2 }) }) });
  });

  afterAll(async () => db?.destroy(), 30_000);

  it("installs effectivity, ambiguity and RLS protections", async () => {
    const constraints = await sql<{ conname: string }>`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('tgv_active_overlap_excl','wtc_effective_overlap_excl','otr_scope_overlap_excl')
    `.execute(db);
    expect(new Set(constraints.rows.map((row) => row.conname))).toEqual(
      new Set(["tgv_active_overlap_excl", "wtc_effective_overlap_excl", "otr_scope_overlap_excl"]),
    );

    const triggers = await sql<{ tgname: string }>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_trr_ambiguity'
    `.execute(db);
    expect(triggers.rows).toHaveLength(1);

    const tables = await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname,c.relname) IN (('control','tax_group_version'),('master','organization_tax_registration'))
    `.execute(db);
    expect(tables.rows).toHaveLength(2);
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
});
