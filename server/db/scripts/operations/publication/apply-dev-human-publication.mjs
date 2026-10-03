import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
assert.equal(process.argv.length,3);
assert.ok(['--apply=DEV-HUMAN-PUBLICATION','--apply=DEV-HUMAN-PUBLICATION-TENANT-READS'].includes(process.argv[2]));
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const root=new URL('../../../',import.meta.url), name=process.argv[2].endsWith('TENANT-READS') ? '20261003_product_publication_tenant_reads.sql' : '20261003_human_reviewed_publication.sql';
const migration=readFileSync(new URL('migrations/'+name,root),'utf8'), hash=createHash('sha256').update(migration).digest('hex');
const entry=JSON.parse(readFileSync(new URL('migrations/inventory.json',root),'utf8')).entries.find(e=>e.path==='migrations/'+name);
assert.equal(entry.sha256,hash);
// Inventory pins immutable migration bytes; canonical sources may have successors.
const contract=JSON.parse(readFileSync(new URL('contracts/security/security-definer-ownership.v1.json',root),'utf8'));
const expected=contract.exceptions.filter(e=>e.owner==='athyper_definer_product_publication').map(e=>e.signature);
const db=new Client({host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,
 password:readFileSync(secret,'utf8').trim(),database:'athyper_studio'});
const report={schema:'athyper.human-publication-integration-install/1',environment:'dev',plane:'studio',migration:name,sha256:hash,applied:false};
await db.connect();
try{
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[name]);
 const state=()=>db.query(`SELECT (SELECT count(*)::int FROM metadata.entity_release) releases,
   (SELECT count(*)::int FROM metadata.entity_product_review_receipt) human_receipts,
   (SELECT count(*)::int FROM control.policy_definition WHERE entity_type='metadata.publication') execution_policies`);
 const before=(await state()).rows[0];
 const prior=(await db.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[name])).rows[0];
 if(prior){assert.equal(prior.sha256,hash);assert.equal(prior.status,'applied');report.reused=true;}
 else{
  await db.query(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
  await db.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[name,hash,'human-publication-'+randomUUID()]);
 }
 for(const signature of expected){
  const row=(await db.query(`SELECT r.rolname,NOT(r.rolsuper OR r.rolbypassrls OR r.rolcanlogin OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication) bounded,
   NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) isolated,
   NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') private
   FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
  assert.equal(row.rolname,'athyper_definer_product_publication');assert.ok(row.bounded&&row.isolated&&row.private,signature);
 }
 const after=(await state()).rows[0];assert.deepEqual(after,before);
 await db.query('COMMIT');Object.assign(report,{applied:true,qualifiedFunctions:expected.length,publicationStateUnchanged:true,before,after});
}catch(error){await db.query('ROLLBACK');report.failure={code:error.code,message:error.message};process.exitCode=1;}
finally{await db.end();report.completedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));}
