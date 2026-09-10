import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { declaredTables, compareTables, reconcileReceipt, buildCapabilityMatrix, assessBaseline } from './atlas-foundation-baseline-model.mjs';

test('catalogue inventory handles quoted SQL and excludes partition child declarations', () => {
  assert.deepEqual(declaredTables('CREATE TABLE "ai"."atlas_run" (id uuid); CREATE TABLE metadata.entity (id uuid); CREATE TABLE ai.child PARTITION OF ai.parent;'), ['ai.atlas_run','metadata.entity']);
});
test('presence comparison reports both missing foundation and unmanaged live tables', () => {
  const result=compareTables(['ai.atlas_run','ai.atlas_message'],[{schema:'ai',table:'atlas_run'},{schema:'ai',table:'atlas_experience_release'}]);
  assert.deepEqual(result.missing,['ai.atlas_message']);assert.deepEqual(result.extra,['ai.atlas_experience_release']);
  assert.match(result.comparison,/not|separately/);
});
test('empty and mismatched receipts never establish current qualification', () => {
  const image='sha256:'+'a'.repeat(64),old='sha256:'+'b'.repeat(64);
  assert.equal(reconcileReceipt({},image).targetImageBinding,'not-bound-by-image-id');
  assert.equal(reconcileReceipt({deployment:{imageId:old}},image).targetImageBinding,'different-image');
  const matching=reconcileReceipt({deployment:{imageId:image}},image);
  assert.match(matching.targetImageBinding,/still-require-review/);assert.equal(matching.currentQualificationEstablished,false);
});
test('factory tools, profile references and historical invocations remain separate evidence', () => {
  const matrix=buildCapabilityMatrix([{toolCode:'bp_read_summary',access:'read',allowedPlanes:['neon'],ownerRequirement:'records'}],
    [{scopeKey:'pseudonym',revision:4,agents:[{code:'atlas',toolCodes:['bp_read_summary']}]}],
    [{toolCode:'bp_read_summary',status:'completed',count:2},{toolCode:'bp_submit_case',status:'completed',count:1}],'2026-09-10');
  assert.equal(matrix[0].profileReferences.length,1);assert.equal(matrix[0].observedInvocations.length,1);
  assert.match(matrix[0].liveProcessRegistry,/not-observed/);assert.match(matrix[0].userAvailability,/authorization/);
});
test('a failed observation prevents complete inventory; schema drift is retained separately', () => {
  const a=assessBaseline({source:{status:'captured'},'neon.schema':{status:'unavailable'}},{});
  assert.equal(a.inventoryStatus,'partial');assert.deepEqual(a.missingObservations,['neon.schema']);
  const b=assessBaseline({source:{status:'captured'}},{neon:{missing:[],extra:['ai.atlas_experience_release']}});
  assert.equal(b.inventoryStatus,'captured');assert.deepEqual(b.schemaPresenceDifferences,['neon']);assert.equal(b.releaseQualified,false);
});
test('collector executes SQL read-only and does not request generation or record payloads', () => {
  const text=readFileSync(new URL('./capture-atlas-foundation-baseline.mjs',import.meta.url),'utf8');
  assert.match(text,/BEGIN READ ONLY/);assert.match(text,/ON_ERROR_STOP=1/);
  assert.doesNotMatch(text,/\/api\/chat|POSTGRES_PASSWORD|SELECT \* FROM|response\.json\(/);
});
test('invalid target is rejected before any inventory or output write', () => {
  const result=spawnSync(process.execPath,[new URL('./capture-atlas-foundation-baseline.mjs',import.meta.url).pathname,'prod','/tmp/atlas-f0-must-not-be-written.json'],{encoding:'utf8'});
  assert.equal(result.status,2);assert.match(result.stderr,/Usage:/);assert.equal(result.stdout,'');
});
