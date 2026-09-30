import { isDeepStrictEqual } from "node:util";
import { capabilityArtifactMembers, parseCapabilityProfile, type CapabilityProfile } from "@athyper/server-contract-publication";
import type { MetaEntityGraph, MetaEntityCapability } from "@athyper/server-contract-meta-entity-authoring";

/** Draft-only enrollment. Refuse any effective behavior change, including defaults. */
export function adoptCapabilityProfiles(graph: MetaEntityGraph, lookup: (code: string, version: number) => CapabilityProfile): MetaEntityGraph {
  const before = capabilityArtifactMembers(graph.entity.entityCode, graph.capabilities ?? []);
  const capabilities = (graph.capabilities ?? []).map((member): MetaEntityCapability => {
    if (!member.declaration.enabled || member.profile) return structuredClone(member);
    const definition = parseCapabilityProfile(lookup(member.capabilityKey === "activity" ? "platform.activity.standard" : `platform.collaboration.${member.capabilityKey}.standard`, 1));
    const binding = member.binding as unknown as Record<string, unknown>;
    const overrides: Record<string, unknown> = {};
    const compare = (defaults: Readonly<Record<string, unknown>>, current: Record<string, unknown>, output: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(defaults)) {
        if (isDeepStrictEqual(value, current[key])) continue;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) throw Error("CAPABILITY_PROFILE_ENROLLMENT_MISMATCH");
          const nested: Record<string, unknown> = {};
          compare(value as Record<string, unknown>, current[key] as Record<string, unknown>, nested);
          if (Object.keys(nested).length) output[key] = nested;
        } else output[key] = structuredClone(current[key]);
      }
    };
    compare(definition.defaults, binding, overrides);
    return { ...(member.id ? { id: member.id } : {}), capabilityKey: member.capabilityKey,
      declaration: structuredClone(member.declaration), profile: { code: definition.profileCode, version: definition.profileVersion },
      profileDefinition: definition, overrides };
  });
  const after = capabilityArtifactMembers(graph.entity.entityCode, capabilities);
  if (!isDeepStrictEqual(before, after)) throw Error("CAPABILITY_PROFILE_ENROLLMENT_BEHAVIOR_CHANGED");
  return { ...structuredClone(graph), capabilities };
}
