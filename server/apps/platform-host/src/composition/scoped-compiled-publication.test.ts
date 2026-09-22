import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),end:vi.fn()}));
vi.mock('pg',()=>({Client:class {query=mocks.query;connect=mocks.connect;end=mocks.end;}}));
import {publishDevelopmentCompiledEntityRuntime} from '../../scripts/db-verification/provisioning/publish-development-compiled-entity-runtime.js';
const options={neonDatabaseUrl:'postgresql://localhost/athyper_neon',entityCode:'business_partner',authoringRoot:'/not-read',sourceDefinitionReleaseId:'00000000-0000-4000-8000-000000000001',confirmation:'LOCAL-COMPILED-ENTITY-RUNTIME',expectedActiveArtifactHash:'a'.repeat(64)};
const actor=(role:string)=>({principalId:role==='author'?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000003',code:`dev.metadata.${role}`,authEpoch:0});
const authority=()=>({tenantId:'00000000-0000-4000-8000-000000000004',entityCode:'business_partner',author:actor('author'),publisher:actor('publisher'),keyId:'test',signer:{sign:vi.fn()},verifier:{verify:vi.fn()}});
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({rowCount:0,rows:[]});});
describe('scoped compiled publication',()=>{
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
});
