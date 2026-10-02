import { expect, it, vi } from 'vitest';
import type { EntityRuntimeDescriptor } from '@athyper/server-contract-metadata';
import type { RegisteredActionCommand, RecordMutationResult } from '@athyper/server-contract-records';
import { createInMemoryRecordPersistence } from '../in-memory-record-repository.js';
import { createTransactionalRecordActionService } from './transactional-action-service.js';

it('rechecks current domain scope before receipt replay and denies a revoked scope without side effects', async () => {
  const persistence = createInMemoryRecordPersistence();
  const descriptor = {
    schema: 'athyper.entity-runtime-descriptor/1.0', releaseId: 'release', releaseNo: 1,
    contractHash: 'a'.repeat(64), compiledHash: 'b'.repeat(64), fields: [], operations: {},
    entityCode: 'principal', planeKey: 'neon',
    storage: { schema: 'master', object: 'principal', idField: 'id', tenantField: 'tenant_id' },
    actions: [{ code: 'link_person', handlerKey: 'governed.link.v1', permissionCode: 'link.invoke' }],
  } as EntityRuntimeDescriptor;
  const command = {
    origin: 'operation', validationMode: 'strict',
    context: {
      planeKey: 'neon', tenantId: 'tenant', principalId: 'actor',
      realmKey: 'realm', authEpoch: 1, profileHash: 'profile', requestId: 'request',
      permissions: {
        planeKey: 'neon', tenantId: 'tenant', principalId: 'actor',
        principalFingerprint: 'actor-fingerprint', profileHash: 'profile',
        schemaHash: 'schema', resolvedAt: 1, allowed: [], denied: [],
        planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [],
      },
    },
    entityCode: 'principal', recordId: 'target', actionCode: 'link_person',
    idempotencyKey: 'governed-link-request-001', input: { personId: 'person' },
  } as RegisteredActionCommand;
  const result: RecordMutationResult = { kind: 'Committed', action: 'domain', entityCode: 'principal', recordId: 'target', replayed: false };
  const order: string[] = [];
  let granted = true;
  const resolveAuthorizationResource = vi.fn(async () => {
    order.push('stored scope');
    return { kind: 'Resolved' as const, resource: { companyCodeId: 'stored-company', tenantId: 'forged-tenant', entityCode: 'forged-entity', recordId: 'forged-record' } };
  });
  const authorize = vi.fn(async () => {
    order.push('domain authorization');
    return granted ? undefined : { kind: 'Forbidden' as const, permissionCode: 'workforce.profile.write' };
  });
  const execute = vi.fn(async () => result);
  const begin = vi.fn(async () => { order.push('receipt'); return { kind: 'replay' as const, result }; });
  const record = vi.fn(async () => { throw Error('Replay must not append audit'); });
  const append = vi.fn(async () => { throw Error('Replay must not append outbox'); });
  const authorizePublished = vi.fn(async () => { order.push('published authorization'); return { allowed: true as const }; });
  const service = createTransactionalRecordActionService({
    ...persistence,
    metadata: { getEntityDescriptor: async () => descriptor },
    authorizer: { authorize: authorizePublished },
    handlers: new Map([['governed.link.v1', { resolveAuthorizationResource, authorize, execute }]]),
    commandExecutions: { begin, complete: async () => undefined },
    audit: { record }, outbox: { append },
  });
  expect(await service.execute(command)).toMatchObject({ kind: 'Committed', replayed: true });
  expect(order).toEqual(['stored scope', 'published authorization', 'domain authorization', 'receipt']);
  expect(authorizePublished).toHaveBeenCalledWith(expect.objectContaining({
    permissionCode: 'link.invoke', resource: expect.objectContaining({
      companyCodeId: 'stored-company', tenantId: 'tenant', entityCode: 'principal', recordId: 'target',
      operationKey: 'link_person', authorizationDescriptorHash: descriptor.compiledHash,
    }),
  }));
  granted = false;
  expect(await service.execute(command)).toEqual({ kind: 'Forbidden', permissionCode: 'workforce.profile.write' });
  expect(begin).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
  authorizePublished.mockResolvedValueOnce({ allowed: false } as never);
  expect(await service.execute(command)).toEqual({kind:'Forbidden',permissionCode:'link.invoke'});
  expect(authorize).toHaveBeenCalledTimes(2);
  expect(begin).toHaveBeenCalledTimes(1);
  resolveAuthorizationResource.mockResolvedValueOnce({kind:'NotFound',entityCode:'principal',recordId:'target'} as never);
  expect(await service.execute(command)).toEqual({kind:'NotFound',entityCode:'principal',recordId:'target'});
  expect(authorizePublished).toHaveBeenCalledTimes(3);
});

it('uses only the pre-authorized bounded target reader and retains identity/version fencing',async()=>{
  const persistence=createInMemoryRecordPersistence();
  const descriptor={schema:'athyper.entity-runtime-descriptor/1.0',entityCode:'target',planeKey:'neon',releaseId:'release',releaseNo:1,compiledHash:'a'.repeat(64),contractHash:'b'.repeat(64),fields:[],operations:{},storage:{schema:'master',object:'target',idField:'id',versionField:'record_version'},actions:[{code:'link',handlerKey:'domain.link',permissionCode:'link.invoke'}]} as EntityRuntimeDescriptor;
  const command={context:{planeKey:'neon',tenantId:'tenant',principalId:'actor',requestId:'request'} as RegisteredActionCommand['context'],entityCode:'target',recordId:'selected',actionCode:'link',origin:'operation',validationMode:'strict',idempotencyKey:'scoped-target-request',expectedVersion:1} as RegisteredActionCommand;
  const readTarget=vi.fn(async()=>({recordId:'selected',version:1}));
  const execute=vi.fn(async()=>({kind:'Committed' as const,action:'domain' as const,entityCode:'target',recordId:'selected',replayed:false}));
  const get=vi.spyOn(persistence.repository,'get');
  const audit=vi.fn(async()=>({id:'audit'} as never)),outbox=vi.fn(async()=>({} as never));
  const complete=vi.fn(async()=>undefined);
  const service=createTransactionalRecordActionService({...persistence,metadata:{getEntityDescriptor:async()=>descriptor},authorizer:{authorize:async()=>({allowed:true})},handlers:new Map([['domain.link',{authorize:async()=>undefined,readTarget,execute}]]),commandExecutions:{begin:async()=>({kind:'started' as const,executionId:'execution'}),complete},audit:{record:audit},outbox:{append:outbox}});
  expect((await service.execute(command)).kind).toBe('Committed');
  expect(get).not.toHaveBeenCalled();expect(audit).toHaveBeenCalledTimes(1);expect(outbox).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledTimes(1);
  readTarget.mockResolvedValueOnce({recordId:'another-target',version:1});
  await expect(service.execute(command)).rejects.toThrow('RECORD_DOMAIN_TARGET_SCOPE_INVALID');
  readTarget.mockResolvedValueOnce({recordId:'selected',version:2});
  expect(await service.execute(command)).toEqual({kind:'VersionConflict',expectedVersion:1,currentVersion:2});
  expect(execute).toHaveBeenCalledTimes(1);
});
