import { PublicationContractError } from "./errors.js";
import { resolveCapabilityProfileDefaults } from "./capability-profile.js";
import type { EntityCapabilityAuthoringMember } from "./entity-capabilities.js";
import {
  activityPolicyActions,
  parseActivityPolicy,
  qualifyActivityPolicy,
} from "./activity-policy.js";

/** Source preparation only; executable Meta Entity publication remains separately gated. */
export function prepareActivityEnrollment(
  source: unknown,
  lookup: (code: string, version: number) => unknown,
  support: Parameters<typeof qualifyActivityPolicy>[1],
) {
  if (!source || typeof source !== "object" || Array.isArray(source)) invalid();
  const value = source as Record<string, unknown>;
  if (
    value.schema !== "athyper.entity-activity-source/1" ||
    !Object.hasOwn(value, "profile") ||
    Object.keys(value).some(
      (key) => !["schema", "profile", "overrides"].includes(key),
    )
  )
    invalid();
  const resolved = resolveCapabilityProfileDefaults(
    {
      capabilityKey: "activity",
      declaration: { enabled: true },
      profile: value.profile,
      ...(Object.hasOwn(value, "overrides")
        ? { overrides: value.overrides }
        : {}),
    },
    lookup,
  );
  const policy = parseActivityPolicy(resolved.defaults);
  qualifyActivityPolicy(policy, support);
  const actions = activityPolicyActions(policy);
  return {
    profile: resolved.profile,
    policy,
    actions,
    requiredPermissions: [
      ...new Set(actions.map((action) => action.permissionCode)),
    ].sort(),
  };
}

function invalid(): never {
  throw new PublicationContractError(
    "ENTITY_CAPABILITY_INVALID",
    "activity enrollment: invalid source",
  );
}

/** Canonical Meta Entity member. The reviewed profile snapshot participates in
 * the contract hash; compilation does not resolve mutable source files. */
export function prepareActivityCapabilityMember(
  entityCode: string,
  source: unknown,
  lookup: (code: string, version: number) => unknown,
  support: Parameters<typeof qualifyActivityPolicy>[1],
): EntityCapabilityAuthoringMember {
  const resolved = prepareActivityEnrollment(source, lookup, support);
  const overrides = (source as Record<string, unknown>).overrides;
  return {
    capabilityKey: "activity",
    declaration: { enabled: true, serviceKey: "platform.activity.v1", ownerEntityCode: entityCode, load: "lazy", includeInAggregateData: false },
    profile: { code: resolved.profile.profileCode, version: resolved.profile.profileVersion },
    profileDefinition: resolved.profile,
    ...(overrides === undefined ? {} : { overrides: structuredClone(overrides as Record<string, unknown>) }),
  };
}
