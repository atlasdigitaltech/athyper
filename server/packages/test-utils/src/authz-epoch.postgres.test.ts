import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  loadPlaneTestDatabases,
  PostgresServiceHarness,
  postgresServiceTestsEnabled,
} from "./postgres-service-harness.js";

const enabled = postgresServiceTestsEnabled();
const tenantId = process.env["ATHYPER_SERVICE_TEST_TENANT_ID"];
const principalId = process.env["ATHYPER_SERVICE_TEST_PRINCIPAL_ID"];
if (enabled && (!tenantId || !principalId))
  throw new Error(
    "ATHYPER_SERVICE_TEST_TENANT_ID and ATHYPER_SERVICE_TEST_PRINCIPAL_ID are required",
  );
const harness = new PostgresServiceHarness(
  enabled
    ? loadPlaneTestDatabases().map((configuration) => ({
        ...configuration,
        connectionString:
          process.env[
            `ATHYPER_${configuration.plane.toUpperCase()}_AUTHORIZATION_TEST_DATABASE_URL`
          ] ?? configuration.connectionString,
        expectedRole: "ci_authorization_writer",
      }))
    : [],
);

describe.skipIf(!enabled)("DDL-owned authorization epoch", () => {
  afterAll(async () => harness.close());
  for (const plane of ["studio", "neon", "mesh"] as const) {
    it(`${plane} authz mutation emits invalidation and increments the plane epoch`, async () => {
      await harness.withTenantRollback(
        plane,
        { tenantId: tenantId!, principalId: principalId! },
        async (client) => {
          const roleId = randomUUID(),
            code = `wave0_${roleId.replaceAll("-", "")}`;
          const before = Number(
            (
              await client.query<{ epoch: string }>(
                "SELECT epoch::text FROM runtime_meta.authorization_epoch WHERE scope_kind='plane' AND tenant_id=$1::uuid AND plane_code=$2",
                [tenantId, plane],
              )
            ).rows[0]?.epoch ?? 0,
          );
          await client.query(
            "INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,status,created_by) VALUES($1::uuid,$2::uuid,$3,$4,'custom','api','draft',$5::uuid)",
            [roleId, tenantId, code, `Wave 0 ${plane}`, principalId],
          );
          const evidence = (
            await client.query<{
              plane_epoch: string;
              epoch_applied_at: string | null;
            }>(
              "SELECT plane_epoch::text,epoch_applied_at::text FROM event.authorization_invalidation_outbox WHERE authority_schema='authz' AND authority_table='role' AND source_row_key->>'id'=$1 ORDER BY created_at DESC LIMIT 1",
              [roleId],
            )
          ).rows[0];
          expect(evidence?.epoch_applied_at).toBeTruthy();
          expect(Number(evidence?.plane_epoch)).toBeGreaterThan(before);
          const after = Number(
            (
              await client.query<{ epoch: string }>(
                "SELECT epoch::text FROM runtime_meta.authorization_epoch WHERE scope_kind='plane' AND tenant_id=$1::uuid AND plane_code=$2",
                [tenantId, plane],
              )
            ).rows[0]?.epoch,
          );
          expect(after).toBe(Number(evidence?.plane_epoch));
        },
      );
    });
  }
});
