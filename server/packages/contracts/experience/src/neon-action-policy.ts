/**
 * Published per-action policy metadata (business-context-selector-design.md §6, §10, §11).
 * `scopeKind`/`requiredCoordinates` are derived from the compiler-published
 * `authz.entity_operation_binding`/`entity_operation_scope_binding` tables (via
 * `EffectiveOperationBinding.requiredScopeKinds` on the request's permission
 * snapshot) — never hand-authored, so this can't drift from what the authorizer
 * actually enforces. The remaining fields have no DB-native source today and come
 * from a small static registry (see `neonActionPolicyRegistry` in the experience
 * service package).
 */
export type NeonActionScopeKind = "company" | "organization" | "tenant";
export type NeonActionCoordinate =
  | "legalEntityId"
  | "companyCodeId"
  | "operatingOrganizationId";
export type NeonStandardView =
  | "my_documents"
  | "my_team"
  | "shared_with_me"
  | "delegated_to_me"
  | "all_accessible";

export interface NeonActionPolicyV1 {
  readonly schemaVersion: 1;
  readonly actionPermissionCode: string;
  /** company: Type A (company-driven). organization: Type B (organization-driven, company optional). tenant: Type C (tenant-wide, no LE/company at all). */
  readonly scopeKind: NeonActionScopeKind;
  readonly requiredCoordinates: readonly NeonActionCoordinate[];
  readonly requiredCapability?: string;
  readonly aggregateMode: "unsupported" | "list_only" | "list_and_create";
  readonly defaultStandardView: NeonStandardView;
  readonly supportedBroaderViews: readonly NeonStandardView[];
  /** none: Type A. shared_organization: Type B, organization may serve several LEs. tenant_wide: Type C base identity. */
  readonly crossLegalEntity: "none" | "shared_organization" | "tenant_wide";
  /** Coordinates an unsent draft of this action may still edit (design doc §8). */
  readonly draftContextChanges: readonly NeonActionCoordinate[];
}
