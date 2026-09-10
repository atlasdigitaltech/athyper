import {Kysely,PostgresDialect} from 'kysely';
import {expect,it,vi} from 'vitest';
import {KyselyPublicationAuthorityWork} from '../kysely-publication-authority-work.js';
function fixture(target=true,approval?:()=>Promise<void>){
 const database=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{connect:async()=>({query:async()=>({rows:target?[{publication_release_id:'release'}]:[]}),release(){}})} as any})});
 const authority={getDeployment:async()=>({deploymentStatus:'pending',targetPlane:'neon'}),transitionDeployment:vi.fn(),listRecoverableDeployments:async()=>[{deploymentId:'deployment',targetPlane:'neon'}]};
 const work=new KyselyPublicationAuthorityWork({database,authority,authorizeEntityActivation:approval} as any);
 return{work,authority};
}
it('holds target authorization dispatch and recovery without an activation approval',async()=>{
 const {work,authority}=fixture();await expect(work.dispatch('deployment')).rejects.toThrow('ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED');expect(authority.transitionDeployment).not.toHaveBeenCalled();expect(await work.recoverStalled()).toEqual([]);
});
it('retains ordinary publication dispatch',async()=>{const {work,authority}=fixture(false);await expect(work.dispatch('deployment')).resolves.toEqual({deploymentId:'deployment',targetPlane:'neon'});expect(authority.transitionDeployment).toHaveBeenCalledOnce();});
it('requires the current approval before every target dispatch and recovery',async()=>{
 const approval=vi.fn(async()=>{}),{work}=fixture(true,approval);await work.dispatch('deployment');await work.recoverStalled();expect(approval).toHaveBeenCalledTimes(2);approval.mockRejectedValueOnce(Error('revoked'));await expect(work.dispatch('deployment')).rejects.toThrow('revoked');
});

it('revalidates release review before using the signer',async()=>{
 const unsigned={"envelope": {"payload": {"entityContract": {"releaseId": "r", "releaseNo": 19, "tenantId": "t", "entityCode": "business_partner", "contract": {}}, "entityDescriptor": {"plane": "neon", "descriptor": {"authorization": {"operations": [{"key": "read"}]}, "authorizationRuntime": {"schemaVersion": 1}}}}}, "manifest": {"evidence": {"authorizationReviewReceiptSha256": "old"}}};
 const database=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{connect:async()=>({query:async()=>({rows:[{plane_code:'neon',artifact_kind:'entity_runtime',unsigned_document:unsigned,unsigned_hash:'hash'}]}),release(){}})} as any})});
 const signer={sign:vi.fn()},review={qualify:vi.fn(async()=>{throw Error('review revoked');})};
 const work=new KyselyPublicationAuthorityWork({database,signer,canonicalizer:{canonicalBytes:()=>new Uint8Array(),sha256:()=> 'hash'},authorizationCompilation:{runtime:{qualify:vi.fn()},catalog:async()=>[],review}} as any);
 await expect(work.sign('compilation')).rejects.toThrow('review revoked');expect(signer.sign).not.toHaveBeenCalled();
 review.qualify.mockResolvedValueOnce({receiptSha256:'changed'} as never);
 await expect(work.sign('compilation')).rejects.toThrow('ENTITY_AUTHORIZATION_SIGNING_REVIEW_CHANGED');expect(signer.sign).not.toHaveBeenCalled();
});
