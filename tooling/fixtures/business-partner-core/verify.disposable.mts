import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {buildSql,tenants,id} from './seed.mjs';
import {readBusinessPartner360CommonSection} from '../../../server/packages/services/master-data/src/business-partner/record/section-readers';
const {Pool}=createRequire(new URL('../../../server/db/package.json',import.meta.url))('pg');
const {Kysely,PostgresDialect,sql}=createRequire(new URL('../../../server/packages/services/master-data/package.json',import.meta.url))('kysely');
const container=JSON.parse(execFileSync('docker',['inspect','athyper-bp2-acceptance-20260923'],{encoding:'utf8'}))[0];
assert.equal(container.Config.Labels['athyper.environment'],'disposable_local');assert.equal(container.Config.Labels['athyper.purpose'],'bp2-acceptance');
const port=container.NetworkSettings.Ports['5432/tcp'][0];assert.equal(port.HostIp,'127.0.0.1');
const password=container.Config.Env.find((s:string)=>s.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
const db=new Kysely({dialect:new PostgresDialect({pool:new Pool({host:'127.0.0.1',port:Number(port.HostPort),database:'athyper_neon',user:'postgres',password})})});
const rollback=Error('intentional rollback'),evidence:any[]=[];
try{await db.transaction().execute(async(tx:any)=>{
 await sql.raw(buildSql(false).replace(/^BEGIN;/,'').replace(/ROLLBACK;$/,'')).execute(tx);
 for(const [tenant,actor] of tenants){
  const row=(await sql`SELECT t.id tenant_id,p.id principal_id FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id WHERE t.code=${tenant} AND p.code=${actor}`.execute(tx)).rows[0];assert.ok(row);
  await sql`SELECT set_config('app.current_tenant_id',${row.tenant_id},true),set_config('app.current_principal_id',${row.principal_id},true)`.execute(tx);
  const owner=(await sql`SELECT id FROM control.owner_type WHERE tenant_id IS NULL AND code='contact_person'`.execute(tx)).rows[0].id;
  await sql`INSERT INTO master.contact_link(id,tenant_id,owner_type_id,owner_id,channel_type,value,purpose,effective_from,created_by) VALUES(${randomUUID()}::uuid,${row.tenant_id}::uuid,${owner}::uuid,${id(tenant,'contact')}::uuid,'email','future@example.test','business',CURRENT_DATE+interval '1 day',${row.principal_id}::uuid)`.execute(tx);
  const input:any={tenantId:row.tenant_id,principalId:row.principal_id,businessPartnerId:id(tenant,'partner'),category:'organization',asOf:new Date().toISOString().slice(0,10),limit:101,cursor:{snapshotAt:new Date(Date.now()+1000).toISOString()}};
  const contacts:any=await readBusinessPartner360CommonSection({...input,sectionCode:'contacts'},tx);
  assert.equal(contacts.items.length,1);assert.equal(contacts.items[0].channels.length,5);assert.ok(!JSON.stringify(contacts).includes('future@example.test'));
  const addresses:any=await readBusinessPartner360CommonSection({...input,sectionCode:'addresses'},tx);assert.equal(addresses.items.length,2);assert.ok(addresses.items.every((a:any)=>a.lines.length&&a.locality));
  const identity:any=await readBusinessPartner360CommonSection({...input,sectionCode:'identity'},tx);
  const classification=identity.items.find((item:any)=>item.kind==='classification'&&item.industryCode==='72');assert.ok(classification?.crosswalks.length);
  const isolated:any=await readBusinessPartner360CommonSection({...input,businessPartnerId:id(tenants.find(([code])=>code!==tenant)![0],'partner'),sectionCode:'contacts'},tx);assert.equal(isolated.items.length,0);
  evidence.push({tenant,channels:5,addresses:2,industryCrosswalks:classification.crosswalks.length,futureChannelExcluded:true,crossTenantEmpty:true});
 }
 throw rollback;
});}catch(error){if(error!==rollback)throw error;}finally{await db.destroy();}
console.log(JSON.stringify({passed:true,rolledBack:true,evidence},null,2));
