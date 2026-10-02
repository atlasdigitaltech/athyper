import { expect, it, vi } from 'vitest';
import type { VerifiedRequestContext } from '@athyper/server-contract-auth';
import type { EntityRuntimeDescriptor } from '@athyper/server-contract-metadata';
import { createInMemoryRecordPersistence } from './in-memory-record-repository.js';
import { createRecordQueryService } from './query-service.js';
import type { RecordSourceAuthorityResolution } from './record-source-authority.js';
import { parseEntityListResult } from '@athyper/contract-platform-entity-list';
import { RecordServiceError } from './errors.js';

const context: VerifiedRequestContext = {
  planeKey: 'neon', tenantId: 'tenant', principalId: 'owner', realmKey: 'realm',
  authEpoch: 1, profileHash: 'profile', requestId: 'request',
  permissions: { planeKey: 'neon', tenantId: 'tenant', principalId: 'owner',
    principalFingerprint: 'owner', profileHash: 'profile', schemaHash: 'schema', resolvedAt: 1,
    allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};
const descriptor: EntityRuntimeDescriptor = {
  schema: 'athyper.entity-runtime-descriptor/1.0', entityCode: 'profile', planeKey: 'neon',
  releaseId: 'release', releaseNo: 1, contractHash: 'a'.repeat(64), compiledHash: 'b'.repeat(64),
  storage: { schema: 'master', object: 'profile', idField: 'id', tenantField: 'tenant_id' },
  fields: [
    { key: 'id', storagePath: 'id', type: 'uuid', required: false, writableOn: [], filterable: true },
    { key: 'principal_id', storagePath: 'principal_id', type: 'uuid', required: false, writableOn: [], readPermissionCode: 'owner.internal' },
    { key: 'name', storagePath: 'name', type: 'string', required: false, writableOn: [] },
  ],
  operations: { list: { code: 'list', permissionCode: 'profile.read' }, read: { code: 'read', permissionCode: 'profile.read' } },
  ownerAccess: { schemaVersion: 1, ownerField: 'principal_id', administerPermission: 'profile.admin', createdByField: 'created_by', updatedByField: 'updated_by', sourceAuthority: 'source.verified.v1' },
};
async function fixture(state: RecordSourceAuthorityResolution['state'], mismatch = false, parentOwner?: string, canonical?: RecordSourceAuthorityResolution['source'], sourceAllowed = true) {
  const persistence = createInMemoryRecordPersistence();
  await persistence.transactions.run('neon', context, tx => persistence.repository.create(descriptor, 'tenant', { id: 'record', principal_id: 'owner', name: 'Old local details' }, tx));
  const sourceDescriptor = {...descriptor,entityCode:'person',storage:{...descriptor.storage,object:'person'},ownerAccess:undefined,operations:{list:{code:'list',permissionCode:'person.read'},read:{code:'read',permissionCode:'person.read'}}};
  if(canonical)await persistence.transactions.run('neon',context,tx=>persistence.repository.create(sourceDescriptor,'tenant',{id:canonical.recordId,name:'Canonical Person'},tx));
  const source = vi.fn(async () => ({ state, tenantId: mismatch ? 'wrong-tenant' : 'tenant', principalId: 'owner', revision: 'revision', ...(canonical ? {source:canonical}: {}) }));
  const list = vi.spyOn(persistence.repository, 'list');
  const service = createRecordQueryService({
    ...persistence,
    metadata: { getEntityDescriptor: async (_context,entityCode) => entityCode==='person'?sourceDescriptor:descriptor },
    authorizer: { authorize: async input => input.permissionCode === 'owner.internal' || (input.permissionCode==='person.read'&&!sourceAllowed) ? { allowed: false, reason: 'hidden owner/source denied' } : { allowed: true } },
    ownerAccess: { prepare: async input => {
      if (input.ownerPrincipalId && input.ownerPrincipalId !== context.principalId)
        throw new RecordServiceError(403, 'ENTITY_OWNER_ACCESS_DENIED', 'Other owner denied');
      return { principal_id: 'owner' };
    } },
    ...(parentOwner ? { collectionScopes: { resolve: async () => ({ status: 'ready' as const, authorizationResource: {}, labels: [], fingerprintMaterial: {}, constraints: [{ kind: 'entity.parent.v1' as const, entityCode: 'profile', storageSchema: 'master', storageObject: 'profile', predicates: [{ field: 'principal_id', value: parentOwner }] }] }) } } : {}),
    sourceAuthorities: new Map([['source.verified.v1', source]]),
  });
  return { service, source, list };
}
it.each(['linked', 'unavailable'] as const)('withholds local rows and counts for a %s authoritative source', async state => {
  const f = await fixture(state);
  const result = await f.service.list({ context, entityCode: 'profile', countMode: 'exact' });
  expect(result.data).toEqual([]);
  expect(result.sourceAuthority).toEqual({ state });
  expect(result.pagination.total).toBeUndefined();
  expect(f.list).not.toHaveBeenCalled();
  await expect(f.service.get({ context, entityCode: 'profile', recordId: 'record' })).rejects.toMatchObject({ code: state === 'linked' ? 'ENTITY_SOURCE_MANAGED' : 'ENTITY_SOURCE_UNAVAILABLE' });
});
it.each([true,false])('exposes a canonical reference only after independent Entity read admission (%s)',async allowed=>{
  const coordinate={plane:'neon',tenantId:'tenant',entityCode:'person',recordId:'11111111-1111-4111-8111-111111111111'};
  const f=await fixture('linked',false,undefined,coordinate,allowed);
  const result=await f.service.list({context,entityCode:'profile'});
  expect(result.data).toEqual([]);
  expect(result.sourceAuthority).toEqual({state:'linked',...(allowed?{reference:{entityCode:'person',recordId:coordinate.recordId}}:{})});
});
it.each([{plane:'mesh',tenantId:'tenant'},{plane:'neon',tenantId:'other'}])('never synthesizes a cross-plane/tenant source context %j',async scope=>{
  const f=await fixture('linked',false,undefined,{...scope,entityCode:'person',recordId:'11111111-1111-4111-8111-111111111111'});
  expect((await f.service.list({context,entityCode:'profile'})).sourceAuthority).toEqual({state:'linked'});
});
it('admits a confirmed local source without disclosing its hidden owner field', async () => {
  const f = await fixture('local');
  const result = await f.service.list({ context, entityCode: 'profile' });
  expect(result.sourceAuthority).toEqual({ state: 'local' });
  expect(result.data[0]?.name).toBe('Old local details');
  expect(result.data[0]?.principal_id).toBeUndefined();
  const detail = await f.service.get({ context, entityCode: 'profile', recordId: 'record' });
  expect(detail.data?.name).toBe('Old local details');
  expect(detail.data?.principal_id).toBeUndefined();
});
it('fails closed for mismatched source ownership', async () => {
  const f = await fixture('local', true);
  const result = await f.service.list({ context, entityCode: 'profile' });
  expect(result.sourceAuthority).toEqual({ state: 'unavailable' });
  expect(result.data).toEqual([]);
  expect(f.list).not.toHaveBeenCalled();
});
it('authorizes the locked parent before exposing its source state', async () => {
  const f = await fixture('linked', false, 'another-owner');
  await expect(f.service.list({ context, entityCode: 'profile' })).rejects.toMatchObject({ code: 'ENTITY_OWNER_ACCESS_DENIED' });
  expect(f.source).not.toHaveBeenCalled();
  expect(f.list).not.toHaveBeenCalled();
});
it('does not derive source ownership from client filters', async () => {
  const f = await fixture('local');
  await f.service.list({ context, entityCode: 'profile', filters: [{ field: 'id', operator: 'eq', value: '11111111-1111-4111-8111-111111111111' }] });
  expect(f.source).toHaveBeenCalledWith({ context, ownerPrincipalId: 'owner' }, expect.anything());
});
it('parses only the admitted source states without accepting coordinates or coercible values', () => {
  const envelope = { schemaVersion: 1, descriptorHash: 'a'.repeat(64), scopeFingerprint: 'b'.repeat(64), queryHash: 'c'.repeat(64), rows: [], pagination: { pageSize: 0, hasNext: false, hasPrevious: false, countMode: 'none' } };
  expect(parseEntityListResult({ ...envelope, sourceAuthority: { state: 'linked' } }).sourceAuthority).toEqual({ state: 'linked' });
  const reference={entityCode:'person',recordId:'11111111-1111-4111-8111-111111111111'};
  expect(parseEntityListResult({...envelope,sourceAuthority:{state:'linked',reference}}).sourceAuthority).toEqual({state:'linked',reference});
  for(const sourceAuthority of [{state:'local',reference},{state:'linked',reference:{...reference,tenantId:'private'}},{state:'linked',reference:{...reference,recordId:'invalid'}}])
    expect(()=>parseEntityListResult({...envelope,sourceAuthority})).toThrow('source authority');
  for (const sourceAuthority of [{ state: ['linked'] }, { state: 'linked', recordId: 'private-source' }, { state: 'unknown' }])
    expect(() => parseEntityListResult({ ...envelope, sourceAuthority })).toThrow('source authority');
});
