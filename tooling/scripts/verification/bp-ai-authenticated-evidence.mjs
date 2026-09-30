import assert from 'node:assert/strict';

/** Validate actual SSE events; matching text inside an answer is not evidence. */
export function validateReadStream(text, recordId, revisionKind = 'content_hash') {
  const envelopes = text.replace(/\r\n/g, '\n').split('\n\n').filter(frame => frame.split('\n').some(line => line.startsWith('data:'))).map(frame => {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    return JSON.parse(data);
  });
  assert.ok(envelopes.length, 'Empty stream');
  assert.ok(envelopes.every(e => e.protocol === 'atlas.sse/1' && e.event && e.runId && e.threadId), 'Invalid envelope');
  assert.equal(new Set(envelopes.map(e => e.runId)).size, 1, 'Mixed runs');
  assert.equal(new Set(envelopes.map(e => e.threadId)).size, 1, 'Mixed threads');
  assert.ok(envelopes.every((e, i) => Number.isSafeInteger(e.sequence) && (i === 0 || e.sequence > envelopes[i - 1].sequence)), 'Invalid sequence');
  const events = envelopes.map(e => e.event);
  assert.equal(events[0].type, 'run.started');
  assert.equal(events.at(-1).type, 'run.completed');
  assert.ok(!events.some(e => ['run.failed', 'run.cancelled'].includes(e.type)), 'Failed run');
  for (const preview of events.filter(e => e.type === 'tool.previewed')) {
    assert.ok(preview.toolCode === 'bp_read_summary' && preview.access === 'read' && preview.confirmationRequired === false, 'Unexpected or mutating preview');
  }
  const calls = events.filter(e => e.type === 'tool.completed');
  assert.ok(calls.length && calls.every(e => e.toolCode === 'bp_read_summary' && e.outcome === 'completed'), 'Expected successful read only');
  const sources = events.filter(e => e.type === 'source.cited');
  assert.ok(sources.length, 'Missing citation');
  for (const source of sources) {
    assert.ok(calls.some(call => call.callId === source.callId && call.toolCode === source.toolCode), 'Unbound citation');
    assert.equal(source.coordinate.entityCode, 'business_partner');
    assert.equal(source.coordinate.recordId, recordId);
    assert.match(source.coordinate.descriptorHash, /^[a-f0-9]{64}$/);
    assert.match(source.coordinate.revision, revisionKind === 'content_hash' ? /^content-sha256:[a-f0-9]{64}$/ : /^[1-9][0-9]*$/);
  }
  assert.ok(events.some(e => e.type === 'message.delta' && typeof e.text === 'string' && e.text.trim()), 'No explanation');
  return { citationCount: sources.length, revisionKind, descriptorHashes: [...new Set(sources.map(e => e.coordinate.descriptorHash))], promptRevision: events[0].promptRevision, bindingRevision: events[0].bindingRevision, policyRevision: events[0].policyRevision };
}

export function timings(samples) {
  assert.ok(samples.length);
  const percentile = (key, ratio) => [...samples].map(s => s[key]).sort((a, b) => a - b)[Math.ceil(samples.length * ratio) - 1];
  return { measuredRuns: samples.length, firstTextMedianMs: percentile('firstTextMs', .5), firstTextP95Ms: percentile('firstTextMs', .95), totalMedianMs: percentile('totalMs', .5), totalP95Ms: percentile('totalMs', .95) };
}
