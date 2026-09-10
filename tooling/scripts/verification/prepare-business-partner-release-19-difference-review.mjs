/** Evidence-bound review proposal. Never writes acceptance or changes historical evidence. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
if(existsSync('governance/policy/reviews/business-partner-release-19-differences.acceptance.dev.json'))throw Error('Accepted proposal is immutable; author a separately named successor revision');
const read=p=>JSON.parse(readFileSync(p));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const historicalPath='governance/policy/reviews/entity-authorization-differences.dev.json';
const historical=read(historicalPath);
const paths=['governance/policy/reports/business-partner-release-19-causal-shadow.admin.v2.dev.json','governance/policy/reports/business-partner-release-19-causal-shadow.owner.v3.dev.json'];
const live=paths.map(path=>({path,sha256:hash(path),data:read(path)}));
if(live.some(s=>!s.data.diagnosticComplete||s.data.grantChanges.length||s.data.mode!=='shadow'))throw Error('Complete unchanged-grant shadow evidence required');
const signedPath='governance/policy/reports/business-partner-release-19-signed-verification.dev.json',signed=read(signedPath);
if(!signed.verification.signatureVerified||!signed.verification.runtimeCompatible)throw Error('Verified signed release required');
const triage=read('governance/policy/reviews/business-partner-policy-triage.dev.json');
const testPaths=['server/apps/platform-host/src/composition/__tests__/business-partner-authorization-shadow.test.ts','server/packages/services/records/src/__tests__/entity-authorization.test.ts','server/packages/services/records/src/__tests__/entity-backend-authorizer.test.ts'];
const rows=historical.dispositions.map(d=>{
 const t=triage.rows.find(r=>r.id===d.id);if(!t)throw Error('Historical row missing');
 const current=live.flatMap(s=>s.data.comparisons.filter(c=>c.operationKey===t.operation).map(c=>({source:s.path,sourceSha256:s.sha256,...c})));
 if(d.id.startsWith('live:')&&!current.length)throw Error('Historical operation lacks successor observations');
 return {id:d.id,operation:t.operation,historicalSourceSha256:d.sourceSha256,historicalExplanation:d.explanation,
 proposedDisposition:d.id.startsWith('synthetic:')?'accept_explicit_synthetic_semantics':'supersede_noncausal_historical_aggregate_with_traced_evidence',
 proposal:d.id.startsWith('synthetic:')?d.resolution:'Retain the original aggregate and its unknown per-event cause. Use the linked release-19 traces for current policy assessment. Accepting this disposition acknowledges the evidence replacement; it does not retrospectively prove the historical cause.',
 currentComparisons:current,
 evidenceBoundary:'Authenticated discovery/read authorization only. No command execution parity, grant assignment, enforcement activation, or historical per-event causality is asserted.',
 regressions:testPaths.map(path=>({path,sha256:hash(path)})),
 acceptance:null,status:'proposed'};
});
if(rows.length!==29||new Set(rows.map(r=>r.id)).size!==29)throw Error('Exact historical coverage required');
const currentGroups=new Map();
for(const source of live)for(const c of source.data.comparisons){
 if(new Set([c.legacy,c.installedTarget,c.candidateTarget]).size===1)continue;
 const key=JSON.stringify([c.operationKey,c.permissionCode,c.legacy,c.installedTarget,c.candidateTarget,c.evidence,c.installedTrace,c.candidateTrace,c.coordinateKinds,c.recordCoordinatePresent]);
 const id=createHash('sha256').update(key).digest('hex').slice(0,24);
 let row=currentGroups.get(id);
 if(!row){
  const stage=c.candidateTrace.at(-1)?.split(':')[1];
  const explanations={
   deferred:'The target operation is explicitly deferred and returns unavailable before scope resolution or authorization. Legacy enforcement remains unchanged.',
   permission:'The target permission check denied this authenticated snapshot. Dedicated target permissions are not inferred from legacy grants.',
   parent_read:'The target parent-read prerequisite denied the operation. Child or organization capability does not imply global-parent read authority.',
   context:'The target context/discovery prerequisite denied this snapshot; a shell context does not create the missing capability.',
   ownership:'The stored or requested scope failed ownership/compatibility validation. Unauthorized scope selection remains denied.'
  };
  if(!explanations[stage])throw Error('Unclassified current trace: '+stage);
  row={id:'release19:'+id,operation:c.operationKey,comparison:{...c,count:undefined},classification:stage,
   explanation:explanations[stage],proposedDisposition:'accept_observed_discovery_difference_with_unchanged_grants',
   evidenceBoundary:'Accept the observed authorization stage, not command execution parity or an inferred historical cause.',
   observations:[],status:'proposed',acceptance:null};
  currentGroups.set(id,row);
 }
 row.observations.push({source:source.path,sourceSha256:source.sha256,principalRef:source.data.principalRef,grantSnapshotRef:c.grantSnapshotRef,count:c.count});
}
const body={schemaVersion:1,kind:'bp_release_19_policy_difference_review_proposal',releaseId:signed.releaseId,artifactHash:signed.artifactHash,
 historicalLedger:{path:historicalPath,sha256:hash(historicalPath)},sources:live.map(s=>({path:s.path,sha256:s.sha256})),
 signedVerification:{path:signedPath,sha256:hash(signedPath)},rows,currentDifferenceProposals:[...currentGroups.values()],
 authenticatedChecks:live.reduce((n,s)=>n+s.data.authenticatedChecks,0),observations:live.reduce((n,s)=>n+s.data.shadowDecisionCount,0),
 policyDifferencesAccepted:false,fullExactReleaseQualification:false,grantsChanged:false,activationAuthorized:false,
 separateGates:['Record explicit acceptance of the historical and current proposals in this revision; no acceptance is inferred.','Qualify commands/import/exports/AI and revocation against the exact signed artifacts.','Approve enforcement separately.']};
const revision=createHash('sha256').update(JSON.stringify(body)).digest('hex');
writeFileSync('governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json',JSON.stringify({...body,proposalRevision:revision},null,2)+'\n');
console.log({rows:rows.length,currentDifferenceGroups:currentGroups.size,revision,authenticatedChecks:body.authenticatedChecks,observations:body.observations,accepted:false});
