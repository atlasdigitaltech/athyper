import type {Authorizer,VerifiedRequestContext} from '@athyper/server-contract-auth';
import {createPermissionAuthorizer} from '@athyper/server-platform-iam';
export interface AuthoringReviewEvidence {tenantId:string;changeSetId?:string;status:string;createdBy:string;submittedBy:string|null;approvedBy:string|null}
export function createMetaEntityAuthoringAuthorizer(fallback:Authorizer,load:(context:VerifiedRequestContext,id:string,kind:'change_set'|'release')=>Promise<AuthoringReviewEvidence|null>):Authorizer {
 const gated=new Set(['metadata.entity.review','metadata.entity.publish','metadata.entity.activate']);
 const authorizer=createPermissionAuthorizer({policyGate:{async evaluate({context,permissionCode,resource}){
   if(context.planeKey!=='studio'||!gated.has(permissionCode))return {allowed:false,reason:'authoring_policy_unavailable'};
   const kind=permissionCode==='metadata.entity.activate'||typeof resource?.['releaseId']==='string'?'release':'change_set',id=resource?.[kind==='release'?'releaseId':'changeSetId'];
   if(typeof id!=='string'||!/^[-0-9a-f]{36}$/.test(id))return {allowed:false,reason:'authoring_coordinate_required'};
   const row=await load(context,id,kind);
   if(!row||row.tenantId!==context.tenantId||(kind==='release'&&resource?.['changeSetId']!==undefined&&resource['changeSetId']!==row.changeSetId))return {allowed:false,reason:'authoring_evidence_unavailable'};
   const separated=permissionCode==='metadata.entity.review'
     ? row.status==='in_review'&&context.principalId!==row.createdBy&&context.principalId!==row.submittedBy
     : row.status===(permissionCode==='metadata.entity.publish'&&kind==='change_set'?'approved':'published')&&row.approvedBy!==null&&row.submittedBy!==null&&row.approvedBy!==row.createdBy&&row.approvedBy!==row.submittedBy;
   return {allowed:separated,sodSatisfied:separated,reason:'authoring_reviewer_separation_required'};
 }}});
 return {authorize:input=>gated.has(input.permissionCode)?authorizer.authorize(input):fallback.authorize(input)};
}
