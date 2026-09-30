import { proposalHash } from './named-role-review.mjs';
export const existingCaseCommands = ['case_update','case_validate','case_submit','case_decide','case_materialize'];

/** Author a corrected draft without rewriting the original accepted selection or its approvals. */
export function prepareCaseRuntimeCorrection(selection, original, correction, review) {
  const require = (ok,code) => { if(!ok)throw Error(code); };
  const verify = (value,key) => { const {[key]:digest,...body}=value; require(digest===proposalHash(body),'REVISION_HASH_CHANGED'); };
  verify(selection,'selectionSha256'); verify(original,'packetRevision'); verify(correction,'packetRevision');
  require(selection.kind==='accepted_bp_operation_selection' && selection.packetRevision===original.packetRevision && correction.previousPacketRevision===original.packetRevision,'CORRECTION_BASE_CHANGED');
  require(correction.nominationSha256===original.nominationSha256 && proposalHash(correction.reviewers)===proposalHash(original.reviewers),'CORRECTION_REVIEWERS_CHANGED');
  require(selection.grantChanges.length===0 && correction.grantChanges.length===0 && correction.activationAuthorized===false,'UNEXPECTED_GRANT_OR_ACTIVATION_CHANGE');
  require(correction.rows.length===existingCaseCommands.length && new Set(correction.rows.map(r=>r.operation)).size===existingCaseCommands.length && correction.rows.every(r=>existingCaseCommands.includes(r.operation)),'INCOMPLETE_CASE_CORRECTION');
  const draft=structuredClone(selection);
  for(const row of correction.rows){
    const prior=original.rows.find(r=>r.operation===row.operation), p=row.proposal;
    require(prior && proposalHash(prior.proposal)===prior.proposalSha256 && proposalHash(p)===row.proposalSha256,'PROPOSAL_HASH_CHANGED');
    require(p.priorApproval?.packetRevision===original.packetRevision && p.priorApproval?.proposalSha256===prior.proposalSha256,'PRIOR_APPROVAL_CHANGED');
    require(prior.proposal.target==='proposed' && p.target==='existing' && p.operation===row.operation &&
      p.handler.key===`business_partner.${row.operation}.v1` && p.handler.variant==='stored_case','INVALID_OWNING_CASE_TARGET');
    for(const key of ['permission','scope','workflow','effect','requiresParentRead','disposition','conditions'])
      require(proposalHash(p[key])===proposalHash(prior.proposal[key]),'UNREVIEWED_SEMANTIC_EXPANSION');
    const operation=draft.descriptor.authorization.operations.find(o=>o.key===row.operation);
    const binding=draft.bindings.find(b=>b.operationKey===row.operation);
    require(operation?.target==='proposed' && binding?.target==='proposed' && binding.proposalSha256===prior.proposalSha256 && operation.permissionCode===p.permission.proposedCode,'BASE_BINDING_CHANGED');
    operation.target='existing';
    binding.target='existing';binding.handler=structuredClone(p.handler);binding.proposalSha256=row.proposalSha256;
  }
  let correctionReview={status:'pending',receiptReferences:[]};
  if(review){
    require(review.state.packetRevision===correction.packetRevision && review.exported.packetRevision===correction.packetRevision &&
      proposalHash(review.state.receipts)===proposalHash(review.exported.receipts),'CORRECTION_DURABLE_RECEIPTS_MISMATCH');
    const receipts=review.state.receipts;
    let complete=true;
    for(const reviewer of correction.reviewers){
      for(const row of correction.rows){
        const matching=receipts.filter(r=>r.actor.reviewerId===reviewer.id && r.decisions.some(d=>d.operation===row.operation));
        require(matching.length<=1,'AMBIGUOUS_CORRECTION_APPROVAL');
        if(!matching.length){complete=false;continue;}
        const receipt=matching[0],decisions=receipt.decisions.filter(d=>d.operation===row.operation);
        require(receipt.packetRevision===correction.packetRevision && receipt.nominationSha256===correction.nominationSha256 &&
          receipt.authenticatedReviewer===true && receipt.actor.assurance==='elevated' &&
          receipt.actor.principalId===reviewer.principalId && receipt.actor.tenantId===reviewer.homeTenantId &&
          ['business','security'].every(d=>receipt.domains.includes(d)) &&
          receipt.grantChanges.length===0 && receipt.activationAuthorized===false &&
          decisions.length===1 && decisions[0].proposalSha256===row.proposalSha256 &&
          typeof receipt.reference==='string' && Number.isFinite(Date.parse(receipt.recordedAt)), 'INVALID_CORRECTION_APPROVAL');
        if(decisions[0].decision!=='approve')complete=false;
      }
    }
    if(complete)correctionReview={status:'approved',receiptReferences:receipts.map(r=>r.reference).sort(),receiptsSha256:proposalHash(receipts)};
  }
  const {selectionSha256,receiptsSha256,...body}=draft;
  const output={...body,kind:'bp_case_runtime_corrected_draft',packetRevision:correction.packetRevision,
    previousPacketRevision:original.packetRevision,baseSelectionSha256:selection.selectionSha256,
    originalApprovalReceiptsSha256:receiptsSha256,
    correctionOperations:[...existingCaseCommands],correctionReview,
    publicationEligible:false,activationAuthorized:false,
    remainingGates:[...new Set([...(correctionReview.status==='approved'?[]:['explicit_case_correction_review']),...draft.remainingGates])],
  };
  return {...output,selectionSha256:proposalHash(output)};
}
