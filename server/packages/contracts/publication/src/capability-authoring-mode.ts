import { PublicationContractError } from "./errors.js";

export type CapabilityAuthoringMode = "disabled" | "explicit" | "profile";

/** Source-only shape guard. Never apply to resolved compiled bindings. */
export function capabilityAuthoringMode(value: unknown, path: string): CapabilityAuthoringMode {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PublicationContractError("ENTITY_CAPABILITY_INVALID", `${path}: capability member must be an object`);
  const member = value as Record<string, unknown>;
  const declaration = member.declaration;
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)
      || typeof (declaration as Record<string, unknown>).enabled !== "boolean")
    throw new PublicationContractError("ENTITY_CAPABILITY_INVALID", `${path}: declaration.enabled must be boolean`);
  const binding = Object.hasOwn(member, "binding");
  const profile = Object.hasOwn(member, "profile");
  const overrides = Object.hasOwn(member, "overrides");
  const snapshot = Object.hasOwn(member, "profileDefinition");
  const enabled = (declaration as Record<string, unknown>).enabled;
  if ((!enabled && (binding || profile || overrides || snapshot))
      || (enabled && (binding === profile || ((overrides || snapshot) && !profile))))
    throw new PublicationContractError("CAPABILITY_AUTHORING_MODE_CONFLICT",
      `${path}: expected disabled declaration only, enabled declaration with binding, or enabled declaration with profile and optional overrides`);
  return !enabled ? "disabled" : profile ? "profile" : "explicit";
}
