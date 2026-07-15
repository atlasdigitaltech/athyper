import type { CanonicalEntity } from "./canonical-metadata-graph.js";

export interface ExecutionEligibilityDiagnostic {
  entityCode: string;
  path: string;
  message: string;
}

export interface ExecutionEligibilityResult {
  eligible: boolean;
  diagnostics: ExecutionEligibilityDiagnostic[];
}

/**
 * The only admission gate for the API compiler. Catalog registration is not
 * enough: execution requires an explicit runtime contract and a descriptor-
 * compatible storage identity.
 */
export function evaluateExecutionEligibility(entity: CanonicalEntity): ExecutionEligibilityResult {
  const diagnostics: ExecutionEligibilityDiagnostic[] = [];
  const error = (path: string, message: string) => diagnostics.push({ entityCode: entity.entity_code, path, message });
  if (!entity.runtime_enabled || !entity.is_active || entity.status !== "ACTIVE") error("runtime_enabled", "Entity is not active and explicitly runtime-enabled.");
  if (!entity.effective_version || entity.effective_version_count !== 1) error("effective_version", "Exactly one EFFECTIVE platform version is required.");
  if (!entity.primary_key) error("primary_key", "Runtime entities require an explicit scalar primary_key.");
  if (entity.physical_primary_key.length !== 1 || entity.physical_primary_key[0] !== entity.primary_key) error("primary_key", "primary_key must match the physical scalar primary key.");
  if (entity.tenant_column && !entity.physical_columns.includes(entity.tenant_column)) error("tenant_column", `Tenant column '${entity.tenant_column}' is not physical.`);
  if (!["table", "view", "materialized_view"].includes(entity.backing_type)) error("backing_type", `Backing type '${entity.backing_type}' is not execution-compatible.`);
  if (entity.read_capability === "none") error("read_capability", "Runtime entity must explicitly allow reads.");
  if (entity.write_capability === "facade" && !entity.operations.some((operation) => operation.execution_target || operation.handler_target)) error("write_capability", "Facade entity has no execution handler.");
  if (entity.backing_type !== "table" && entity.write_capability === "generic") error("write_capability", "Generic writes require a table-backed entity.");
  if (entity.write_capability === "append_only" && entity.mutability !== "append_only" && entity.mutability !== "append-only") error("write_capability", "Append-only capability requires append-only mutability.");
  if (entity.physical_primary_key.length > 1) error("primary_key", "Composite primary keys are not supported by the execution descriptor.");
  return { eligible: diagnostics.length === 0, diagnostics };
}
