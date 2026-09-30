import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAcceptedOperations } from './accepted-operation-selection.mjs';
const read = path => JSON.parse(readFileSync(new URL('../../../../'+path, import.meta.url)));
function input() {
 const packet=read('governance/policy/reviews/business-partner-operation-workflow.dev.json');
 const exported=read('governance/policy/reports/business-partner-operation-decisions.dev.json');
 return { packet, exported, state:{packetRevision:exported.packetRevision,receipts:structuredClone(exported.receipts)}, candidate:read('governance/policy/reports/business-partner-activation-publication.dev.json') };
}
test('exact accepted selection is deterministic, separates permissions from grants and removes deferred import paths',()=>{
 const source=input(),before=structuredClone(source),result=selectAcceptedOperations(source);
 assert.deepEqual(source,before); assert.deepEqual(selectAcceptedOperations(source),result);
 assert.equal(result.permissionDefinitions.length,27);assert.equal(result.bindings.length,42);assert.equal(result.deferredOperations.length,9);
 assert.equal(result.bindings.filter(b=>b.catalogAction==='retain_catalog_entry').length,15);
 assert.deepEqual(result.grantChanges,[]);assert.equal(result.activationAuthorized,false);assert.equal(result.publicationEligible,false);
 for(const key of result.deferredOperations){assert.equal(result.descriptor.operations[key],undefined);assert.equal(result.bindings.some(b=>b.operationKey===key),false);}
 assert.deepEqual(result.descriptor.listPresentation.dataOperations.importOperations,[]);
 assert.equal(result.descriptor.listPresentation.dataOperations.importAdapterKey,undefined);
 for(const op of result.descriptor.authorization.operations)assert.equal(result.descriptor.operations[op.key].permissionCode,op.permissionCode);
 const action=result.descriptor.listPresentation.experience.actions.find(a=>a.operationKey==='request_supplier');
 assert.equal(action.scopes[0].scopeKind,'operating_organization');
 assert.equal(action.requiresPreflight,true);
 for(const b of result.bindings.filter(b=>b.catalogAction==='retain_catalog_entry'))assert.equal(b.permissionCode,source.packet.rows.find(r=>r.operation===b.operationKey).proposal.permission.existingCode);
});
test('changed proposals, candidate contents, heads and durable receipt mismatches block generation',()=>{
 for(const mutate of [
  i=>i.packet.rows[0].proposal.permission.proposedCode='neon.unreviewed.permission.enter',
  i=>i.candidate.candidate.descriptorDraft.operations.read.permissionCode='neon.unreviewed.permission.read',
  i=>i.candidate.base.headVersion++,
  i=>i.state.receipts.pop(),
 ]){const i=input();mutate(i);assert.throws(()=>selectAcceptedOperations(i));}
});
test('missing, rejected, ambiguous or non-MFA decisions cannot become accepted bindings',()=>{
 for(const mutate of [
  r=>r[0].decisions.pop(),r=>r[0].decisions[0].decision='reject',r=>r.push(structuredClone(r[0])),
  r=>r[0].actor.assurance='baseline',r=>r[0].actor.principalId=r[1].actor.principalId,
  r=>r[0].domains=['business'],r=>r[0].authenticatedReviewer=false,
 ]){const i=input();mutate(i.state.receipts);i.exported.receipts=structuredClone(i.state.receipts);assert.throws(()=>selectAcceptedOperations(i));}
});
