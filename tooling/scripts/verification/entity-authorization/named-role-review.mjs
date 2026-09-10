import {createHash} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
export const proposalHash = proposal => hash(JSON.stringify(stable(proposal)));
export const candidateId = c => hash(JSON.stringify([c.tenant_id,c.principal_id,c.group_id,c.role_id,c.scope_target_id,c.propagation_mode]));
const responsibilityPermissions = {
 directory_reader: p => p === 'neon.relationship.business_partner.read',
 case_requester: p => /^neon\.relationship\.entity_case\.(create|update|validate|submit)$/.test(p),
 case_reader: p => p === 'neon.relationship.entity_case.read',
 case_approver: p => p === 'neon.relationship.entity_case.decide',
 case_applier: p => p === 'neon.relationship.entity_case.materialize',
 contact_verifier: p => p === 'neon.relationship.business_partner.verify_contact',
 sensitive_reader: p => p.endsWith('.reveal') || /\.read_.*sensitive$/.test(p) || p.includes('_sensitive.read'),
 sensitive_editor: p => /\.write_.*sensitive$/.test(p),
 provider_reader: p => /\.(read|read_masked)$/.test(p) && !p.includes('sensitive'),
};
const scopeOf=c=>({kind:c.scope_kind,targetId:c.scope_entity_id,scopeTargetId:c.scope_target_id,propagationMode:c.propagation_mode});
export function prepareNamedRoleReview(inventory, sourceSha256) {
 if(inventory.grantsChanged!==false||inventory.grantChanges.length||!Array.isArray(inventory.candidates))throw Error('Expected unchanged-grant inventory');
 const ids=inventory.candidates.map(candidateId);if(new Set(ids).size!==ids.length)throw Error('Duplicate candidate combination');
 const principalPermissions=new Map();
 for(const c of inventory.candidates){const key=`${c.tenant_id}:${c.principal_id}`;principalPermissions.set(key,new Set([...(principalPermissions.get(key)??[]),...c.role_permission_codes]));}
 const items=inventory.candidates.map(c=>{
  if(!c.scope_entity_id||!c.principal_code)throw Error('Named principal and actual scope target are required');
  const p=new Set(c.role_permission_codes),combined=principalPermissions.get(`${c.tenant_id}:${c.principal_id}`),flags=[];
  const direct=[...p].filter(x=>['neon.relationship.business_partner.create','neon.relationship.business_partner.update','neon.relationship.business_partner.activate'].includes(x));
  const sensitive=[...p].filter(x=>x.includes('sensitive')||x.endsWith('.reveal'));
  if(c.role_code.includes('reader')&&(direct.length||sensitive.length))flags.push('reader_name_includes_mutation_or_sensitive_access');
  if(c.scope_kind==='legal_entity')flags.push('legal_entity_is_not_company_code');
  if(c.scope_kind!=='tenant'&&p.has('neon.relationship.business_partner.read'))flags.push('scoped_read_is_not_global_record_authority');
  if(direct.length)flags.push('legacy_mutation_is_not_global_stewardship');
  if(sensitive.length)flags.push('sensitive_capabilities_require_separate_review');
  if(c.propagation_mode==='subtree')flags.push('review_current_and_future_descendant_coverage');
  if(combined.has('neon.relationship.entity_case.create')&&combined.has('neon.relationship.entity_case.decide'))flags.push('principal_has_requester_and_approver_candidates');
  if(combined.has('neon.relationship.entity_case.decide')&&combined.has('neon.relationship.entity_case.materialize'))flags.push('principal_has_approver_and_applier_candidates');
  if(!c.has_current_plane_membership||c.principal_status!=='active')flags.push('principal_not_currently_admitted');
  const proposals=[];
  const add=(responsibility,capabilities)=>{if(capabilities.length)proposals.push({responsibility,capabilities,scope:scopeOf(c)});};
  add('directory_reader',[...p].filter(x=>x==='neon.relationship.business_partner.read'));
  add('case_requester',[...p].filter(x=>/^neon\.relationship\.entity_case\.(create|update|validate|submit)$/.test(x)));
  add('case_reader',[...p].filter(x=>x==='neon.relationship.entity_case.read'));
  add('case_approver',[...p].filter(x=>x==='neon.relationship.entity_case.decide'));
  add('case_applier',[...p].filter(x=>x==='neon.relationship.entity_case.materialize'));
  add('contact_verifier',[...p].filter(x=>x==='neon.relationship.business_partner.verify_contact'));
  add('sensitive_access_review',sensitive);
  add('legacy_direct_mutation_review',direct);
  const classified=new Set(proposals.flatMap(x=>x.capabilities));add('provider_access_review',[...p].filter(x=>!classified.has(x)));
  return {candidateId:candidateId(c),tenant:{id:c.tenant_id,code:c.tenant_code,name:c.tenant_name},principal:{id:c.principal_id,code:c.principal_code,name:c.principal_name,status:c.principal_status},group:{id:c.group_id,code:c.group_code},role:{id:c.role_id,code:c.role_code},existingScope:scopeOf(c),scopeName:c.scope_name,existingCapabilities:[...p].sort(),candidateResponsibilities:proposals,flags,proposal:{decision:'pending',responsibilities:[],conditions:{mfa:'pending_review',separationOfDuties:'pending_review',denyAndRevocationPrecedence:true,effectiveFrom:null,effectiveUntil:null,expiryPolicy:'pending_review',scopeCoverage:'pending_review'},grantChanges:[]},approvals:[]};
 });
 return {schemaVersion:1,kind:'named_role_review_packet',sourceSha256,reviewers:[],items,approvedAssignments:[],grantChanges:[],applySupported:false};
}
export function assessNamedRoleReview(inventory,packet,sourceSha256) {
 if(packet.schemaVersion!==1||packet.kind!=='named_role_review_packet'||!Array.isArray(packet.reviewers)||!Array.isArray(packet.items))throw Error('Invalid review packet');
 if(new Set(packet.items.map(i=>i.candidateId)).size!==packet.items.length)throw Error('Duplicate review row');
 if(new Set(packet.reviewers.map(r=>r.id)).size!==packet.reviewers.length)throw Error('Duplicate reviewer');
 const candidates=new Map(inventory.candidates.map(c=>[candidateId(c),c]));
 const obsoleteRows=packet.items.filter(i=>!candidates.has(i.candidateId)).map(i=>i.candidateId);
 const rows=[...candidates].map(([id,c])=>{
  const item=packet.items.find(i=>i.candidateId===id),gates=[];
  if(packet.sourceSha256!==sourceSha256)gates.push('inventory_changed');
  if(!item)return {candidateId:id,resolved:false,gates:[...gates,'missing_review_row']};
  const p=item.proposal;
  if(packet.recommendationVersion===1){
   if(p?.legacyGrantEffect!=='unchanged')gates.push('legacy_grant_effect_must_remain_unchanged');
   const mapped=p?.responsibilities?.flatMap(r=>r.capabilities??[])??[];
   if(proposalHash([...new Set([...mapped,...(p?.retainedLegacyCapabilities??[])])].sort())!==proposalHash([...c.role_permission_codes].sort()))gates.push('existing_capability_disposition_incomplete');
   if(proposalHash(p?.reviewedExistingScope)!==proposalHash(scopeOf(c)))gates.push('existing_scope_disposition_mismatch');
  }
  if(!p||!['approve_responsibilities','retain_legacy_only','exclude_from_target'].includes(p.decision))gates.push('decision_pending');
  if(!Array.isArray(p?.grantChanges)||p.grantChanges.length)gates.push('separate_grant_change_review_required');
  if(p?.decision==='approve_responsibilities') {
   if(!Array.isArray(p.responsibilities)||!p.responsibilities.length)gates.push('responsibilities_missing');
   for(const role of p.responsibilities??[]){
    if(!Object.hasOwn(responsibilityPermissions,role.responsibility)||!Array.isArray(role.capabilities)||role.capabilities.some(cap=>!responsibilityPermissions[role.responsibility]?.(cap)))gates.push('responsibility_not_defined_for_capabilities');
    if(proposalHash(role.scope)!==proposalHash(scopeOf(c)))gates.push('scope_change_requires_separate_grant_review');
    if(!Array.isArray(role.capabilities)||!role.capabilities.length||role.capabilities.some(x=>!c.role_permission_codes.includes(x)))gates.push('capability_change_requires_separate_grant_review');
   }
   const conditions=p.conditions;
   const critical=(p.responsibilities??[]).flatMap(r=>r.capabilities??[]).some(cap=>cap.endsWith('.decide')||cap.endsWith('.materialize')||cap.endsWith('.reveal'));
   if(critical && (conditions?.mfa!=='required'||conditions?.makerMayApprove!==false||conditions?.approverMayApply!==false))gates.push('critical_mfa_or_separation_missing');
   if(conditions?.scopeCoverage!==(c.propagation_mode==='subtree'?'current_and_future_descendants_reviewed':'exact_target_reviewed'))gates.push('scope_coverage_not_reviewed');
   if(!conditions?.denyAndRevocationPrecedence||!['required','not_required_with_rationale'].includes(conditions.mfa)||!conditions.mfaRationale||!conditions.separationOfDuties||conditions.separationOfDuties==='pending_review'||!conditions.scopeCoverage||conditions.scopeCoverage==='pending_review'||!Number.isFinite(Date.parse(conditions.effectiveFrom)))gates.push('conditions_incomplete');
   if(packet.recommendationVersion===1 && (conditions?.activationRequired!==true||conditions?.activateWithinWindowOnly!==true))gates.push('activation_boundary_missing');
   if(conditions?.effectiveUntil && Date.parse(conditions.effectiveUntil)<=Date.now())gates.push('proposed_assignment_window_expired');
   if(conditions?.effectiveUntil){if(!Number.isFinite(Date.parse(conditions.effectiveUntil))||Date.parse(conditions.effectiveUntil)<=Date.parse(conditions.effectiveFrom))gates.push('invalid_effective_dates');}
   else if(conditions?.expiryPolicy!=='no_expiry_reviewed')gates.push('expiry_policy_unreviewed');
   if(!c.has_current_plane_membership||c.principal_status!=='active')gates.push('principal_not_currently_admitted');
  } else if(!p?.rationale?.trim())gates.push('retention_or_exclusion_rationale_missing');
  const digest=proposalHash({candidateId:id,sourceSha256,proposal:p});
  for(const domain of ['business','security']){
   const approvals=(item.approvals??[]).filter(a=>a.domain===domain);
   const batchValid=a=>{
    const reviewer=packet.reviewers.find(r=>r.id===a.reviewerId);
    if(reviewer?.assignedBatchIds&&(!reviewer.assignedBatchIds.includes(a.batchId)||a.reviewerAuthoritySha256!==proposalHash(reviewer)))return false;
    if(reviewer?.prohibitSelfReview&&reviewer.principalId===c.principal_id)return false;
    if(packet.recommendationVersion===1 && packet.reviewers.some(r=>r.id===a.reviewerId&&r.principalId===c.principal_id)&&a.selfReviewAcknowledged!==true)return false;
    if(!a.batchId)return packet.recommendationVersion!==1;
    const batch=packet.batches?.find(b=>b.batchId===a.batchId);if(!batch||batch.batchSha256!==a.batchSha256)return false;
    const {batchSha256,...manifest}=batch;
    if(proposalHash({sourceSha256,...manifest})!==batchSha256)return false;
    if(!batch.members.some(m=>m.candidateId===id))return false;
    return batch.members.every(m=>{const current=packet.items.find(i=>i.candidateId===m.candidateId);return current&&m.proposalSha256===proposalHash({candidateId:m.candidateId,sourceSha256,proposal:current.proposal});});
   };
   const valid=approvals.length===1&&approvals.some(a=>batchValid(a)&&a.decision==='approve'&&a.proposalSha256===digest&&a.reference&&Number.isFinite(Date.parse(a.approvedAt))&&packet.reviewers.some(r=>r.id===a.reviewerId&&r.name&&r.authorityReference&&r.domains?.includes(domain)&&r.tenantIds?.includes(c.tenant_id)));
   if(!valid)gates.push(`${domain}_approval_missing_or_stale`);
  }
  return {candidateId:id,resolved:gates.length===0,gates:[...new Set(gates)],proposalSha256:digest,decision:p?.decision};
 });
 const unresolvedRows=rows.filter(r=>!r.resolved).length;
 return {schemaVersion:1,kind:'named_role_review_assessment',candidateCount:rows.length,unresolvedRows,obsoleteRows,namedRoleReviewComplete:unresolvedRows===0&&obsoleteRows.length===0,targetRoleCoverageQualified:false,approvedAssignments:rows.filter(r=>r.resolved&&r.decision==='approve_responsibilities').map(r=>({candidateId:r.candidateId,tenantId:candidates.get(r.candidateId).tenant_id,principalId:candidates.get(r.candidateId).principal_id,groupId:candidates.get(r.candidateId).group_id,proposalSha256:r.proposalSha256,responsibilities:packet.items.find(i=>i.candidateId===r.candidateId).proposal.responsibilities,conditions:packet.items.find(i=>i.candidateId===r.candidateId).proposal.conditions})),grantChanges:[],activationEligible:false,applySupported:false,rows};
}
