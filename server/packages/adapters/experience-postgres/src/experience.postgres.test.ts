import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { loadPlaneRlsFixtures, loadPlaneTestDatabases, postgresServiceTestsEnabled } from "@athyper/server-test-utils";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { KyselyExperiencePlaneRepository } from "./index.js";

const enabled = postgresServiceTestsEnabled();
const databases = enabled ? loadPlaneTestDatabases() : [];
const fixtures = loadPlaneRlsFixtures();
const clients = databases.map((configuration) => ({ configuration, pool: new Pool({ connectionString: configuration.connectionString, max: 2 }), database: undefined as Kysely<Record<string, never>> | undefined }));
for (const item of clients) item.database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: item.pool }) });

afterAll(async () => { await Promise.all(clients.map(async (item) => { await item.database?.destroy(); })); });

describe.runIf(enabled)("experience projection against current all-plane DDL", () => {
  for (const item of clients) {
    it(`${item.configuration.plane}: reads current identity/profile/catalog/features and enforces RLS isolation`, async () => {
      const plane = item.configuration.plane;
      const fixture = fixtures[plane];
      const database = item.database!;
      await database.transaction().execute(async (transaction) => {
        if (!/^[a-z_][a-z0-9_]*$/.test(item.configuration.expectedRole)) throw new Error("Unsafe database role fixture");
        await sql.raw(`SET LOCAL ROLE "${item.configuration.expectedRole}"`).execute(transaction);
        await sql`SELECT set_config('app.current_tenant_id', ${fixture.tenantId}, true), set_config('app.current_principal_id', ${fixture.principalId}, true), set_config('app.current_request_id', '11111111-1111-4111-8111-111111111119', true), set_config('app.current_correlation_id', '11111111-1111-4111-8111-111111111118', true), set_config('app.current_plane_key', ${plane}, true)`.execute(transaction);
        const physical = await sql<{ databaseName: string; configuredPlane: string | null }>`SELECT current_database() AS "databaseName", current_setting('app.database_plane', true) AS "configuredPlane"`.execute(transaction);
        expect(physical.rows[0]?.databaseName).toBe(plane === "studio" ? "athyper_studio" : `athyper_${plane}`);
        expect(physical.rows[0]?.configuredPlane).toBe(plane);

        const raw = await sql<{ realmKey: string; authEpoch: number }>`SELECT t.realm_key AS "realmKey", p.auth_epoch AS "authEpoch" FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id WHERE t.id=${fixture.tenantId}::uuid AND p.id=${fixture.principalId}::uuid`.execute(transaction);
        expect(raw.rows[0]).toBeDefined();
        const context = requestContext(plane, fixture.tenantId, fixture.principalId, raw.rows[0]!.realmKey, raw.rows[0]!.authEpoch);
        const repository = new KyselyExperiencePlaneRepository(transaction as unknown as Kysely<Record<string, never>>);
        const identity = await repository.readIdentity(context, new Date());
        expect(identity).toMatchObject({ tenantRealmKey: raw.rows[0]!.realmKey, principalAuthEpoch: raw.rows[0]!.authEpoch });
        const profile = await repository.readProfile(context);
        expect(profile.revision).toEqual(expect.any(String));
        if (identity?.subscriptionPlanId) {
          const catalog = await repository.readCatalog(context, identity.subscriptionPlanId);
          expect(catalog).toBeDefined();
          expect(catalog?.associations.map((entry) => [entry.workspaceSortOrder, entry.moduleSortOrder])).toEqual([...catalog!.associations].sort((a, b) => a.workspaceSortOrder - b.workspaceSortOrder || a.moduleSortOrder - b.moduleSortOrder).map((entry) => [entry.workspaceSortOrder, entry.moduleSortOrder]));
        }
        const features = await repository.readFeatures(context, new Date());
        expect(new Set(features.map((feature) => feature.code)).size).toBe(features.length);

        const other = requestContext(plane, fixture.otherTenantId, fixture.otherPrincipalId, raw.rows[0]!.realmKey, 0);
        await expect(repository.readIdentity(other, new Date())).resolves.toBeUndefined();
        await expect(repository.readProfile(other)).resolves.toMatchObject({ revision: "profile:missing" });
      });
    });
  }
});

function requestContext(planeKey: "studio" | "neon" | "mesh", tenantId: string, principalId: string, realmKey: string, authEpoch: number): VerifiedRequestContext {
  return { planeKey, tenantId, principalId, realmKey, authEpoch, requestId: "experience-ddl-test", profileHash: "ddl-profile", permissions: { planeKey, tenantId, principalId, principalFingerprint: "ddl-principal", profileHash: "ddl-profile", schemaHash: "ddl-schema", resolvedAt: Date.now(), allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } };
}
