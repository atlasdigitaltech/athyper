import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planMeshBaseline,assertCurrent} from './atlas-mesh-baseline-model.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../../docs/examples/atlas-f6/mesh-baseline-import.json',import.meta.url)));
const expected={tenantId:fixture.tenantId,publicationKey:fixture.publicationKey,releaseId:fixture.sourceReleaseId,releaseNo:fixture.sourceReleaseNo,compiledHash:fixture.sourceCompiledHash};
test('global provenance and exact source survive tenant-owned observation',()=>{
 const p=planMeshBaseline(fixture.source,expected);
 assert.equal(p.sourceTenantId,null);assert.equal(p.tenantId,expected.tenantId);
 assert.deepEqual(p.source,fixture.source);assert.equal(p.publicationKey,'metadata.entity.network_relationship');
 assert.equal(p.provenance.historicalStudioApproval,'not_available');
 assert.equal(p.provenance.sourceSignatureVerification,'not_performed_by_importer');
});
for(const [name,change] of [
 ['tenant source',s=>s.contract.tenant_id=expected.tenantId],
 ['tenant descriptor',s=>s.descriptor.tenant_id=expected.tenantId],
 ['wrong plane',s=>s.descriptor.plane_code='neon'],
 ['head replacement',s=>s.head.applied_release_id='other'],
 ['hash substitution',s=>s.descriptor.source_contract_hash='a'.repeat(64)],
 ['entity mismatch',s=>s.descriptor.entity_id='other'],
 ['retired source',s=>s.applied.status='retired'],
])test(`rejects ${name}`,()=>{const s=structuredClone(fixture.source);change(s);assert.throws(()=>planMeshBaseline(s,expected),/MESH_/);});
test('freshness includes same-release metadata and activation-head ABA',()=>{
 for(const change of [s=>{s.head.row_version=Number(s.head.row_version??0)+1;},s=>{s.descriptor.compiled_json.fields[0].required=false;}]){
 const s=structuredClone(fixture.source);change(s);assert.throws(()=>assertCurrent(fixture,s),/BASELINE_STALE/);}
});
test('source drift cannot be reimported against pinned qualification',()=>{
 assert.throws(()=>planMeshBaseline(fixture.source,{...expected,releaseNo:6}),/MESH_BASELINE_STALE/);
});
