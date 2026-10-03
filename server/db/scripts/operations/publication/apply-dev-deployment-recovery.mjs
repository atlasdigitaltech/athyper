/** Install lifecycle infrastructure only; never records human approval or retires policies. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
const args=process.argv.slice(2),apply=args.includes('--apply=DEV-DEPLOYMENT-RECOVERY'),hardening=args.includes('--harden-search-path'),workerAccess=args.includes('--worker-access');
assert.ok(new Set(args).size===args.length&&args.every(a=>['--apply=DEV-DEPLOYMENT-RECOVERY','--harden-search-path','--worker-access'].includes(a)),'Unsupported recovery install argument');
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
assert.ok(!(hardening&&workerAccess),'Choose one upgrade');
const name=workerAccess?'20261003_deployment_recovery_worker_access.sql':hardening?'20261003_deployment_recovery_search_path.sql':'20261003_coordinated_deployment_recovery.sql';
const migration=readFileSync('server/db/migrations/'+name,'utf8');
assert.ok(migration.includes('publication.fn_coordinated_deployment_recovery_source')); // Installed bytes are pinned by inventory, not mutable canonical SQL.
const hash=createHash('sha256').update(migration).digest('hex');
assert.equal(JSON.parse(readFileSync('server/db/migrations/inventory.json')).entries.find(e=>e.path==='migrations/'+name)?.sha256,hash);
const ddl=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const db=new Client({host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim(),database:'athyper_studio'});
const report={schema:'athyper.deployment-recovery-install/1',environment:'dev',migration:name,sha256:hash,applied:false};
await db.connect();
async function state(){return(await db.query(`SELECT md5(jsonb_build_array(
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM control.policy_definition d),
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM publication.deployment d),
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM publication.artifact d))::text) hash`)).rows[0].hash;}
try{
 const before=await state();
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15000ms'");
 await db.query(ddl);await db.query(ddl);assert.equal(await state(),before);
 const originalId='7886bdc7-6a64-4145-9e71-d610ca9a3a91', originalHash='f83745496f6130b300dcb1da6514d4f6079a5c2af720594908b576e9a92da76f';
 const tenant='11111111-1111-4111-8111-111111111111', publisher='c0febdd1-491c-46b8-8113-160be767b88d';
 const probe=async(actor,scope=tenant,hash=originalHash)=>{
  await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[scope,actor]);
  return(await db.query('SELECT publication.fn_coordinated_deployment_recovery_source($1,$2) value',[originalId,hash])).rows[0].value;
 };
 const checks=[];
 for(const [role,actor] of [['athyper_control_api','df0159b0-2bdc-55e8-944b-efaa9ed9b8e5'],['athyper_control_api','41bf4855-6aa1-5e43-bc11-ee2cfa647693'],['athyper_runtime',publisher],['athyper_worker',publisher]]){
  await db.query('SET LOCAL ROLE '+role);
  const value=await probe(actor);assert.equal(value.deliveries.length,8);assert.equal(new Set(value.deliveries.map(d=>d.releaseId)).size,6);
  assert.ok(value.deliveries.every(d=>d.instance==='*'&&d.artifactStatus==='signed'&&!d.acknowledged));checks.push(role+':'+actor);
  await db.query('RESET ROLE');
 }
 await db.query('SET LOCAL ROLE athyper_runtime');
 for(const [actor,scope,hash] of [[publisher,randomUUID(),originalHash],[randomUUID(),tenant,originalHash],[publisher,tenant,'0'.repeat(64)]]){
  await db.query('SAVEPOINT denied');await assert.rejects(probe(actor,scope,hash),/DEPLOYMENT_RECOVERY_/);await db.query('ROLLBACK TO SAVEPOINT denied');
 }
 const privileges=(await db.query("SELECT has_table_privilege(current_user,'publication.deployment','UPDATE') allowed")).rows[0];assert.equal(privileges.allowed,false);
 await db.query('ROLLBACK');report.sourceChecks=checks;report.denialChecks=['wrong_tenant','wrong_actor','stale_hash','no_runtime_table_update'];
 report.rollbackAndReplayPassed=true;
 if(apply){
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15000ms'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[name]);
  const previous=(await db.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[name])).rows[0];
  if(previous){assert.equal(previous.sha256,hash);assert.equal(previous.status,'applied');}
  await db.query(ddl);assert.equal(await state(),before);
  if(!previous)await db.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[name,hash,'deployment-recovery-'+randomUUID()]);
  await db.query('COMMIT');report.applied=true;report.reused=Boolean(previous);
 }
 report.policyArtifactDeploymentStateUnchanged=(await state())===before;report.passed=true;
}catch(e){await db.query('ROLLBACK');report.passed=false;report.error={code:e.code,message:e.message};process.exitCode=1;}
finally{await db.end();report.completedAt=new Date().toISOString();writeFileSync('docs/reports/coordinated-release-deployment-recovery'+(workerAccess?'-worker-access':hardening?'-search-path':'')+'-install-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
