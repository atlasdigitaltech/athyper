import type { NeonActionPolicyV1 } from "@athyper/server-contract-experience";

/**
 * Hand-authored half of the published per-action policy: the fields with no
 * DB-native source (`authz.entity_operation_binding` only publishes scope kind and
 * required coordinates). Keyed by `actionPermissionCode`. Extend this only as
 * mutations actually adopt `NeonActionPolicyV1` — do not backfill speculatively.
 */
export type NeonActionPolicyRegistryEntry = Omit<
  NeonActionPolicyV1,
  "schemaVersion" | "actionPermissionCode" | "scopeKind" | "requiredCoordinates"
>;

export const neonActionPolicyRegistry: Readonly<
  Record<string, NeonActionPolicyRegistryEntry>
> = Object.freeze({
  "neon.relationship.entity_case.create": {
    aggregateMode: "unsupported",
    defaultStandardView: "my_documents",
    supportedBroaderViews: [],
    crossLegalEntity: "none",
    draftContextChanges: ["companyCodeId", "operatingOrganizationId"],
  },
});
