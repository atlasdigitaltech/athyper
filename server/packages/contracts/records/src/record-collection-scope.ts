import type { RecordCollectionScopeResolution } from "./ports.js";

/** Default tenant-scoped collection access with no additional record constraint. */
export function tenantRecordCollectionScope(): Extract<
  RecordCollectionScopeResolution,
  { readonly status: "ready" }
> {
  return Object.freeze({
    status: "ready",
    authorizationResource: Object.freeze({}),
    constraints: Object.freeze([]),
    labels: Object.freeze([]),
    fingerprintMaterial: Object.freeze({ mode: "tenant" }),
  });
}
