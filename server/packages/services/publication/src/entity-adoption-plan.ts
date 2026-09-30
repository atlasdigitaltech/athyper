/** Admission checks for an immutable, independently approved adoption pair.
 * This is planning only: it neither verifies signatures nor changes activation
 * heads. The publisher must load both signed artifacts through its verified
 * loader and activate the resulting pair in one target-database transaction.
 */
export interface EntityAdoptionPlanInput {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly plane: 'neon' | 'mesh';
  readonly authorId: string;
  readonly publisherId: string;
  readonly baselineReleaseId: string;
  readonly baselineHash: string;
  readonly native: AdoptionMember;
  readonly compiled: AdoptionMember;
}
export interface AdoptionMember {
  readonly kind: 'entity_runtime' | 'compiled_entity_runtime';
  readonly tenantId: string | null;
  readonly entityCode: string;
  readonly plane: 'neon' | 'mesh';
  readonly publicationKey: string;
  readonly artifactHash: string;
  readonly baselineReleaseId: string;
  readonly baselineHash: string;
  /** Explicit null means first adoption, never an unconditional overwrite. */
  readonly expectedActiveHash: string | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
function requirePlan(ok: unknown, code: string): asserts ok {
  if (!ok) throw Error(code);
}
export function planEntityAdoption(input: EntityAdoptionPlanInput) {
  requirePlan(uuid.test(input.tenantId) && uuid.test(input.authorId) && uuid.test(input.publisherId)
    && uuid.test(input.baselineReleaseId) && hash.test(input.baselineHash)
    && /^[a-z][a-z0-9_]{1,62}$/.test(input.entityCode)
    && ['neon', 'mesh'].includes(input.plane), 'ADOPTION_COORDINATE_INVALID');
  requirePlan(input.authorId !== input.publisherId, 'ADOPTION_INDEPENDENT_PUBLISHER_REQUIRED');
  for (const [member, kind, family] of [
    [input.native, 'entity_runtime', 'entity'],
    [input.compiled, 'compiled_entity_runtime', 'compiled_entity'],
  ] as const) {
    requirePlan(member.kind === kind && member.entityCode === input.entityCode && member.plane === input.plane,
      'ADOPTION_MEMBER_MISMATCH');
    requirePlan(member.tenantId === input.tenantId, 'ADOPTION_TENANT_MISMATCH');
    requirePlan(member.publicationKey === `metadata.${family}.${input.entityCode}.tenant.${input.tenantId}`, 'ADOPTION_PUBLICATION_KEY_INVALID');
    requirePlan(hash.test(member.artifactHash)
      && (member.expectedActiveHash === null || hash.test(member.expectedActiveHash)), 'ADOPTION_HASH_INVALID');
    requirePlan(member.baselineReleaseId === input.baselineReleaseId && member.baselineHash === input.baselineHash,
      'ADOPTION_BASELINE_MISMATCH');
  }
  return Object.freeze({
    ...input,
    native: Object.freeze({...input.native}),
    compiled: Object.freeze({...input.compiled}),
  });
}

/** Compare under the same locks/transaction used to move both heads. A complete
 * replay is allowed; a half-active pair is an inconsistency, not a success.
 */
export function checkEntityAdoptionHeads(plan: ReturnType<typeof planEntityAdoption>,
  current: {readonly native: string | null; readonly compiled: string | null}) {
  if (current.native === plan.native.artifactHash && current.compiled === plan.compiled.artifactHash)
    return 'already-active' as const;
  requirePlan(current.native === plan.native.expectedActiveHash
    && current.compiled === plan.compiled.expectedActiveHash, 'ADOPTION_HEAD_CHANGED');
  return 'activate-pair' as const;
}
