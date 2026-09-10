/** Server-owned routing evidence. No inferred record IDs, raw prompts or permission grants. */
export interface AtlasIntentV1 {
  readonly schemaVersion: 1;
  readonly kind: "read" | "clarify" | "delegate" | "denied";
  readonly strategy: "exact_terms" | "owner_scope" | "authorization" | "model";
  readonly capabilityIds: readonly string[];
  readonly reason: "matched" | "ambiguous" | "missing_scope" | "access_denied" | "unsupported";
}
export const atlasGuidance = Object.freeze({
  ambiguous: "Which section would you like me to read? Name one section and ask again.",
  missing_scope: "Select and apply the required work context on the record, then ask again. No scoped data was read and no absence finding was made.",
  access_denied: "I could not access the requested record or capability with your current permissions. No absence finding was made. If you need access, contact your administrator.",
} as const);
export type AtlasGuidanceCode = keyof typeof atlasGuidance;
export function parseAtlasIntent(value: unknown): AtlasIntentV1 {
  const v = value as AtlasIntentV1;
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !["schemaVersion", "kind", "strategy", "capabilityIds", "reason"].includes(k)) || v.schemaVersion !== 1 ||
    !["read", "clarify", "delegate", "denied"].includes(v.kind) || !["exact_terms", "owner_scope", "authorization", "model"].includes(v.strategy) ||
    !["matched", "ambiguous", "missing_scope", "access_denied", "unsupported"].includes(v.reason) || !Array.isArray(v.capabilityIds) || v.capabilityIds.length > 16 || new Set(v.capabilityIds).size !== v.capabilityIds.length || v.capabilityIds.some(id => typeof id !== "string" || !/^[a-z][a-z0-9_-]{0,127}$/.test(id))) throw new TypeError("Invalid Atlas intent");
  const valid = v.kind === "read" ? v.reason === "matched" && v.strategy === "exact_terms" && v.capabilityIds.length === 1 :
    v.kind === "delegate" ? v.reason === "unsupported" && v.strategy === "model" && !v.capabilityIds.length :
    v.kind === "denied" ? v.reason === "access_denied" && v.strategy === "authorization" && !v.capabilityIds.length :
    v.reason === "ambiguous" ? v.strategy === "exact_terms" && v.capabilityIds.length > 1 : v.reason === "missing_scope" && v.strategy === "owner_scope" && !v.capabilityIds.length;
  if (!valid) throw new TypeError("Inconsistent Atlas intent");
  return Object.freeze({...v, capabilityIds: Object.freeze([...v.capabilityIds])});
}
