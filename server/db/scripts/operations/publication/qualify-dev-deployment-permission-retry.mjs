/** DEV-only migration qualification. All retry probes roll back; apply installs code only. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
const args=process.argv.slice(2);assert.ok(args.length<=1&&args.every(a=>a==='--apply=DEV-REVIEWED-PERMISSION-RETRY'));
const apply=args.length===1;
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const name='20261003_reviewed_deployment_permission_retry.sql',migration=readFileSync('server/db/migrations/'+name,'utf8');
const hash=createHash('sha256').update(migration).digest('hex');
assert.equal(JSON.parse(readFileSync('server/db/migrations/inventory.json')).entries.find(e=>e.path==='migrations/'+name)?.sha256,hash);
const ddl=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const options={host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim(),database:'athyper_studio'};
const db=new Client(options),other=new Client(options);
const candidate=JSON.parse(readFileSync('docs/reports/coordinated-release-deployment-recovery-policy-20261003.json'));
const pin=JSON.parse(readFileSync('docs/reports/coordinated-release-deployment-recovery-proposal-20261003.json')).result;
const targets=JSON.parse(readFileSync('docs/reports/coordinated-release-deployment-recovery-execution-20261003.json')).result.targets;
const evidence={schema:'athyper.coordinated-deployment-retry/1',recoveryPolicyId:pin.id,recoveryPolicyHash:pin.hash,compilerHash:candidate.compiler.buildHash,reason:'Worker execution grant repaired; retry the unchanged approved command after pre-receipt permission denial.'};
const report={schema:'athyper.reviewed-deployment-permission-retry-install/1',migration:name,sha256:hash,applied:false,checks:[]};
await db.connect();await other.connect();
async function state(){return(await db.query(`SELECT md5(jsonb_build_array(
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM control.policy_definition d),
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM publication.deployment d),
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM publication.deployment_event d),
 (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM publication.artifact d))::text) hash`)).rows[0].hash;}
async function stamp(actor=candidate.publisherPrincipalId,tenant=candidate.authorityTenantId){await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[tenant,actor]);}
async function transition(id=targets[0].deploymentId,e=evidence){return(await db.query("SELECT (publication.fn_transition_deployment($1,'dispatched',$2)).*",[id,e])).rows[0];}
async function denied(label,work,pattern=/DEPLOYMENT_RECOVERY_|INVALID_DEPLOYMENT_TRANSITION|query returned no rows/){await db.query('SAVEPOINT denial');await assert.rejects(work(),pattern);await db.query('ROLLBACK TO SAVEPOINT denial');report.checks.push(label);}
try{
 const before=await state();
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s'");
 await db.query(ddl);await db.query(ddl);
 await db.query('SET LOCAL ROLE athyper_worker');await stamp();
 await denied('stale_policy_hash',()=>transition(undefined,{...evidence,recoveryPolicyHash:'0'.repeat(64)}));
 await denied('stale_compiler',()=>transition(undefined,{...evidence,compilerHash:'0'.repeat(64)}));
 await denied('wrong_actor',async()=>{await stamp('df0159b0-2bdc-55e8-944b-efaa9ed9b8e5');return transition();});
 await denied('wrong_tenant',async()=>{await stamp(candidate.publisherPrincipalId,randomUUID());return transition();});
 await denied('wildcard_attempt',()=>transition(candidate.deliveries[0].deploymentId));
 await denied('missing_reviewed_evidence',()=>transition(undefined,{}));
 await other.query('BEGIN');await other.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`deployment-recovery:${candidate.authorityTenantId}:${candidate.originalPolicy.id}`]);
 try{await denied('concurrent_execution',()=>transition(),/DEPLOYMENT_RECOVERY_RETRY_BUSY/);}finally{await other.query('ROLLBACK');}
 await db.query('RESET ROLE');
 await denied('terminal_nonpermission_failure',async()=>{await db.query("UPDATE publication.deployment SET failure_code='ARTIFACT_HASH_MISMATCH' WHERE id=$1",[targets[0].deploymentId]);await db.query('SET LOCAL ROLE athyper_worker');return transition();});
 await denied('receipt_already_started',async()=>{await db.query('UPDATE publication.deployment SET received_at=clock_timestamp() WHERE id=$1',[targets[0].deploymentId]);await db.query('SET LOCAL ROLE athyper_worker');return transition();});
 await db.query('SET LOCAL ROLE athyper_worker');
 for(const target of targets){const row=await transition(target.deploymentId);assert.equal(row.status,'dispatched');assert.equal(row.failure_code,null);assert.equal(row.target_instance,'dev');assert.equal(row.attempt_no,2);assert.equal((await transition(target.deploymentId)).id,row.id);}
 report.checks.push('eight_exact_retries','idempotent_same_status');
 const events=(await db.query("SELECT count(*)::int n FROM publication.deployment_event WHERE deployment_id=ANY($1::uuid[]) AND from_status='failed' AND to_status='dispatched' AND evidence->>'schema'=$2",[targets.map(t=>t.deploymentId),evidence.schema])).rows[0].n;assert.equal(events,8);
 const failures=(await db.query("SELECT count(*)::int n FROM publication.deployment_event WHERE deployment_id=ANY($1::uuid[]) AND to_status='failed'",[targets.map(t=>t.deploymentId)])).rows[0].n;assert.equal(failures,8);
 assert.equal((await db.query("SELECT has_table_privilege(current_user,'publication.deployment','UPDATE') allowed")).rows[0].allowed,false);
 await db.query('ROLLBACK');assert.equal(await state(),before);report.checks.push('failure_history_retained','no_direct_worker_update','all_probe_changes_rolled_back');
 if(apply){await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[name]);
 const previous=(await db.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[name])).rows[0];
 if(previous){assert.equal(previous.sha256,hash);assert.equal(previous.status,'applied');}
 await db.query(ddl);assert.equal(await state(),before);
 if(!previous)await db.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[name,hash,'reviewed-permission-retry-'+randomUUID()]);
 await db.query('COMMIT');report.applied=true;
 }
 report.passed=true;
}catch(e){await db.query('ROLLBACK');report.passed=false;report.error={code:e.code,message:e.message};process.exitCode=1;}
finally{await db.end();await other.end();report.completedAt=new Date().toISOString();writeFileSync('docs/reports/coordinated-release-permission-retry-install-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
