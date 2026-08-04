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

export type CompiledEntityPlaneArtifact=CrossPlaneEntityArtifactV1;

interface NormalizedOperation {
  operation_key: string;
  permission_code: string;
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
  plane: OperationScopePlane;
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
  input: EntityPlaneArtifactCompilerInput,
): CompiledEntityPlaneArtifact {
  const operations = array<NormalizedOperation>(input.contract["operations"], "operations");
  const sourceBindings = array<NormalizedScopeBinding>(
    input.contract["operation_scope_bindings"],
    "operation_scope_bindings",
  );
  const bindingsByOperation = new Map<string, NormalizedScopeBinding[]>();
  for (const binding of sourceBindings) {
    if (binding.status !== "active" || binding.target_plane !== input.plane) continue;
    const values = bindingsByOperation.get(binding.operation_key) ?? [];
    values.push(binding);
    bindingsByOperation.set(binding.operation_key, values);
  }

  const blueprints: CompiledOperationScopeBindingBlueprint[] = operations
    .filter((operation) => operation.status === "active")
    .flatMap((operation) => (bindingsByOperation.get(operation.operation_key) ?? []).map((binding) => ({
      targetPlane: input.plane,
      sourceEntityOperationId: stableUuid(`metadata.entity-operation:${input.entityId}:${operation.operation_key}`),
      entityCode: input.entityCode,
      operationKey: operation.operation_key,
      permissionCode: operation.permission_code,
      decisionMode: binding.decision_mode,
      scopeKind: binding.scope_kind,
      coordinateSource: binding.coordinate_source,
      coordinateKey: binding.coordinate_key,
      resolverKey: binding.resolver_key,
      missingValueBehavior: "deny" as const,
    })))
    .sort((left, right) => left.operationKey.localeCompare(right.operationKey)
      || left.scopeKind.localeCompare(right.scopeKind));

  for (const operation of operations.filter((item) => item.status === "active")) {
    if (!bindingsByOperation.has(operation.operation_key)) {
      throw new Error(`entity_plane_artifact.authorization_missing:${input.entityCode}.${operation.operation_key}.${input.plane}`);
    }
  }

  const artifact:CompiledEntityPlaneArtifact={
    artifact_schema_code: "athyper.meta-entity-plane-artifact",
    artifact_schema_version: "1.1",
    plane: input.plane,
    source: {
      entity_id: input.entityId,
      entity_code: input.entityCode,
      release_id: input.releaseId,
      release_hash: input.releaseHash,
      revision_id: input.revisionId,
      revision_hash: input.revisionHash,
      contract_hash: input.contractHash,
    },
    activation_contract:operationScopeActivationContract(input.plane),
    contract: input.contract,
    operation_scope_bindings: blueprints,
  };
  const problems=validateCrossPlaneEntityArtifact(artifact);
  if(problems.length)throw new Error(`entity_plane_artifact.invalid:${problems.join(",")}`);
  return artifact;
}
