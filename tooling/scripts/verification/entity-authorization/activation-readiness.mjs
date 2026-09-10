import {candidateId,proposalHash,assessNamedRoleReview} from './named-role-review.mjs';
/** Compare exact persisted membership proposals; never infer effective authorization. */
export function compareApprovedGrants({approvedInventory,packet,sourceSha256,current}) {
 const assessment=assessNamedRoleReview(approvedInventory,packet,sourceSha256);
 const prior=new Map(approvedInventory.candidates.map(c=>[candidateId(c),c]));
 const live=new Map(current.candidates.map(c=>[candidateId(c),c]));
 if(prior.size!==approvedInventory.candidates.length||live.size!==current.candidates.length)throw Error('Duplicate inventory coordinates');
 const changedTables=[...new Set([...Object.keys(approvedInventory.authorizationFingerprints),...Object.keys(current.authorizationFingerprints)])].filter(k=>proposalHash(approvedInventory.authorizationFingerprints[k]??null)!==proposalHash(current.authorizationFingerprints[k]??null));
 const rows=packet.items.map(item=>{
  const before=prior.get(item.candidateId),now=live.get(item.candidateId);
  const drift=!now?'missing_current_membership':proposalHash(before)!==proposalHash(now)?'membership_changed':'unchanged';
  return {candidateId:item.candidateId,principal:item.principal,group:item.group,role:item.role,tenant:item.tenant,reviewDisposition:item.proposal.decision,reviewedScope:item.existingScope,current:now??null,drift,
   proposedResponsibilities:item.proposal.responsibilities,conditions:item.proposal.conditions,
   retainedLegacyCapabilities:item.proposal.retainedLegacyCapabilities,
   persistedGrantProposal:{action:'retain_current',addPermissions:[],removePermissions:[],scopeChange:null,propagationChange:null,effectiveDateChange:null},
   restoreMissingGrant:false,targetMembershipProvisioning:'not_authorized_or_compiled',reviewReferences:item.approvals.map(a=>({domain:a.domain,reviewerId:a.reviewerId,reference:a.reference,proposalSha256:a.proposalSha256}))};
 });
 const newCandidateIds=[...live.keys()].filter(id=>!prior.has(id));
 const inventoryUnchanged=!changedTables.length&&!newCandidateIds.length&&rows.every(r=>r.drift==='unchanged');
 return {schemaVersion:1,kind:'approved_mapping_grant_diff',assessment,inventoryUnchanged,changedTables,newCandidateIds,rows,
  summary:{reviewedRows:rows.length,responsibilityAssignmentRows:rows.filter(r=>r.reviewDisposition==='approve_responsibilities').length,retainLegacyRows:rows.filter(r=>r.reviewDisposition==='retain_legacy_only').length,excludeTargetRows:rows.filter(r=>r.reviewDisposition==='exclude_from_target').length,changedMemberships:rows.filter(r=>r.drift!=='unchanged').length,persistedGrantAdditions:0,persistedGrantRemovals:0,persistedGrantUpdates:0},
  grantChanges:[],applySupported:false,activationAuthorized:false,
  limits:['Permission lists and table hashes do not establish effective access; denies, expiry, external identity and runtime context must be reauthorized.','Approved responsibility labels are not runtime role IDs. No target role or group is provisioned by this proposal.','Retaining legacy capabilities does not union legacy and target allow decisions.','Missing or revoked current grants are never restored from the approved snapshot.']};
}
