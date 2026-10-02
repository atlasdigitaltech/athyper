import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const {Client}=createRequire(new URL("../../package.json",import.meta.url))("pg");
const inspected=JSON.parse(execFileSync("docker",["inspect","athyper-dev-db-1"],{encoding:"utf8"}))[0];
assert.equal(inspected.Config.Labels["com.docker.compose.project"],"athyper-dev");
const env=Object.fromEntries(inspected.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const secret=inspected.Mounts.find(m=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
assert.ok(secret?.includes('/.athyper/instances/dev/secrets/'));
const connection={host:Object.values(inspected.NetworkSettings.Networks)[0].IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,'utf8').trim()};
const name=`athyper_profile_source_${randomUUID().replaceAll('-','')}_neon`;
const admin=new Client({...connection,database:'postgres'}),clients=[];
const receipt={environment:'dev',database:name,isolated:true,passed:false,checks:[],cleanup:false};
let created=false;
await admin.connect();
try{
  await admin.query(`CREATE DATABASE ${name}`);created=true;
  async function client(){const c=new Client({...connection,database:name});await c.connect();clients.push(c);return c;}
  const setup=await client();
  await setup.query(`CREATE SCHEMA shared; CREATE SCHEMA master;
    CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS $$SELECT gen_random_uuid()$$;
    CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid$$;
    CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('app.current_tenant_id')::uuid$$;
    CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.current_principal_id',true),'')::uuid$$;
    CREATE TABLE master.principal(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,external_ref text,metadata jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'active',principal_type text NOT NULL DEFAULT 'user',UNIQUE(tenant_id,id));
    CREATE TABLE master.person(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,status text NOT NULL DEFAULT 'active',UNIQUE(tenant_id,id));
    CREATE TABLE master.employee(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,person_id uuid NOT NULL,principal_id uuid,updated_at timestamptz,updated_by uuid,status text NOT NULL DEFAULT 'active');
    CREATE TABLE master.principal_identity_binding(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,principal_id uuid NOT NULL,status text NOT NULL DEFAULT 'active',sync_status text NOT NULL DEFAULT 'synced',metadata jsonb NOT NULL DEFAULT '{}',updated_at timestamptz);
    CREATE TABLE master.principal_profile(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,principal_id uuid NOT NULL,given_name text,UNIQUE(tenant_id,principal_id));
    CREATE TABLE master.employment(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,person_id uuid NOT NULL,company_code_id uuid NOT NULL,status text NOT NULL DEFAULT 'active',employment_status text NOT NULL DEFAULT 'active');
    GRANT USAGE ON SCHEMA shared,master TO athyperapp;
    GRANT SELECT,INSERT,UPDATE ON master.principal_profile TO athyperapp;
    GRANT SELECT ON master.employee TO athyperapp;
    ALTER TABLE master.employee ENABLE ROW LEVEL SECURITY;
    ALTER TABLE master.employee FORCE ROW LEVEL SECURITY;
    CREATE POLICY invisible_employee ON master.employee FOR SELECT TO athyperapp USING(false);`);
  await setup.query(readFileSync('server/db/ddl/planes/neon/master/36_principal_person_link.sql','utf8'));
  await setup.query(readFileSync('server/db/ddl/planes/neon/master/37_principal_person_link_target.sql','utf8'));
  const tenant=randomUUID(),company=randomUUID();
  async function fixture(){const principal=randomUUID(),person=randomUUID(),employment=randomUUID();
    await setup.query('INSERT INTO master.principal(id,tenant_id) VALUES($1,$2)',[principal,tenant]);
    await setup.query('INSERT INTO master.person(id,tenant_id) VALUES($1,$2)',[person,tenant]);
    await setup.query('INSERT INTO master.employment(id,tenant_id,person_id,company_code_id) VALUES($1,$2,$3,$4)',[employment,tenant,person,company]);
    return {principal,person,employment};}
  async function context(c,f){await c.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[tenant,f.principal]);}
  async function snapshot(c,f){return(await c.query('SELECT master.entity_profile_source_v1($1,$2) snapshot',[tenant,f.principal])).rows[0].snapshot;}
  async function link(c,f,revision){await c.query("SELECT set_config('app.entity_person_link_authority',$1,true)",[JSON.stringify({actorId:f.principal,tenantId:tenant,principalId:f.principal,personId:f.person,employmentId:f.employment,companyCodeId:company,sourceRevision:revision,permissionCode:'neon.workforce.profile.write',handlerKey:'identity.principal.link_person.v1'})]);return c.query('SELECT master.entity_link_person_v1($1,$2,$3,$4)',[tenant,f.principal,f.person,revision]);}
  async function blocked(waiter,holder){for(let i=0;i<100;i++){const r=await setup.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) blocked',[waiter.processID,holder.processID]);if(r.rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected parent-row fence contention was not observed');}
  const a=await client(),b=await client();
  const first=await fixture();
  await a.query('BEGIN');await context(a,first);const local=await snapshot(a,first);
  await a.query("INSERT INTO master.principal_profile(tenant_id,principal_id,given_name) VALUES($1,$2,'Local draft')",[tenant,first.principal]);
  await b.query('BEGIN');await context(b,first);const pendingLink=link(b,first,local.revision).then(()=>({ok:true}),e=>({error:e}));
  await blocked(b,a);await a.query('COMMIT');assert.equal((await pendingLink).ok,true);await b.query('COMMIT');
  await setup.query('BEGIN');await context(setup,first);assert.equal((await snapshot(setup,first)).state,'linked');await setup.query('COMMIT');
  receipt.checks.push('Profile save first: HR link waits for its parent fence, then establishes governed source');
  const second=await fixture();
  await b.query('BEGIN');await context(b,second);const source=await snapshot(b,second);await link(b,second,source.revision);
  await a.query('BEGIN');await context(a,second);const pendingProfile=a.query("INSERT INTO master.principal_profile(tenant_id,principal_id,given_name) VALUES($1,$2,'Must not persist')",[tenant,second.principal]).then(()=>({ok:true}),e=>({error:e}));
  await blocked(a,b);await b.query('COMMIT');const denied=await pendingProfile;assert.equal(denied.error?.code,'42501');await a.query('ROLLBACK');
  assert.equal(Number((await setup.query('SELECT count(*) count FROM master.principal_profile WHERE principal_id=$1',[second.principal])).rows[0].count),0);
  receipt.checks.push('HR link first: concurrent Profile creation waits and is denied without a dummy row');
  const third=await fixture();await setup.query('INSERT INTO master.employee(id,tenant_id,person_id,principal_id) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,third.person,third.principal]);
  await a.query('BEGIN');await context(a,third);await a.query('SET LOCAL ROLE athyperapp');
  assert.equal((await a.query('SELECT * FROM master.employee')).rowCount,0);
  assert.equal((await snapshot(a,third)).state,'linked');await a.query('ROLLBACK');
  receipt.checks.push('RLS-hidden Employee does not produce a false unlinked result');
  const privilege=(await setup.query("SELECT has_table_privilege('athyperapp','master.principal_person_link','INSERT') allowed")).rows[0];assert.equal(privilege.allowed,false);
  receipt.checks.push('application role has no direct link-table insert privilege');
  const targetFixture=await fixture();
  await setup.query('GRANT SELECT ON master.principal TO athyperapp; ALTER TABLE master.principal ENABLE ROW LEVEL SECURITY; ALTER TABLE master.principal FORCE ROW LEVEL SECURITY; CREATE POLICY hidden_principals ON master.principal FOR SELECT TO athyperapp USING(false)');
  await a.query('BEGIN');await context(a,targetFixture);
  const revision=(await snapshot(a,targetFixture)).revision;
  const gate={actorId:targetFixture.principal,tenantId:tenant,principalId:targetFixture.principal,personId:targetFixture.person,employmentId:targetFixture.employment,companyCodeId:company,sourceRevision:revision,permissionCode:'neon.workforce.profile.write',handlerKey:'identity.principal.link_person.v1'};
  await a.query('SET LOCAL ROLE athyperapp');
  assert.equal((await a.query('SELECT * FROM master.principal')).rowCount,0);
  async function targetDenied(proof,owner=targetFixture.principal){await a.query('SAVEPOINT target_probe');await a.query("SELECT set_config('app.entity_person_link_authority',$1,true)",[JSON.stringify(proof)]);let denied;try{await a.query('SELECT master.entity_person_link_target_v1($1,$2) id',[tenant,owner]);}catch(e){denied=e;}await a.query('ROLLBACK TO SAVEPOINT target_probe');assert.equal(denied?.code,'42501');}
  await targetDenied({});await targetDenied({...gate,actorId:randomUUID()});await targetDenied({...gate,companyCodeId:randomUUID()});await targetDenied(gate,randomUUID());
  await a.query("SELECT set_config('app.entity_person_link_authority',$1,true)",[JSON.stringify(gate)]);
  assert.deepEqual((await a.query('SELECT master.entity_person_link_target_v1($1,$2) id',[tenant,targetFixture.principal])).rows,[{id:targetFixture.principal}]);
  assert.equal((await a.query('SELECT * FROM master.principal')).rowCount,0);
  await a.query('ROLLBACK');
  receipt.checks.push('scoped HR target reader returns only pinned identity; rejects missing gate, wrong actor/company/target; generic Principal RLS remains closed');
  const admission=JSON.parse(execFileSync('pnpm',['--filter','@athyper/server-db','exec','tsx',
    'scripts/verification/qualify-installed-profile-source-dev.ts',`--isolated-database=${name}`],{encoding:'utf8'}));
  assert.equal(admission.passed,true);
  receipt.checks.push(...admission.checks);
  receipt.passed=true;
}catch(e){receipt.failure={code:e.code,message:e.message};process.exitCode=1;}
finally{
  for(const c of clients){try{await c.query('ROLLBACK');}catch{}try{await c.end();}catch{}}
  if(created){await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);receipt.cleanup=true;}
  await admin.end();receipt.completedAt=new Date().toISOString();console.log(JSON.stringify(receipt,null,2));
}
