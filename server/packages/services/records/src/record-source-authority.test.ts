import { expect, it } from 'vitest';
import type { VerifiedRequestContext } from '@athyper/server-contract-auth';
import { assertLocalRecordSource, type RecordSourceAuthorityResolution } from './record-source-authority.js';
const input = { context: { tenantId: 'tenant', principalId: 'admin' } as VerifiedRequestContext, ownerPrincipalId: 'subject' };
const local: RecordSourceAuthorityResolution = { state: 'local', tenantId: 'tenant', principalId: 'subject', revision: '1' };
it('requires positive local-source evidence for the target subject, not the administrator', async () => {
  const transaction = {};
  await expect(assertLocalRecordSource(async (request, tx) => { expect(request).toEqual(input); expect(tx).toBe(transaction); return local; }, input, transaction)).resolves.toBeUndefined();
});
it.each([{state:'linked'}, {state:'unavailable'}, {tenantId:'other'}, {principalId:'admin'}, {revision:''}])('rejects linked, unavailable, stale-scope or unversioned evidence %j', async override => {
  await expect(assertLocalRecordSource(async () => ({ ...local, ...override } as RecordSourceAuthorityResolution), input, {})).rejects.toThrow();
});
it('fails closed without a registered resolver and rechecks changed linkage on retries', async () => {
  await expect(assertLocalRecordSource(undefined, input, {})).rejects.toThrow('unavailable');
  let state: RecordSourceAuthorityResolution['state'] = 'local';
  const resolver = async () => ({ ...local, state });
  await assertLocalRecordSource(resolver, input, {});
  state = 'linked';
  await expect(assertLocalRecordSource(resolver, input, {})).rejects.toThrow('authoritative source');
});
