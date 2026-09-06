#!/usr/bin/env tsx
// Synthetic source/receipt SQL checks only. No provider is contacted; rollback is mandatory.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { KyselyCustomerPortalDeliveryRepository } from "../../../../packages/platform/iam/src/customer-portal-delivery.js";
const url = process.env.ATHYPER_NEON_DATABASE_ADMIN_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  new URL(url).pathname != "/athyper_neon"
)
  throw new Error("Use the isolated loopback athyper_neon database");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }),
});
const rolledBack = new Error("R5_EXPECTED_ROLLBACK");
try {
  await db.transaction().execute(async (tx) => {
    const scope = (
      await sql<{
        tenant_id: string;
        actor_id: string;
        bp: string;
        customer: string;
        org: string;
        company: string;
      }>`SELECT b.tenant_id,b.created_by actor_id,b.id bp,c.id customer,a.operating_organization_id org,p.company_code_id company FROM master.business_partner b JOIN master.customer c ON c.tenant_id=b.tenant_id AND c.business_partner_id=b.id JOIN master.business_partner_operating_organization_assignment a ON a.tenant_id=b.tenant_id AND a.business_partner_id=b.id AND a.partner_role='customer' JOIN master.company_code_customer_profile p ON p.tenant_id=b.tenant_id AND p.customer_id=c.id WHERE b.code='R5.CUS.CONTROLS' AND c.status='prospect' AND c.record_version=1`.execute(
        tx,
      )
    ).rows[0]!;
    assert.ok(scope);
    const person = randomUUID(),
      contact = randomUUID(),
      outbox = randomUUID();
    await sql`SELECT set_config('app.current_tenant_id',${scope.tenant_id},true),set_config('app.current_principal_id',${scope.actor_id},true),set_config('app.database_plane','neon',true)`.execute(
      tx,
    );
    await sql`INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,status,created_by) VALUES(${person}::uuid,${scope.tenant_id}::uuid,${`r5.${person}`},'R5 Contact','R5','Contact','active',${scope.actor_id}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO master.contact_person(id,tenant_id,owner_type_id,owner_id,contact_name,created_by) VALUES(${contact}::uuid,${scope.tenant_id}::uuid,(SELECT id FROM control.owner_type WHERE code='business_partner'),${scope.bp}::uuid,'R5 Contact',${scope.actor_id}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO master.contact_person_identity_link(tenant_id,contact_person_id,person_id,created_by) VALUES(${scope.tenant_id}::uuid,${contact}::uuid,${person}::uuid,${scope.actor_id}::uuid)`.execute(
      tx,
    );
    const event = (
      await sql<{
        event_id: string;
      }>`SELECT event_id FROM control.command_customer_lifecycle(${scope.tenant_id}::uuid,${scope.bp}::uuid,${scope.customer}::uuid,${scope.org}::uuid,${scope.company}::uuid,'activate',1,'R5_SOURCE_PROBE',CURRENT_DATE,${"a".repeat(64)},jsonb_build_object('decisionFingerprint',${"a".repeat(64)}::text,'eligible',true,'businessPartnerId',${scope.bp}::text,'role','customer','operatingOrganizationId',${scope.org}::text,'companyCodeId',${scope.company}::text,'businessDate',CURRENT_DATE),'r5-source-probe',${scope.actor_id}::uuid)`.execute(
        tx,
      )
    ).rows[0]!;
    const payload = {
      customerId: scope.customer,
      desiredState: "active",
      sourceLifecycleEventId: event.event_id,
      portalCapability: "customer",
    };
    await sql`INSERT INTO event.outbox(id,tenant_id,topic,event_type,entity_type,entity_id,actor_id,source,payload,created_by) VALUES(${outbox}::uuid,${scope.tenant_id}::uuid,'iam-projection','customer.portal_iam_projection.requested','customer',${scope.customer}::uuid,${scope.actor_id}::uuid,'r5-synthetic',${JSON.stringify(payload)}::jsonb,${scope.actor_id}::uuid)`.execute(
      tx,
    );
    const repo = new KyselyCustomerPortalDeliveryRepository((work) => work(tx));
    const item = (await repo.claim(1, "r5-claim"))[0]!;
    assert.equal(item.outboxId, outbox);
    const intent = await repo.intent(item);
    assert.ok(intent);
    assert.equal(intent.lifecycleEventId, event.event_id);
    assert.deepEqual(intent.contacts, [
      { sourceRef: `business_partner_contact:${contact}`, personId: person },
    ]);
    await assert.rejects(
      repo.finish({ ...item, claimToken: "expired" }, undefined),
      /LEASE_LOST/,
    );
    const receipt = {
      receiptId: randomUUID(),
      lifecycleEventId: event.event_id,
      disposition: "consumed" as const,
      attempts: [randomUUID()],
    };
    await repo.finish(item, receipt);
    await assert.rejects(repo.finish(item, receipt), /LEASE_LOST/);
    assert.equal(
      (
        await sql<{
          n: number;
        }>`SELECT count(*)::int n FROM event.outbox WHERE event_type='customer.portal_iam_projection.consumed' AND payload->>'sourceOutboxId'=${outbox}`.execute(
          tx,
        )
      ).rows[0]!.n,
      1,
    );
    console.log(
      "PASS: authoritative contact intent, claim fencing, atomic receipt, duplicate completion denied",
    );
    throw rolledBack;
  });
} catch (error) {
  if (error !== rolledBack) throw error;
} finally {
  await db.destroy();
}
console.log("ROLLBACK: source and synthetic receipt removed");
