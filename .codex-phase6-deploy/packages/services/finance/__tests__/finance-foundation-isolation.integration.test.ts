import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCompanyFoundation } from "../services/finance-foundation.service.js";

const integrationDescribe = process.env.RUN_FINANCE_INTEGRATION === "1" ? describe : describe.skip;

integrationDescribe("finance foundation tenant and Company isolation", () => {
  let db: Kysely<unknown>;

  beforeAll(() => {
    const connectionString = process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if (!connectionString) throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }) });
  });

  afterAll(async () => db?.destroy());

  it("returns the requested Company only and never crosses the active tenant", async () => {
    await db.transaction().execute(async (trx) => {
      const fixtures = await sql<{ tenant_id: string; code: string; other_tenant_id: string | null }>`
        WITH selected_tenant AS (
          SELECT tenant_id
            FROM master.company_code
           WHERE status = 'active'
           GROUP BY tenant_id
          HAVING count(*) >= 2
           ORDER BY tenant_id
           LIMIT 1
        )
        SELECT company.tenant_id, company.code,
               (SELECT tenant.id FROM master.tenant tenant WHERE tenant.id <> company.tenant_id ORDER BY tenant.id LIMIT 1) AS other_tenant_id
          FROM master.company_code company
          JOIN selected_tenant selected ON selected.tenant_id = company.tenant_id
         WHERE company.status = 'active'
         ORDER BY company.code
         LIMIT 2
      `.execute(trx);
      if (fixtures.rows.length !== 2 || !fixtures.rows[0]?.other_tenant_id) {
        throw new Error("Integration fixture requires two active Companies in one tenant and a second tenant");
      }
      const [first, second] = fixtures.rows;
      await sql`SELECT set_config('app.current_tenant_id', ${first!.tenant_id}, true)`.execute(trx);
      await sql`SET LOCAL ROLE athyperapp`.execute(trx);

      const firstPayload = await loadCompanyFoundation(trx, first!.tenant_id, first!.code);
      const secondPayload = await loadCompanyFoundation(trx, second!.tenant_id, second!.code);
      expect(firstPayload?.context.company.code).toBe(first!.code);
      expect(secondPayload?.context.company.code).toBe(second!.code);
      expect(firstPayload?.context.company.id).not.toBe(secondPayload?.context.company.id);

      await sql`SELECT set_config('app.current_tenant_id', ${first!.other_tenant_id}, true)`.execute(trx);
      await expect(loadCompanyFoundation(trx, first!.tenant_id, first!.code)).resolves.toBeNull();
    });
  });
});
