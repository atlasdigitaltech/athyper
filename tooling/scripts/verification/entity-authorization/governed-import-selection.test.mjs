import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectGovernedImport} from './governed-import-selection.mjs';
import {proposalHash} from './named-role-review.mjs';
const read=path=>JSON.parse(readFileSync(path));
function fixture(){const exported=read('governance/policy/reports/business-partner-governed-import-decisions.dev.json');return{selection:read('governance/policy/reports/business-partner-corrected-release.dev.json'),packet:read('governance/policy/reviews/business-partner-governed-import-workflow.dev.json'),original:read('governance/policy/reviews/business-partner-operation-workflow.dev.json'),exported,state:{packetRevision:exported.packetRevision,receipts:structuredClone(exported.receipts)}};}
test('consumes exact dual approvals while preserving corrections, permissions and deferrals',()=>{
 const input=fixture(),before=structuredClone(input),draft=selectGovernedImport(input);
 assert.deepEqual(input,before);assert.deepEqual(draft.descriptor.authorization,input.selection.descriptor.authorization);
 assert.deepEqual(draft.permissionDefinitions,input.selection.permissionDefinitions);
 assert.deepEqual(draft.correctionReview,input.selection.correctionReview);
 assert.equal(draft.descriptor.authorizationRuntime.bindings.find(b=>b.operation==='import').handler,'business_partner.import.governed_requests.v1');
 assert.equal(draft.importReview.status,'approved');assert.equal(draft.publicationEligible,false);assert.deepEqual(draft.grantChanges,[]);
});
test('missing or baseline reviews cannot select a native import binding',()=>{
 const input=fixture();input.state.receipts.pop();assert.throws(()=>selectGovernedImport(input),/DURABLE_RECEIPTS/);
 const baseline=fixture();baseline.state.receipts[0].actor.assurance='baseline';baseline.exported.receipts=structuredClone(baseline.state.receipts);
 assert.throws(()=>selectGovernedImport(baseline),/EXACT_AUTHENTICATED/);
});
test('rejects stale proposal evidence and even rehashed changes to reviewed capability scope',()=>{
 const stale=fixture();stale.packet.rows[0].proposal.target='existing';assert.throws(()=>selectGovernedImport(stale),/REVISION_CHANGED/);
 const changed=fixture();changed.packet.rows[0].proposal.scope.resolver='organization.record.v1';changed.packet.rows[0].proposalSha256=proposalHash(changed.packet.rows[0].proposal);
 const {packetRevision,...body}=changed.packet;changed.packet.packetRevision=proposalHash(body);changed.state.packetRevision=changed.packet.packetRevision;changed.exported.packetRevision=changed.packet.packetRevision;
 assert.throws(()=>selectGovernedImport(changed),/UNREVIEWED_CAPABILITY_CHANGE/);
});
