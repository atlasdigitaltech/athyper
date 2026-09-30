import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCaseRuntimeCorrection,existingCaseCommands} from './case-runtime-correction.mjs';
import {proposalHash} from './named-role-review.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../../../../'+path,import.meta.url)));
const input=()=>[
 read('governance/policy/reports/business-partner-accepted-operations.dev.json'),
 read('governance/policy/reviews/business-partner-operation-workflow.dev.json'),
 read('governance/policy/reviews/business-partner-case-runtime-correction.dev.json'),
];
const rehash=(v,key)=>{const {[key]:ignored,...body}=v;v[key]=proposalHash(body);};
test('corrects profile and bindings together, preserves unrelated operations and never carries old approvals forward',()=>{
 const args=input(),before=structuredClone(args),result=prepareCaseRuntimeCorrection(...args);
 assert.deepEqual(args,before);assert.deepEqual(prepareCaseRuntimeCorrection(...args),result);
 for(const op of result.descriptor.authorization.operations){
  const binding=result.bindings.find(b=>b.operationKey===op.key);
  if(existingCaseCommands.includes(op.key)){
   assert.equal(op.target,'existing');assert.equal(binding.target,'existing');
   assert.equal(binding.handler.key,`business_partner.${op.key}.v1`);
  }else{assert.deepEqual(op,args[0].descriptor.authorization.operations.find(o=>o.key===op.key));assert.deepEqual(binding,args[0].bindings.find(b=>b.operationKey===op.key));}
 }
 assert.deepEqual(result.permissionDefinitions,args[0].permissionDefinitions);
 assert.deepEqual(result.deferredOperations,args[0].deferredOperations);
 assert.equal(result.receiptsSha256,undefined);assert.equal(result.originalApprovalReceiptsSha256,args[0].receiptsSha256);
 assert.equal(result.correctionReview.status,'pending');assert.deepEqual(result.correctionReview.receiptReferences,[]);
 assert.equal(result.publicationEligible,false);assert.equal(result.activationAuthorized,false);assert.deepEqual(result.grantChanges,[]);
 assert.notEqual(result.selectionSha256,args[0].selectionSha256);
});
test('stale proposals, incomplete corrections and changed prior approval remain blocked',()=>{
 for(const mutate of [
  a=>a[2].rows.pop(),a=>a[2].rows[0].proposal.target='proposed',
  a=>a[2].rows[0].proposal.priorApproval.packetRevision='f'.repeat(64),
  a=>a[2].previousPacketRevision='e'.repeat(64),
 ]){const args=input();mutate(args);for(const r of args[2].rows)r.proposalSha256=proposalHash(r.proposal);rehash(args[2],'packetRevision');assert.throws(()=>prepareCaseRuntimeCorrection(...args));}
});
test('even rehashed permission/scope/workflow expansions cannot hide inside a target correction',()=>{
 for(const key of ['permission','scope','workflow','conditions']){
  const args=input();args[2].rows[0].proposal[key].unreviewed='expansion';
  args[2].rows[0].proposalSha256=proposalHash(args[2].rows[0].proposal);rehash(args[2],'packetRevision');
  assert.throws(()=>prepareCaseRuntimeCorrection(...args),/SEMANTIC_EXPANSION/);
 }
});

test('only matching MFA-authenticated durable receipts close correction review, never publication',()=>{
 const args=input(),exported=read('governance/policy/reports/business-partner-case-correction-decisions.dev.json');
 const review={state:{packetRevision:exported.packetRevision,receipts:structuredClone(exported.receipts)},exported};
 const result=prepareCaseRuntimeCorrection(...args,review);
 assert.equal(result.correctionReview.status,'approved');assert.equal(result.correctionReview.receiptReferences.length,2);
 assert.equal(result.remainingGates.includes('explicit_case_correction_review'),false);
 assert.equal(result.publicationEligible,false);assert.equal(result.activationAuthorized,false);
 review.state.receipts[0].actor.assurance='baseline';
 assert.throws(()=>prepareCaseRuntimeCorrection(...args,review),/DURABLE_RECEIPTS/);
 review.exported.receipts=structuredClone(review.state.receipts);
 assert.throws(()=>prepareCaseRuntimeCorrection(...args,review),/INVALID_CORRECTION_APPROVAL/);
});
