import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../../../package.json',import.meta.url))('pg');
assert.deepEqual(process.argv.slice(2),['--apply=DEV-PROJECTED-PROFILE-SOURCE']);
const container=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(container.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(container.State.Running,true);
const env=Object.fromEntries(container.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=container.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const file='20261002_projected_profile_source_authority.sql';
const migration=readFileSync('server/db/migrations/'+file,'utf8');
assert.ok(migration.includes(readFileSync('server/db/ddl/common/master/23_projected_profile_source.sql','utf8')));
const digest=createHash('sha256').update(migration).digest('hex');
const receipt={environment:'dev',migration:file,sha256:digest,planes:[],passed:false};
try{for(const plane of ['studio','mesh']){
 const database=new Client({host:Object.values(container.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim(),database:'athyper_'+plane});
 await database.connect();
 try {
  await database.query('BEGIN');await database.query("SET LOCAL lock_timeout='5s'");
  await database.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[file]);
  const previous=await database.query('SELECT sha256,status FROM public.athyper_schema_migration_v1 WHERE migration_name=$1',[file]);
  if(previous.rowCount){assert.equal(previous.rows[0].sha256,digest);assert.equal(previous.rows[0].status,'applied');await database.query('ROLLBACK');receipt.planes.push({plane,applied:true,reused:true});}
  else {
   await database.query(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
   await database.query("INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,started_at,completed_at) VALUES($1,$2,'applied',$3,transaction_timestamp(),clock_timestamp())",[file,digest,'projected-profile-source-'+randomUUID()]);
   await database.query('COMMIT');receipt.planes.push({plane,applied:true,reused:false});
  }
  const installed=JSON.parse(execFileSync('pnpm',['--filter','@athyper/server-db','exec','tsx','scripts/verification/qualify-installed-profile-source-dev.ts',`--plane=${plane}`],{encoding:'utf8'}));assert.equal(installed.passed,true);receipt.planes.at(-1).qualified=true;
 } catch(error){await database.query('ROLLBACK');throw error;} finally{await database.end();}
}receipt.passed=true;}catch(error){receipt.failure={code:error.code,message:error.message};process.exitCode=1;}finally{receipt.completedAt=new Date().toISOString();console.log(JSON.stringify(receipt,null,2));}
