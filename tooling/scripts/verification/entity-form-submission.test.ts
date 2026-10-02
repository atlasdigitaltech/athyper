import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createFormSubmissionIdentity } from '../../../packages/platform/entity/runtime/form-detail/src/form-submission-identity.ts';
it('reuses uncertain submissions but separates changed payloads, record scope, versions and successful saves', () => {
  let sequence = 0;
  const identity = createFormSubmissionIdentity(() => String(++sequence));
  const request = { recordId: 'a', version: 1, input: { name: 'First' } };
  const first = identity.key(request);
  assert.equal(identity.key(structuredClone(request)), first);
  assert.notEqual(identity.key({ ...request, input: { name: 'Second' } }), first);
  const second = identity.key(request);
  assert.notEqual(identity.key({ ...request, recordId: 'b' }), second);
  const third = identity.key(request);
  assert.notEqual(identity.key({ ...request, version: 2 }), third);
  const fourth = identity.key(request);
  identity.clear();
  assert.notEqual(identity.key(request), fourth);
});
