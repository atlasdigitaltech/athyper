import { createHash } from "node:crypto";
import {
  operationScopeActivationContract,
  validateCrossPlaneEntityArtifact,
  type CompiledOperationScopeBindingBlueprint,
  type CrossPlaneEntityArtifactV1,
  type OperationScopePlane,
  type OperationScopeKind as ScopeKind,
  type ScopeCoordinateSource as CoordinateSource,
} from "@athyper/entity-operation-scope-contracts";

export type CompiledEntityPlaneArtifact=CompiledEntityArtifact;

export interface AthyperEntityPreviewArtifactV1 {
  artifact_schema_code: "athyper.meta-entity-admin-preview";
  artifact_schema_version: "1.0";
  plane: "athyper";
  source: CrossPlaneEntityArtifactV1["source"];
  activation_contract: {
    contractCode: "athyper.admin-preview-activation";
    contractVersion: "1.0";
    targetPlane: "athyper";
    coordinateBinding: "exact_release_artifact";
    activeRequires: "verified_signature";
    rollbackMode: "previous_verified_release";
  };
  contract: Readonly<Record<string, unknown>>;
  operation_scope_bindings: readonly [];
}

export type CompiledEntityArtifact = CrossPlaneEntityArtifactV1 | AthyperEntityPreviewArtifactV1;

interface NormalizedOperation {
  operation_key: string;
  permission_code?: string;
  status: "active" | "deprecated";
}

interface NormalizedOperationPermission {
  operation_key: string;
  target_plane: OperationScopePlane;
  permission_code: string;
  permission_kind: "entity_operation" | "capability";
  status: "active" | "deprecated";
}

interface NormalizedScopeBinding {
  operation_key: string;
  target_plane: OperationScopePlane;
  decision_mode: "entity_resource" | "collection";
  scope_kind: ScopeKind;
  coordinate_source: CoordinateSource;
  coordinate_key: string | null;
  resolver_key: string | null;
  missing_value_behavior: "deny";
  status: "active" | "deprecated";
}

export interface EntityPlaneArtifactCompilerInput {
  plane: OperationScopePlane | "athyper";
  entityId: string;
  entityCode: string;
  releaseId: string;
  releaseHash: string;
  revisionId: string;
  revisionHash: string;
  contractHash: string;
  contract: Readonly<Record<string, unknown>>;
}

function stableUuid(coordinate: string): string {
  const hex = createHash("sha256").update(coordinate).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function array<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw new Error(`entity_plane_artifact.${name}_required`);
  return value as T[];
}

export function compileEntityPlaneArtifact(
  input: EntityPlaneArtifactCompilerInput & { plane: "athyper" },
): AthyperEntityPreviewArtifactV1;
export function compileEntityPlaneArtifact(
  input: EntityPlaneArtifactCompilerInput & { plane: OperationScopePlane },
): CrossPlaneEntityArtifactV1;
export function compileEntityPlaneArtifact(
  input: EntityPlaneArtifactCompilerInput,
): CompiledEntityArtifact {
  const source = {
    entity_id: input.entityId,
    entity_code: input.entityCode,
    release_id: input.releaseId,
    release_hash: input.releaseHash,
    revision_id: input.revisionId,
    revision_hash: input.revisionHash,
    contract_hash: input.contractHash,
  };
  if (input.plane === "athyper") {
    return {
      artifact_schema_code: "athyper.meta-entity-admin-preview",
      artifact_schema_version: "1.0",
      plane: "athyper",
      source,
      activation_contract: {
        contractCode: "athyper.admin-preview-activation",
        contractVersion: "1.0",
        targetPlane: "athyper",
        coordinateBinding: "exact_release_artifact",
        activeRequires: "verified_signature",
        rollbackMode: "previous_verified_release",
      },
      contract: input.contract,
      operation_scope_bindings: [],
    };
  }
  const plane: OperationScopePlane = input.plane;
  const operations = array<NormalizedOperation>(input.contract["operations"], "operations");
  const operationPermissions = Array.isArray(input.contract["operation_permissions"])
    ? input.contract["operation_permissions"] as NormalizedOperationPermission[]
    : [];
  const permissionByOperation = new Map(
    operationPermissions
      .filter((binding) => binding.status === "active" && binding.target_plane === plane)
      .map((binding) => [binding.operation_key, binding] as const),
  );
  const sourceBindings = array<NormalizedScopeBinding>(
    input.contract["operation_scope_bindings"],
    "operation_scope_bindings",
  );
  const bindingsByOperation = new Map<string, NormalizedScopeBinding[]>();
  for (const binding of sourceBindings) {
    if (binding.status !== "active" || binding.target_plane !== plane) continue;
    const values = bindingsByOperation.get(binding.operation_key) ?? [];
    values.push(binding);
    bindingsByOperation.set(binding.operation_key, values);
  }

  const blueprints: CompiledOperationScopeBindingBlueprint[] = operations
    .filter((operation) => operation.status === "active")
    .flatMap((operation) => {
      const permissionCode = permissionByOperation.get(operation.operation_key)?.permission_code
        ?? operation.permission_code;
      if (!permissionCode) {
        throw new Error(`entity_plane_artifact.permission_missing:${input.entityCode}.${operation.operation_key}.${plane}`);
      }
      return (bindingsByOperation.get(operation.operation_key) ?? []).map((binding) => ({
      targetPlane: plane,
      sourceEntityOperationId: stableUuid(`metadata.entity-operation:${input.entityId}:${operation.operation_key}`),
      entityCode: input.entityCode,
      operationKey: operation.operation_key,
      permissionCode,
      permissionKind: permissionByOperation.get(operation.operation_key)?.permission_kind ?? "entity_operation",
      decisionMode: binding.decision_mode,
      scopeKind: binding.scope_kind,
      coordinateSource: binding.coordinate_source,
      coordinateKey: binding.coordinate_key,
      resolverKey: binding.resolver_key,
      }));
    })
    .sort((left, right) => left.operationKey.localeCompare(right.operationKey)
      || left.scopeKind.localeCompare(right.scopeKind));

  for (const operation of operations.filter((item) => item.status === "active")) {
    if (!bindingsByOperation.has(operation.operation_key)) {
      throw new Error(`entity_plane_artifact.authorization_missing:${input.entityCode}.${operation.operation_key}.${plane}`);
    }
  }

  const artifact:CompiledEntityPlaneArtifact={
    artifact_schema_code: "athyper.meta-entity-plane-artifact",
    artifact_schema_version: "1.1",
    plane,
    source,
    activation_contract:operationScopeActivationContract(plane),
    contract: input.contract,
    operation_scope_bindings: blueprints,
  };
  const problems=validateCrossPlaneEntityArtifact(artifact);
  if(problems.length)throw new Error(`entity_plane_artifact.invalid:${problems.join(",")}`);
  return artifact;
}
