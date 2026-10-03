#!/usr/bin/env node
/** Reconcile only the already-enrolled DEV publisher identity on declared planes.
 * No credential rotation, human membership, role/permission grants or approval. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
const args=process.argv.slice(2),apply=args.includes('--apply=DEV-PUBLISHER-IDENTITY');
assert.ok(args.length===(apply?2:1)&&args.every(a=>a.startsWith('--policy=')||a==='--apply=DEV-PUBLISHER-IDENTITY'));
const candidate=JSON.parse(readFileSync(args.find(a=>a.startsWith('--policy=')).slice(9),'utf8'));
assert.equal(candidate.schema,'athyper.dev-coordinated-deployment-recovery/1');
assert.equal(candidate.environment,'local');assert.equal(candidate.instance,'dev');
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
const secret=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const connect=async plane=>{assert.ok(['studio','neon','mesh'].includes(plane));const db=new Client({host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim(),database:'athyper_'+plane});await db.connect();return db;};
const studio=await connect('studio'),report={schema:'athyper.dev-publisher-identity-reconciliation/1',applied:apply,planes:[]};
try{
 await studio.query('BEGIN READ ONLY');
 await studio.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[candidate.authorityTenantId,candidate.publisherPrincipalId]);
 const source=(await studio.query('SELECT publication.fn_coordinated_deployment_recovery_source($1,$2) value',[candidate.originalPolicy.id,candidate.originalPolicy.hash])).rows[0].value;
 assert.equal(source.policy.publisherPrincipalId,candidate.publisherPrincipalId);assert.equal(source.policy.authorityTenantId,candidate.authorityTenantId);
 const planes=[...new Set(source.policy.plan.members.flatMap(m=>m.targets.map(t=>t.plane)))].sort();
 assert.deepEqual([...new Set(candidate.deliveries.map(d=>d.plane))].sort(),planes);
 const actor=(await studio.query("SELECT id,tenant_id,code,name,principal_type,provisioning_source,status,auth_epoch,metadata->'devPublication' marker FROM master.principal WHERE id=$1 AND tenant_id=$2",[candidate.publisherPrincipalId,candidate.authorityTenantId])).rows[0];
 assert.equal(actor.code,'dev.metadata.publisher');assert.equal(actor.principal_type,'service_account');assert.equal(actor.provisioning_source,'internal');assert.equal(actor.status,'active');
 assert.deepEqual(actor.marker,{role:'publisher',instance:'dev'});
 await studio.query('ROLLBACK');
 const fingerprint=createHash('sha256').update(JSON.stringify({original:candidate.originalPolicy,actor})).digest('hex');
 for(const plane of planes){const db=await connect(plane);try{
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`dev-publication-publisher:${actor.tenant_id}`]);
  const seed=(await db.query("SELECT id FROM master.principal WHERE tenant_id=$1 AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active'",[actor.tenant_id])).rows;assert.equal(seed.length,1);
  await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('app.database_plane',$3,true)",[actor.tenant_id,seed[0].id,plane]);
  const existing=(await db.query('SELECT id,tenant_id,code,principal_type,provisioning_source,status,auth_epoch,metadata FROM master.principal WHERE id=$1 OR (tenant_id=$2 AND code=$3)',[actor.id,actor.tenant_id,actor.code])).rows;
  assert.ok(existing.length<=1,'Identity collision');
  if(existing.length){const row=existing[0];for(const key of ['id','tenant_id','code','principal_type','provisioning_source','status','auth_epoch'])assert.equal(row[key],actor[key],`Identity drift: ${key}`);assert.deepEqual(row.metadata.devPublication,actor.marker);}
  else{
   await db.query("INSERT INTO master.principal(id,tenant_id,code,name,principal_type,provisioning_source,status,auth_epoch,metadata,created_by) VALUES($1,$2,$3,$4,'service_account','internal','active',$5,$6::jsonb,$7)",[actor.id,actor.tenant_id,actor.code,actor.name,actor.auth_epoch,JSON.stringify({devPublication:actor.marker}),seed[0].id]);
   await db.query("INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by) VALUES($1::uuid,'publication.publisher.reconcile',$2::text,$2::text,'succeeded',$3::uuid,'dev-maintenance',$4::jsonb,now(),now(),$3::uuid)",[actor.tenant_id,fingerprint,seed[0].id,JSON.stringify({originalPolicy:candidate.originalPolicy,publisherId:actor.id,plane,grantsChanged:false,humanApproval:false})]);
  }
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  report.planes.push({plane,principalId:actor.id,authEpoch:actor.auth_epoch,created:!existing.length});
  await db.query(apply?'COMMIT':'ROLLBACK');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}}
 report.passed=true;
}catch(e){await studio.query('ROLLBACK');report.passed=false;report.error={code:e.code,message:e.message};process.exitCode=1;}
finally{await studio.end();report.completedAt=new Date().toISOString();writeFileSync('docs/reports/coordinated-release-publisher-reconciliation-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
