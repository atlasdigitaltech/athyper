import assert from "node:assert/strict";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { KyselyBusinessPartner360Repository } from "../../../../packages/services/master-data/src/kysely-business-partner-360-repository.js";
import { buildR2DatabaseFixtures } from "../../provisioning/provision-business-partner-r2-fixtures.js";

const databaseUrl = process.env.ATHYPER_NEON_DATABASE_ADMIN_URL;
if (!databaseUrl) throw new Error("Configure the local R2 fixture database");
const url = new URL(databaseUrl);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/athyper_neon"
)
  throw new Error("Local NEON database required");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: databaseUrl }),
  }),
});
try {
  await db.transaction().execute(async (tx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const organization = (
      await sql<{
        id: string;
      }>`SELECT id::text FROM master.operating_organization WHERE tenant_id=${tenantId}::uuid AND code='acceptance.bp.r2'`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(organization, "Provision the R2 fixtures first");
    const repository = new KyselyBusinessPartner360Repository();
    for (const fixture of buildR2DatabaseFixtures()) {
      const query = {
        tenantId,
        businessPartnerId: fixture.businessPartnerId,
        operatingOrganizationId: organization.id,
      };
      const core = await repository.resolveCore(query, tx);
      assert.equal(
        core?.scopeValid,
        true,
        fixture.scenario + " must be visible in its acceptance scope",
      );
      assert.equal(
        (
          await repository.resolveCore(
            {
              ...query,
              operatingOrganizationId: "00000000-0000-4000-8000-000000000001",
            },
            tx,
          )
        )?.scopeValid,
        false,
        "Unknown organization must never qualify",
      );
      if (fixture.existingRole !== "none")
        assert.equal(
          (
            await repository.resolveCore(
              {
                ...query,
                operatingOrganizationId: "b07b2544-67b9-5b03-8607-9c35d6886877",
              },
              tx,
            )
          )?.scopeValid,
          false,
          "Existing roles must not leak to another organization",
        );
      else
        assert.equal(
          (await repository.resolveCore({ ...query, roleLens: "supplier" }, tx))
            ?.scopeValid,
          false,
          "Unassigned identity must not manufacture an existing supplier scope",
        );
    }
  });
  console.log("R2 real-database scope checks passed (4 positive, 8 negative)");
} finally {
  await db.destroy();
}
