import { lockMasterDataOwner } from "../master-data-locks.js";
import { resolveMasterDataAuthorityTarget, createMasterDataAuthority, type MasterDataAccess, type MasterDataAuthorityTarget } from "../master-data-authority.js";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { createContactVerificationAuthority } from "../verification-authority.js";
import { createLocalContactChallenges } from "../local-contact-challenge.js";
import { KyselyContactChallengeRepository } from "../kysely-contact-challenge.js";
import { contactVerificationSigningBytes, createProviderEvidenceVerifier } from "../provider-evidence-verifier.js";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KyselyMasterDataRepository } from "../kysely-master-data-repository.js";
import { normalizeAddress } from "../normalization.js";
import { createMasterDataServices } from "../services.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

// Only use a disposable empty database: this suite installs the production DDL subset.
const url = process.env["ATHYPER_MASTER_DATA_TEST_DATABASE_URL"];
const enabled = process.env["ATHYPER_MASTER_DATA_DB_TESTS"] === "true" && Boolean(url);
const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: url ?? "postgres://disabled", max: 8 }) }) });
type Tx = Transaction<Record<string, never>>;
const repo = new KyselyMasterDataRepository();
const tenant = randomUUID(), otherTenant = randomUUID(), principal = randomUUID(), type = randomUUID();
const owner = () => ({ entityCode: "test_owner", ownerTypeId: type, ownerId: randomUUID() });
const from = "2026-01-01T00:00:00Z", until = "2026-06-01T00:00:00Z";
function run<T>(work: (tx: Tx) => Promise<T>, tenantId = tenant): Promise<T> {
  return db.transaction().execute(async tx => {
    await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${principal},true)`.execute(tx);
    return work(tx);
  });
}
async function newOwner() {
  const result = owner();
  await sql`INSERT INTO master.test_owner VALUES (${result.ownerId}::uuid,${tenant}::uuid)`.execute(db);
  return result;
}
function contactInput(o: ReturnType<typeof owner>, value = "a@example.com", isPrimary = false) {
  return { tenantId: tenant, owner: o, channelType: "email" as const, value, purpose: "default", isPrimary, effectiveFrom: from };
}
const ddl = (path: string) => readFileSync(resolve(process.cwd(), "../../../db/ddl", path), "utf8");

describe.skipIf(!enabled)("master data PostgreSQL repository", () => {
  beforeAll(async () => {
    await sql.raw("CREATE SCHEMA shared; CREATE SCHEMA master; CREATE SCHEMA control; CREATE EXTENSION btree_gist; CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE TABLE shared.country(code text PRIMARY KEY); INSERT INTO shared.country VALUES ('MY'); CREATE TABLE master.tenant(id uuid PRIMARY KEY); CREATE TABLE master.test_owner(id uuid PRIMARY KEY,tenant_id uuid NOT NULL); CREATE TABLE master.test_effect(kind text NOT NULL);").execute(db);
    await sql.raw("CREATE TABLE master.business_partner(tenant_id uuid,id uuid); CREATE TABLE master.operating_organization(tenant_id uuid,id uuid,status text); CREATE TABLE master.business_partner_operating_organization_assignment(tenant_id uuid,business_partner_id uuid,operating_organization_id uuid,status text,is_active boolean,effective_from date,effective_until date);").execute(db);
    const tables = ddl("common/master/03_platform_tables.sql");
    const control = ddl("planes/neon/control/03_tables.sql");
    for (const name of ["owner_type", "owner_type_purpose"]) await sql.raw(control.match(new RegExp(`CREATE TABLE control\\.${name} \\([\\s\\S]*?\\n\\);`))![0]).execute(db);
    for (const name of ["address", "address_link", "contact_link"]) await sql.raw(tables.match(new RegExp(`CREATE TABLE master\\.${name} \\([\\s\\S]*?\\n\\);`))![0]).execute(db);
    const constraints = ddl("planes/neon/master/05_constraints.sql");
    for (const statement of constraints.matchAll(/ALTER TABLE master\.(?:address|address_link|contact_link)\s[\s\S]*?;/g)) await sql.raw(statement[0]).execute(db);
    const indexes = ddl("planes/neon/master/06_indexes.sql");
    for (const statement of indexes.matchAll(/CREATE UNIQUE INDEX (?:address_normalized_hash_uq|address_link_current_primary_uq|contact_link_value_uq|contact_link_one_primary_uq)[\s\S]*?;/g)) await sql.raw(statement[0]).execute(db);
    await sql.raw(constraints.match(/CREATE UNIQUE INDEX address_link_owner_purpose_address_uq[\s\S]*?;/)![0]).execute(db);
    await sql.raw(ddl("common/master/07_functions.sql").match(/CREATE OR REPLACE FUNCTION master\.trg_validate_address_link_usage\(\)[\s\S]*?\$\$;/)![0]).execute(db);
    await sql.raw("CREATE TRIGGER trg_address_link_05_usage_guard BEFORE INSERT OR UPDATE OF usage_status,usage_denied_reason_code,usage_denied_at,usage_denied_by ON master.address_link FOR EACH ROW EXECUTE FUNCTION master.trg_validate_address_link_usage()").execute(db);
    const functions = ddl("planes/neon/master/07_functions.sql");
    for (const name of ["trg_validate_owner_reference", "trg_normalize_contact_link", "trg_require_contact_verification_evidence"]) await sql.raw(functions.match(new RegExp(`CREATE OR REPLACE FUNCTION master\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`))![0]).execute(db);
    const triggers = ddl("planes/neon/master/08_triggers.sql");
    for (const name of ["trg_address_link_owner_reference", "trg_contact_link_10_normalize", "trg_contact_link_20_owner_reference", "trg_contact_link_30_verification_evidence"]) await sql.raw(triggers.match(new RegExp(`CREATE TRIGGER ${name}\\s[\\s\\S]*?;`))![0]).execute(db);
    await sql.raw(`CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$; CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT shared.current_tenant_id_soft() $$; CREATE ROLE master_data_test_user; GRANT USAGE ON SCHEMA master,control,shared TO master_data_test_user; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA master,control TO master_data_test_user;`).execute(db);
    await sql.raw(readFileSync(resolve(process.cwd(), '../../../db/scripts/provisioning/sql/local-master-data-authority-lock.sql'), 'utf8')).execute(db);
    await sql.raw('REVOKE INSERT,UPDATE ON control.owner_type FROM master_data_test_user; GRANT EXECUTE ON FUNCTION control.lock_master_data_owner_registry() TO master_data_test_user;').execute(db);
    const policies = ddl("planes/neon/master/10_rls.sql");
    for (const name of ["address", "address_link", "contact_link"]) {
      await sql.raw(`ALTER TABLE master.${name} ENABLE ROW LEVEL SECURITY; ALTER TABLE master.${name} FORCE ROW LEVEL SECURITY;`).execute(db);
      await sql.raw(policies.match(new RegExp(`CREATE POLICY tenant_access ON master\\.${name}\\s[\\s\\S]*?;`))![0]).execute(db);
    }
    await sql`INSERT INTO master.tenant VALUES (${tenant}::uuid),(${otherTenant}::uuid)`.execute(db);
    await sql`INSERT INTO control.owner_type (id,code,name,category,source_type,target_schema,target_table,is_tenant_scoped,tenant_column,supports_address,supports_contact,status,created_by)
      VALUES (${type}::uuid,'test_owner','Test owner','custom','platform','master','test_owner',true,'tenant_id',true,true,'active',${principal}::uuid)`.execute(db);
    await sql`INSERT INTO control.owner_type_purpose (owner_type_id,capability,purpose_code,created_by) VALUES (${type}::uuid,'contact','default',${principal}::uuid),(${type}::uuid,'address','default',${principal}::uuid)`.execute(db);
  });
  afterAll(async () => { await db.destroy(); });

  it("resolves registry owners and rejects mismatched entities and tenants", async () => {
    const o = await newOwner();
    expect(await run(tx => repo.ownerExists(tenant,o,tx))).toBe(true);
    expect(await run(tx => repo.ownerExists(otherTenant,o,tx))).toBe(false);
    expect(await run(tx => repo.ownerExists(tenant,{...o,entityCode:"wrong"},tx))).toBe(false);
    await expect(run(tx => repo.createContact({...contactInput(o),tenantId:otherTenant},tx))).rejects.toMatchObject({status:404});
  });
  it("enforces the production tenant RLS policy under a non-owner role", async () => {
    const o = await newOwner(), c = await run(tx => repo.createContact(contactInput(o),tx));
    await run(async tx => {
      await sql`SET LOCAL ROLE master_data_test_user`.execute(tx);
      expect(await repo.listContacts(tenant,o,from,tx)).toHaveLength(0);
      expect(await repo.deactivateContact(tenant,c.id,until,tx)).toBe(false);
    }, otherTenant);
    await run(async tx => {
      await sql`SET LOCAL ROLE master_data_test_user`.execute(tx);
      expect(await repo.listContacts(tenant,o,from,tx)).toHaveLength(1);
    });
  });
  it("maps contacts and preserves historical visibility after deactivation", async () => {
    const o = await newOwner(), c = await run(tx => repo.createContact(contactInput(o),tx));
    expect(c).toMatchObject({owner:o,isVerified:false,value:"a@example.com",effectiveFrom:"2026-01-01T00:00:00.000Z"});
    expect(await run(tx => repo.findContactDuplicate(contactInput(o),tx))).toMatchObject({id:c.id});
    expect(await run(tx => repo.deactivateContact(otherTenant,c.id,until,tx))).toBe(false);
    await run(tx => repo.deactivateContact(tenant,c.id,until,tx));
    await expect(run(tx => repo.deactivateContact(tenant,c.id,until,tx))).rejects.toMatchObject({status:409,code:"MASTER_DATA_PERIOD_CLOSED"});
    expect(await run(tx => repo.listContacts(tenant,o,from,tx))).toHaveLength(1);
    expect(await run(tx => repo.listContacts(tenant,o,until,tx))).toHaveLength(0);
    expect(await run(tx => repo.listContacts(otherTenant,o,from,tx))).toHaveLength(0);
    await expect(run(tx => repo.deactivateContact(tenant,c.id,"2026-07-01T00:00:00Z",tx))).rejects.toMatchObject({status:409});
    await expect(run(tx => repo.deactivateContact(tenant,c.id,from,tx))).rejects.toMatchObject({status:400});
  });
  it("persists verification evidence and clears verified_at when unverified", async () => {
    const c = await run(async tx => repo.createContact(contactInput(await newOwner()),tx));
    const evidence = {provider:"test",evidenceId:randomUUID(),issuedAt:from,payloadHash:"a".repeat(64),signature:"signed1",keyId:"key"};
    expect(await run(tx => repo.setContactVerification(otherTenant,c.id,true,from,evidence,tx))).toBeNull();
    expect(await run(tx => repo.setContactVerification(tenant,c.id,true,from,evidence,tx))).toMatchObject({isVerified:true,verifiedAt:"2026-01-01T00:00:00.000Z"});
    await expect(run(tx => repo.setContactVerification(tenant,c.id,false,from,evidence,tx))).rejects.toMatchObject({status:409});
    const updated = await run(tx => repo.setContactVerification(tenant,c.id,false,from,{...evidence,issuedAt:"2026-01-02T00:00:00Z",evidenceId:randomUUID(),signature:"signed2"},tx));
    expect(updated?.isVerified).toBe(false); expect(updated?.verifiedAt).toBeUndefined();
  });
  it("serializes duplicate and primary contact races, including bounded intervals", async () => {
    for (const primary of [false,true]) {
      const o = await newOwner();
      const results = await Promise.allSettled(["a","b"].map(v => run(tx => repo.createContact({...contactInput(o,primary ? `${v}@example.com` : "same@example.com",primary),effectiveUntil:until},tx))));
      expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{status:409}});
    }
  });
  it("uses the same owner lock for differently cased UUIDs", async () => {
    const o = await newOwner();
    let release!: () => void, signal!: () => void;
    const ready = new Promise<void>(r => { signal = r; });
    const held = new Promise<void>(r => { release = r; });
    const first = run(async tx => {
      await repo.createContact({...contactInput(o, "first@example.com", true), effectiveUntil:until}, tx);
      signal(); await held;
    });
    await ready;
    try {
      await expect(run(async tx => {
        await sql`SET LOCAL lock_timeout='100ms'`.execute(tx);
        return repo.createContact({...contactInput({...o,ownerTypeId:o.ownerTypeId.toUpperCase(),ownerId:o.ownerId.toUpperCase()}, "second@example.com", true),tenantId:tenant.toUpperCase(),effectiveUntil:until},tx);
      })).rejects.toMatchObject({code:"55P03"});
    } finally { release(); await first; }
  });
  it("cancels today's and future address usage, releases primary/duplicate slots and retains audit coordinates", async () => {
    const today = new Date().toISOString().slice(0,10)+"T00:00:00Z";
    const future = new Date(Date.now()+86400000*3).toISOString().slice(0,10)+"T00:00:00Z";
    for (const start of [today,future]) {
      const o=await newOwner(), normalized=normalizeAddress({countryCode:"MY",city:randomUUID()});
      const a=await run(tx=>repo.createAddress(tenant,normalized.address,normalized.hash,tx));
      const input={tenantId:tenant,owner:o,addressId:a.id,purpose:"default",isPrimary:true,effectiveFrom:start};
      const link=await run(tx=>repo.createAddressLink(input,tx));
      expect(await run(tx=>repo.deactivateAddressLink(otherTenant,link.id,today,tx))).toBe(false);
      await expect(run(async tx=>{await repo.deactivateAddressLink(tenant,link.id,today,tx);throw Error("audit failed");})).rejects.toThrow("audit failed");
      expect((await sql<{usage_status:string}>`SELECT usage_status FROM master.address_link WHERE id=${link.id}::uuid`.execute(db)).rows[0]?.usage_status).toBe("active");
      expect(await run(tx=>repo.deactivateAddressLink(tenant,link.id,today,tx))).toBe("cancelled");
      const row=(await sql<{usage_status:string;usage_denied_by:string;usage_denied_at:Date}>`SELECT usage_status,usage_denied_by,usage_denied_at FROM master.address_link WHERE id=${link.id}::uuid`.execute(db)).rows[0]!;
      expect(row.usage_status).toBe("cancelled");expect(row.usage_denied_by).toBe(principal);expect(row.usage_denied_at).toBeTruthy();
      expect(await run(tx=>repo.listAddresses(tenant,o,start,tx))).toHaveLength(0);
      await expect(run(tx=>repo.deactivateAddressLink(tenant,link.id,today,tx))).rejects.toMatchObject({status:409});
      await expect(sql`UPDATE master.address_link SET usage_status='active' WHERE id=${link.id}::uuid`.execute(db)).rejects.toMatchObject({code:"23514"});
      const replacements=await Promise.allSettled([1,2].map(()=>run(tx=>repo.createAddressLink(input,tx))));
      expect(replacements.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      expect(replacements.filter(r=>r.status==='rejected')).toHaveLength(1);
      expect(await run(tx=>repo.listAddresses(tenant,o,start,tx))).toHaveLength(1);
      expect(await run(tx=>repo.findAddressDuplicate(tenant,normalized.hash,tx))).toMatchObject({id:a.id});
    }
  });
  it("deduplicates addresses concurrently, maps numeric fields, and dates links in UTC", async () => {
    const normalized = normalizeAddress({countryCode:"MY",city:randomUUID(),latitude:3.123456,longitude:101.123456});
    const values = await Promise.all([1,2].map(()=>run(tx=>repo.createAddress(tenant,normalized.address,normalized.hash,tx))));
    expect(values[0]).toEqual(values[1]); expect(values[0]!.address.latitude).toBe(3.123456);
    expect(await run(tx=>repo.findAddressDuplicate(otherTenant,normalized.hash,tx))).toBeNull();
    const o = await newOwner();
    const link = await run(async tx => { await sql`SET LOCAL TIME ZONE 'Asia/Kuala_Lumpur'`.execute(tx); return repo.createAddressLink({tenantId:tenant,addressId:values[0]!.id,owner:o,purpose:"default",isPrimary:true,effectiveFrom:from},tx); });
    expect(link.effectiveFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(await run(tx=>repo.deactivateAddressLink(otherTenant,link.id,until,tx))).toBe(false);
    await run(tx=>repo.deactivateAddressLink(tenant,link.id,until,tx));
    expect(await run(tx=>repo.listAddresses(tenant,o,from,tx))).toHaveLength(1);
    expect(await run(tx=>repo.listAddresses(tenant,o,until,tx))).toHaveLength(0);
    expect(await run(tx=>repo.listAddresses(otherTenant,o,from,tx))).toHaveLength(0);
  });
  it("enforces address primary exclusion and translates foreign key and country errors", async () => {
    const o=await newOwner();
    const addresses=await Promise.all([1,2].map(async()=>{const n=normalizeAddress({countryCode:"MY",city:randomUUID()});return run(tx=>repo.createAddress(tenant,n.address,n.hash,tx));}));
    const results=await Promise.allSettled(addresses.map(a=>run(tx=>repo.createAddressLink({tenantId:tenant,owner:o,addressId:a.id,purpose:"default",isPrimary:true,effectiveFrom:from,effectiveUntil:until},tx))));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{status:409}});
    await expect(run(tx=>repo.createAddress(tenant,{city:"KL"},"a".repeat(64),tx))).rejects.toMatchObject({status:400,code:"COUNTRY_CODE_REQUIRED"});
    const n=normalizeAddress({countryCode:"MY",city:randomUUID()});
    await expect(run(tx=>repo.createAddress(randomUUID(),n.address,n.hash,tx))).rejects.toMatchObject({status:422});
  });
  it("rolls back service data and outbox writes if audit fails", async () => {
    const o=await newOwner();
    const service=createMasterDataServices({authorizeAccess:async()=>undefined,repository:repo,transactions:{run:(_plane,_actor,work)=>run(work)},metadata:{getEntityDescriptor:async()=>({}) as never},authorizer:{authorize:async()=>({allowed:true})},
      evidenceVerifier:{verify:async()=>true},outbox:{append:async(_event,tx)=>{await sql`INSERT INTO master.test_effect VALUES ('outbox')`.execute(tx);}},audit:{record:async()=>{throw new Error("audit failed");}}});
    await expect(service.contacts.create({context:{planeKey:"neon",tenantId:tenant,principalId:principal} as VerifiedRequestContext,owner:o,channelType:"email",value:"a@example.com"})).rejects.toThrow("audit failed");
    expect(await run(tx=>repo.listContacts(tenant,o,"2099-01-01T00:00:00Z",tx))).toHaveLength(0);
    expect((await sql`SELECT * FROM master.test_effect`.execute(db)).rows).toHaveLength(0);
  });
  it("atomically rejects concurrent signed-evidence replay and permits retry after rollback", async () => {
    const o = await newOwner(), c = await run(tx=>repo.createContact(contactInput(o),tx));
    const pair = generateKeyPairSync("ed25519");
    const clock = () => new Date("2026-01-01T00:00:03.000Z");
    const verifier = createProviderEvidenceVerifier([{provider:"test",keyId:"key",publicKeyPem:pair.publicKey.export({type:"spki",format:"pem"}).toString(),planeKeys:["neon"],tenantIds:[tenant],notBefore:"2020-01-01T00:00:00.000Z",notAfter:"2099-01-01T00:00:00.000Z"}],clock);
    let failAudit = true;
    const service = createMasterDataServices({authorizeVerification:async()=>undefined,repository:repo,transactions:{run:(_plane,_actor,work)=>run(work)},metadata:{getEntityDescriptor:async()=>({}) as never},authorizer:{authorize:async()=>({allowed:true})},now:clock,evidenceVerifier:verifier,
      outbox:{append:async()=>undefined},audit:{record:async()=>{if(failAudit) throw new Error("audit failed");}}});
    const target = {planeKey:"neon",tenantId:tenant,contactId:c.id,channelType:c.channelType,value:c.value,verified:true};
    const fields = {provider:"test",keyId:"key",evidenceId:randomUUID(),issuedAt:"2026-01-01T00:00:00.000Z",expiresAt:"2026-01-01T00:05:00.000Z"};
    const bytes=contactVerificationSigningBytes(fields,target);
    const evidence={...fields,payloadHash:createHash("sha256").update(bytes).digest("hex"),signature:sign(null,bytes,pair.privateKey).toString("base64url")};
    const command={context:{planeKey:"neon",tenantId:tenant,principalId:principal} as VerifiedRequestContext,contactId:c.id,verified:true,evidence};
    await expect(service.contacts.changeVerification(command)).rejects.toThrow("audit failed");
    expect((await run(tx=>repo.getContactForVerification(tenant,c.id,tx)))?.isVerified).toBe(false);
    failAudit=false;
    const results=await Promise.allSettled([service.contacts.changeVerification(command),service.contacts.changeVerification(command)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{status:409,code:"VERIFICATION_EVIDENCE_REPLAY"}});
    expect((await run(tx=>repo.getContactForVerification(tenant,c.id,tx)))?.isVerified).toBe(true);
    await expect(service.contacts.changeVerification({...command,verified:false})).rejects.toMatchObject({status:422});
  });

  it("rejects Contact A's authentic proof for Contact B, another tenant/plane, and a changed value without effects", async () => {
    const a = await run(async tx => repo.createContact(contactInput(await newOwner()),tx));
    const b = await run(async tx => repo.createContact(contactInput(await newOwner()),tx));
    const foreignOwner = owner();
    await sql`INSERT INTO master.test_owner VALUES (${foreignOwner.ownerId}::uuid,${otherTenant}::uuid)`.execute(db);
    const foreign = await run(tx => repo.createContact({...contactInput(foreignOwner),tenantId:otherTenant},tx),otherTenant);
    const pair = generateKeyPairSync("ed25519"), clock = () => new Date("2026-01-01T00:00:03.000Z");
    // Trust both scopes so these checks cannot pass merely by rejecting the key's scope.
    const verifier = createProviderEvidenceVerifier([{provider:"test",keyId:"binding-key",publicKeyPem:pair.publicKey.export({type:"spki",format:"pem"}).toString(),planeKeys:["neon","mesh"],tenantIds:[tenant,otherTenant],notBefore:"2020-01-01T00:00:00.000Z",notAfter:"2099-01-01T00:00:00.000Z"}],clock);
    let effects = 0;
    const service = createMasterDataServices({authorizeVerification:async()=>undefined,repository:repo,transactions:{run:(_plane,actor,work)=>run(work,actor.tenantId)},metadata:{getEntityDescriptor:async()=>({}) as never},authorizer:{authorize:async()=>({allowed:true})},now:clock,evidenceVerifier:verifier,
      outbox:{append:async()=>{effects++;}},audit:{record:async()=>{effects++;}}});
    const fields = {provider:"test",keyId:"binding-key",evidenceId:randomUUID(),issuedAt:"2026-01-01T00:00:00.000Z",expiresAt:"2026-01-01T00:05:00.000Z"};
    const bytes = contactVerificationSigningBytes(fields,{planeKey:"neon",tenantId:tenant,contactId:a.id,channelType:a.channelType,value:a.value,verified:true});
    const evidence = {...fields,payloadHash:createHash("sha256").update(bytes).digest("hex"),signature:sign(null,bytes,pair.privateKey).toString("base64url")};
    const command = {context:{planeKey:"neon",tenantId:tenant,principalId:principal} as VerifiedRequestContext,contactId:a.id,verified:true,evidence};
    for (const attempt of [
      {...command,contactId:b.id},
      {...command,context:{...command.context,tenantId:otherTenant},contactId:foreign.id},
      {...command,context:{...command.context,planeKey:"mesh" as const}},
      {...command,verified:false},
    ]) await expect(service.contacts.changeVerification(attempt)).rejects.toMatchObject({status:422,code:"VERIFICATION_EVIDENCE_INVALID"});
    await run(async tx => {await sql`UPDATE master.contact_link SET value='replacement@example.com' WHERE tenant_id=${tenant}::uuid AND id=${a.id}::uuid`.execute(tx);});
    await expect(service.contacts.changeVerification(command)).rejects.toMatchObject({status:422});
    expect(effects).toBe(0);
    const rows = (await sql<{is_verified:boolean;verification_evidence:object}>`SELECT is_verified,verification_evidence FROM master.contact_link WHERE id IN (${a.id}::uuid,${b.id}::uuid,${foreign.id}::uuid)`.execute(db)).rows;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toEqual({is_verified:false,verification_evidence:{}});
  });

  it("holds the contact row lock until verification's transaction ends", async () => {
    const c = await run(async tx => repo.createContact(contactInput(await newOwner()),tx));
    let release!: () => void;
    let locked!: () => void;
    const barrier = new Promise<void>(resolve=>{release=resolve;});
    const acquired = new Promise<void>(resolve=>{locked=resolve;});
    const holder = run(async tx => {
      const current = await repo.getContactForVerification(tenant,c.id,tx);
      locked();
      await barrier;
      return current;
    });
    try {
      await acquired;
      await expect(run(async tx => {
        await sql`SET LOCAL lock_timeout='100ms'`.execute(tx);
        await sql`UPDATE master.contact_link SET value='replacement@example.com' WHERE tenant_id=${tenant}::uuid AND id=${c.id}::uuid`.execute(tx);
      })).rejects.toMatchObject({code:"55P03"});
    } finally { release(); await holder; }
    expect((await run(tx=>repo.getContactForVerification(tenant,c.id,tx)))?.value).toBe(c.value);
  });

  it("completes local challenges atomically, rejects replay/changed targets/invalid tokens, and persists throttling", async () => {
    await sql.raw("CREATE TABLE master.principal(tenant_id uuid,id uuid,PRIMARY KEY(tenant_id,id));").execute(db);
    await sql`INSERT INTO master.principal VALUES (${tenant}::uuid,${principal}::uuid)`.execute(db);
    await sql.raw(readFileSync(resolve(process.cwd(), "../../../db/scripts/provisioning/sql/local-contact-challenge.sql"),"utf8")).execute(db);
    const challenges = new KyselyContactChallengeRepository();
    const pair=generateKeyPairSync("ed25519");
    let clock=new Date("2026-01-01T00:00:03.000Z"), denied=false, auditFails=false, outboxFails=false;
    let link="";
    const options={authorizeVerification:async()=>{if(denied)throw Object.assign(new Error("Denied"),{status:403});},repository:repo,transactions:{run:<R>(_plane:unknown,actor:{tenantId:string},work:(tx:Tx)=>Promise<R>)=>run(work,actor.tenantId)},
      metadata:{getEntityDescriptor:async()=>({}) as never},authorizer:{authorize:async()=>({allowed:!denied})},now:()=>clock,
      evidenceVerifier:createProviderEvidenceVerifier([{provider:"athyper-local-challenge",keyId:"local-test",publicKeyPem:pair.publicKey.export({type:"spki",format:"pem"}).toString(),planeKeys:["neon"],tenantIds:[tenant],notBefore:"2020-01-01T00:00:00.000Z",notAfter:"2099-01-01T00:00:00.000Z"}],()=>clock),
      outbox:{append:async(_event:unknown,tx:Tx)=>{await sql`INSERT INTO master.test_effect VALUES ('local-outbox')`.execute(tx);if(outboxFails)throw Error('outbox unavailable');}},
      audit:{record:async(_event:unknown,tx:Tx)=>{await sql`INSERT INTO master.test_effect VALUES ('local-audit')`.execute(tx);if(auditFails)throw Error("audit unavailable");}}};
    const service=createLocalContactChallenges(options,challenges,{environment:"local",capture:true,tenantId:tenant,privateKeyPem:pair.privateKey.export({type:"pkcs8",format:"pem"}).toString(),keyId:"local-test",pageUrl:"https://neon.dev.athyper.test/contact-verification.html"},async input=>{link=input.link;});
    const context={planeKey:"neon",tenantId:tenant,principalId:principal} as VerifiedRequestContext;
    const contact=await run(async tx=>repo.createContact(contactInput(await newOwner()),tx));
    const {authorizeVerification: _ignored, ...unscopedOptions} = options;
    const unscoped = createLocalContactChallenges(unscopedOptions,challenges,{environment:"local",capture:true,tenantId:tenant,privateKeyPem:pair.privateKey.export({type:"pkcs8",format:"pem"}).toString(),keyId:"local-test",pageUrl:"https://neon.dev.athyper.test/contact-verification.html"},async()=>{throw Error("Unexpected delivery");});
    await expect(unscoped.request(context,contact.id)).rejects.toMatchObject({status:503,code:"MASTER_DATA_AUTHORITY_UNAVAILABLE"});
    denied=true;
    await expect(service.request(context,contact.id)).rejects.toMatchObject({status:403});expect(link).toBe("");denied=false;
    await expect(service.request({...context,tenantId:otherTenant},contact.id)).rejects.toMatchObject({status:403});
    const created=await service.request(context,contact.id),token=link.split(".").at(-1)!;
    const stored=await run(tx=>challenges.lock(tenant,created.challengeId,tx));
    expect(stored?.tokenHash).not.toBe(token);expect(stored?.consumedAt).toBeNull();
    await sql.raw("GRANT SELECT ON master.local_contact_challenge TO master_data_test_user").execute(db);
    await run(async tx=>{await sql.raw("SET LOCAL ROLE master_data_test_user").execute(tx);expect((await sql`SELECT id FROM master.local_contact_challenge`.execute(tx)).rows).toHaveLength(0);},otherTenant);
    await expect(service.complete(context,created.challengeId,"a".repeat(43))).rejects.toMatchObject({status:422});
    auditFails=true;
    await expect(service.complete(context,created.challengeId,token)).rejects.toThrow("audit unavailable");
    expect((await run(tx=>repo.getContactForVerification(tenant,contact.id,tx)))?.isVerified).toBe(false);
    expect((await run(tx=>challenges.lock(tenant,created.challengeId,tx)))?.consumedAt).toBeNull();
    expect((await sql`SELECT 1 FROM master.test_effect WHERE kind IN ('local-audit','local-outbox')`.execute(db)).rows).toHaveLength(0);
    auditFails=false;outboxFails=true;
    await expect(service.complete(context,created.challengeId,token)).rejects.toThrow('outbox unavailable');
    expect((await run(tx=>challenges.lock(tenant,created.challengeId,tx)))?.consumedAt).toBeNull();
    expect((await sql`SELECT 1 FROM master.test_effect WHERE kind IN ('local-audit','local-outbox')`.execute(db)).rows).toHaveLength(0);
    outboxFails=false;
    const results=await Promise.allSettled([service.complete(context,created.challengeId,token),service.complete(context,created.challengeId,token)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}});
    expect((await run(tx=>repo.getContactForVerification(tenant,contact.id,tx)))?.isVerified).toBe(true);
    expect((await sql`SELECT 1 FROM master.test_effect WHERE kind IN ('local-audit','local-outbox')`.execute(db)).rows).toHaveLength(2);
    const changed=await service.request(context,contact.id),changedToken=link.split(".").at(-1)!;
    await run(async tx=>{await sql`UPDATE master.contact_link SET value='changed@example.test' WHERE id=${contact.id}::uuid`.execute(tx);});
    await expect(service.complete(context,changed.challengeId,changedToken)).rejects.toMatchObject({code:'CHALLENGE_TARGET_CHANGED'});
    const expired=await service.request(context,contact.id),expiredToken=link.split(".").at(-1)!;
    clock=new Date(clock.getTime()+600001);
    await expect(service.complete(context,expired.challengeId,expiredToken)).rejects.toMatchObject({code:'CHALLENGE_EXPIRED'});
    await expect(service.request(context,contact.id)).rejects.toMatchObject({status:429});
    for(let i=0;i<10;i++)await service.complete(context,created.challengeId,'bad').catch(()=>{});
    await expect(service.complete(context,created.challengeId,token)).rejects.toMatchObject({status:429});
  });

  it("resolves verification scope from stored ownership and blocks concurrent assignment inserts", async () => {

    const bp=randomUUID(),org=randomUUID(),org2=randomUUID(),ot=randomUUID(),cid=randomUUID();
    await sql`INSERT INTO master.business_partner VALUES(${tenant}::uuid,${bp}::uuid)`.execute(db);
    await sql`INSERT INTO master.operating_organization VALUES(${tenant}::uuid,${org}::uuid,'active'),(${tenant}::uuid,${org2}::uuid,'active')`.execute(db);
    await sql`INSERT INTO control.owner_type(id,code,name,category,source_type,target_schema,target_table,is_tenant_scoped,tenant_column,supports_contact,status,created_by) VALUES(${ot}::uuid,'business_partner','Partner','custom','platform','master','business_partner',true,'tenant_id',true,'active',${principal}::uuid)`.execute(db);
    await sql`INSERT INTO control.owner_type_purpose(owner_type_id,capability,purpose_code,created_by) VALUES(${ot}::uuid,'contact','default',${principal}::uuid)`.execute(db);
    await sql`INSERT INTO master.contact_link(id,tenant_id,owner_type_id,owner_id,channel_type,value,created_by) VALUES(${cid}::uuid,${tenant}::uuid,${ot}::uuid,${bp}::uuid,'email','scope@example.test',${principal}::uuid)`.execute(db);
    const context={planeKey:'neon',tenantId:tenant,principalId:principal} as VerifiedRequestContext;
    const authority=createContactVerificationAuthority({authorize:async input=>({allowed:input.resource?.operatingOrganizationId===org && input.permissionCode==='neon.relationship.business_partner.verify_contact'})});
    await expect(run(tx=>authority(context,cid,tx))).rejects.toMatchObject({status:403});
    await sql`INSERT INTO master.business_partner_operating_organization_assignment VALUES(${tenant}::uuid,${bp}::uuid,${org}::uuid,'active',true,current_date,NULL)`.execute(db);
    await run(tx=>authority(context,cid,tx));
    await expect(run(tx=>authority({...context,tenantId:otherTenant},cid,tx),otherTenant)).rejects.toMatchObject({status:404});
    let unlock!:()=>void, acquired!:()=>void;
    const barrier=new Promise<void>(r=>{unlock=r;}),ready=new Promise<void>(r=>{acquired=r;});
    const pending=run(async tx=>{await authority(context,cid,tx);acquired();await barrier;});
    await ready;
    try { await expect(run(async tx=>{await sql`SET LOCAL lock_timeout='100ms'`.execute(tx);await sql`INSERT INTO master.business_partner_operating_organization_assignment VALUES(${tenant}::uuid,${bp}::uuid,${org2}::uuid,'active',true,current_date,NULL)`.execute(tx);})).rejects.toMatchObject({code:'55P03'}); }
    finally {unlock();await pending;}
    for (const statement of [
      sql`UPDATE master.operating_organization SET status='inactive' WHERE tenant_id=${tenant}::uuid AND id=${org}::uuid`,
      sql`UPDATE control.owner_type SET status='inactive' WHERE id=${ot}::uuid`,
    ]) {
      let release!:()=>void, signal!:()=>void;
      const ready=new Promise<void>(r=>{signal=r;}),held=new Promise<void>(r=>{release=r;});
      const checking=run(async tx=>{await authority(context,cid,tx);signal();await held;});
      await ready;
      try { await expect(run(async tx=>{await sql`SET LOCAL lock_timeout='100ms'`.execute(tx);await statement.execute(tx);})).rejects.toMatchObject({code:'55P03'}); }
      finally {release();await checking;}
    }
    await sql`INSERT INTO master.business_partner_operating_organization_assignment VALUES(${tenant}::uuid,${bp}::uuid,${org2}::uuid,'active',true,current_date,NULL)`.execute(db);
    await expect(run(tx=>authority(context,cid,tx))).rejects.toMatchObject({code:'VERIFICATION_SCOPE_AMBIGUOUS'});
  });

  async function authorityFixture() {
    const bp=randomUUID(), org=randomUUID(), ot=randomUUID();
    await sql`INSERT INTO master.business_partner VALUES(${tenant}::uuid,${bp}::uuid)`.execute(db);
    await sql`INSERT INTO master.operating_organization VALUES(${tenant}::uuid,${org}::uuid,'active')`.execute(db);
    // The registry enforces a unique owner code; use the valid existing business-partner type.
    if (!(await sql`SELECT id FROM control.owner_type WHERE code='business_partner'`.execute(db)).rows.length) {
      await sql`INSERT INTO control.owner_type(id,code,name,category,source_type,target_schema,target_table,is_tenant_scoped,tenant_column,supports_contact,status,created_by) VALUES(${ot}::uuid,'business_partner','Partner','custom','platform','master','business_partner',true,'tenant_id',true,'active',${principal}::uuid)`.execute(db);
      await sql`INSERT INTO control.owner_type_purpose(owner_type_id,capability,purpose_code,created_by) VALUES(${ot}::uuid,'contact','default',${principal}::uuid)`.execute(db);
    }
    const existing=(await sql<{id:string}>`SELECT id FROM control.owner_type WHERE code='business_partner'`.execute(db)).rows[0]!;
    const owner={entityCode:'business_partner',ownerTypeId:existing.id,ownerId:bp};
    await sql`INSERT INTO master.business_partner_operating_organization_assignment VALUES(${tenant}::uuid,${bp}::uuid,${org}::uuid,'active',true,current_date,NULL)`.execute(db);
    const c=await run(tx=>repo.createContact(contactInput(owner,randomUUID()+'@example.test'),tx));
    await sql`UPDATE control.owner_type SET supports_address=true WHERE id=${existing.id}::uuid`.execute(db);
    await sql`INSERT INTO control.owner_type_purpose(owner_type_id,capability,purpose_code,created_by) VALUES(${existing.id}::uuid,'address','default',${principal}::uuid) ON CONFLICT DO NOTHING`.execute(db);
    const normalized=normalizeAddress({countryCode:'MY',city:randomUUID()});
    const a=await run(tx=>repo.createAddress(tenant,normalized.address,normalized.hash,tx));
    const link=await run(tx=>repo.createAddressLink({tenantId:tenant,owner,addressId:a.id,purpose:'default',isPrimary:false,effectiveFrom:from},tx));
    const context={planeKey:'neon',tenantId:tenant,principalId:principal} as VerifiedRequestContext;
    const descriptor={entityCode:'business_partner',planeKey:'neon',storage:{schema:'master',object:'business_partner',tenantField:'tenant_id',idField:'id'},
      operations:{read:{permissionCode:'neon.relationship.business_partner.read'},update:{permissionCode:'neon.relationship.business_partner.update'}}};
    const metadata={getEntityDescriptor:async()=>descriptor} as unknown as MetadataReader;
    Object.assign(context, {permissions:{operationBindings:['read','update'].map(operationKey=>({entityCode:'business_partner',operationKey,permissionCode:`neon.relationship.business_partner.${operationKey}`}))}});
    return {bp,org,owner,c,link,context,metadata,descriptor};
  }
  it.each(['contact','address'] as const)("takes the owner lock before the %s row lock during authorization", async kind => {
    const f=await authorityFixture();
    let release!:()=>void, signal!:()=>void;
    const held=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{signal=r;});
    const writer=run(async tx=>{await lockMasterDataOwner(tenant,f.owner,tx);signal();await held;});
    await ready;
    const label='master-lock-order-'+randomUUID();
    let completed=false;
    const resolver=run(async tx=>{
      await sql`SELECT set_config('application_name',${label},true)`.execute(tx);
      await resolveMasterDataAuthorityTarget(f.context,kind==='contact'?{contactId:f.c.id}:{addressLinkId:f.link.id},tx);
    }).finally(()=>{completed=true;});
    try {
      let waiting=false;
      for (let attempt=0;attempt<100&&!completed;attempt++) {
        waiting=(await sql<{waiting:boolean}>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${label} AND lower(wait_event)='advisory') AS waiting`.execute(db)).rows[0]!.waiting;
        if(waiting)break;
        await new Promise(r=>setTimeout(r,10));
      }
      expect(waiting).toBe(true);
      // Inspect while authorization is waiting, not after its transaction has ended.
      await run(async tx=>{await sql`SELECT id FROM ${sql.table(kind==='contact'?'master.contact_link':'master.address_link')} WHERE id=${kind==='contact'?f.c.id:f.link.id}::uuid FOR UPDATE NOWAIT`.execute(tx);});
    } finally { release(); await Promise.all([writer,resolver]); }

  });
  it.each(['contact.create','address.create','contact.deactivate','address.deactivate','profile.read'] as const)('authorizes %s with stored scope, bound root and every sensitive capability',async route=>{
    const f=await authorityFixture();
    const access:MasterDataAccess=route==='profile.read'?'profile.read':route.startsWith('contact')?'contact.write':'address.write';
    const target:MasterDataAuthorityTarget=route==='contact.deactivate'?{contactId:f.c.id}:route==='address.deactivate'?{addressLinkId:f.link.id}:{owner:f.owner};
    const calls:Array<{permissionCode:string;resource?:Readonly<Record<string,unknown>>}>=[];
    let denied:string|undefined;
    const auth=createMasterDataAuthority({authorize:async input=>{calls.push(input);return {allowed:input.resource?.operatingOrganizationId===f.org && input.permissionCode!==denied};}},f.metadata);
    await run(tx=>auth(f.context,access,target,tx));
    const root=route==='profile.read'?'read':'update';
    expect(calls[0]).toMatchObject({permissionCode:`neon.relationship.business_partner.${root}`,resource:{tenantId:tenant,recordId:f.bp,operatingOrganizationId:f.org,entityCode:'business_partner',operationKey:root}});
    expect(calls).toHaveLength(route==='profile.read'?3:2);
    for(const call of calls.slice(1)) {expect(call.resource).not.toHaveProperty('entityCode');expect(call.resource).not.toHaveProperty('operationKey');}
    for(const permission of calls.map(c=>c.permissionCode)) {denied=permission;await expect(run(tx=>auth(f.context,access,target,tx))).rejects.toMatchObject({status:403});}
    denied=undefined;
    await expect(run(tx=>auth({...f.context,tenantId:otherTenant},access,target,tx),otherTenant)).rejects.toMatchObject({status:404});
    const wrongScope=createMasterDataAuthority({authorize:async input=>({allowed:input.resource?.operatingOrganizationId===randomUUID()})},f.metadata);
    await expect(run(tx=>wrongScope(f.context,access,target,tx))).rejects.toMatchObject({status:403});
    await sql`UPDATE master.business_partner_operating_organization_assignment SET effective_until=current_date WHERE business_partner_id=${f.bp}::uuid`.execute(db);
    await expect(run(tx=>auth(f.context,access,target,tx))).rejects.toMatchObject({code:'MASTER_DATA_SCOPE_AMBIGUOUS'});
  });
  it('rejects unpublished or mismatched root bindings and unsupported owners/planes',async()=>{
    const f=await authorityFixture();let calls=0;
    const auth=createMasterDataAuthority({authorize:async()=>{calls++;return {allowed:true};}},f.metadata);
    await expect(run(tx=>auth({...f.context,planeKey:'mesh'},'profile.read',{owner:f.owner},tx))).rejects.toMatchObject({status:403});
    await expect(run(tx=>auth(f.context,'profile.read',{owner:{...f.owner,entityCode:'other'}},tx))).rejects.toMatchObject({status:403});
    f.descriptor.operations.read.permissionCode='legacy.read';
    await expect(run(tx=>auth(f.context,'profile.read',{owner:f.owner},tx))).rejects.toMatchObject({code:'MASTER_DATA_OPERATION_UNAVAILABLE'});
    expect(calls).toBe(0);
  });
  it('keeps historical profile reads behind current authority and fails closed without the resolver',async()=>{
    const f=await authorityFixture();
    const options={repository:repo,transactions:{run:(_plane:unknown,_actor:unknown,work:(tx:Tx)=>Promise<any>)=>run(work)},metadata:f.metadata,authorizer:{authorize:async()=>({allowed:true})},evidenceVerifier:{verify:async()=>true},audit:{record:async()=>undefined},outbox:{append:async()=>undefined}};
    const query={context:f.context,owner:f.owner,asOf:from};
    await expect(createMasterDataServices(options).ownerProfile.get(query)).rejects.toMatchObject({code:'MASTER_DATA_AUTHORITY_UNAVAILABLE'});
    const services=createMasterDataServices({...options,authorizeAccess:createMasterDataAuthority(options.authorizer,f.metadata)});
    await services.ownerProfile.get(query);
    await sql`UPDATE master.business_partner_operating_organization_assignment SET effective_until=current_date WHERE business_partner_id=${f.bp}::uuid`.execute(db);
    await expect(services.ownerProfile.get(query)).rejects.toMatchObject({status:403});
  });

  it('holds trusted owner and organization coordinates stable until the profile transaction completes', async()=>{
    const f=await authorityFixture();
    const authority=createMasterDataAuthority({authorize:async()=>({allowed:true})},f.metadata);
    let unlock!:()=>void, acquired!:()=>void;
    const barrier=new Promise<void>(r=>{unlock=r;}),ready=new Promise<void>(r=>{acquired=r;});
    const pending=run(async tx=>{await sql`SET LOCAL ROLE master_data_test_user`.execute(tx);await authority(f.context,'profile.read',{owner:f.owner},tx);acquired();await barrier;});
    await ready;
    try {
      for(const statement of [
        sql`UPDATE master.operating_organization SET status='inactive' WHERE id=${f.org}::uuid`,
        sql`UPDATE control.owner_type SET target_table='test_owner' WHERE id=${f.owner.ownerTypeId}::uuid`,
        sql`INSERT INTO master.business_partner_operating_organization_assignment VALUES(${tenant}::uuid,${f.bp}::uuid,${randomUUID()}::uuid,'active',true,current_date,NULL)`,
      ]) await expect(run(async tx=>{await sql`SET LOCAL lock_timeout='100ms'`.execute(tx);await statement.execute(tx);})).rejects.toMatchObject({code:'55P03'});
    } finally {unlock();await pending;}
  });

});
