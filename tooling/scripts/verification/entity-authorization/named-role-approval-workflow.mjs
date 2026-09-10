import {proposalHash,assessNamedRoleReview} from './named-role-review.mjs';
import {buildReviewBatches,recordBatchApproval} from './named-role-recommendations.mjs';

export function prepareApprovalRequest(packet,packetSha256,reviewerId,now=new Date().toISOString()) {
 const reviewer=packet.reviewers.find(r=>r.id===reviewerId);
 if(!reviewer||!reviewer.authorityReference||!['business','security'].every(d=>reviewer.domains.includes(d)))throw Error('Reviewer must be explicitly nominated for both domains');
 const batches=buildReviewBatches(packet);
 if(proposalHash(batches)!==proposalHash(packet.batches))throw Error('Review manifests are stale');
 const eligible=batches.filter(b=>(!reviewer.assignedBatchIds||reviewer.assignedBatchIds.includes(b.batchId))&&(!reviewer.prohibitSelfReview||!b.members.some(m=>m.principalId===reviewer.principalId))&&b.members.every(m=>!packet.items.find(i=>i.candidateId===m.candidateId).approvals.length));
 if(!eligible.length)throw Error('No unapproved manifests');
 if(eligible.some(b=>!reviewer.tenantIds.includes(b.tenantId)))throw Error('Reviewer does not cover all requested tenants');
 const body={schemaVersion:1,kind:'named_role_approval_request',createdAt:now,reviewerId,reviewerPrincipalId:reviewer.principalId,packetSha256,sourceSha256:packet.sourceSha256,domains:['business','security'],batches:eligible.map(b=>({...b,selfReviewAcknowledgementRequired:b.members.some(m=>m.principalId===reviewer.principalId)})),grantChanges:[],activationAuthorized:false,evidenceMode:'explicit_reviewer_attestation_not_authenticated_signature'};
 return {...body,requestSha256:proposalHash(body)};
}
/** A request is not approval. Consume an explicit, revision-bound reviewer response. */
export function completeApprovalRequest({inventory,packet,sourceSha256,packetSha256,request,response,now=Date.now()}) {
 const {requestSha256,...requestBody}=request;
 if(request.schemaVersion!==1||request.kind!=='named_role_approval_request'||proposalHash(requestBody)!==requestSha256)throw Error('Invalid approval request');
 if(packet.sourceSha256!==sourceSha256||request.sourceSha256!==sourceSha256||request.packetSha256!==packetSha256)throw Error('Source or packet changed; prepare a new request');
 if(response.schemaVersion!==1||response.kind!=='named_role_approval_response'||response.decision!=='approve'||response.requestSha256!==requestSha256||response.reviewerId!==request.reviewerId||!response.reference?.trim())throw Error('Explicit reviewer approval of this request is required');
 const when=Date.parse(response.approvedAt);
 if(!Number.isFinite(when)||when<Date.parse(request.createdAt)||when>now)throw Error('Approval timestamp must follow the request and not be in the future');
 if(proposalHash(response.domains)!==proposalHash(['business','security']))throw Error('Business and security approval required');
 const ids=response.approvedBatchIds;
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('Select unique explicit batch IDs; empty or wildcard approval is not accepted');
 const self=response.selfReviewAcknowledgedBatchIds;
 if(!Array.isArray(self)||new Set(self).size!==self.length||self.some(id=>!ids.includes(id)))throw Error('Self-review acknowledgement must name selected batches');
 const current=buildReviewBatches(packet);
 let result=structuredClone(packet);
 for(const id of ids){
  const requested=request.batches.find(b=>b.batchId===id),actual=current.find(b=>b.batchId===id);
  if(!requested||!actual||requested.batchSha256!==actual.batchSha256)throw Error('Selected batch is absent or stale');
  if(requested.selfReviewAcknowledgementRequired&&!self.includes(id))throw Error('Explicit acknowledgement required for reviewer-as-subject batch');
  result=recordBatchApproval(inventory,result,sourceSha256,{decision:'approve',domains:response.domains,reviewerId:response.reviewerId,reference:response.reference,approvedAt:response.approvedAt,batchId:id,batchSha256:requested.batchSha256,...(self.includes(id)?{selfReviewAcknowledged:true}:{})});
 }
 return {packet:result,assessment:assessNamedRoleReview(inventory,result,sourceSha256),receipt:{schemaVersion:1,kind:'named_role_approval_recording_receipt',requestSha256,responseSha256:proposalHash(response),reviewerId:response.reviewerId,approvalReference:response.reference,recordedAt:new Date(now).toISOString(),approvedBatchIds:ids,evidenceMode:request.evidenceMode,authenticatedReviewer:false,grantChanges:[],activationAuthorized:false}};
}
