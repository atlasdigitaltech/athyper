import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationDescribe = process.env.RUN_FINANCE_INTEGRATION === "1" ? describe : describe.skip;
const rollbackMarker = new Error("__finance_phase2_stage_a_rollback__");

integrationDescribe("Finance Setup Phase 2 Stage A contracts", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely<unknown>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 2 }) }),
    });
  });

  afterAll(async () => db?.destroy(), 30_000);

  it("locks the metadata, tax-role, rounding, credential, and explicit-pivot contracts", async () => {
    const contract = await sql<{
      fx_default_args: string;
      generic_bank_link_actions: number;
      tax_role_count: number;
      tax_rounding_fk: number;
      secret_key_detected: boolean;
      tenant_delete_policy_count: number;
    }>`
      SELECT
        pg_get_function_arguments(
          'master.get_fx_rate(uuid,character,character,text,date,character)'::regprocedure
        ) AS fx_default_args,
        (SELECT count(*)::int
           FROM control.entity_operation
          WHERE tenant_id IS NULL
            AND entity_name = 'bank_account_link'
            AND lower(coalesce(operation_code, permission_code)) IN ('delete','retire','cancel','deactivate'))
          AS generic_bank_link_actions,
        (SELECT count(*)::int
           FROM control.lookup_value
          WHERE tenant_id IS NULL
            AND domain_code = 'finance.posting_role'
            AND code IN (
              'output_tax_payable','input_tax_nonrecoverable','reverse_charge_input',
              'reverse_charge_output','wht_receivable','tax_rounding_variance','tax_suspense'
            )) AS tax_role_count,
        (SELECT count(*)::int
           FROM pg_constraint
          WHERE conrelid = 'control.tax_group'::regclass
            AND conname = 'tg_rounding_rule_fk') AS tax_rounding_fk,
        control.jsonb_contains_secret_key(
          '{"transport":{"client_secret":"must-not-enter-json"}}'::jsonb
        ) AS secret_key_detected,
        (SELECT count(*)::int
           FROM pg_policies
          WHERE schemaname = 'master'
            AND tablename = 'bank_account_link'
            AND policyname = 'tenant_delete') AS tenant_delete_policy_count
    `.execute(db);

    const row = contract.rows[0];
    expect(row?.fx_default_args).toMatch(/p_pivot_currency character DEFAULT NULL/);
    expect(row?.generic_bank_link_actions).toBe(0);
    expect(row?.tax_role_count).toBe(7);
    expect(row?.tax_rounding_fk).toBe(1);
    expect(row?.secret_key_detected).toBe(true);
    expect(row?.tenant_delete_policy_count).toBe(0);
  });

  it("enforces FX-policy RLS and rejects cross-tenant Company and rounding references", async () => {
    const observation: Record<string, boolean> = {};
    try {
      await db.transaction().execute(async (trx) => {
        const fixture = await sql<{
          tenant_a: string;
          tenant_b: string;
          company_a: string;
          company_b: string;
          actor_a: string;
          rounding_a: string | null;
          rounding_b: string | null;
          tax_group_a: string | null;
        }>`
          WITH tenants AS (
            SELECT id, row_number() OVER (ORDER BY id) AS rn
              FROM master.tenant
             WHERE status = 'active'
          )
          SELECT
            a.id AS tenant_a,
            b.id AS tenant_b,
            (SELECT id FROM master.company_code WHERE tenant_id = a.id AND status = 'active' ORDER BY id LIMIT 1) AS company_a,
            (SELECT id FROM master.company_code WHERE tenant_id = b.id AND status = 'active' ORDER BY id LIMIT 1) AS company_b,
            (SELECT id FROM master.principal WHERE tenant_id = a.id AND status = 'active' ORDER BY id LIMIT 1) AS actor_a,
            (SELECT id FROM control.rounding_rule WHERE tenant_id = a.id AND status = 'active' ORDER BY id LIMIT 1) AS rounding_a,
            (SELECT id FROM control.rounding_rule WHERE tenant_id = b.id AND status = 'active' ORDER BY id LIMIT 1) AS rounding_b,
            (SELECT id FROM control.tax_group WHERE tenant_id = a.id AND status = 'active' ORDER BY id LIMIT 1) AS tax_group_a
          FROM tenants a JOIN tenants b ON a.rn = 1 AND b.rn = 2
        `.execute(trx);
        const f = fixture.rows[0];
        if (!f?.company_a || !f.company_b || !f.actor_a) {
          throw new Error("Integration fixture requires two active tenants with Companies and a Tenant A principal");
        }

        await sql`SELECT set_config('app.current_tenant_id', ${f.tenant_a}, true)`.execute(trx);
        await sql`SET LOCAL ROLE athyperapp`.execute(trx);

        const inserted = await sql<{ id: string }>`
          INSERT INTO control.fx_policy (
            tenant_id, company_code_id, transaction_context, effective_from,
            allow_triangulation, status, created_by
          ) VALUES (
            ${f.tenant_a}::uuid, ${f.company_a}::uuid, 'integration_test', CURRENT_DATE,
            false, 'active', ${f.actor_a}::uuid
          ) RETURNING id
        `.execute(trx);
        const policyId = inserted.rows[0]!.id;

        let crossTenantCompanyRejected = false;
        await sql`SAVEPOINT cross_tenant_company`.execute(trx);
        try {
          await sql`
            INSERT INTO control.fx_policy (
              tenant_id, company_code_id, transaction_context, effective_from,
              allow_triangulation, status, created_by
            ) VALUES (
              ${f.tenant_a}::uuid, ${f.company_b}::uuid, 'invalid_cross_tenant', CURRENT_DATE,
              false, 'active', ${f.actor_a}::uuid
            )
          `.execute(trx);
        } catch {
          crossTenantCompanyRejected = true;
          await sql`ROLLBACK TO SAVEPOINT cross_tenant_company`.execute(trx);
        }

        let crossTenantRoundingRejected = !f.rounding_b || !f.tax_group_a;
        if (f.rounding_b && f.tax_group_a) {
          await sql`SAVEPOINT cross_tenant_rounding`.execute(trx);
          try {
            await sql`
              UPDATE control.tax_group
                 SET rounding_rule_id = ${f.rounding_b}::uuid
               WHERE tenant_id = ${f.tenant_a}::uuid AND id = ${f.tax_group_a}::uuid
            `.execute(trx);
          } catch {
            crossTenantRoundingRejected = true;
            await sql`ROLLBACK TO SAVEPOINT cross_tenant_rounding`.execute(trx);
          }
        }

        await sql`SELECT set_config('app.current_tenant_id', ${f.tenant_b}, true)`.execute(trx);
        const hidden = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM control.fx_policy WHERE id = ${policyId}::uuid
        `.execute(trx);

        observation.crossTenantCompanyRejected = crossTenantCompanyRejected;
        observation.crossTenantRoundingRejected = crossTenantRoundingRejected;
        observation.rlsHidTenantAPolicy = hidden.rows[0]?.count === 0;
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }

    expect(observation.crossTenantCompanyRejected).toBe(true);
    expect(observation.crossTenantRoundingRejected).toBe(true);
    expect(observation.rlsHidTenantAPolicy).toBe(true);
  }, 30_000);
});
