import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const run=(command,args,input='')=>new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd:root,stdio:['pipe','pipe','pipe']});
  let output='';
  child.stdout.on('data',part=>output+=part);
  child.stderr.on('data',part=>output+=part);
  child.once('error',reject);
  child.once('close',code=>code===0?resolve(output):reject(new Error(output)));
  child.stdin.on('error',()=>{});child.stdin.end(input);
});

test('fresh Neon foundation builds with organization identity and matching permission seed',{
  skip:process.env.RUN_BP_FOUNDATION_DISPOSABLE!=='1',timeout:240000,
},async()=>{
  const container=`athyper-bp-foundation-${randomUUID().slice(0,8)}`;
  let created=false;
  try {
    await run('docker',['run','--pull=never','--detach','--name',container,'--network=none',
      '--label','athyper.environment=disposable_local','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16']);created=true;
    let ready=false;
    for(let i=0;i<100;i++){
      try {await run('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}
      catch {await setTimeout(100);}
    }
    assert.ok(ready);
    const output=await run('server/db/node_modules/.bin/tsx',[
      'server/db/scripts/provisioning/foundation-runner.ts','--plane=neon','--docker',`--container=${container}`,'--database-user=postgres']);
    assert.match(output,/"mode": "applied"/);
    const sql=input=>run('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],input);
    await sql(readFileSync(new URL('../../../server/db/scripts/tests/integration/business-partner-organization-identity.sql',import.meta.url),'utf8'));
    await sql(readFileSync(new URL('../../../server/db/scripts/tests/integration/business-partner-identity-cutover.sql',import.meta.url),'utf8'));
    await sql(await run('server/db/node_modules/.bin/tsx',['tooling/scripts/verification/business-partner-cutover-publication.fixture.mts']));
    // Verify the seed is repeatable on the complete baseline, not just on an empty mock.
    await sql("BEGIN; SELECT set_config('app.database_plane','neon',true);\n"+
      readFileSync(new URL('../../../server/db/ddl/planes/neon/authz/16_compiled_entity_runtime_permission.sql',import.meta.url),'utf8')+'\nROLLBACK;');
    const cleanup=readFileSync(new URL('../../../server/db/ddl/planes/neon/master/32_remove_legacy_commodity_capability.sql',import.meta.url),'utf8');
    await sql('BEGIN;\n'+cleanup+'\nROLLBACK;');
    for(const [table,message] of [['business_partner_commodity_capability','Legacy commodity capability rows'],['business_partner_commodity_classification_origin','Legacy classification-origin rows']]){
      await assert.rejects(sql(`BEGIN; CREATE TABLE master.${table}(id integer); INSERT INTO master.${table} VALUES(1);\n${cleanup}\nROLLBACK;`),new RegExp(message));
    }
    console.log('Full Neon manifest, registration commands/replay, compiled activation and safe cleanup replay passed.');
  } finally {
    if(created)await run('docker',['rm','--force',container]);
  }
});
