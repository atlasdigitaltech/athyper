import {expect,it,vi} from 'vitest';
import type {VerifiedRequestContext} from '@athyper/server-contract-auth';
import {createMetaEntityInspectionAuthorizer,createMetaEntityAuthoringAuthorizer,type AuthoringReviewEvidence} from '../meta-entity-authoring-authorizer.js';
const id='10000000-0000-4000-8000-000000000001';
function context(permission:string):VerifiedRequestContext{return {planeKey:'studio',realmKey:'athyper',tenantId:'tenant',principalId:'reviewer',authEpoch:1,profileHash:'p',requestId:'r',assurance:'elevated',permissions:{planeKey:'studio',tenantId:'tenant',principalId:'reviewer',principalFingerprint:'f',profileHash:'p',schemaHash:'s',resolvedAt:1,allowed:[permission],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[],requirements:[{permissionCode:permission,moduleId:'m',riskTier:'high',requiresMfa:true,requiresSod:true,entitled:true}]}};}
const base:AuthoringReviewEvidence={tenantId:'tenant',status:'in_review',createdBy:'author',submittedBy:'author',approvedBy:null};
const fallback={authorize:vi.fn(async()=>({allowed:false,reason:'fallback'}))};
it('permits only a separately authorized reviewer with tenant evidence',async()=>{
 const a=createMetaEntityAuthoringAuthorizer(fallback,async()=>base);
 expect(await a.authorize({context:context('metadata.entity.review'),permissionCode:'metadata.entity.review',resource:{changeSetId:id}})).toMatchObject({allowed:true});
});
for(const [label,row] of [['author reviews',{...base,createdBy:'reviewer'}],['submitter reviews',{...base,submittedBy:'reviewer'}],['wrong tenant',{...base,tenantId:'other'}],['wrong status',{...base,status:'draft'}],['missing row',null]] as const)it(`denies ${label}`,async()=>{
 const a=createMetaEntityAuthoringAuthorizer(fallback,async()=>row);expect(await a.authorize({context:context('metadata.entity.review'),permissionCode:'metadata.entity.review',resource:{changeSetId:id}})).toMatchObject({allowed:false});
});
it('does not bypass MFA, missing permissions or explicit denials',async()=>{
 const load=vi.fn(async()=>base),a=createMetaEntityAuthoringAuthorizer(fallback,load),c=context('metadata.entity.review');
 for(const x of [{...c,assurance:undefined},{...c,permissions:{...c.permissions,allowed:[]}},{...c,permissions:{...c.permissions,denied:['metadata.entity.review']}}])expect(await a.authorize({context:x as VerifiedRequestContext,permissionCode:'metadata.entity.review',resource:{changeSetId:id}})).toMatchObject({allowed:false});
 expect(load).not.toHaveBeenCalled();
});
for(const permission of ['metadata.entity.publish','metadata.entity.activate'])it(`requires durable independent approval for ${permission}`,async()=>{
 const row={...base,status:permission.endsWith('publish')?'approved':'published',approvedBy:'reviewer'};
 const input={context:context(permission),permissionCode:permission,resource:permission.endsWith('publish')?{changeSetId:id}:{releaseId:id}};
 expect(await createMetaEntityAuthoringAuthorizer(fallback,async()=>row).authorize(input)).toMatchObject({allowed:true});
 expect(await createMetaEntityAuthoringAuthorizer(fallback,async()=>({...row,approvedBy:'author'})).authorize(input)).toMatchObject({allowed:false});
});
it('does not accept caller supplied separation claims without coordinates',async()=>{
 const a=createMetaEntityAuthoringAuthorizer(fallback,async()=>base);expect(await a.authorize({context:context('metadata.entity.review'),permissionCode:'metadata.entity.review',resource:{sodSatisfied:true}})).toMatchObject({allowed:false});
});

it('inspection accepts a qualified reviewer without approval coordinates but retains assurance and grant checks', async()=>{
 const a=createMetaEntityInspectionAuthorizer(fallback),c=context('metadata.entity.review');
 expect(await a.authorize({context:c,permissionCode:'metadata.entity.review',resource:{tenantId:'tenant'}})).toMatchObject({allowed:true});
 for(const x of [{...c,assurance:undefined},{...c,planeKey:'neon'},{...c,permissions:{...c.permissions,allowed:[]}},{...c,permissions:{...c.permissions,denied:['metadata.entity.review']}}])
 expect(await a.authorize({context:x as VerifiedRequestContext,permissionCode:'metadata.entity.review'})).toMatchObject({allowed:false});
 // The approval gate still refuses this coordinate-free request.
 expect(await createMetaEntityAuthoringAuthorizer(fallback,async()=>base).authorize({context:c,permissionCode:'metadata.entity.review'})).toMatchObject({allowed:false});
});
