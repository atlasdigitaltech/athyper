import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessDifferences,collectDifferences} from './policy-differences.mjs';
const synthetic={schemaVersion:1,kind:'synthetic_policy_qualification',effectiveGrantsChanged:false,comparisons:[{persona:'requester',operation:'read',legacyState:'allowed',targetState:'denied',differs:true}]};
const live={schemaVersion:1,mode:'shadow',effectiveAuthority:'legacy',grantChanges:[],shadowDecisionCount:3,comparisons:[{operationKey:'create',permissionCode:'case.create',legacy:'allowed',installedTarget:'denied',candidateTarget:'preflight_required',evidence:'command_discovery_preview',count:3}]};
const input=()=>({synthetic:structuredClone(synthetic),live:structuredClone(live),sourceHashes:{synthetic:'source1',live:'source2'},regressionHashes:{'test.mjs':'regression1'},ledger:{schemaVersion:1,dispositions:collectDifferences(synthetic,live).map(r=>({id:r.id,sourceSha256:r.source==='synthetic'?'source1':'source2',status:'accepted',causeConfidence:'confirmed',explanation:'Proven cause',resolution:'Reviewed intended difference',regressions:[{path:'test.mjs',sha256:'regression1',test:'regression case'}],acceptance:{reviewer:'reviewer',reference:'review-1',acceptedAt:'2026-09-10T00:00:00Z'}}))}});
test('accepted raw inequalities close only the difference gate, never activation',()=>{const report=assessDifferences(input());assert.equal(report.rawDifferenceGroups,2);assert.equal(report.rawLiveDifferenceObservations,3);assert.equal(report.unresolvedDifferences,0);assert.equal(report.policyDifferenceGateSatisfied,true);assert.equal(report.activationEligible,false);assert.equal(report.differences[1].executionParity,false);});
test('proposed dispositions and absent acceptance remain unresolved',()=>{const i=input();i.ledger.dispositions[0].status='proposed';i.ledger.dispositions[0].acceptance=null;assert.equal(assessDifferences(i).unresolvedDifferences,1);});
test('review acceptance cannot substitute for proof of live cause',()=>{const i=input();i.ledger.dispositions[1].causeConfidence='inference';assert.ok(assessDifferences(i).differences[1].gates.includes('root_cause_unconfirmed'));});
test('changed source and regression evidence invalidate prior acceptance',()=>{for(const kind of ['source','regression']){const i=input();if(kind==='source')i.sourceHashes.synthetic='new';else i.regressionHashes['test.mjs']='new';assert.ok(assessDifferences(i).unresolvedDifferences>0);}});
test('new operation differences do not inherit an existing disposition',()=>{const i=input();i.live.comparisons.push({...i.live.comparisons[0],operationKey:'update',count:1});i.live.shadowDecisionCount++;const r=assessDifferences(i);assert.equal(r.unresolvedDifferences,1);assert.deepEqual(r.differences[2].gates,['missing_disposition']);});
test('obsolete and duplicate dispositions cannot silently clear the gate',()=>{const i=input();i.ledger.dispositions.push({...i.ledger.dispositions[0],id:'obsolete'});assert.equal(assessDifferences(i).policyDifferenceGateSatisfied,false);i.ledger.dispositions.push(i.ledger.dispositions[0]);assert.throws(()=>assessDifferences(i),/Duplicate/);});
test('mismatched raw totals and incorrect synthetic flags fail validation',()=>{const i=input();i.live.shadowDecisionCount=99;assert.throws(()=>assessDifferences(i),/totals/);const j=input();j.synthetic.comparisons[0].differs=false;assert.throws(()=>assessDifferences(j),/flag/);});
test('installed/candidate divergence is retained even when legacy matches candidate',()=>{const i=input();i.live.comparisons[0].candidateTarget='allowed';const rows=collectDifferences(i.synthetic,i.live);assert.equal(rows.length,2);assert.equal(assessDifferences(i).unresolvedDifferences,1);});

test('changed grants cannot be hidden by the review report',()=>{const i=input();i.live.grantChanges.push({permission:'new'});assert.throws(()=>assessDifferences(i),/grants/);});

test('same final states with different causal traces remain separate review groups',()=>{
 const i=input(), original=i.live.comparisons[0];
 const traced={...original,installedTrace:['create:binding:denied'],candidateTrace:['create:preflight:preflight_required'],coordinateKinds:[],recordCoordinatePresent:false};
 i.live.comparisons=[traced,{...traced,installedTrace:['create:permission:denied']}];i.live.shadowDecisionCount=6;
 const rows=collectDifferences(i.synthetic,i.live);
 assert.equal(rows.length,3);assert.notEqual(rows[1].id,rows[2].id);
 assert.equal(assessDifferences(i).unresolvedDifferences,2);
});
test('unbounded or coordinate-value diagnostic evidence is rejected',()=>{
 const i=input();Object.assign(i.live.comparisons[0],{installedTrace:['create:binding:denied'],candidateTrace:['secret raw resource'],coordinateKinds:['company-secret'],recordCoordinatePresent:true});
 assert.throws(()=>collectDifferences(i.synthetic,i.live),/trace/);
});
