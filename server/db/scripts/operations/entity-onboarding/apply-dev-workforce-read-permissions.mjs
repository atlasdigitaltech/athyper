/** DEV-only, catalog-only upgrade with rollback, conflict and grant-preservation checks. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
const apply=process.argv[2]==='--apply=DEV-WORKFORCE-READ-CATALOG';
assert.ok(process.argv.length===2 || (apply && process.argv.length===3),'Expected optional --apply=DEV-WORKFORCE-READ-CATALOG');
const container=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(container.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(container.State.Running,true);
const env=Object.fromEntries(container.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=container.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const name='20261003_workforce_entity_read_permissions.sql';
const migration=readFileSync('server/db/migrations/'+name,'utf8');
const canonical=readFileSync('server/db/ddl/planes/neon/authz/19_workforce_entity_read.sql','utf8');
// The installed migration is an immutable snapshot; the canonical guard now
// checks database identity independently of the migration's own plane GUC.
const installedCanonical=canonical.replace("IF current_database()<>'athyper_neon'\n     OR current_setting", "IF current_setting");
assert.ok(migration.includes(installedCanonical));
const hash=createHash('sha256').update(migration).digest('hex');
const inventory=JSON.parse(readFileSync('server/db/migrations/inventory.json','utf8'));
assert.equal(inventory.entries.find(e=>e.path==='migrations/'+name)?.sha256,hash);
const sql=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const codes=['address','employee','external_worker','person','person_address_use'].map(e=>'neon.workforce.'+e+'.read');
const db=new Client({host:Object.values(container.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim(),database:'athyper_neon'});
const evidence={schema:'athyper.workforce-read-catalog-upgrade/1',environment:'dev',plane:'neon',migration:name,sha256:hash,applied:false,checks:[]};
async function grantState(){
 const result={};
 for(const table of ['role_permission','group_role','principal_group','delegation_grant','override','record_acl','deny_rule']){
  const exists=(await db.query('SELECT to_regclass($1) relation',['authz.'+table])).rows[0].relation;
  if(exists)result[table]=(await db.query(`SELECT count(*)::int count,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) hash FROM authz.${table} t`)).rows[0];
 }
 return result;
}
async function catalog(){return (await db.query(`SELECT p.id,p.canonical_code,p.permission_kind,p.risk_tier,p.requires_mfa,p.is_shareable,p.is_delegable,p.is_overridable,p.status,s.scope_kind,s.propagation_mode,s.status scope_status FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.canonical_code=ANY($1) ORDER BY p.canonical_code,s.scope_kind`,[codes])).rows;}
await db.connect();
try{
 assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,'athyper_neon','Workforce catalog requires the independently identified Neon database');
 const initial=await catalog(),grants=await grantState();
 await db.query('BEGIN');
 await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15000ms'");
 await db.query(sql);const first=await catalog();assert.equal(first.length,5);
 await db.query(sql);assert.deepEqual(await catalog(),first);evidence.checks.push('actual_postgres_idempotency');
 assert.deepEqual(await grantState(),grants);evidence.checks.push('no_role_membership_or_record_grant_changes');
 await db.query('SAVEPOINT conflict_probe');
 await db.query("UPDATE authz.permission_scope_kind SET scope_kind='company_code' WHERE permission_id=$1",[first[0].id]);
 await assert.rejects(db.query(sql),/Workforce read catalog conflict/);
 await db.query('ROLLBACK TO SAVEPOINT conflict_probe');evidence.checks.push('conflicting_scope_rejected');
 await db.query('ROLLBACK');assert.deepEqual(await catalog(),initial);evidence.checks.push('rollback_restored_catalog');
 if(apply){
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15000ms'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[name]);
  const previous=(await db.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[name])).rows[0];
  if(previous){assert.equal(previous.sha256,hash);assert.equal(previous.status,'applied');}
  await db.query(sql);assert.deepEqual(await grantState(),grants);
  if(!previous)await db.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[name,hash,'workforce-read-catalog-'+randomUUID()]);
  await db.query('COMMIT');evidence.applied=true;evidence.reused=Boolean(previous);
 }
 evidence.catalog=await catalog();evidence.grantStateUnchanged=JSON.stringify(await grantState())===JSON.stringify(grants);
 evidence.passed=true;
}catch(error){await db.query('ROLLBACK');evidence.passed=false;evidence.error={code:error.code,message:error.message};process.exitCode=1;}
finally{await db.end();evidence.completedAt=new Date().toISOString();writeFileSync('docs/reports/workforce-read-permission-catalog-20261003.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));}
