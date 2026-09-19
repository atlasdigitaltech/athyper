import {createHash} from 'node:crypto';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const states = new Set(['allowed','denied','context_required','verification_required','preflight_required','workflow_blocked','not_applicable','unavailable']);
const requireThat = (condition, message) => {if (!condition) throw Error(message);};
export function collectDifferences(synthetic, live) {
  requireThat(synthetic.schemaVersion === 1 && synthetic.kind === 'synthetic_policy_qualification', 'Invalid synthetic source');
  requireThat(live.schemaVersion === 1 && live.mode === 'shadow' && live.effectiveAuthority === 'legacy', 'Invalid live source');
  requireThat(synthetic.effectiveGrantsChanged === false && Array.isArray(live.grantChanges) && live.grantChanges.length === 0, 'Changed or unknown effective grants cannot be recorded as unchanged');
  requireThat(Array.isArray(synthetic.comparisons) && Array.isArray(live.comparisons), 'Missing comparisons');
  const rows = [];
  for (const c of synthetic.comparisons) {
    requireThat(typeof c.persona === 'string' && typeof c.operation === 'string' && states.has(c.legacyState) && states.has(c.targetState), 'Invalid synthetic comparison');
    requireThat(c.differs === (c.legacyState !== c.targetState), 'Incorrect synthetic difference flag');
    if (c.differs) rows.push({id:`synthetic:${c.persona}:${c.operation}`,source:'synthetic',comparison:c,observationCount:1,executionParity:false});
  }
  let observations=0;
  for (const c of live.comparisons) {
    requireThat(typeof c.operationKey === 'string' && typeof c.permissionCode === 'string' && states.has(c.legacy) && states.has(c.installedTarget) && states.has(c.candidateTarget), 'Invalid live comparison');
    requireThat(['authorization_comparison','command_discovery_preview'].includes(c.evidence) && Number.isSafeInteger(c.count) && c.count > 0, 'Invalid observation evidence/count');
    observations += c.count;
    if (new Set([c.legacy,c.installedTarget,c.candidateTarget]).size > 1) {
      const key=[c.operationKey,c.permissionCode,c.legacy,c.installedTarget,c.candidateTarget,c.evidence];
      if (c.installedTrace !== undefined || c.candidateTrace !== undefined) {
        for (const trace of [c.installedTrace,c.candidateTrace]) requireThat(Array.isArray(trace) && trace.length > 0 && trace.length <= 8 && trace.every(t=>typeof t==='string' && /^[a-z][a-z0-9_.-]*:(contract|deferred|binding|record|input_scope|ownership|scope_conflict|permission|parent_read|context|verification|historical|preflight|complete):(allowed|denied|context_required|verification_required|preflight_required|workflow_blocked|not_applicable|unavailable)$/.test(t)), 'Invalid bounded decision trace');
        requireThat(Array.isArray(c.coordinateKinds) && c.coordinateKinds.every(k=>['operatingOrganizationId','companyCodeId','workspaceId','networkRelationshipId'].includes(k)) && typeof c.recordCoordinatePresent==='boolean', 'Invalid scope evidence');
        key.push(c.installedTrace,c.candidateTrace,[...c.coordinateKinds].sort(),c.recordCoordinatePresent);
      }
      rows.push({id:`live:${sha256(JSON.stringify(key)).slice(0,24)}`,source:'live',comparison:c,observationCount:c.count,executionParity:false});
    }
  }
  requireThat(observations === live.shadowDecisionCount, 'Live observation totals disagree');
  requireThat(new Set(rows.map(r=>r.id)).size === rows.length, 'Duplicate comparison identity');
  return rows;
}
/** Acceptance is evidence-bound. Raw inequality alone neither opens nor closes the review gate. */
export function assessDifferences({synthetic,live,ledger,sourceHashes,regressionHashes}) {
  requireThat(ledger.schemaVersion === 1 && Array.isArray(ledger.dispositions), 'Invalid disposition ledger');
  requireThat(new Set(ledger.dispositions.map(d=>d.id)).size === ledger.dispositions.length, 'Duplicate disposition');
  const differences=collectDifferences(synthetic,live);
  const known = new Set(differences.map(d=>d.id));
  const obsoleteDispositions=ledger.dispositions.filter(d=>!known.has(d.id)).map(d=>d.id);
  const assessed=differences.map(row=>{
    const d=ledger.dispositions.find(d=>d.id===row.id);
    const gates=[];
    if(!d) gates.push('missing_disposition');
    else {
      if(!['proposed','accepted','rejected'].includes(d.status)) gates.push('invalid_status');
      if(typeof d.explanation!=='string'||!d.explanation.trim()||typeof d.resolution!=='string'||!d.resolution.trim()) gates.push('missing_explanation_or_resolution');
      if(d.sourceSha256!==sourceHashes[row.source]) gates.push('stale_source_evidence');
      if(!Array.isArray(d.regressions)||!d.regressions.length) gates.push('missing_regression_evidence');
      else for(const r of d.regressions) if(!r.path || !r.sha256 || regressionHashes[r.path]!==r.sha256 || !r.test) gates.push('stale_or_missing_regression');
      if(d.causeConfidence!=='confirmed') gates.push('root_cause_unconfirmed');
      if(d.status!=='accepted') gates.push('acceptance_pending');
      if(!d.acceptance?.reviewer || !d.acceptance?.reference || !Number.isFinite(Date.parse(d.acceptance?.acceptedAt))) gates.push('acceptance_not_recorded');
    }
    return {...row,disposition:d??null,resolved:gates.length===0,gates:[...new Set(gates)]};
  });
  const unresolvedDifferences=assessed.filter(d=>!d.resolved).length;
  return {schemaVersion:1,kind:'policy_difference_review',sourceHashes,rawDifferenceGroups:assessed.length,rawSyntheticDifferences:assessed.filter(d=>d.source==='synthetic').length,rawLiveDifferenceGroups:assessed.filter(d=>d.source==='live').length,rawLiveDifferenceObservations:assessed.filter(d=>d.source==='live').reduce((n,d)=>n+d.observationCount,0),unresolvedDifferences,obsoleteDispositions,policyDifferenceGateSatisfied:unresolvedDifferences===0 && obsoleteDispositions.length===0,activationEligible:false,effectiveAuthority:'legacy',grantChanges:[],differences:assessed};
}
