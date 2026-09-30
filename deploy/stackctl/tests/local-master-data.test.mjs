import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadLocalMasterData,writeLocalMasterData,validatePreservedLocal,preservedLocalPath} from '../src/local-master-data.mjs';
import {createPlan} from '../src/plan.mjs';
import {defaultRepoRoot} from '../src/io.mjs';
const settings={runtimeImage:'sha256:'+'a'.repeat(64),neonImage:'sha256:'+'b'.repeat(64),keyId:'local-v2',parameterRuntime:true};
const instance={metadata:{id:'dev'},spec:{mode:'development',composeProject:'athyper-dev',domainSuffix:'dev.athyper.test',providers:{mail:'internal',push:'disabled'}}};
test('ordinary plan retains immutable images, capture, signing secrets and browser relay',()=>{
 const root=mkdtempSync(join(tmpdir(),'local-master-'));const path=writeLocalMasterData(root,settings);
 const loaded=loadLocalMasterData(defaultRepoRoot,root,instance);assert.equal(loaded.compose.at(-1),path);
 const plan=createPlan(defaultRepoRoot,'dev',{runtimeRoot:root,infrastructureGates:{blockers:[],qualification:{},cold:{},disposition:{},intake:{},restore:{}},policy:{errors:[]},secretProblem:()=>null,listeningPorts:()=>new Set(),liveProjectObjects:()=>({containers:[],networks:[],volumes:[]})});
 assert.deepEqual(plan.sources.compose.slice(-3),loaded.compose);assert.equal(plan.services.find(s=>s.id==='api').image,settings.runtimeImage);
 assert.notEqual(plan.services.find(s=>s.id==='db-migration').image,settings.runtimeImage);
 assert.equal(loadLocalMasterData(defaultRepoRoot,root,{...instance,metadata:{id:'qa'}}),null);
 const doc=JSON.parse(readFileSync(path));doc.services.worker.environment={LOCAL_CONTACT_CHALLENGE_PRIVATE_KEY:'secret'};writeFileSync(path,JSON.stringify(doc));assert.throws(()=>loadLocalMasterData(defaultRepoRoot,root,instance),/unsupported/);
});
test('rejects mutable images and nondevelopment use',()=>{
 const root=mkdtempSync(join(tmpdir(),'local-master-'));assert.throws(()=>writeLocalMasterData(root,{...settings,runtimeImage:'athyper/runtime:latest'}),/digests/);
 writeLocalMasterData(root,settings);assert.throws(()=>loadLocalMasterData(defaultRepoRoot,root,{...instance,spec:{...instance.spec,mode:'production'}}),/development/);
});

test('preserved settings allow public feature configuration but reject private values and alternate mounts',()=>{
 const root=mkdtempSync(join(tmpdir(),'local-master-'));writeLocalMasterData(root,settings);
 const doc={services:{api:{environment:{PUBLICATION_API_ENABLED:'true',WAVE0_CONTROL_ADMIN_LOCAL_CATALOG_READS_ENABLED:'true',WAVE0_CONTROL_ADMIN_CONNECTOR_LIFECYCLE_ENABLED:'true'}}},secrets:{}};
 writeFileSync(preservedLocalPath(root),JSON.stringify(doc),{mode:0o600});
 assert.equal(loadLocalMasterData(defaultRepoRoot,root,instance).compose[0],preservedLocalPath(root));
 assert.throws(()=>validatePreservedLocal({services:{api:{environment:{PRIVATE_KEY:'secret'}}}},root),/environment/);
 assert.throws(()=>validatePreservedLocal({secrets:{'publication-infisical-token':{file:'/tmp/other'}}},root),/reference/);
});
