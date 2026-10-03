import { expect, it, vi } from 'vitest';
import { activateProductGroup, type ProductActivationGroup, type ProductActivationGroupPorts } from './coordinated-entity-adoption.js';

function fixture() {
  const group: ProductActivationGroup = { coordinationHash: 'a'.repeat(64), plane: 'neon', environment: 'local', instance: 'dev',
    members: ['person', 'employee'].map((entityCode, i) => ({ entityCode, expectedActiveHash: null,
      deployment: { deploymentId: `deployment-${i}`, deploymentStatus: 'dispatched', targetPlane: 'neon', targetEnvironment: 'local',
        targetInstance: 'dev', publicationKey: `metadata.entity.${entityCode}`, sourceReleaseId: `release-${i}`, sourceReleaseNo: 1,
        artifactUri: 'memory://artifact', artifactHash: String(i + 1).repeat(64), signatureAlgorithm: 'Ed25519', signingKeyId: 'test', signature: 'test' } })) };
  // Loader verification is mocked here. Cryptographic loader tests own actual
  // signatures; these tests exercise transaction ordering and group admission.
  const artifacts = group.members.map(m => ({ computedArtifactHash: m.deployment.artifactHash,
    verification: { signatureVerified: true, manifestValid: true, runtimeCompatible: true, targetPlane: 'neon' },
    document: { envelope: { artifactKind: 'compiled_entity_runtime', publicationKey: m.deployment.publicationKey,
      releaseId: m.deployment.sourceReleaseId, releaseNo: 1, targetPlane: 'neon', payload: { entityCode: m.entityCode } },
    manifest: { evidence: { coordinationHash: group.coordinationHash } } } }));
  const heads: Record<string, any> = {}, events: string[] = [];
  let failSecond = false;
  const repository: any = {
    findActive: async (key: string) => heads[key] ?? null,
    stage: async ({ deployment }: any) => { events.push(`stage:${deployment.deploymentId}`); return { id: deployment.deploymentId }; },
    verify: async ({ appliedReleaseId }: any) => { events.push(`verify:${appliedReleaseId}`); return { id: appliedReleaseId, status: 'verified' }; },
    activate: async ({ appliedReleaseId }: any) => {
      events.push(`activate:${appliedReleaseId}`);
      if (failSecond && appliedReleaseId === 'deployment-1') throw Error('activation failed');
      const d = group.members.find(m => m.deployment.deploymentId === appliedReleaseId)!.deployment;
      heads[d.publicationKey] = { id: appliedReleaseId, artifactHash: d.artifactHash, sourceReleaseId: d.sourceReleaseId, sourceReleaseNo: d.sourceReleaseNo };
      return heads[d.publicationKey];
    },
  };
  const ports: ProductActivationGroupPorts = {
    authorize: vi.fn(async () => {}), loader: { load: vi.fn(async d => artifacts[group.members.findIndex(m => m.deployment.deploymentId === d.deploymentId)] as any) },
    qualify: vi.fn(async () => { events.push('qualify'); }), invalidate: vi.fn(async () => {}),
    transaction: vi.fn(async work => {
      const before = structuredClone(heads);
      try { return await work({ repository, lock: async (keys: readonly string[]) => { events.push(`lock:${keys.join(',')}`); } }); }
      catch (error) { for (const key of Object.keys(heads)) delete heads[key]; Object.assign(heads, before); throw error; }
    }),
  };
  return { group, ports, heads, events, artifacts, failSecond: () => { failSecond = true; } };
}

it('verifies and qualifies the entire set before activating; complete replay only invalidates caches', async () => {
  const f = fixture();
  expect((await activateProductGroup(f.group, f.ports)).replayed).toBe(false);
  expect(f.events).toEqual(['lock:metadata.entity.employee,metadata.entity.person', 'stage:deployment-0', 'verify:deployment-0',
    'stage:deployment-1', 'verify:deployment-1', 'qualify', 'activate:deployment-0', 'activate:deployment-1']);
  expect((await activateProductGroup(f.group, f.ports)).replayed).toBe(true);
  expect(f.ports.qualify).toHaveBeenCalledTimes(2); expect(f.ports.invalidate).toHaveBeenCalledTimes(2);
});
it('rolls back every head when the second member fails', async () => {
  const f = fixture(); f.failSecond();
  await expect(activateProductGroup(f.group, f.ports)).rejects.toThrow('activation failed');
  expect(f.heads).toEqual({}); expect(f.ports.invalidate).not.toHaveBeenCalled();
});
it('rejects partial activation and changed predecessor heads', async () => {
  const f = fixture(), d = f.group.members[0]!.deployment;
  f.heads[d.publicationKey] = { artifactHash: d.artifactHash, sourceReleaseId: d.sourceReleaseId, sourceReleaseNo: 1 };
  await expect(activateProductGroup(f.group, f.ports)).rejects.toThrow('HEAD_CHANGED');
  expect(f.ports.qualify).not.toHaveBeenCalled();
});
it('requires signed coordination evidence on every member', async () => {
  const f = fixture(); f.artifacts[1]!.document.manifest.evidence.coordinationHash = 'b'.repeat(64);
  await expect(activateProductGroup(f.group, f.ports)).rejects.toThrow('SIGNED_COORDINATION_REQUIRED');
  expect(f.ports.transaction).not.toHaveBeenCalled();
});
it.each(['signature', 'source'])('rejects invalid %s before opening the target transaction', async kind => {
  const f = fixture();
  if (kind === 'signature') f.artifacts[1]!.verification.signatureVerified = false;
  if (kind === 'source') f.artifacts[1]!.document.envelope.releaseId = 'different-release';
  await expect(activateProductGroup(f.group, f.ports)).rejects.toThrow('ARTIFACT_MISMATCH');
  expect(f.ports.transaction).not.toHaveBeenCalled();
});
it('does not activate when prospective dependency qualification fails', async () => {
  const f = fixture(); vi.mocked(f.ports.qualify).mockRejectedValue(Error('FK missing'));
  await expect(activateProductGroup(f.group, f.ports)).rejects.toThrow('FK missing');
  expect(f.heads).toEqual({}); expect(f.events.some(e => e.startsWith('activate:'))).toBe(false);
});
it('rechecks execution authority after qualification inside the transaction', async () => {
  const f = fixture(); vi.mocked(f.ports.authorize).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValue(Error('revoked'));
  await expect(activateProductGroup(f.group, f.ports)).rejects.toThrow('revoked');
  expect(f.heads).toEqual({}); expect(f.ports.invalidate).not.toHaveBeenCalled();
});
it('rejects duplicate members and cross-instance targets', async () => {
  const f = fixture();
  await expect(activateProductGroup({ ...f.group, members: [f.group.members[0]!, f.group.members[0]!] }, f.ports)).rejects.toThrow('DUPLICATE_MEMBER');
  await expect(activateProductGroup({ ...f.group, instance: 'another' }, f.ports)).rejects.toThrow('MEMBER_INVALID');
  expect(f.ports.authorize).not.toHaveBeenCalled();
});

it.each([null, '', 'tenant', '11111111-1111-4111-8111-111111111111'])(
  'rejects an explicit invalid or tenant scope %j on a global signed publication', async tenantId => {
    const f = fixture();
    Object.assign(f.artifacts[1]!.document.envelope.payload, { tenantId });
    await expect(activateProductGroup(f.group, f.ports)).rejects.toMatchObject({ code: 'ARTIFACT_COORDINATES_INVALID' });
    expect(f.ports.transaction).not.toHaveBeenCalled();
    expect(f.ports.qualify).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  },
);
it('activates signed global payloads with omitted tenantId without rewriting them', async () => {
  const f = fixture(), signed = structuredClone(f.artifacts);
  expect(f.artifacts.every(a => !Object.hasOwn(a.document.envelope.payload, 'tenantId'))).toBe(true);
  await expect(activateProductGroup(f.group, f.ports)).resolves.toMatchObject({ replayed: false });
  expect(f.artifacts).toEqual(signed);
  expect(Object.keys(f.heads)).toHaveLength(2);
});
