import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { evaluatePeriodPostability } from "../finance-readiness.service.js";

const enabled = process.env.RUN_FINANCE_INTEGRATION === "1";
const integrationDescribe = enabled ? describe : describe.skip;
const rollbackMarker = new Error("__finance_period_gate_rollback__");

integrationDescribe("finance fiscal-period and book-period gates", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = required("FINANCE_INTEGRATION_DATABASE_URL");
    db = new Kysely<unknown>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }),
    });
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("reads the governance book gate and applies the most restrictive status", async () => {
    const observed: Array<{ chip: string; reasonCode: string }> = [];

    try {
      await db.transaction().execute(async (trx) => {
        const scope = await sql<{
          tenant_id: string;
          company_code_id: string;
          book_id: string;
          actor_id: string;
        }>`
          SELECT cc.tenant_id,
                 cc.id AS company_code_id,
                 ba.book_id,
                 p.id AS actor_id
            FROM master.company_code cc
            JOIN master.company_code_book_assignment ba
              ON ba.tenant_id = cc.tenant_id
             AND ba.company_code_id = cc.id
            JOIN master.principal p
              ON p.tenant_id = cc.tenant_id
             AND p.status = 'active'
           WHERE cc.status = 'active'
           ORDER BY cc.tenant_id, cc.code, ba.priority DESC
           LIMIT 1
        `.execute(trx);
        const fixture = scope.rows[0];
        if (!fixture) throw new Error("Finance integration test requires an active company, book assignment, and principal");

        await sql`SELECT set_config('app.current_tenant_id', ${fixture.tenant_id}, true)`.execute(trx);

        const period = await sql<{ id: string }>`
          INSERT INTO master.fiscal_period (
            tenant_id, code, name, company_code_id, fiscal_year, period_number,
            period_type, start_date, end_date, status, created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid, 'RLS-GATE-2098-16', 'Finance gate integration period',
            ${fixture.company_code_id}::uuid, 2098, 16,
            'adjustment', DATE '2098-12-31', DATE '2098-12-31', 'open', ${fixture.actor_id}::uuid
          )
          ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
          DO UPDATE SET status = EXCLUDED.status, updated_at = now(), updated_by = EXCLUDED.created_by
          RETURNING id
        `.execute(trx);
        const fiscalPeriodId = period.rows[0]?.id;
        if (!fiscalPeriodId) throw new Error("Unable to create fiscal-period fixture");

        await sql`
          INSERT INTO governance.book_period_status (
            tenant_id, company_code_id, book_id, fiscal_year, period_number,
            status, created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid, ${fixture.company_code_id}::uuid,
            ${fixture.book_id}::uuid, 2098, 16, 'open', ${fixture.actor_id}::uuid
          )
          ON CONFLICT (tenant_id, company_code_id, book_id, fiscal_year, period_number)
          DO UPDATE SET status = EXCLUDED.status, updated_at = now(), updated_by = EXCLUDED.created_by
        `.execute(trx);

        const context = { bookId: fixture.book_id, bookLabel: "Integration book", fiscalYear: 2098, periodNumber: 16 };
        observed.push(await evaluatePeriodPostability(trx, fixture.tenant_id, fixture.company_code_id, context));

        await sql`UPDATE master.fiscal_period SET status = 'soft_close' WHERE id = ${fiscalPeriodId}::uuid`.execute(trx);
        observed.push(await evaluatePeriodPostability(trx, fixture.tenant_id, fixture.company_code_id, context));

        await sql`UPDATE master.fiscal_period SET status = 'open' WHERE id = ${fiscalPeriodId}::uuid`.execute(trx);
        await sql`
          UPDATE governance.book_period_status
             SET status = 'hard_close'
           WHERE tenant_id = ${fixture.tenant_id}::uuid
             AND company_code_id = ${fixture.company_code_id}::uuid
             AND book_id = ${fixture.book_id}::uuid
             AND fiscal_year = 2098
             AND period_number = 16
        `.execute(trx);
        observed.push(await evaluatePeriodPostability(trx, fixture.tenant_id, fixture.company_code_id, context));

        await sql`
          DELETE FROM governance.book_period_status
           WHERE tenant_id = ${fixture.tenant_id}::uuid
             AND company_code_id = ${fixture.company_code_id}::uuid
             AND book_id = ${fixture.book_id}::uuid
             AND fiscal_year = 2098
             AND period_number = 16
        `.execute(trx);
        observed.push(await evaluatePeriodPostability(trx, fixture.tenant_id, fixture.company_code_id, context));

        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }

    expect(observed).toEqual([
      { chip: "postable", reasonCode: "period_open" },
      { chip: "adjustment_only", reasonCode: "period_adjustment_only" },
      { chip: "locked", reasonCode: "period_hard_closed" },
      { chip: "locked", reasonCode: "book_period_missing" },
    ]);
  });
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when RUN_FINANCE_INTEGRATION=1`);
  return value;
}
