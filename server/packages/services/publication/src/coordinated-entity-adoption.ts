import {sql, type Kysely} from 'kysely';
import {compiledPublicationTenant} from '@athyper/server-contract-publication';
import type {PublicationArtifactLoader, PublicationDeploymentBundle, LocalProjectionRepository, LoadedPublicationArtifact} from '@athyper/server-contract-publication';
import {KyselyLocalProjectionRepository} from './kysely-local-projection-repository.js';
import {planEntityAdoption, checkEntityAdoptionHeads, type EntityAdoptionPlanInput, type AdoptionMember} from './entity-adoption-plan.js';

type Plan = ReturnType<typeof planEntityAdoption>;
export interface AdoptionTransaction {
  readonly repository: LocalProjectionRepository;
  /** Acquire locks in sorted key order, including when the heads do not exist. */
  lock(keys: readonly string[]): Promise<void>;
}
export interface CoordinatedAdoptionPorts {
  readonly loader: PublicationArtifactLoader;
  /** Must check current authority AND durable independent approval for these
   * exact deployment hashes; client-supplied author/publisher IDs are not proof. */
  authorize(plan: Plan, deployments: readonly PublicationDeploymentBundle[]): Promise<void>;
  transaction<T>(work: (tx: AdoptionTransaction) => Promise<T>): Promise<T>;
  /** Run after commit, also on exact replay so a failed invalidation is retryable. */
  invalidate(plan: Plan): Promise<void>;
}
function requireAdoption(ok: unknown, code: string): asserts ok {
  if (!ok) throw Error(code);
}
function assertMember(plan: Plan, member: AdoptionMember, deployment: PublicationDeploymentBundle, loaded: LoadedPublicationArtifact) {
  const e=loaded.document.envelope;
  requireAdoption(deployment.artifactHash===member.artifactHash && loaded.computedArtifactHash===member.artifactHash
    && deployment.publicationKey===member.publicationKey && e.publicationKey===member.publicationKey
    && deployment.targetPlane===plan.plane && e.targetPlane===plan.plane
    && e.releaseId===deployment.sourceReleaseId && e.releaseNo===deployment.sourceReleaseNo
    && e.artifactKind===member.kind, 'ADOPTION_ARTIFACT_MISMATCH');
  requireAdoption(loaded.verification.signatureVerified && loaded.verification.manifestValid
    && loaded.verification.runtimeCompatible && loaded.verification.targetPlane===plan.plane, 'ADOPTION_VERIFICATION_REQUIRED');
  if (e.artifactKind==='entity_runtime') {
    requireAdoption(e.payload.entityContract.tenantId===plan.tenantId && e.payload.entityContract.entityCode===plan.entityCode
      && e.payload.entityDescriptor.descriptorKind==='entity_runtime', 'ADOPTION_NATIVE_SCOPE_MISMATCH');
  } else if(e.artifactKind==='compiled_entity_runtime') {
    requireAdoption(e.payload.tenantId===plan.tenantId && e.payload.entityCode===plan.entityCode, 'ADOPTION_COMPILED_SCOPE_MISMATCH');
  }
  // The signed manifest binds both independently loaded members to the same
  // reviewed baseline. Do not accept provenance supplied only in the request.
  const evidence=loaded.document.manifest.evidence;
  requireAdoption(evidence?.['baselineReleaseId']===plan.baselineReleaseId
    && evidence?.['baselineHash']===plan.baselineHash, 'ADOPTION_SIGNED_BASELINE_REQUIRED');
}

/** No head can become visible until both verified members activate successfully.
 * This intentionally does not create reviews, signatures, or grant permissions. */
export async function adoptEntityPair(ports: CoordinatedAdoptionPorts, input: EntityAdoptionPlanInput,
  deployments: {readonly native: PublicationDeploymentBundle; readonly compiled: PublicationDeploymentBundle}) {
  const plan=planEntityAdoption(input);
  const pair=[deployments.native,deployments.compiled] as const;
  requireAdoption(pair[0].deploymentId!==pair[1].deploymentId
    && pair[0].targetInstance===pair[1].targetInstance
    && pair[0].targetEnvironment===pair[1].targetEnvironment, 'ADOPTION_TARGET_MISMATCH');
  await ports.authorize(plan,pair);
  const loaded=await Promise.all(pair.map(d=>ports.loader.load(d)));
  assertMember(plan,plan.native,pair[0],loaded[0]!);
  assertMember(plan,plan.compiled,pair[1],loaded[1]!);
  const result=await ports.transaction(async tx=>{
    await tx.lock([plan.native.publicationKey,plan.compiled.publicationKey].sort());
    await ports.authorize(plan,pair);
    const native=await tx.repository.findActive(plan.native.publicationKey);
    const compiled=await tx.repository.findActive(plan.compiled.publicationKey);
    const action=checkEntityAdoptionHeads(plan,{native:native?.artifactHash??null,compiled:compiled?.artifactHash??null});
    if(action==='already-active') return {nativeId:native!.id,compiledId:compiled!.id,replayed:true};
    const staged=[];
    for(let i=0;i<pair.length;i++) {
      const artifact=loaded[i]!;
      const row=await tx.repository.stage({deployment:pair[i]!,artifact:artifact.document});
      const verified=await tx.repository.verify({appliedReleaseId:row.id,computedArtifactHash:artifact.computedArtifactHash,evidence:artifact.verification});
      requireAdoption(verified.status==='verified','ADOPTION_LOCAL_VERIFICATION_FAILED');
      staged.push(verified);
    }
    const evidence={tenantId:plan.tenantId,entityCode:plan.entityCode,baselineReleaseId:plan.baselineReleaseId,baselineHash:plan.baselineHash,
      nativeArtifactHash:plan.native.artifactHash,compiledArtifactHash:plan.compiled.artifactHash,authorId:plan.authorId,publisherId:plan.publisherId};
    for(const row of staged) await tx.repository.activate({appliedReleaseId:row.id,evidence});
    return {nativeId:staged[0]!.id,compiledId:staged[1]!.id,replayed:false};
  });
  await ports.invalidate(plan);
  return result;
}

/** Target-plane worker adapter; all repository operations use the same connection. */
export function entityAdoptionTransaction(database: Kysely<Record<string,never>>): CoordinatedAdoptionPorts['transaction'] {
  return work=>database.transaction().execute(async transaction=>work({
    repository:new KyselyLocalProjectionRepository(transaction),
    async lock(keys) {
      for(const key of [...new Set(keys)].sort())
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`.execute(transaction);
    },
  }));
}

export interface ProductActivationGroup {
  /** Digest of the independently enrolled source/target plan, before signing.
   * Each signed member must carry this same digest in its manifest evidence. */
  readonly coordinationHash: string;
  readonly plane: 'studio' | 'neon' | 'mesh';
  readonly environment: string;
  readonly instance: string;
  readonly members: readonly {
    readonly entityCode: string;
    readonly deployment: PublicationDeploymentBundle;
    readonly expectedActiveHash: string | null;
  }[];
}
export interface ProductActivationGroupPorts {
  readonly loader: PublicationArtifactLoader;
  authorize(group: ProductActivationGroup): Promise<void>;
  transaction: CoordinatedAdoptionPorts['transaction'];
  /** Validates the complete prospective set against existing dependencies and
   * target storage in this transaction. Cannot merely skip missing dependencies. */
  qualify(group: ProductActivationGroup, artifacts: readonly LoadedPublicationArtifact[], tx: AdoptionTransaction): Promise<void>;
  invalidate(group: ProductActivationGroup): Promise<void>;
}

/** Generalizes the existing transactional pair mechanism to product entities
 * with mutual dependencies. Atomicity is per target database, never cross-plane.
 * Uncoordinated signed artifacts cannot opt into this path at execution time. */
export async function activateProductGroup(input: ProductActivationGroup, ports: ProductActivationGroupPorts) {
  const group = structuredClone(input), hash = /^[a-f0-9]{64}$/;
  requireAdoption(hash.test(group.coordinationHash) && ['studio','neon','mesh'].includes(group.plane)
    && !!group.environment && !!group.instance && Array.isArray(group.members) && group.members.length > 0,
  'PRODUCT_GROUP_INVALID');
  const keys = group.members.map(m => m.deployment.publicationKey);
  requireAdoption(new Set(keys).size === keys.length
    && new Set(group.members.map(m => m.entityCode)).size === keys.length
    && new Set(group.members.map(m => m.deployment.deploymentId)).size === keys.length, 'PRODUCT_GROUP_DUPLICATE_MEMBER');
  for (const member of group.members) {
    const d = member.deployment;
    requireAdoption(/^[a-z][a-z0-9_]{0,62}$/.test(member.entityCode)
      && [ `metadata.entity.${member.entityCode}`, `metadata.reference.${member.entityCode}` ].includes(d.publicationKey)
      && d.targetPlane === group.plane && d.targetEnvironment === group.environment && d.targetInstance === group.instance
      && hash.test(d.artifactHash) && (member.expectedActiveHash === null || hash.test(member.expectedActiveHash))
      && member.expectedActiveHash !== d.artifactHash, 'PRODUCT_GROUP_MEMBER_INVALID');
  }
  await ports.authorize(structuredClone(group));
  const loaded = await Promise.all(group.members.map(m => ports.loader.load(structuredClone(m.deployment))));
  for (let i=0; i<loaded.length; i++) {
    const artifact = loaded[i]!, member = group.members[i]!, d = member.deployment, e = artifact.document.envelope;
    requireAdoption(artifact.computedArtifactHash === d.artifactHash && e.publicationKey === d.publicationKey
      && e.releaseId === d.sourceReleaseId && e.releaseNo === d.sourceReleaseNo && e.targetPlane === group.plane
      && e.artifactKind === 'compiled_entity_runtime' && compiledPublicationTenant(e.publicationKey, e.payload) === null
      && e.payload.entityCode === member.entityCode
      && artifact.verification.signatureVerified && artifact.verification.manifestValid
      && artifact.verification.runtimeCompatible && artifact.verification.targetPlane === group.plane,
    'PRODUCT_GROUP_ARTIFACT_MISMATCH');
    requireAdoption(artifact.document.manifest.evidence?.['coordinationHash'] === group.coordinationHash,
      'PRODUCT_GROUP_SIGNED_COORDINATION_REQUIRED');
  }
  const result = await ports.transaction(async tx => {
    await tx.lock([...keys].sort());
    await ports.authorize(structuredClone(group));
    const active = await Promise.all(keys.map(key => tx.repository.findActive(key)));
    const complete = active.every((head, i) => head?.artifactHash === group.members[i]!.deployment.artifactHash
      && head.sourceReleaseId === group.members[i]!.deployment.sourceReleaseId
      && head.sourceReleaseNo === group.members[i]!.deployment.sourceReleaseNo);
    if (complete) {
      await ports.qualify(structuredClone(group), structuredClone(loaded), tx);
      return { appliedReleaseIds: active.map(head => head!.id), replayed: true };
    }
    requireAdoption(active.every((head, i) => (head?.artifactHash ?? null) === group.members[i]!.expectedActiveHash),
      'PRODUCT_GROUP_HEAD_CHANGED');
    const staged = [];
    for (let i=0; i<loaded.length; i++) {
      const artifact = loaded[i]!;
      const row = await tx.repository.stage({ deployment: group.members[i]!.deployment, artifact: artifact.document });
      const verified = await tx.repository.verify({ appliedReleaseId: row.id, computedArtifactHash: artifact.computedArtifactHash,
        evidence: artifact.verification });
      requireAdoption(verified.status === 'verified', 'PRODUCT_GROUP_VERIFICATION_FAILED');
      staged.push(verified);
    }
    await ports.qualify(structuredClone(group), structuredClone(loaded), tx);
    await ports.authorize(structuredClone(group));
    for (const row of staged) await tx.repository.activate({ appliedReleaseId: row.id,
      evidence: { coordinationHash: group.coordinationHash, members: keys } });
    return { appliedReleaseIds: staged.map(row => row.id), replayed: false };
  });
  await ports.invalidate(structuredClone(group));
  return result;
}
