import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planAdoption, assertCurrent, digest, planInitialAi } from './atlas-baseline-adoption-model.mjs';

const base = JSON.parse(readFileSync(new URL('../../../docs/examples/atlas-f5/cirrus-bp-release-baseline.json',import.meta.url)));
const tenantId='44444444-4444-4444-8444-444444444444';
const expected={...base,tenantId,entityCode:'business_partner'};
function source() {
  return {contract:{id:'contract',tenant_id:tenantId,entity_id:base.entityId,entity_code:'business_partner',release_id:base.releaseId,revision_id:'revision',release_no:17,publication_key:base.publicationKey,status:'published',entity_contract_hash:'a'.repeat(64),contract_json:structuredClone(base.contract),signature_algorithm:'development-local-sha256',signing_key_id:'local',signature:'original'},
    descriptor:{tenant_id:tenantId,entity_contract_id:'contract',entity_id:base.entityId,release_id:base.releaseId,revision_id:'revision',plane_code:'neon',descriptor_kind:'entity_runtime',status:'active',source_contract_hash:'a'.repeat(64),compiled_hash:base.compiledHash,compiled_json:structuredClone(base.descriptor),applied_release_id:'applied'},
    head:{publication_key:base.publicationKey,applied_release_id:'applied',source_release_no:17,artifact_hash:'b'.repeat(64),row_version:4},
    applied:{id:'applied',publication_key:base.publicationKey,source_release_id:base.releaseId,source_release_no:17,status:'active',artifact_hash:'b'.repeat(64)}};
}
test('captures original signature and hashes without manufacturing verification or approval',()=>{
  const input=source(), imported=planAdoption(input,expected);
  assert.deepEqual(imported.source,input);
  assert.equal(imported.sourceCompiledHash,base.compiledHash);
  assert.equal(imported.provenance.historicalStudioApproval,'not_available');
  assert.equal(imported.provenance.sourceSignatureVerification,'not_performed_by_importer');
});
for(const [name,change] of [
  ['tenant',s=>s.descriptor.tenant_id='other'],['global fallback',s=>s.contract.publication_key='metadata.entity.business_partner'],
  ['head race',s=>s.head.source_release_no=18],['descriptor substitution',s=>s.descriptor.entity_contract_id='other'],
  ['release rollback',s=>s.contract.release_no=16],['retired descriptor',s=>s.descriptor.status='retired'],
  ['artifact mismatch',s=>s.applied.artifact_hash='c'.repeat(64)],['contract mismatch',s=>s.descriptor.source_contract_hash='c'.repeat(64)],
  ['plane',s=>s.descriptor.plane_code='mesh'],['payload identity',s=>s.descriptor.compiled_json.entityCode='invoice'],
]) test(`rejects ${name}`,()=>{const s=source();change(s);assert.throws(()=>planAdoption(s,expected),/BASELINE_/);});
test('freshness detects same-release mutation and activation head ABA',()=>{
  const s=source(), b=planAdoption(s,expected);
  assertCurrent(b,s);
  const changed=structuredClone(s);changed.descriptor.compiled_json.operations.read.permissionCode='other';
  assert.throws(()=>assertCurrent(b,changed),/BASELINE_STALE/);
  const aba=structuredClone(s);aba.head.row_version++;
  assert.throws(()=>assertCurrent(b,aba),/BASELINE_STALE/);
});
test('canonical import digest does not depend on object property order',()=>{
  const s=source();assert.equal(digest(s),digest(Object.fromEntries(Object.entries(s).reverse())));
});
test('AI candidate and rollback preserve the complete BP contract and protected descriptor properties',()=>{
  const s=source(), b=planAdoption(s,expected), ai=JSON.parse(readFileSync(new URL('../../../docs/examples/atlas-f2/business-partner.ai.json',import.meta.url)));
  const p=planInitialAi(b,ai);
  assert.equal(p.proposedReleaseNo,18);assert.equal(p.publicationKey,base.publicationKey);
  assert.deepEqual(p.contract,s.contract.contract_json);
  assert.deepEqual(p.rollback.descriptor,s.descriptor.compiled_json);
  const {ai:delta,...remaining}=p.descriptor; assert.deepEqual(remaining,s.descriptor.compiled_json);assert.deepEqual(delta,ai);
  assert.equal(p.approval,'required');assert.equal(p.signature,'required');
  p.rollback.descriptor.fields.length=0;assert.equal(s.descriptor.compiled_json.fields.length,10);
});
test('tampered imported content cannot generate a candidate',()=>{
  const b=planAdoption(source(),expected);b.source.contract.contract_json.storage.schema='other';
  assert.throws(()=>planInitialAi(b,{schemaVersion:1,enabled:true}),/BASELINE_CONTENT_CHANGED/);
});
test('initial enablement cannot silently replace an already enabled AI definition',()=>{
  const s=source();s.descriptor.compiled_json.ai={enabled:true};const b=planAdoption(s,expected);
  assert.throws(()=>planInitialAi(b,{schemaVersion:1,enabled:true}),/INITIAL_AI_ALREADY_ENABLED/);
});
