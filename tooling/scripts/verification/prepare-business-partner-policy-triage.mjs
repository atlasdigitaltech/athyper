import { readFileSync,writeFileSync } from 'node:fs';
import { collectDifferences,sha256 } from './entity-authorization/policy-differences.mjs';
import { proposalHash } from './entity-authorization/named-role-review.mjs';
const read = path => JSON.parse(readFileSync(path));
const ledger=read('governance/policy/reviews/entity-authorization-differences.dev.json');
const selection=read('governance/policy/reports/business-partner-accepted-operations.dev.json');
const rows=collectDifferences(read(ledger.sources.synthetic),read(ledger.sources.live)).map(row=>{
 const old=ledger.dispositions.find(d=>d.id===row.id);
 const operation=row.comparison.operationKey??row.comparison.operation;
 const deferred=selection.deferredOperations.includes(operation);
 const classification=row.source==='synthetic'?'intended_policy_change':deferred?'approved_deferral_requires_current_trace':'unconfirmed_live_cause';
 return {id:row.id,operation,classification,sourceSha256:sha256(readFileSync(ledger.sources[row.source])),historicalComparison:row.comparison,
   causeConfidence:old.causeConfidence,explanation:old.explanation,
   proposedResolution:row.source==='synthetic'?old.resolution:deferred?
     'Keep the operation unavailable in the selected target. Recapture its exact operation trace and verify direct execution has no fallback. Historical causes remain unconfirmed.':
     'Capture installed/candidate binding, ownership, permission, parent-read, context and preflight stages against the selected release. Fix an incorrect mapping or resolver; submit only proven intended changes for acceptance.',
   requiredRegression:row.source==='synthetic'?old.regressions:deferred?
     [{path:'server/packages/services/records/src/__tests__/entity-authorization.test.ts',test:'returns unavailable for a deferred operation before authority or scope evaluation'},
      {path:'server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts',test:'never falls back to a legacy allow for an explicitly deferred target operation'}]:
     [{path:'server/packages/services/records/src/__tests__/entity-authorization.test.ts',test:'diagnostics distinguish binding, ownership and permission failures without exposing them in DTOs'}],
   requiredLiveEvidence:{authenticated:true,selectedReleaseArtifactHash:true,principalAndGrantSnapshot:true,decisionStages:true,executionParity:row.comparison.evidence!=='command_discovery_preview'},
   acceptance:null,resolved:false};
});
const body={schemaVersion:1,kind:'bp_policy_difference_triage',selectionSha256:selection.selectionSha256,operationPacketRevision:selection.packetRevision,
 rows,counts:Object.fromEntries([...new Set(rows.map(r=>r.classification))].map(k=>[k,rows.filter(r=>r.classification===k).length])),
 confirmedEngineeringDefects:[{code:'CATALOG_STATUS_CHECK',resolution:'Check published permission status; active applies to scope rows.',regression:'Catalog installation dry run and refreshed snapshot.'},
 {code:'MISSING_CAUSAL_TELEMETRY',resolution:'Trusted bounded stage diagnostics added to evaluator and shadow events; no client DTO change. Deployment and fresh capture are pending.',regression:'Evaluator diagnostics and shadow privacy tests.'}],
 unresolvedDifferences:rows.length,policyDifferenceGateSatisfied:false,grantChanges:[],activationAuthorized:false};
writeFileSync('governance/policy/reviews/business-partner-policy-triage.dev.json',JSON.stringify({...body,proposalRevision:proposalHash(body)},null,2)+'\n');
console.log({counts:body.counts,unresolvedDifferences:rows.length});
