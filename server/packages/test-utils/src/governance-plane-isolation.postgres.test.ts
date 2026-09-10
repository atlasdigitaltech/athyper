import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { PostgresServiceHarness, loadPlaneRlsFixtures, postgresServiceTestsEnabled, type TestPlane } from "./postgres-service-harness.js";

const enabled = postgresServiceTestsEnabled();
const suite = enabled ? describe : describe.skip;
const harness = new PostgresServiceHarness();
const fixtures = loadPlaneRlsFixtures();
const planes = ["studio", "neon", "mesh"] as const;

afterAll(async () => { await harness.close(); });

suite.each(planes)("governance %s plane isolation", (plane) => {
  it("keeps an identical tenant and consent coordinate local to the selected database", async () => {
    const subjectId = randomUUID();
    const ownId = randomUUID();
    await harness.withTenantRollback(plane, fixtures[plane], async (client) => {
      await insertConsent(client, { id: ownId, subjectId, sourceCode: `${plane}.boundary`, consented: plane !== "mesh" });
      const own = await client.query<{ source_code: string; is_consented: boolean }>("SELECT source_code,is_consented FROM governance.channel_consent WHERE tenant_id=$1::uuid AND id=$2::uuid", [fixtures[plane].tenantId, ownId]);
      expect(own.rows).toEqual([{ source_code: `${plane}.boundary`, is_consented: plane !== "mesh" }]);
      for (const other of planes.filter((candidate) => candidate !== plane)) {
        await harness.withTenantRollback(other, fixtures[other], async (otherClient) => {
          const foreignRead = await otherClient.query("SELECT id FROM governance.channel_consent WHERE tenant_id=$1::uuid AND id=$2::uuid", [fixtures[other].tenantId, ownId]);
          const foreignMutation = await otherClient.query("UPDATE governance.channel_consent SET source_code=$3 WHERE tenant_id=$1::uuid AND id=$2::uuid", [fixtures[other].tenantId, ownId, `${other}.attempted-cross-plane-write`]);
          expect(foreignRead.rowCount).toBe(0);
          expect(foreignMutation.rowCount).toBe(0);
        });
      }
      const unchanged = await client.query<{ source_code: string }>("SELECT source_code FROM governance.channel_consent WHERE tenant_id=$1::uuid AND id=$2::uuid", [fixtures[plane].tenantId, ownId]);
      expect(unchanged.rows[0]?.source_code).toBe(`${plane}.boundary`);
    });
  });
});

async function insertConsent(client: PoolClient, input: { id: string; subjectId: string; sourceCode: string; consented: boolean }): Promise<void> {
  const tenantId = fixtures.neon.tenantId;
  const eventId = randomUUID();
  await client.query("INSERT INTO event.channel_consent_event(id,tenant_id,subject_type,subject_id,channel_code,action,source_code) VALUES($1::uuid,$2::uuid,'principal',$3::uuid,'email',$4,$5)", [eventId,tenantId,input.subjectId,input.consented ? 'granted' : 'revoked',input.sourceCode]);
  await client.query("INSERT INTO governance.channel_consent(id,tenant_id,subject_type,subject_id,channel_code,is_consented,effective_at,last_event_id,source_code,evidence) VALUES($1::uuid,$2::uuid,'principal',$3::uuid,'email',$4,now(),$5::uuid,$6,jsonb_build_object('suite','plane-boundary'))", [input.id, tenantId, input.subjectId, input.consented, eventId, input.sourceCode]);
}
