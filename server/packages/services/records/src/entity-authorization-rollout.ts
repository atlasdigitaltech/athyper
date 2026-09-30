import { createHash } from "node:crypto";
import type { EntityAccessDecisionV1 } from "@athyper/contract-platform-entity-runtime";
import type {
  EntityAccessEvaluator,
  EntityAccessInput,
} from "./entity-authorization.js";

export const entityAuthorizationCoverage = [
  "application",
  "workspace",
  "collection",
  "record",
  "sections",
  "fields",
  "commands",
  "transfer_ai",
  "relationships",
  "revocation",
] as const;
export interface EntityAuthorizationRelease {
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly entityCode: string;
  readonly descriptorHash: string;
  readonly profileHash: string;
  readonly bindingsHash: string;
  readonly runtimeVersion: string;
}
export interface EntityAuthorizationRollout {
  readonly schemaVersion: 1;
  readonly mode: "legacy" | "shadow" | "enforce";
  readonly release: EntityAuthorizationRelease;
  readonly qualificationRef?: string;
}
/** Receipt verification is supplied by deployment governance, not browser input. */
export interface EntityAuthorizationQualification {
  readonly release: EntityAuthorizationRelease;
  readonly coverage: readonly (typeof entityAuthorizationCoverage)[number][];
  readonly unresolvedDifferences: number;
  readonly grantReviewRef: string;
  readonly rollbackRef: string;
  readonly revocationWatermark: string;
  readonly companyEntityQualified: boolean;
  readonly independentChildQualified: boolean;
}
export interface EntityAuthorizationShadowEvidence {
  readonly schemaVersion: 1;
  readonly entityCode: string;
  readonly planeKey: string;
  readonly release: EntityAuthorizationRelease;
  readonly operationKey: string;
  readonly phase: "discover" | "execute";
  readonly targetPhase: "discover";
  readonly comparison: "same_phase" | "discovery_preview";
  readonly legacyState: string;
  readonly targetState: string;
  readonly differs: boolean;
  readonly requestRef: string;
}
const hashPattern = /^[a-f0-9]{64}$/;
export function parseEntityAuthorizationRollout(
  raw: unknown,
): EntityAuthorizationRollout {
  const object = (value: unknown, keys: readonly string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new TypeError("Invalid entity authorization rollout");
    return value as Record<string, unknown>;
  };
  const value = object(raw, [
    "schemaVersion",
    "mode",
    "release",
    "qualificationRef",
  ]);
  const release = object(value.release, [
    "planeKey",
    "entityCode",
    "descriptorHash",
    "profileHash",
    "bindingsHash",
    "runtimeVersion",
  ]);
  if (
    value.schemaVersion !== 1 ||
    !["legacy", "shadow", "enforce"].includes(String(value.mode)) ||
    !["neon", "mesh", "studio"].includes(String(release.planeKey))
  )
    throw new TypeError("Unsupported entity authorization rollout");
  for (const key of ["descriptorHash", "profileHash", "bindingsHash"])
    if (typeof release[key] !== "string" || !hashPattern.test(release[key]))
      throw new TypeError("Invalid release hash");
  for (const field of [
    release.entityCode,
    release.runtimeVersion,
    ...(value.qualificationRef === undefined ? [] : [value.qualificationRef]),
  ])
    if (typeof field !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(field))
      throw new TypeError("Invalid release reference");
  if (value.mode === "enforce" && !value.qualificationRef)
    throw new TypeError("Enforcement requires qualification");
  return Object.freeze({
    schemaVersion: 1,
    mode: value.mode as EntityAuthorizationRollout["mode"],
    release: Object.freeze(release) as unknown as EntityAuthorizationRelease,
    ...(value.qualificationRef
      ? { qualificationRef: value.qualificationRef as string }
      : {}),
  });
}
export function sameEntityAuthorizationRelease(
  left: EntityAuthorizationRelease,
  right: EntityAuthorizationRelease,
): boolean {
  return (
    [
      "planeKey",
      "entityCode",
      "descriptorHash",
      "profileHash",
      "bindingsHash",
      "runtimeVersion",
    ] as const
  ).every((key) => left[key] === right[key]);
}
export function entityAuthorizationProfileHash(profile: unknown): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
  return createHash("sha256")
    .update(JSON.stringify(canonical(profile)))
    .digest("hex");
}

export function createEntityAuthorizationRolloutEvaluator(options: {
  readonly rollout: EntityAuthorizationRollout;
  readonly currentRelease: () => Promise<EntityAuthorizationRelease>;
  readonly legacy: EntityAccessEvaluator;
  readonly target: EntityAccessEvaluator;
  readonly writeShadow: (
    evidence: EntityAuthorizationShadowEvidence,
  ) => Promise<void>;
  readonly verifyQualification: (
    reference: string,
  ) => Promise<EntityAuthorizationQualification | null>;
  readonly currentRevocationWatermark: () => Promise<string>;
  readonly diagnostic: (code: "SHADOW_UNAVAILABLE") => void;
}): EntityAccessEvaluator {
  const rollout = parseEntityAuthorizationRollout(options.rollout);
  return {
    async evaluate(input: EntityAccessInput): Promise<EntityAccessDecisionV1> {
      if (input.context.planeKey !== rollout.release.planeKey)
        throw new Error("ENTITY_AUTHORIZATION_PLANE_MISMATCH");
      if (rollout.mode === "legacy") return options.legacy.evaluate(input);
      if (rollout.mode === "enforce") {
        const [current, qualification, watermark] = await Promise.all([
          options.currentRelease(),
          options.verifyQualification(rollout.qualificationRef!),
          options.currentRevocationWatermark(),
        ]);
        if (
          !qualification ||
          !sameEntityAuthorizationRelease(current, rollout.release) ||
          !sameEntityAuthorizationRelease(qualification.release, current) ||
          entityAuthorizationCoverage.some(
            (key) => !qualification.coverage.includes(key),
          ) ||
          qualification.unresolvedDifferences !== 0 ||
          !qualification.grantReviewRef ||
          !qualification.rollbackRef ||
          qualification.revocationWatermark !== watermark ||
          !qualification.companyEntityQualified ||
          !qualification.independentChildQualified
        )
          throw new Error("ENTITY_AUTHORIZATION_ENFORCEMENT_NOT_QUALIFIED");
        return options.target.evaluate(input);
      }
      const legacy = await options.legacy.evaluate(input);
      try {
        if (
          !sameEntityAuthorizationRelease(
            await options.currentRelease(),
            rollout.release,
          )
        )
          throw new Error("Release changed");
        // Shadow is advisory/read-only: never execute target preflight or mutations.
        const target = await options.target.evaluate({
          ...input,
          phase: "discover",
        });
        await options.writeShadow({
          schemaVersion: 1,
          entityCode: rollout.release.entityCode,
          planeKey: rollout.release.planeKey,
          release: rollout.release,
          operationKey: input.operationKey,
          phase: input.phase,
          targetPhase: "discover",
          comparison:
            input.phase === "discover" ? "same_phase" : "discovery_preview",
          legacyState: legacy.state,
          targetState: target.state,
          differs: legacy.state !== target.state,
          requestRef: legacy.decisionRef,
        });
      } catch {
        try {
          options.diagnostic("SHADOW_UNAVAILABLE");
        } catch {
          /* telemetry must not alter the selected legacy decision */
        }
      }
      return legacy;
    },
  };
}
