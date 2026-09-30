import {proposalHash} from './named-role-review.mjs';
/** Consume durable dual-review evidence without mutating historical selections. */
export function selectGovernedImport({selection, packet, original, state, exported}) {
 const require=(ok,code)=>{if(!ok)throw Error(code);};
 const verify=(value,key)=>{const {[key]:digest,...body}=value;require(proposalHash(body)===digest,'IMPORT_REVISION_CHANGED');};
 verify(selection,'selectionSha256');verify(packet,'packetRevision');verify(original,'packetRevision');
 require(proposalHash(packet.source.base)===proposalHash(selection.base),'IMPORT_APPROVED_HEAD_CHANGED');
 require(packet.rows.length===1&&packet.rows[0].operation==='import'&&packet.previousPacketRevision===original.packetRevision&&selection.previousPacketRevision===original.packetRevision,'IMPORT_BASE_CHANGED');
 require(packet.nominationSha256===original.nominationSha256&&proposalHash(packet.reviewers)===proposalHash(original.reviewers),'IMPORT_NOMINATION_CHANGED');
 require(state.packetRevision===packet.packetRevision&&exported.packetRevision===packet.packetRevision&&proposalHash(state.receipts)===proposalHash(exported.receipts),'IMPORT_DURABLE_RECEIPTS_CHANGED');
 const row=packet.rows[0],p=row.proposal,prior=original.rows.find(r=>r.operation==='import');
 require(proposalHash(p)===row.proposalSha256&&prior?.proposalSha256===p.priorApproval?.proposalSha256&&p.priorApproval.packetRevision===original.packetRevision,'IMPORT_PRIOR_APPROVAL_CHANGED');
 for(const key of ['permission','scope','effect','target','requiresParentRead','disposition','conditions'])require(proposalHash(p[key])===proposalHash(prior.proposal[key]),'IMPORT_UNREVIEWED_CAPABILITY_CHANGE');
 require(p.handler.key==='business_partner.import.governed_requests.v1'&&p.handler.variant==='supplier_request_drafts'&&p.workflow.requiresPreflight===true,'IMPORT_HANDLER_CHANGED');
 require(packet.activationAuthorized===false&&selection.activationAuthorized===false&&packet.grantChanges.length===0&&selection.grantChanges.length===0&&state.receipts.length===2&&packet.reviewers.length===2,'IMPORT_UNEXPECTED_ACTIVATION_OR_GRANTS');
 for(const reviewer of packet.reviewers){
  const receipts=state.receipts.filter(r=>r.actor.reviewerId===reviewer.id);require(receipts.length===1,'IMPORT_REVIEWER_MISSING');const r=receipts[0],d=r.decisions[0];
  require(r.packetRevision===packet.packetRevision&&r.nominationSha256===packet.nominationSha256&&r.authenticatedReviewer===true&&r.actor.assurance==='elevated'&&r.actor.principalId===reviewer.principalId&&r.actor.tenantId===reviewer.homeTenantId&&['business','security'].every(domain=>r.domains.includes(domain))&&r.decisions.length===1&&d.operation==='import'&&d.decision==='approve'&&d.proposalSha256===row.proposalSha256&&r.activationAuthorized===false&&r.grantChanges.length===0&&Number.isFinite(Date.parse(r.recordedAt)),'IMPORT_EXACT_AUTHENTICATED_APPROVAL_REQUIRED');
 }
 const draft=structuredClone(selection),binding=draft.bindings.find(b=>b.operationKey==='import');
 require(binding?.proposalSha256===prior.proposalSha256&&binding.permissionCode===p.permission.proposedCode&&binding.scopeResolver===p.scope.resolver&&binding.target===p.target,'IMPORT_BASE_BINDING_CHANGED');
 binding.handler=structuredClone(p.handler);binding.workflow=structuredClone(p.workflow);binding.proposalSha256=row.proposalSha256;
 draft.descriptor.authorizationRuntime={schemaVersion:1,runtimeVersion:'entity-authorization.v1',bindings:draft.descriptor.authorization.operations.map(o=>({operation:o.key,handler:o.key==='import'?p.handler.key:`business_partner.${o.key}.v1`,resolver:o.scope,...(o.requiresPreflight?{preflight:`business_partner.${o.key}.preflight.v1`}:{})}))};
 draft.kind='reviewed_bp_import_selection';draft.previousSelectionSha256=selection.selectionSha256;
 draft.importReview={packetRevision:packet.packetRevision,status:'approved',receiptReferences:state.receipts.map(r=>r.reference),receiptsSha256:proposalHash(state.receipts)};
 draft.publicationEligible=false;draft.activationAuthorized=false;
 delete draft.selectionSha256;draft.selectionSha256=proposalHash(draft);
 return draft;
}
