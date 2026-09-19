#!/usr/bin/env tsx
// Isolated SQL engineering probe. All synthetic rows and receipts are rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { CustomerPortalIntentConsumer } from "@athyper/server-platform-iam/customer-portal-delivery";
const url = process.env.ATHYPER_PLATFORM_DATABASE_ADMIN_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  new URL(url).pathname != "/athyper_studio"
)
  throw new Error("Use the isolated loopback athyper_studio database");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }),
});
const rolledBack = new Error("R5_EXPECTED_ROLLBACK");
try {
  await db.transaction().execute(async (tx) => {
    const actor = (
      await sql<{
        tenant_id: string;
        id: string;
      }>`SELECT tenant_id,id FROM master.principal WHERE code='systemadmin'`.execute(
        tx,
      )
    ).rows[0]!;
    assert.ok(actor);
    const tenant = actor.tenant_id,
      party = randomUUID(),
      org = randomUUID(),
      identity = randomUUID(),
      person = randomUUID(),
      contact = randomUUID();
    await sql`INSERT INTO master.canonical_party(id,authority_tenant_id,party_kind,legal_name,display_name,created_by) VALUES(${party}::uuid,${tenant}::uuid,'legal_entity','R5 SQL probe','R5 SQL probe',${actor.id}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO trustiam.organization(id,authority_tenant_id,canonical_party_id,realm_key,external_organization_id,display_name,status,metadata,created_by) VALUES(${org}::uuid,${tenant}::uuid,${party}::uuid,'athyper',${org},'R5 SQL probe','active','{"organizationPurpose":"customer_portal"}',${actor.id}::uuid)`.execute(
      tx,
    );
    const applications = JSON.stringify([
      { plane: "neon", targetTenantId: tenant, roles: [] },
    ]);
    await sql`INSERT INTO trustiam.identity_projection(id,authority_tenant_id,source_plane,source_tenant_id,person_id,organization_id,relationship_kind,source_ref,realm_key,normalized_identifier,display_name,desired_version,desired_hash,desired_status,desired_applications,created_by) VALUES(${identity}::uuid,${tenant}::uuid,'neon',${tenant}::uuid,${person}::uuid,${org}::uuid,'contact',${`business_partner_contact:${contact}`},'athyper',${`${identity}@example.test`},'R5 SQL contact',1,${"a".repeat(64)},'active',${applications}::jsonb,${actor.id}::uuid)`.execute(
      tx,
    );
    // The shared graph trigger still rejects hierarchy cycles after its record-shape fix.
    await sql`SAVEPOINT r5_graph`.execute(tx);
    const secondParty = randomUUID();
    await sql`INSERT INTO master.canonical_party(id,authority_tenant_id,party_kind,legal_name,display_name,created_by) VALUES(${secondParty}::uuid,${tenant}::uuid,'legal_entity','R5 second party','R5 second party',${actor.id}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO master.canonical_party_relationship(authority_tenant_id,from_party_id,to_party_id,relationship_kind,effective_from,created_by) VALUES(${tenant}::uuid,${party}::uuid,${secondParty}::uuid,'group_member',clock_timestamp(),${actor.id}::uuid)`.execute(
      tx,
    );
    await assert.rejects(
      sql`INSERT INTO master.canonical_party_relationship(authority_tenant_id,from_party_id,to_party_id,relationship_kind,effective_from,created_by) VALUES(${tenant}::uuid,${secondParty}::uuid,${party}::uuid,'group_member',clock_timestamp(),${actor.id}::uuid)`.execute(
        tx,
      ),
      /hierarchy cycle/,
    );
    await sql`ROLLBACK TO SAVEPOINT r5_graph`.execute(tx);
    const consumer = new CustomerPortalIntentConsumer(
      (work) => work(tx),
      actor.id,
    );
    const intent = {
      tenantId: tenant,
      outboxId: randomUUID(),
      customerId: randomUUID(),
      lifecycleEventId: randomUUID(),
      version: 2,
      status: "active" as const,
      contacts: [
        { sourceRef: `business_partner_contact:${contact}`, personId: person },
      ],
    };
    const first = await consumer.consume(intent),
      replay = await consumer.consume(intent);
    assert.equal(first.disposition, "pending");
    assert.deepEqual(replay, first);
    const state = (
      await sql<{
        desired_version: string;
        desired_hash: string;
        desired_applications: unknown;
      }>`SELECT desired_version,desired_hash,desired_applications FROM trustiam.identity_projection WHERE id=${identity}::uuid`.execute(
        tx,
      )
    ).rows[0]!;
    assert.equal(Number(state.desired_version), 2);
    assert.deepEqual(state.desired_applications, JSON.parse(applications));
    await assert.rejects(
      consumer.consume({ ...intent, status: "suspended" }),
      /EVENT_CONFLICT/,
    );
    await assert.rejects(
      consumer.consume({ ...intent, outboxId: randomUUID(), version: 1 }),
      /STALE_EVENT/,
    );
    // A synthetic successful attempt exercises receipt linkage only; no provider
    // was contacted and this transaction cannot produce qualification evidence.
    const attempt = randomUUID();
    await sql`INSERT INTO trustiam.identity_saga_attempt(id,authority_tenant_id,identity_projection_id,desired_version,desired_hash,attempt_no,worker_id,claim_token_hash,fencing_token,status,lease_expires_at,terminal_at,created_at,created_by,receipt) VALUES(${attempt}::uuid,${tenant}::uuid,${identity}::uuid,2,${state.desired_hash},1,'r5-synthetic',${"b".repeat(64)},1,'succeeded',clock_timestamp()+interval '90 seconds',clock_timestamp(),clock_timestamp()-interval '1 second',${actor.id}::uuid,'{"synthetic":true}')`.execute(
      tx,
    );
    const complete = await consumer.consume(intent);
    assert.equal(complete.disposition, "consumed");
    assert.deepEqual(complete.attempts, [attempt]);
    console.log(
      "PASS: exact staging replay, unchanged grants, conflicting/stale denial, pending vs exact saga receipt",
    );
    throw rolledBack;
  });
} catch (error) {
  if (error !== rolledBack) throw error;
} finally {
  await db.destroy();
}
console.log(
  "ROLLBACK: no Customer portal authority or delivery receipt retained",
);
