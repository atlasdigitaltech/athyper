import {expect,it,vi} from 'vitest';
import {adoptEntityPair} from '../coordinated-entity-adoption.js';

function fixture() {
 const tenantId='11111111-1111-4111-8111-111111111111', baselineReleaseId='22222222-2222-4222-8222-222222222222',baselineHash='a'.repeat(64);
 const shared={tenantId,entityCode:'business_partner',plane:'neon' as const,baselineReleaseId,baselineHash,expectedActiveHash:null};
 const plan={...shared,authorId:'33333333-3333-4333-8333-333333333333',publisherId:'44444444-4444-4444-8444-444444444444',
 native:{...shared,kind:'entity_runtime' as const,publicationKey:`metadata.entity.business_partner.tenant.${tenantId}`,artifactHash:'b'.repeat(64)},
 compiled:{...shared,kind:'compiled_entity_runtime' as const,publicationKey:`metadata.compiled_entity.business_partner.tenant.${tenantId}`,artifactHash:'c'.repeat(64)}};
 const deployment=(m:typeof plan.native|typeof plan.compiled,id:string)=>({deploymentId:id,deploymentStatus:'dispatched' as const,targetPlane:'neon' as const,targetEnvironment:'development',targetInstance:'test-neon',publicationKey:m.publicationKey,sourceReleaseId:id,sourceReleaseNo:1,artifactUri:'memory://test',artifactHash:m.artifactHash,signatureAlgorithm:'Ed25519',signingKeyId:'test',signature:'test'});
 const deployments={native:deployment(plan.native,'native'),compiled:deployment(plan.compiled,'compiled')};
 // Fake loader isolates orchestration from cryptography; signature verification
 // itself is covered by VerifiedPublicationArtifactLoader tests.
 const artifacts:any={};
 for(const name of ['native','compiled'] as const) {
  const m=plan[name],d=deployments[name];
  artifacts[name]={computedArtifactHash:m.artifactHash,verification:{signatureVerified:true,manifestValid:true,runtimeCompatible:true,targetPlane:'neon'},document:{
   envelope:{artifactKind:m.kind,publicationKey:m.publicationKey,targetPlane:'neon',releaseId:d.sourceReleaseId,releaseNo:1,payload:name==='native'?{entityContract:{tenantId,entityCode:'business_partner'},entityDescriptor:{descriptorKind:'entity_runtime'}}:{tenantId,entityCode:'business_partner'}},
   manifest:{evidence:{baselineReleaseId,baselineHash}}}};
 }
 const events:string[]=[];const heads:any={};let failSecond=false;
 const repo:any={findActive:async(k:string)=>heads[k]??null,stage:async({deployment:d}:any)=>({id:d.deploymentId}),verify:async({appliedReleaseId:id}:any)=>({id,status:'verified'}),activate:async({appliedReleaseId:id}:any)=>{
   events.push('activate:'+id);if(id==='compiled'&&failSecond)throw Error('second activation failed');
   const d=id==='native'?deployments.native:deployments.compiled;heads[d.publicationKey]={id,artifactHash:d.artifactHash};
 }};
 const ports:any={loader:{load:async(d:any)=>artifacts[d.deploymentId]},authorize:vi.fn(async()=>{}),invalidate:vi.fn(async()=>{}),transaction:vi.fn(async(work:any)=>{
   const before=structuredClone(heads);try{return await work({repository:repo,lock:async()=>events.push('lock')});}catch(e){for(const k of Object.keys(heads))delete heads[k];Object.assign(heads,before);throw e;}
 })};
 return {plan,deployments,ports,artifacts,heads,events,fail:()=>{failSecond=true;}};
}
it('activates both members and replays without extra activation',async()=>{
 const f=fixture();expect((await adoptEntityPair(f.ports,f.plan,f.deployments)).replayed).toBe(false);
 expect((await adoptEntityPair(f.ports,f.plan,f.deployments)).replayed).toBe(true);
 expect(f.events.filter(e=>e.startsWith('activate:'))).toHaveLength(2);
 expect(f.ports.invalidate).toHaveBeenCalledTimes(2);
});
it('rolls back the first head if the second activation fails',async()=>{
 const f=fixture();f.fail();await expect(adoptEntityPair(f.ports,f.plan,f.deployments)).rejects.toThrow('second activation');
 expect(f.heads).toEqual({});expect(f.ports.invalidate).not.toHaveBeenCalled();
});
it('requires signed baseline provenance before any target transaction',async()=>{
 const f=fixture();f.artifacts.compiled.document.manifest.evidence.baselineHash='e'.repeat(64);
 await expect(adoptEntityPair(f.ports,f.plan,f.deployments)).rejects.toThrow('SIGNED_BASELINE');expect(f.ports.transaction).not.toHaveBeenCalled();
});
it('checks authority again inside the transaction',async()=>{
 const f=fixture();f.ports.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('revoked'));
 await expect(adoptEntityPair(f.ports,f.plan,f.deployments)).rejects.toThrow('revoked');expect(f.heads).toEqual({});
});
it('rejects cross-instance deployment pairs',async()=>{
 const f=fixture();f.deployments.compiled.targetInstance='other';await expect(adoptEntityPair(f.ports,f.plan,f.deployments)).rejects.toThrow('TARGET_MISMATCH');
 expect(f.ports.transaction).not.toHaveBeenCalled();
});
