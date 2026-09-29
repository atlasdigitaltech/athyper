import {beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const mocks=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),end:vi.fn()}));
vi.mock('pg',()=>({Client:class {query=mocks.query;connect=mocks.connect;end=mocks.end;}}));
import {publishDevelopmentCompiledEntityRuntime} from './publish-development-compiled-entity-runtime.js';
const options={neonDatabaseUrl:'postgresql://localhost/athyper_neon',entityCode:'business_partner',authoringRoot:'/not-read',sourceDefinitionReleaseId:'00000000-0000-4000-8000-000000000001',confirmation:'LOCAL-COMPILED-ENTITY-RUNTIME',expectedActiveArtifactHash:'a'.repeat(64)};
const actor=(role:string)=>({principalId:role==='author'?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000003',code:`dev.metadata.${role}`,authEpoch:0});
const authority=()=>({tenantId:'00000000-0000-4000-8000-000000000004',entityCode:'business_partner',author:actor('author'),publisher:actor('publisher'),keyId:'test',signer:{sign:vi.fn()},verifier:{verify:vi.fn()}});
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({rowCount:0,rows:[]});});
describe('scoped compiled publication',()=>{
 it('requires a pinned frozen candidate when extending a compiled release',async()=>{
  await expect(publishDevelopmentCompiledEntityRuntime({...options,dryRun:true,sourceCompiledRelease:true})).rejects.toThrow('COMPILED_SOURCE_REQUIRES_PINNED_CANDIDATE');
  expect(mocks.connect).not.toHaveBeenCalled();
 });
 it('checks a compiled source against the signed active hash before loading candidate files',async()=>{
  await expect(publishDevelopmentCompiledEntityRuntime({...options,dryRun:true,sourceCompiledRelease:true,candidateOutput:'/not-read'})).rejects.toThrow('expected one row');
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("a.status='signed'"),[options.sourceDefinitionReleaseId,'metadata.compiled_entity.business_partner',options.expectedActiveArtifactHash]);
 });
 it('rejects the old checksum-only write path before opening a database',async()=>{
  await expect(publishDevelopmentCompiledEntityRuntime(options)).rejects.toThrow('Scoped workload authority');expect(mocks.connect).not.toHaveBeenCalled();
 });
 it('requires the active baseline pin before opening a database',async()=>{
  const {expectedActiveArtifactHash:_,...unbound}=options;
  await expect(publishDevelopmentCompiledEntityRuntime({...unbound,authority:authority()})).rejects.toThrow('pinned active artifact');expect(mocks.connect).not.toHaveBeenCalled();
 });
 it('rejects scope mismatch before compilation or writes',async()=>{
  mocks.query.mockResolvedValueOnce({rows:[{tenant_id:'different',bundle_json:{},release_no:1,release_key:'test'}]});
  await expect(publishDevelopmentCompiledEntityRuntime({...options,authority:authority()})).rejects.toThrow('scope mismatch');expect(mocks.query).toHaveBeenCalledTimes(1);
 });
 it('rejects revoked workload identities before compilation or writes',async()=>{
  const a=authority();mocks.query.mockResolvedValueOnce({rows:[{tenant_id:a.tenantId,bundle_json:{},release_no:1,release_key:'test'}]});
  await expect(publishDevelopmentCompiledEntityRuntime({...options,authority:a})).rejects.toThrow('absent, revoked or out of scope');expect(mocks.query).toHaveBeenCalledTimes(2);expect(a.signer.sign).not.toHaveBeenCalled();
 });
 it.each(['document.business_partner_request','document.entity_case'])('validates frozen candidate source %s against the target catalog',async(source)=>{
  const candidate=await mkdtemp(join(tmpdir(),'bp-source-admission-'));
  try {
   await mkdir(join(candidate,'entities'));
   await writeFile(join(candidate,'entities','core.json'),JSON.stringify({
    schema:'athyper.compiled-entity-artifact/2.0-draft',schemaVersion:2,contractStatus:'draft_for_review',
    artifactType:'core',artifactKey:'business_partner_request/core',entityCode:'business_partner_request',plane:'neon',dependencies:[],
    storage:{kind:'handler_projection',primaryObject:source,sourceObjects:[source],genericWriteEnabled:false},fields:[],
   }));
   await writeFile(join(candidate,'entities','release.json'),JSON.stringify({schema:'athyper.compiled-entity-release/2.0-draft',releaseId:'test',releaseNo:1,targetPlanes:['neon'],externalDependencies:[],artifacts:[{}]}));
   mocks.query.mockResolvedValueOnce({rows:[{tenant_id:'tenant',bundle_json:{},release_no:1,release_key:'test'}]})
    .mockResolvedValueOnce({rows:[{source_object:'document.entity_case'},{source_object:'snapshot.entity_snapshot'}]});
   const promise=publishDevelopmentCompiledEntityRuntime({...options,entityCode:'business_partner_request',dryRun:true,candidateOutput:candidate,authoringRoot:fileURLToPath(new URL('../../../../../../metadata/products/mdg/entities',import.meta.url))});
   if(source==='document.business_partner_request') {
    await expect(promise).rejects.toThrow('Missing source object');
    expect(mocks.query).toHaveBeenCalledTimes(2);
   } else {
    await expect(promise).resolves.toMatchObject({mode:'planned',artifactCount:1});
   }
   expect(mocks.query.mock.calls.some(([sql])=>/INSERT|UPDATE|fn_activate_release/.test(sql))).toBe(false);
  } finally {await rm(candidate,{recursive:true,force:true});}
 });
});
