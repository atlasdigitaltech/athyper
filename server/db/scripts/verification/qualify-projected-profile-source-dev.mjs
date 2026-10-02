/** Isolated database qualification; never inserts real user or workforce rows. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {Client}=createRequire(new URL('../../package.json',import.meta.url))('pg');
const c=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(c.Config.Labels['com.docker.compose.project'],'athyper-dev');assert.equal(c.State.Running,true);
const env=Object.fromEntries(c.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=c.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const connection={host:Object.values(c.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim()};
const admin=new Client({...connection,database:'postgres'});await admin.connect();
const receipt={environment:'dev',isolated:true,passed:false,planes:[],cleanup:true};
try {for(const plane of ['studio','mesh']) {
 const name=`athyper_profile_source_${randomUUID().replaceAll('-','')}_${plane}`;
 let db;const concurrent=[];await admin.query(`CREATE DATABASE ${name}`);
 try {
  db=new Client({...connection,database:name});await db.connect();
  await db.query(`CREATE SCHEMA shared; CREATE SCHEMA master;
  CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid$$;
  CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_principal_id',true),'')::uuid$$;
  CREATE TABLE master.principal(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,external_ref text,metadata jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'active');
  CREATE TABLE master.principal_identity_binding(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,principal_id uuid NOT NULL,status text NOT NULL DEFAULT 'active',sync_status text NOT NULL DEFAULT 'synced',metadata jsonb NOT NULL DEFAULT '{}',updated_at timestamptz);
  CREATE TABLE master.principal_profile(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,principal_id uuid NOT NULL,given_name text);
  GRANT USAGE ON SCHEMA shared,master TO athyperapp;
  GRANT SELECT ON master.principal_identity_binding TO athyperapp;
  ALTER TABLE master.principal_identity_binding ENABLE ROW LEVEL SECURITY;
  ALTER TABLE master.principal_identity_binding FORCE ROW LEVEL SECURITY;
  CREATE POLICY hidden_bindings ON master.principal_identity_binding FOR SELECT TO athyperapp USING(false);`);
  await db.query(readFileSync('server/db/ddl/common/master/23_projected_profile_source.sql','utf8'));
  const tenant=randomUUID(),principal=randomUUID(),identity=randomUUID(),sourceTenant=randomUUID(),person=randomUUID(),binding=randomUUID();
  await db.query('INSERT INTO master.principal(id,tenant_id) VALUES($1,$2)',[principal,tenant]);
  await db.query('BEGIN');await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[tenant,principal]);
  const snapshot=async()=> (await db.query('SELECT master.entity_projected_profile_source_v1($1,$2) snapshot',[tenant,principal])).rows[0].snapshot;
  const local=await snapshot();assert.equal(local.state,'confirmed_unlinked');assert.equal(local.complete,true);
  await db.query("INSERT INTO master.principal_profile(tenant_id,principal_id,given_name) VALUES($1,$2,'Local fixture')",[tenant,principal]);
  await db.query("UPDATE master.principal SET external_ref=$1 WHERE id=$2",['trustiam:'+identity,principal]);
  assert.equal((await snapshot()).state,'unresolved');
  const proof={trustIamIdentityId:identity,sourcePlane:'neon',sourceTenantId:sourceTenant,personId:person,desiredHash:'a'.repeat(64),desiredVersion:1};
  await db.query('INSERT INTO master.principal_identity_binding(id,tenant_id,principal_id,metadata) VALUES($1,$2,$3,$4)',[binding,tenant,principal,proof]);
  const linked=await snapshot();assert.equal(linked.state,'linked');assert.equal(linked.sources[0].tenantId,sourceTenant);assert.notEqual(linked.sources[0].tenantId,tenant);
  await db.query('SAVEPOINT guard');let denied;try{await db.query("UPDATE master.principal_profile SET given_name='must not persist' WHERE principal_id=$1",[principal]);}catch(e){denied=e;}await db.query('ROLLBACK TO SAVEPOINT guard');assert.equal(denied?.code,'42501');
  await db.query('SET LOCAL ROLE athyperapp');assert.equal((await db.query('SELECT * FROM master.principal_identity_binding')).rowCount,0);assert.equal((await snapshot()).state,'linked');await db.query('RESET ROLE');
  await db.query("UPDATE master.principal_identity_binding SET sync_status='pending' WHERE id=$1",[binding]);assert.equal((await snapshot()).state,'unresolved');
  await db.query("UPDATE master.principal_identity_binding SET sync_status='synced',status='inactive' WHERE id=$1",[binding]);assert.equal((await snapshot()).state,'unresolved');
  await db.query('ROLLBACK');
  const first=new Client({...connection,database:name}),second=new Client({...connection,database:name});
  concurrent.push(first,second);await first.connect();await second.connect();
  async function begin(client,owner){await client.query('BEGIN');await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)",[tenant,owner]);}
  async function blocked(waiter,holder){for(let i=0;i<100;i++){const r=await db.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked',[waiter.processID,holder.processID]);if(r.rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Projected source fence contention was not observed');}
  for(const profileFirst of [true,false]){
    const owner=randomUUID(),identity=randomUUID(),row=randomUUID();
    await db.query('INSERT INTO master.principal(id,tenant_id) VALUES($1,$2)',[owner,tenant]);
    const metadata={...proof,trustIamIdentityId:identity};
    const project=async client=>{await client.query('UPDATE master.principal SET external_ref=$1 WHERE id=$2',['trustiam:'+identity,owner]);await client.query('INSERT INTO master.principal_identity_binding(id,tenant_id,principal_id,metadata) VALUES($1,$2,$3,$4)',[row,tenant,owner,metadata]);};
    const profile=client=>client.query("INSERT INTO master.principal_profile(tenant_id,principal_id,given_name) VALUES($1,$2,'Race fixture')",[tenant,owner]);
    await begin(first,owner);await begin(second,owner);
    if(profileFirst){
      await profile(first);
      const pending=project(second).then(()=>({ok:true}),error=>({error}));
      await blocked(second,first);await first.query('COMMIT');
      assert.deepEqual(await pending,{ok:true});await second.query('COMMIT');
      assert.equal((await db.query('SELECT count(*)::int count FROM master.principal_profile WHERE principal_id=$1',[owner])).rows[0].count,1);
      await begin(first,owner);assert.equal((await first.query('SELECT master.entity_projected_profile_source_v1($1,$2) snapshot',[tenant,owner])).rows[0].snapshot.state,'linked');await first.query('ROLLBACK');
    }else{
      await project(first);
      const pending=profile(second).then(()=>({ok:true}),error=>({error}));
      await blocked(second,first);await first.query('COMMIT');
      assert.equal((await pending).error?.code,'42501');await second.query('ROLLBACK');
      assert.equal((await db.query('SELECT count(*)::int count FROM master.principal_profile WHERE principal_id=$1',[owner])).rows[0].count,0);
    }
  }
  const qualification=JSON.parse(execFileSync('pnpm',['--filter','@athyper/server-db','exec','tsx','scripts/verification/qualify-installed-profile-source-dev.ts',`--isolated-database=${name}`],{encoding:'utf8'}));assert.equal(qualification.passed,true);
  receipt.planes.push({plane,passed:true,checks:['confirmed local setup','missing projection unresolved','original cross-plane source tenant retained','linked local edit denied','RLS-hidden binding remains linked','pending/inactive projection unresolved','Profile-first projection waits and becomes source-managed','projection-first Profile waits and leaves no dummy row','installed publication qualification',...qualification.checks]});
 } finally {for(const client of concurrent){await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}if(db){await db.query('ROLLBACK').catch(()=>{});await db.end();}await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);}
}receipt.passed=true;}catch(e){receipt.failure={code:e.code,message:e.message};process.exitCode=1;}finally{await admin.end();console.log(JSON.stringify(receipt,null,2));}
