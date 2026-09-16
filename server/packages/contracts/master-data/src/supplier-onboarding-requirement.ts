/** Requester assertion of governance depth, never a verified compliance result. */
export const supplierComplianceLevels = [
  "basic",
  "standard",
  "enhanced",
] as const;
export type SupplierComplianceLevel = (typeof supplierComplianceLevels)[number];
export interface SupplierOnboardingRequirement {
  readonly requestedComplianceLevel?: SupplierComplianceLevel;
  readonly complianceRequirementReason?: string;
}

/** These snapshot fields share the existing scoped requester's operation authority. */
export const supplierRequirementFieldContract = Object.freeze({
  fields: ["requestedComplianceLevel", "complianceRequirementReason"] as const,
  createPermission: "neon.relationship.entity_case.create",
  updatePermission: "neon.relationship.entity_case.update",
  readPermission: "neon.relationship.entity_case.read",
  allowedLevels: supplierComplianceLevels,
  reasonMaxLength: 2000,
});
