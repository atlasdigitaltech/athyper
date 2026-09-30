// Isolated PostgreSQL tests: never accept a deployed target or apply SQL to DEV/QA.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { databaseRoot, migrationName, tables, signatureFunction, legacyBlocks } from '../../checks/ddl/experience-foundation.mjs';

const root=resolve(databaseRoot,'../..');
const token=randomUUID(), container=`athyper-db-experience-${token.slice(0,8)}`;
const args=process.argv.slice(2);
if(args.length>1||(args.length&&!args[0].startsWith('--report=')))throw Error('Only optional --report=<file.json> is supported; deployed containers cannot be test targets');
const report={schema:'atlas-experience-foundation-verification/1',capturedAt:new Date().toISOString(),checks:[],legacyReference:{source:'pinned canonical legacy blocks'},deploymentApplied:false};
async function run(command,args,input=''){
  return new Promise((ok,fail)=>{
    const child=spawn(command,args,{cwd:root,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
    child.on('error',fail);child.on('close',code=>code===0?ok(stdout.trim()):fail(Error(`${command} failed (${code}): ${stderr.slice(-6000)}`)));
    child.stdin.end(input);
  });
}
const docker=(...args)=>run('docker',args);
const sql=(database,input)=>run('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-f','-'],input);
const migration=readFileSync(resolve(databaseRoot,'scripts/operations/upgrades/legacy-baseline-20260914',migrationName),'utf8');
const pass=name=>{report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
const tenantA='10000000-0000-4000-8000-000000000001',tenantB='10000000-0000-4000-8000-000000000002',actor='20000000-0000-4000-8000-000000000001';
const releaseInsert=(tenant,scope='home')=>`INSERT INTO ai.atlas_experience_release(tenant_id,scope,revision,definition,content_hash,created_by) VALUES('${tenant}','${scope}',1,'{"schema":"atlas-experience-definition/1","scope":"${scope}"}',repeat('a',64),'${actor}');`;
const projectionInsert=(tenant,plane,surface='bp.manage')=>`INSERT INTO runtime_meta.experience_surface_projection(tenant_id,plane_code,surface_key,layer,source_release_id,source_revision,definition,content_hash,applied_by) VALUES('${tenant}','${plane}','${surface}','tenant',shared.uuidv7(),1,'{"schema":"athyper-experience-surface/1","id":"${surface}"}',repeat('b',64),'${actor}');`;
const context=(plane,tenant=tenantA)=>`SET app.database_plane='${plane}'; SET app.current_tenant_id='${tenant}'; SET app.current_principal_id='${actor}';`;
const signature=database=>sql(database,`BEGIN; CREATE TEMP TABLE atlas_signature_context(id integer); ${signatureFunction} SELECT jsonb_build_array(${tables.map(t=>`pg_temp.atlas_experience_signature('${t}'::regclass)`).join(',')}); ROLLBACK;`);
let created=false;
try{
  await docker('run','-d','--name',container,'--label',`athyper.experience-test=${token}`,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16.13-bookworm');created=true;
  for(let i=0;;i++){try{await docker('exec',container,'pg_isready','-U','postgres');break;}catch(error){if(i===40)throw error;await new Promise(r=>setTimeout(r,250));}}
  const [inspection]=JSON.parse(await docker('inspect',container));
  assert.equal(inspection.Config.Labels['athyper.experience-test'],token);assert.equal(inspection.HostConfig.NetworkMode,'none');assert.ok(Object.hasOwn(inspection.HostConfig.Tmpfs,'/var/lib/postgresql/data'));
  for(const plane of ['studio','neon','mesh']){
    const database=`athyper_${plane}`;
    await run('pnpm',['--dir',databaseRoot,'exec','tsx','scripts/provisioning/foundation-runner.ts',`--plane=${plane}`,`--container=${container}`]);
    pass(`${plane}: complete fresh foundation manifest`);
    const fresh=await signature(database);
    await sql(database,migration);await sql(database,migration);
    assert.equal(await signature(database),fresh);pass(`${plane}: migration is repeatable on fresh canonical tables`);

    // Keep one table populated, omit the other, and prove atomic refusal of drift.
    await sql(database,context(plane)+releaseInsert(tenantA)+`ALTER TABLE ai.atlas_experience_release ADD COLUMN unexpected text; DROP TABLE runtime_meta.experience_surface_projection;`);
    await assert.rejects(sql(database,migration),/EXPERIENCE_SCHEMA_DRIFT: ai.atlas_experience_release/);
    assert.equal(await sql(database,"SELECT to_regclass('runtime_meta.experience_surface_projection') IS NULL"),'t');
    assert.equal(await sql(database,'SELECT count(*) FROM ai.atlas_experience_release'),'1');
    await sql(database,'ALTER TABLE ai.atlas_experience_release DROP COLUMN unexpected;');
    await sql(database,migration);assert.equal(await signature(database),fresh);
    assert.equal(await sql(database,'SELECT count(*) FROM ai.atlas_experience_release'),'1');
    pass(`${plane}: incompatible partial install aborts atomically; compatible table data preserved`);
    await sql(database,'DROP TABLE ai.atlas_experience_release, runtime_meta.experience_surface_projection;');
    await sql(database,migration);await sql(database,migration);assert.equal(await signature(database),fresh);
    pass(`${plane}: missing-table upgrade matches fresh catalog`);

    // Reproduce the nullable-CHECK defect on the exact pinned previous schema.
    const dump=tables.map(legacyBlocks).join('\n');
    report.legacyReference[plane]={schemaSha256:createHash('sha256').update(dump).digest('hex')};
    await sql(database,'DROP TABLE ai.atlas_experience_release, runtime_meta.experience_surface_projection;');
    await sql(database,dump);
    await sql(database,context(plane)+releaseInsert(tenantA,'invalid').replace('{"schema":"atlas-experience-definition/1","scope":"invalid"}','{}'));
    await assert.rejects(sql(database,migration),/atlas_experience_release_definition_chk/);
    assert.equal(await sql(database,'SELECT count(*) FROM ai.atlas_experience_release'),'1');
    await sql(database,'DELETE FROM ai.atlas_experience_release;');
    await sql(database,migration);
    assert.equal(await signature(database),fresh);
    await sql(database,context(plane)+releaseInsert(tenantA)+releaseInsert(tenantB)+projectionInsert(tenantA,plane)+projectionInsert(tenantB,plane));
    const rows=await sql(database,"SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ai.atlas_experience_release t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM runtime_meta.experience_surface_projection t))");
    await sql(database,migration);await sql(database,migration);
    assert.equal(await signature(database),fresh);
    assert.equal(await sql(database,"SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ai.atlas_experience_release t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM runtime_meta.experience_surface_projection t))"),rows);
    pass(`${plane}: pinned legacy schema upgrades atomically; valid populated rows preserved`);

    assert.equal(await sql(database,context(plane)+"SET ROLE athyperapp; SELECT count(*) FROM ai.atlas_experience_release; SELECT count(*) FROM runtime_meta.experience_surface_projection;"),'1\n1');
    await assert.rejects(sql(database,context(plane)+`SET ROLE athyperapp; ${releaseInsert(tenantA,'forbidden')}`),/permission denied/);
    await assert.rejects(sql(database,context(plane)+`SET ROLE athyperapp; ${projectionInsert(tenantB,plane,'forbidden.surface')}`),/row-level security/);
    await assert.rejects(sql(database,context(plane)+`SET ROLE athyperapp; ${projectionInsert(tenantA,plane==='mesh'?'neon':'mesh','wrong.plane')}`),/local_plane_chk/);
    await assert.rejects(sql(database,context(plane)+`SET ROLE athyperapp; ${projectionInsert(tenantA,plane)}`),/active_uq/);
    await assert.rejects(sql(database,context(plane)+"SET ROLE athyperapp; UPDATE runtime_meta.experience_surface_projection SET status='retired';"),/retirement_chk/);
    await sql(database,context(plane)+"SET ROLE athyperapp; UPDATE runtime_meta.experience_surface_projection SET status='retired',retired_at=now(),retired_by='"+actor+"';"+projectionInsert(tenantA,plane));
    for (const bad of ['{}','{"schema":null,"scope":"invalid"}','{"schema":"atlas-experience-definition/1","scope":null}']) {
      await assert.rejects(sql(database,context(plane)+releaseInsert(tenantA,'invalid').replace('{"schema":"atlas-experience-definition/1","scope":"invalid"}',bad)),/definition_chk/);
    }
    for (const bad of ['{}','{"schema":null,"id":"invalid.surface"}','{"schema":"athyper-experience-surface/1","id":null}']) {
      await assert.rejects(sql(database,context(plane)+projectionInsert(tenantA,plane,'invalid.surface').replace('{"schema":"athyper-experience-surface/1","id":"invalid.surface"}',bad)),/definition_chk/);
    }
    const wrongPlane=plane==='mesh'?'neon':'mesh';
    await assert.rejects(sql(database,context(wrongPlane)+projectionInsert(tenantA,wrongPlane,'spoofed.plane')),/local_plane_chk/);
    await assert.rejects(sql(database,context(plane)+"SET app.database_plane='';"+projectionInsert(tenantA,plane,'missing.plane')),/local_plane_chk/);
    pass(`${plane}: tenant isolation, read-only release grant, projection write, plane and lifecycle constraints`);
  }
  report.passed=true;
}catch(error){report.passed=false;throw error;}
finally{
  if(created){const [inspection]=JSON.parse(await docker('inspect',container));if(inspection.Config.Labels['athyper.experience-test']===token)await docker('rm','-f',container);}
  report.completedAt=new Date().toISOString();
  if(args[0]){const path=resolve(root,args[0].slice('--report='.length));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
}
