import { afterAll, describe, expect, it } from "vitest";
import {
  loadPlaneRlsFixtures,
  loadPlaneTestDatabases,
  PostgresServiceHarness,
  postgresServiceTestsEnabled,
} from "./postgres-service-harness.js";

const enabled = postgresServiceTestsEnabled();
const harness = new PostgresServiceHarness(
  enabled ? loadPlaneTestDatabases() : [],
);
describe.skipIf(!enabled)("DDL-created plane databases", () => {
  afterAll(async () => harness.close());
  const fixtures = loadPlaneRlsFixtures();
  for (const plane of ["studio", "neon", "mesh"] as const) {
    it(`${plane} verifies its physical plane, application role, request context, and RLS fixture`, async () => {
      const fixture = fixtures[plane];
      await harness.withTenantRollback(
        plane,
        fixture,
        async (client, context) => {
          expect(context).toMatchObject({
            plane,
            tenantId: fixture.tenantId,
            principalId: fixture.principalId,
          });
          expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
          expect(context.correlationId).toMatch(/^[0-9a-f-]{36}$/);
          const visible = await client.query<{
            tenant_id: string;
            principal_id: string;
          }>(
            "SELECT t.id AS tenant_id, p.id AS principal_id FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id WHERE t.id=$1::uuid AND p.id=$2::uuid",
            [fixture.tenantId, fixture.principalId],
          );
          expect(visible.rows).toEqual([
            { tenant_id: fixture.tenantId, principal_id: fixture.principalId },
          ]);
          const hidden = await client.query(
            "SELECT 1 FROM master.tenant WHERE id=$1::uuid",
            [fixture.otherTenantId],
          );
          expect(hidden.rowCount).toBe(0);
          // Tenant identity is owned by its dedicated writer, even within the tenant.
          await expect(
            client.query(
              "UPDATE master.tenant SET display_name=display_name WHERE id=$1::uuid",
              [fixture.tenantId],
            ),
          ).rejects.toMatchObject({ code: "42501" });
        },
      );
    });

    it(`${plane} rejects a connection presented as the wrong physical plane before SQL work`, async () => {
      const database = loadPlaneTestDatabases().find(
        (entry) => entry.plane === plane,
      )!;
      const claimedPlane = plane === "studio" ? "neon" : "studio";
      const wrongPlaneHarness = new PostgresServiceHarness([
        { ...database, plane: claimedPlane },
      ]);
      try {
        await expect(
          wrongPlaneHarness.withTenantRollback(
            claimedPlane,
            fixtures[claimedPlane],
            async () => undefined,
          ),
        ).rejects.toThrow(/Wrong physical database|Wrong physical plane/);
      } finally {
        await wrongPlaneHarness.close();
      }
    });
  }
});
