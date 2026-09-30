import { exactObject, requireUuid } from "./dev-publication-policy.js";

export interface EntitySuccessorTargetPin {
  readonly plane: "studio" | "neon" | "mesh";
  readonly environment: "local";
  readonly instance: "dev";
  readonly publicationKey: string;
  readonly appliedReleaseId: string;
  readonly sourceReleaseId: string;
  readonly sourceReleaseNo: number;
  readonly artifactHash: string;
  readonly headVersion: number;
}
export interface DevEntitySuccessorPolicy {
  readonly schema: "athyper.dev-entity-successor-policy/1";
  readonly environment: "local";
  readonly instance: "dev";
  readonly authorityTenantId: string;
  readonly policyId: string;
  readonly revision: number;
  readonly entityId: string;
  readonly changeSetId: string;
  readonly contractHash: string;
  readonly descriptorHash: string;
  readonly authorPrincipalId: string;
  readonly publisherPrincipalId: string;
  readonly predecessor: {
    readonly authoringReleaseId: string;
    readonly authoringReleaseNo: number;
    readonly authoringReleaseHash: string;
    readonly publicationReleaseId: string;
    readonly publicationReleaseNo: number;
    readonly publicationReleaseHash: string;
    readonly revisionId: string;
    /** Snapshot hash in its historical PostgreSQL JSONB-text domain. Not the
     * newly compiled source's canonical graph hash at the policy root. */
    readonly contractHash: string;
  };
  readonly compiler: { readonly name: string; readonly version: string; readonly buildHash: string };
  readonly targets: readonly EntitySuccessorTargetPin[];
}
const check = (value: unknown, message: string): void => { if (!value) throw new TypeError(`ENTITY_SUCCESSOR_${message}`); };
const hash = (v: unknown): string => { check(typeof v === "string" && /^[a-f0-9]{64}$/.test(v), "HASH_INVALID"); return v as string; };
const positive = (v: unknown): number => { check(Number.isSafeInteger(v) && Number(v) > 0, "NUMBER_INVALID"); return v as number; };
const text = (v: unknown): string => { check(typeof v === "string" && /^[a-zA-Z0-9@][a-zA-Z0-9@/_.-]{0,190}$/.test(v), "CODE_INVALID"); return v as string; };

export function parseEntitySuccessorTargetPin(value: unknown): EntitySuccessorTargetPin {
  const p = exactObject(value, ["plane", "environment", "instance", "publicationKey", "appliedReleaseId", "sourceReleaseId", "sourceReleaseNo", "artifactHash", "headVersion"]);
  check(["studio", "neon", "mesh"].includes(String(p.plane)) && p.environment === "local" && p.instance === "dev", "TARGET_INVALID");
  return Object.freeze({ plane: p.plane as EntitySuccessorTargetPin["plane"], environment: "local", instance: "dev", publicationKey: text(p.publicationKey),
    appliedReleaseId: requireUuid(p.appliedReleaseId), sourceReleaseId: requireUuid(p.sourceReleaseId), sourceReleaseNo: positive(p.sourceReleaseNo), artifactHash: hash(p.artifactHash), headVersion: positive(p.headVersion) });
}

/** Structural admission only. A parsed policy has NO enrollment or execution
 * authority. The first-publication policy cannot be upgraded by adding fields. */
export function parseDevEntitySuccessorPolicy(value: unknown): DevEntitySuccessorPolicy {
  const p = exactObject(value, ["schema", "environment", "instance", "authorityTenantId", "policyId", "revision", "entityId", "changeSetId", "contractHash", "descriptorHash", "authorPrincipalId", "publisherPrincipalId", "predecessor", "compiler", "targets"]);
  check(p.schema === "athyper.dev-entity-successor-policy/1" && p.environment === "local" && p.instance === "dev", "DEV_ONLY");
  const r = exactObject(p.predecessor, ["authoringReleaseId", "authoringReleaseNo", "authoringReleaseHash", "publicationReleaseId", "publicationReleaseNo", "publicationReleaseHash", "revisionId", "contractHash"]);
  const predecessor = Object.freeze({ authoringReleaseId: requireUuid(r.authoringReleaseId), authoringReleaseNo: positive(r.authoringReleaseNo), authoringReleaseHash: hash(r.authoringReleaseHash),
    publicationReleaseId: requireUuid(r.publicationReleaseId), publicationReleaseNo: positive(r.publicationReleaseNo), publicationReleaseHash: hash(r.publicationReleaseHash), revisionId: requireUuid(r.revisionId), contractHash: hash(r.contractHash) });
  const c = exactObject(p.compiler, ["name", "version", "buildHash"]);
  const compiler = Object.freeze({ name: text(c.name), version: text(c.version), buildHash: hash(c.buildHash) });
  check(Array.isArray(p.targets) && p.targets.length > 0, "TARGETS_REQUIRED");
  const targets = (p.targets as unknown[]).map(parseEntitySuccessorTargetPin);
  check(new Set(targets.map(t => t.plane)).size === targets.length && new Set(targets.map(t => t.publicationKey)).size === 1, "TARGETS_AMBIGUOUS");
  check(targets.every(t => t.sourceReleaseId === predecessor.publicationReleaseId && t.sourceReleaseNo === predecessor.publicationReleaseNo), "PREDECESSOR_MISMATCH");
  const authorPrincipalId = requireUuid(p.authorPrincipalId), publisherPrincipalId = requireUuid(p.publisherPrincipalId);
  check(authorPrincipalId !== publisherPrincipalId, "ACTOR_SEPARATION_REQUIRED");
  return Object.freeze({ schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: requireUuid(p.authorityTenantId),
    policyId: text(p.policyId), revision: positive(p.revision), entityId: requireUuid(p.entityId), changeSetId: requireUuid(p.changeSetId),
    contractHash: hash(p.contractHash), descriptorHash: hash(p.descriptorHash), authorPrincipalId, publisherPrincipalId, predecessor, compiler, targets: Object.freeze(targets) });
}

/** Call inside the target's activation-head lock, not merely before dispatch. */
export function assertEntitySuccessorTargetHead(expected: EntitySuccessorTargetPin, actual: EntitySuccessorTargetPin | null): void {
  const pin = parseEntitySuccessorTargetPin(expected);
  check(actual !== null, "TARGET_HEAD_MISSING");
  const head = parseEntitySuccessorTargetPin(actual);
  check((Object.keys(pin) as (keyof EntitySuccessorTargetPin)[]).every(key => pin[key] === head[key]), "TARGET_HEAD_CHANGED");
}
