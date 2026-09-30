import {createHash} from "node:crypto";
import {it,expect,vi} from "vitest";
import {createAuthenticatedEntityReleaseReview} from "../authenticated-entity-release-review.js";
const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=(v:any)=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const coordinate={releaseId:'release',releaseNo:18,tenantId:'tenant',plane:'neon' as const,entityCode:'business_partner',contractHash:'a'.repeat(64),profileHash:'b'.repeat(64),runtimeHash:'c'.repeat(64),catalogHash:'d'.repeat(64),operationKeys:['read']};
function fixture(){
 const reviewers=['owner','admin'].map(id=>({id,principalId:id,homeTenantId:'tenant',domains:['business','security']}));
 const releaseReview={schemaVersion:1,coordinate,notBefore:'2026-01-01T00:00:00Z',expiresAt:'2026-12-31T00:00:00Z'};
 const evidence={path:'implementation.ts',sha256:'e'.repeat(64)};
 const proposal={disposition:'include',releaseReview,implementationEvidence:[evidence],regressionEvidence:[{...evidence,path:'regression.ts'}]};
 const body={schemaVersion:1,kind:'bp_operation_decision_packet',releaseReview,reviewers,source:{base:{publicationKey:'bp'}},nominationSha256:'f'.repeat(64),grantChanges:[],activationAuthorized:false,rows:[{operation:'read',proposal,proposalSha256:hash(proposal)}]};
 const packet={...body,packetRevision:hash(body)};
 const receipts=reviewers.map(r=>({reference:`neon-operation-review:${r.id}`,recordedAt:'2026-06-01T00:00:00Z',packetRevision:packet.packetRevision,nominationSha256:packet.nominationSha256,actor:{reviewerId:r.id,principalId:r.id,tenantId:'tenant',assurance:'elevated'},domains:['business','security'],authenticatedReviewer:true,grantChanges:[],activationAuthorized:false,decisions:[{operation:'read',proposalSha256:hash(proposal),decision:'approve',reason:'Exact release reviewed'}]}));
 const data={packet,state:{schemaVersion:1,packetRevision:packet.packetRevision,receipts},nomination:{nominationOnly:true,activationAuthorized:false,scope:{tenantId:'tenant',entityCode:'business_partner',planeKey:'neon',publicationKey:'bp'},reviewers},nominationSha256:packet.nominationSha256};
 const currentReviewer=vi.fn(async()=>true),sourceCurrent=vi.fn(async()=>true),evidenceCurrent=vi.fn(async()=>true);
 const port=createAuthenticatedEntityReleaseReview({load:async()=>data,currentReviewer,sourceCurrent,evidenceCurrent,now:()=>Date.parse('2026-09-10T00:00:00Z')});
 return {data,port,currentReviewer,sourceCurrent,evidenceCurrent};
}
it('verifies exact release receipts, source, current authority and evidence before producing the compiler receipt',async()=>{
 const f=fixture();expect(await f.port.qualify(coordinate)).toEqual({receiptSha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(f.currentReviewer).toHaveBeenCalledTimes(2);expect(f.evidenceCurrent).toHaveBeenCalledTimes(2);expect(f.sourceCurrent).toHaveBeenCalledTimes(2);
});
it.each(['missing','duplicate','unelevated','forged_actor','rejected','future','grant_change'])("rejects %s authenticated receipt evidence",async kind=>{
 const f=fixture(),receipts=f.data.state.receipts;
 if(kind==='missing')receipts.pop();
 if(kind==='duplicate')receipts.push({...receipts[0]!,reference:'neon-operation-review:duplicate'});
 if(kind==='unelevated')receipts[0]!.actor.assurance='standard';
 if(kind==='forged_actor')receipts[0]!.actor.principalId='someone-else';
 if(kind==='rejected')receipts[0]!.decisions[0]!.decision='reject';
 if(kind==='future')receipts[0]!.recordedAt='2027-01-01T00:00:00Z';
 if(kind==='grant_change')(receipts[0]!.grantChanges as unknown[]).push({permission:'new'});
 await expect(f.port.qualify(coordinate)).rejects.toThrow();
});
it('rejects changed release, historical packets and missing/currently revoked evidence',async()=>{
 await expect(fixture().port.qualify({...coordinate,catalogHash:'0'.repeat(64)})).rejects.toThrow();
 const old=fixture();delete (old.data.packet as any).releaseReview;await expect(old.port.qualify(coordinate)).rejects.toThrow();
 for(const dependency of ['sourceCurrent','evidenceCurrent','currentReviewer'] as const){const f=fixture();f[dependency].mockResolvedValue(false);await expect(f.port.qualify(coordinate)).rejects.toThrow();}
});
