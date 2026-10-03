/** Install lifecycle infrastructure only; never records human approval or retires policies. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
const apply=process.argv[2]==='--apply=DEV-COORDINATED-WORKER-READ';
assert.ok(process.argv.length===2||(apply&&process.argv.length===3),'Expected optional --apply=DEV-COORDINATED-WORKER-READ');
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const name='20261003_coordinated_worker_source_read.sql';
const migration=readFileSync('server/db/migrations/'+name,'utf8');
assert.ok(migration.includes(readFileSync('server/db/ddl/planes/studio/publication/21_coordinated_worker_source_read.sql','utf8')));
const hash=createHash('sha256').update(migration).digest('hex');
assert.equal(JSON.parse(readFileSync('server/db/migrations/inventory.json')).entries.find(e=>e.path==='migrations/'+name)?.sha256,hash);
const ddl=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const db=new Client({host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim(),database:'athyper_studio'});
const report={schema:'athyper.coordinated-worker-read-install/1',environment:'dev',migration:name,sha256:hash,applied:false};
await db.connect();
async function state(){return(await db.query("SELECT md5(COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]')::text) hash FROM control.policy_definition d")).rows[0].hash;}
try{
 const before=await state();
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15000ms'");
 await db.query(ddl);await db.query(ddl);assert.equal(await state(),before);
 const policy=JSON.parse(readFileSync('docs/reports/coordinated-release-execution-policy-replacement-20261003.json'));
 const releaseIds=JSON.parse(readFileSync('docs/reports/coordinated-release-policy-replacement-execution-20261003.json')).result.releases.map(r=>r.id);
 await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[policy.authorityTenantId,policy.publisherPrincipalId]);
 await db.query('SET LOCAL ROLE athyper_worker');
 const visible=async()=>Number((await db.query('SELECT count(id)::int count FROM metadata.entity_release WHERE id=ANY($1::uuid[])',[releaseIds])).rows[0].count);
 assert.equal(await visible(),6);
 await db.query("SELECT set_config('app.current_principal_id',$1,true)",[policy.authorPrincipalId]);assert.equal(await visible(),0);
 await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[randomUUID(),policy.publisherPrincipalId]);assert.equal(await visible(),0);
 await db.query('SAVEPOINT column_probe');await assert.rejects(db.query('SELECT contract_signature FROM metadata.entity_release'),/permission denied/);await db.query('ROLLBACK TO SAVEPOINT column_probe');
 assert.equal((await db.query("SELECT has_table_privilege(current_user,'metadata.entity_release','INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,false);
 await db.query('ROLLBACK');report.workerReadChecks=['six_exact_releases_visible','other_actor_hidden','other_tenant_hidden','signature_column_denied','writes_denied'];
 report.rollbackAndReplayPassed=true;
 if(apply){
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15000ms'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[name]);
  const previous=(await db.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[name])).rows[0];
  if(previous){assert.equal(previous.sha256,hash);assert.equal(previous.status,'applied');}
  await db.query(ddl);assert.equal(await state(),before);
  if(!previous)await db.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[name,hash,'coordinated-worker-read-'+randomUUID()]);
  await db.query('COMMIT');report.applied=true;report.reused=Boolean(previous);
 }
 report.policyStateUnchanged=(await state())===before;report.passed=true;
}catch(e){await db.query('ROLLBACK');report.passed=false;report.error={code:e.code,message:e.message};process.exitCode=1;}
finally{await db.end();report.completedAt=new Date().toISOString();writeFileSync('docs/reports/coordinated-release-coordinated-worker-read-install-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
