import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReadStream, timings } from './bp-ai-authenticated-evidence.mjs';
const id = '01a0464b-e381-7681-8f0d-f46a177439fa';
const events = () => [
  { type: 'run.started', promptRevision: 'v1', bindingRevision: 'model', policyRevision: 'policy' },
  { type: 'tool.completed', toolCode: 'bp_read_summary', callId: 'read', outcome: 'completed' },
  { type: 'source.cited', toolCode: 'bp_read_summary', callId: 'read', coordinate: { entityCode: 'business_partner', recordId: id, descriptorHash: 'a'.repeat(64), revision: 'content-sha256:' + 'b'.repeat(64) } },
  { type: 'message.delta', text: 'Draft; readiness not evaluated.' },
  { type: 'run.completed', reason: 'stop' },
];
const stream = (items, separator = '\n') => items.map((event, sequence) => `data: ${JSON.stringify({ protocol: 'atlas.sse/1', runId: 'run', threadId: 'thread', sequence, event })}${separator}${separator}`).join('');
test('accepts real cited read evidence with LF or CRLF framing', () => {
  for (const separator of ['\n', '\r\n']) assert.equal(validateReadStream(stream(events(), separator), id).citationCount, 1);
});
test('accepts the normal read preview but rejects a preview requiring confirmation', () => {
  const sample = events();
  sample.splice(1, 0, { type: 'tool.previewed', toolCode: 'bp_read_summary', access: 'read', confirmationRequired: false });
  assert.equal(validateReadStream(stream(sample), id).citationCount, 1);
  sample[1].confirmationRequired = true;
  assert.throws(() => validateReadStream(stream(sample), id));
});
test('does not accept event names embedded in generated text', () => {
  assert.throws(() => validateReadStream(stream([{ type: 'message.delta', text: 'tool.completed source.cited run.completed' }]), id));
});
test('rejects denied tools, wrong targets, unbound citations and mutation previews', () => {
  const denied = events(); denied[1].outcome = 'denied';
  const wrong = events(); wrong[2].coordinate.recordId = 'other';
  const unbound = events(); unbound[2].callId = 'other';
  const mutation = events(); mutation.splice(1, 0, { type: 'tool.previewed', toolCode: 'bp_submit_case' });
  for (const sample of [denied, wrong, unbound, mutation, events().slice(0, -1)]) assert.throws(() => validateReadStream(stream(sample), id));
});
test('distinguishes content hashes from actual record versions', () => {
  assert.throws(() => validateReadStream(stream(events()), id, 'record_version'));
  const sample = events(); sample[2].coordinate.revision = '3';
  assert.equal(validateReadStream(stream(sample), id, 'record_version').revisionKind, 'record_version');
  assert.throws(() => validateReadStream(stream(sample), id));
});
test('rejects mixed runs and invalid event order', () => {
  const text = stream(events());
  assert.throws(() => validateReadStream(text.replace('"runId":"run"', '"runId":"other"'), id));
  assert.throws(() => validateReadStream(text.replace('"sequence":2', '"sequence":0'), id));
});
test('calculates measured percentiles without a hidden warm-up sample', () => {
  assert.deepEqual(timings(Array.from({ length: 20 }, (_, i) => ({ firstTextMs: i + 1, totalMs: (i + 1) * 10 }))), { measuredRuns: 20, firstTextMedianMs: 10, firstTextP95Ms: 19, totalMedianMs: 100, totalP95Ms: 190 });
});
