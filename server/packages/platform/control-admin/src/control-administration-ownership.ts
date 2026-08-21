export type ControlAdministrationClass =
  | "platform_catalog"
  | "tenant_override"
  | "tenant_configuration"
  | "reference_lookup";

export type ControlAdministrationResource =
  | "feature_definitions"
  | "subscription_definitions"
  | "usage_metric_catalog"
  | "bank_validation_rules"
  | "parameter_definitions"
  | "connector_types"
  | "feature_overrides"
  | "tenant_parameter_values"
  | "tenant_usage_limit_overrides"
  | "rounding_configuration"
  | "connector_instances"
  | "cycle_templates"
  | "reference_lookups";

export type ControlAdministrationWriteMechanism =
  | "versioned_publication"
  | "tenant_admin_api"
  | "aggregate_service"
  | "row_ownership_scoped";

export interface ControlAdministrationOwnershipEntry {
  readonly resource: ControlAdministrationResource;
  readonly classification: ControlAdministrationClass;
  readonly tables: readonly string[];
  readonly writeMechanism: ControlAdministrationWriteMechanism;
  readonly runtimeRead: true;
  readonly runtimeWrite: "none" | "tenant_scoped" | "aggregate" | "row_owner_scoped";
  readonly safeguards: readonly (
    | "review"
    | "versioning"
    | "occ"
    | "audit"
    | "outbox"
    | "invalidation"
    | "lifecycle"
    | "reference_use_check"
    | "retirement_only"
  )[];
  readonly ownershipRule: string;
}

export interface ControlAdministrationRouteRequest {
  readonly resource: ControlAdministrationResource;
  readonly operation: "read" | "write" | "author";
  /** Studio is the only authority allowed to expose reviewed catalog authoring. */
  readonly planeKey?: "studio" | "neon" | "mesh";
  /** Required for every runtime write that can mutate tenant-owned state. */
  readonly tenantScoped?: boolean;
  /** Required for reference writes; prevents a generic CRUD route from being registered. */
  readonly rowOwnershipResolved?: boolean;
}

/**
 * Approved C1 ownership decision. Keep this table synchronized with the DDL and
 * docs/architecture/control-administration-ownership-matrix.md.
 */
export const controlAdministrationOwnershipDecision = Object.freeze({
  decisionId: "C1",
  status: "approved",
  approvedAt: "2026-08-11",
  genericCrudAllowed: false,
  entries: Object.freeze([
    platform("feature_definitions", ["control.feature_flag_catalog"]),
    platform("subscription_definitions", ["control.module", "control.subscription_plan", "control.subscription_plan_module"]),
    platform("usage_metric_catalog", ["control.usage_metric_catalog", "control.subscription_plan_usage_limit"]),
    platform("bank_validation_rules", ["control.bank_account_validation_rule"]),
    platform("parameter_definitions", ["control.parameter_definition"]),
    platform("connector_types", ["control.connector_type"]),
    tenantOverride("feature_overrides", ["control.feature_flag_override"]),
    tenantOverride("tenant_parameter_values", ["control.tenant_parameter_value"]),
    tenantOverride("tenant_usage_limit_overrides", ["control.tenant_usage_limit_override"]),
    tenantConfiguration("rounding_configuration", ["control.rounding_rule", "control.rounding_context"]),
    tenantConfiguration("connector_instances", ["control.connector_instance", "control.integration_endpoint"]),
    tenantConfiguration("cycle_templates", [
      "control.cycle_type",
      "control.cycle_phase",
      "control.cycle_task_category",
      "control.cycle_task_template",
      "control.cycle_task_dependency",
      "control.cycle_cross_dependency",
      "control.cycle_carryforward_rule",
      "control.cycle_template_revision",
    ]),
    Object.freeze<ControlAdministrationOwnershipEntry>({
      resource: "reference_lookups",
      classification: "reference_lookup",
      tables: Object.freeze(["control.lookup_domain", "control.lookup_value"]),
      writeMechanism: "row_ownership_scoped",
      runtimeRead: true,
      runtimeWrite: "row_owner_scoped",
      safeguards: Object.freeze(["review", "versioning", "occ", "audit", "outbox", "invalidation", "reference_use_check", "retirement_only"] as const),
      ownershipRule: "Domains and values with tenant_id IS NULL are platform-published. Only values in an extensible domain with a non-null tenant_id may be tenant-authored.",
    }),
  ] satisfies readonly ControlAdministrationOwnershipEntry[]),
} as const);

const ownershipByResource = new Map<ControlAdministrationResource, ControlAdministrationOwnershipEntry>(
  controlAdministrationOwnershipDecision.entries.map((entry) => [entry.resource, entry]),
);

/** Returns the single approved owner for a control-administration resource. */
export function controlAdministrationOwnership(resource: ControlAdministrationResource): ControlAdministrationOwnershipEntry {
  const entry = ownershipByResource.get(resource);
  if (!entry) throw policyError("CONTROL_ADMIN_OWNERSHIP_UNCLASSIFIED", resource);
  return entry;
}

/**
 * Fails closed before routes are registered. This is intentionally stricter
 * than request authorization: it prevents an invalid HTTP surface from
 * existing at all.
 */
export function assertApprovedControlAdministrationRoute(request: ControlAdministrationRouteRequest): ControlAdministrationOwnershipEntry {
  if (controlAdministrationOwnershipDecision.status !== "approved") throw policyError("CONTROL_ADMIN_OWNERSHIP_NOT_APPROVED", request.resource);
  const entry = controlAdministrationOwnership(request.resource);
  if (request.operation === "read") return entry;
  if (request.operation === "author") {
    if (entry.classification !== "platform_catalog") throw policyError("CONTROL_ADMIN_CATALOG_AUTHORING_CLASSIFICATION_REQUIRED", request.resource);
    if (request.planeKey !== "studio") throw policyError("CONTROL_ADMIN_CATALOG_AUTHORING_STUDIO_REQUIRED", request.resource);
    return entry;
  }
  if (entry.runtimeWrite === "none") throw policyError("CONTROL_ADMIN_PLATFORM_CATALOG_WRITE_ROUTE_FORBIDDEN", request.resource);
  if (entry.runtimeWrite === "row_owner_scoped" && !request.rowOwnershipResolved) throw policyError("CONTROL_ADMIN_GENERIC_REFERENCE_WRITE_ROUTE_FORBIDDEN", request.resource);
  if (!request.tenantScoped) throw policyError("CONTROL_ADMIN_TENANT_SCOPE_REQUIRED", request.resource);
  return entry;
}

function platform(resource: ControlAdministrationResource, tables: readonly string[]): ControlAdministrationOwnershipEntry {
  return Object.freeze<ControlAdministrationOwnershipEntry>({ resource, classification: "platform_catalog", tables: Object.freeze([...tables]), writeMechanism: "versioned_publication", runtimeRead: true, runtimeWrite: "none", safeguards: Object.freeze(["review", "versioning"] as const), ownershipRule: "Platform-owned desired state is reviewed, versioned, and published to plane-local read models." });
}

function tenantOverride(resource: ControlAdministrationResource, tables: readonly string[]): ControlAdministrationOwnershipEntry {
  return Object.freeze<ControlAdministrationOwnershipEntry>({ resource, classification: "tenant_override", tables: Object.freeze([...tables]), writeMechanism: "tenant_admin_api", runtimeRead: true, runtimeWrite: "tenant_scoped", safeguards: Object.freeze(["occ", "audit", "outbox", "invalidation"] as const), ownershipRule: "Every row is owned by the exact authenticated tenant and may be mutated only through a governed admin command." });
}

function tenantConfiguration(resource: ControlAdministrationResource, tables: readonly string[]): ControlAdministrationOwnershipEntry {
  return Object.freeze<ControlAdministrationOwnershipEntry>({ resource, classification: "tenant_configuration", tables: Object.freeze([...tables]), writeMechanism: "aggregate_service", runtimeRead: true, runtimeWrite: "aggregate", safeguards: Object.freeze(["versioning", "occ", "audit", "outbox", "invalidation", "lifecycle"] as const), ownershipRule: "The complete tenant aggregate is changed through its lifecycle service; child tables are never independently exposed." });
}

function policyError(code: string, resource: ControlAdministrationResource): Error {
  return Object.assign(new Error(`${code}: ${resource}`), { code, resource });
}
