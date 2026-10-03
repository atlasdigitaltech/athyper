import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
assert.ok(process.argv.length===3&&process.argv[2]==='--apply=DEV-MESH-WORKER-IDENTITY');
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');
const env=Object.fromEntries(c.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));const file=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(file?.includes('/.athyper/instances/dev/secrets/'));
const name='20261003_mesh_publication_worker_identity.sql',source=readFileSync('server/db/migrations/'+name,'utf8'),hash=createHash('sha256').update(source).digest('hex');
assert.equal(JSON.parse(readFileSync('server/db/migrations/inventory.json')).entries.find(e=>e.path==='migrations/'+name)?.sha256,hash);
const ddl=source.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const db=new Client({host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(file,'utf8').trim(),database:'athyper_mesh'});await db.connect();
const report={schema:'athyper.mesh-worker-identity-install/1',migration:name,sha256:hash};
try{
 await db.query('BEGIN');await db.query(ddl);await db.query(ddl);await db.query('SET LOCAL ROLE athyper_worker');
 const id='c0febdd1-491c-46b8-8113-160be767b88d';await db.query("SELECT set_config('app.current_principal_id',$1,true)",[id]);assert.equal((await db.query('SELECT master.current_principal_id_soft() id')).rows[0].id,id);
 assert.equal((await db.query("SELECT has_table_privilege(current_user,'master.principal','UPDATE') allowed")).rows[0].allowed,false);
 await db.query('ROLLBACK');report.rollbackProbePassed=true;
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[name]);
 const old=(await db.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[name])).rows[0];if(old){assert.equal(old.sha256,hash);assert.equal(old.status,'applied');}
 await db.query(ddl);if(!old)await db.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[name,hash,'mesh-worker-identity-'+randomUUID()]);await db.query('COMMIT');report.applied=true;
}catch(e){await db.query('ROLLBACK');report.error={code:e.code,message:e.message};process.exitCode=1;}
finally{await db.end();writeFileSync('docs/reports/coordinated-release-mesh-worker-identity-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
