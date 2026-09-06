/** Disposable PostgreSQL proof of the real delivery repository and acknowledgement DDL.
 * Requires an empty database named r6_probe_*; never runs against a tenant database.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {Kysely, PostgresDialect, sql} from "kysely";
import pg from "pg";
import {KyselyBusinessPartnerDeliveryRepository, BusinessPartnerDeliveryLeaseLostError} from "../../../../packages/planes/mesh/src/business-partner-delivery.js";
const connectionString=process.env.ATHYPER_R6_TEST_DATABASE_URL;
if(!connectionString||!/^\/r6_probe_[a-z0-9_]+$/.test(new URL(connectionString).pathname))throw new Error("A disposable r6_probe_* database is required");
const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new pg.Pool({connectionString})})});
const root=new URL("../../../ddl/",import.meta.url);
const tenant=randomUUID(),recipient=randomUUID(),createdBy=randomUUID();
try {
  // Minimal supporting schema; outbox and acknowledgement definitions are read
  // from the production DDL. This is not a full foundation qualification.
  await sql.raw(`CREATE SCHEMA shared; CREATE SCHEMA mesh; CREATE SCHEMA event;
    CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
    CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''app.current_tenant_id'',true),'''')::uuid';`).execute(db);
  const domains=readFileSync(new URL("common/event/02_domains.sql",root),"utf8");
  const domain=domains.match(/CREATE DOMAIN event\.outbox_status_d[\s\S]*?;/)?.[0];
  assert.ok(domain);await sql.raw(domain).execute(db);
  const tables=readFileSync(new URL("common/event/03_tables.sql",root),"utf8");
  const table=tables.match(/CREATE TABLE event\.outbox \([\s\S]*?\n\);/)?.[0];assert.ok(table);await sql.raw(table).execute(db);
  const columns=()=>sql`SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='mesh' AND table_name='business_partner_delivery_acknowledgement' ORDER BY ordinal_position`.execute(db);
  const grouped=(path:string)=>readFileSync(new URL(`planes/mesh/mesh/${path}`,root),"utf8");
  const required=(value:string|undefined,label:string)=>{assert.ok(value,`missing grouped acknowledgement ${label}`);return value;};
  const groupedTable=required(grouped("03_tables.sql").match(/CREATE TABLE mesh\.business_partner_delivery_acknowledgement \([\s\S]*?\n\);/)?.[0],"table");
  const groupedIndex=required(grouped("06_indexes.sql").match(/CREATE INDEX business_partner_delivery_acknowledgement_source_idx[\s\S]*?;/)?.[0],"index");
  const groupedFunction=required(grouped("07_functions.sql").match(/CREATE FUNCTION mesh\.trg_delivery_acknowledgement_immutable\(\)[\s\S]*?END \$\$;/)?.[0],"function");
  const groupedTrigger=required(grouped("08_triggers.sql").match(/CREATE TRIGGER delivery_acknowledgement_immutable[\s\S]*?;/)?.[0],"trigger");
  const groupedRls=required(grouped("10_rls.sql").match(/ALTER TABLE mesh\.business_partner_delivery_acknowledgement ENABLE ROW LEVEL SECURITY;[\s\S]*$/)?.[0],"RLS");
  const groupedGrants=required(grouped("11_grants.sql").match(/REVOKE ALL ON mesh\.business_partner_delivery_acknowledgement FROM PUBLIC;[\s\S]*$/)?.[0],"grants");
  await sql.raw([groupedTable,groupedIndex,groupedFunction,groupedTrigger,groupedRls,groupedGrants].join("\n")).execute(db);
  assert.deepEqual((await columns()).rows.map(column=>column.column_name),["id","source_tenant_id","recipient_tenant_id","source_network_account_id","outbox_id","event_id","delivery_lease_id","attempt_no","disposition","reason_code","acknowledged_at"]);

  const repository=new KyselyBusinessPartnerDeliveryRepository(work=>db.transaction().execute(work));
  async function seed(topic:string,eventType:string,valid=true){const id=randomUUID(),eventId=randomUUID();await sql`INSERT INTO event.outbox(id,tenant_id,topic,event_type,partition_key,payload,created_by)
    VALUES(${id}::uuid,${tenant}::uuid,${topic},${eventType},${recipient},${JSON.stringify(valid?{eventId,eventType,sourcePlane:"mesh",sourceTenantId:tenant,sourceNetworkAccountId:createdBy,recipientTenantId:recipient}:{eventId:"bad"})}::jsonb,${createdBy}::uuid)`.execute(db);return id;}
  const profile=await seed("mesh-business-partner-profile","business_partner.profile_publication.published");
  await seed("mesh-business-partner-bank","mesh.bank_account.disclosed");
  const malformed=await seed("mesh-business-partner-profile","business_partner.profile_publication.published",false);
  const first=await repository.claim({workerId:"probe",limit:100,leaseSeconds:90});
  assert.equal(first.length,2);assert.deepEqual(new Set(first.map(i=>i.kind)),new Set(["profile","bank"]));
  assert.equal((await sql<{status:string}>`SELECT status FROM event.outbox WHERE id=${malformed}::uuid`.execute(db)).rows[0]?.status,"dead_letter");
  const item=first.find(i=>i.outboxId===profile)!;
  await assert.rejects(repository.complete({...item,leaseId:"stale-lease"},"applied"),BusinessPartnerDeliveryLeaseLostError);
  assert.equal((await sql<{count:string}>`SELECT count(*) FROM mesh.business_partner_delivery_acknowledgement`.execute(db)).rows[0]?.count,"0");
  await repository.complete(item,"applied");
  await repository.complete(first.find(i=>i.kind==="bank")!,"quarantined","BANK_POLICY_DENIED");
  assert.equal((await sql<{count:string}>`SELECT count(*) FROM mesh.business_partner_delivery_acknowledgement`.execute(db)).rows[0]?.count,"2");
  await assert.rejects(sql`UPDATE mesh.business_partner_delivery_acknowledgement SET disposition='stale'`.execute(db),/immutable/);
  await assert.rejects(sql`DELETE FROM mesh.business_partner_delivery_acknowledgement`.execute(db),/immutable/);
  const expired=await seed("mesh-business-partner-profile","business_partner.profile_publication.published");
  await sql`UPDATE event.outbox SET status='processing',attempts=max_attempts,locked_at=clock_timestamp()-interval '2 minutes',locked_until=clock_timestamp()-interval '1 minute',locked_by='expired' WHERE id=${expired}::uuid`.execute(db);
  assert.equal((await repository.claim({workerId:"probe",limit:100,leaseSeconds:90})).length,0);
  assert.equal((await sql<{status:string}>`SELECT status FROM event.outbox WHERE id=${expired}::uuid`.execute(db)).rows[0]?.status,"dead_letter");
  process.stdout.write(JSON.stringify({schema:"athyper.business-partner-r6-delivery-probe/1",productionQualified:false,passed:["acknowledgement_canonical_ddl","profile_and_bank_topics","malformed_isolation","lease_fencing","atomic_source_acknowledgement","quarantine_acknowledgement","acknowledgement_immutability","expired_final_lease_dead_letter"]})+"\n");
} finally {await db.destroy();}
