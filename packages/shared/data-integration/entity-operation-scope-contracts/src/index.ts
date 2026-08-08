export type OperationScopePlane = "athyper" | "neon" | "mesh";
export type OperationDecisionMode = "entity_resource" | "collection";
export type OperationScopeKind =
  | "tenant"
  | "workspace"
  | "module"
  | "company_code"
  | "legal_entity"
  | "operating_organization"
  | "network_account"
  | "network_relationship"
  | "resource";
export type ScopeCoordinateSource =
  | "tenant_context"
  | "request_field"
  | "record_field"
  | "collection_field"
  | "relation_resolver";
export type OperationScopeBindingStatus = "draft" | "published" | "retired";
export type OperationPermissionKind = "entity_operation" | "capability";

export interface EntityOperationScopeBindingContract {
  bindingId: string;
  targetPlane: OperationScopePlane;
  tenantId: string | null;
  sourceEntityId: string;
  sourceEntityOperationId: string;
  sourceReleaseHash: string;
  sourceCompiledHash: string;
  entityCode: string;
  operationKey: string;
  permissionCode: string;
  permissionKind?: OperationPermissionKind;
  decisionMode: OperationDecisionMode;
  scopeKind: OperationScopeKind;
  coordinateSource: ScopeCoordinateSource;
  coordinateKey: string | null;
  resolverKey: string | null;
  status: OperationScopeBindingStatus;
}

/**
 * Portable compiler output embedded in an immutable plane artifact. Database
 * IDs and artifact hashes are attached by the consumer-plane importer because
 * an artifact cannot contain its own hash.
 */
export interface CompiledOperationScopeBindingBlueprint {
  targetPlane: OperationScopePlane;
  sourceEntityOperationId: string;
  entityCode: string;
  operationKey: string;
  permissionCode: string;
  permissionKind?: OperationPermissionKind;
  decisionMode: OperationDecisionMode;
  scopeKind: OperationScopeKind;
  coordinateSource: ScopeCoordinateSource;
  coordinateKey: string | null;
  resolverKey: string | null;
}

export interface CrossPlaneArtifactActivationContractV1 {
  contractCode:"athyper.operation-scope-activation";
  contractVersion:"1.0";
  targetPlane:OperationScopePlane;
  coordinateBinding:"exact_release_artifact";
  initialMode:"shadow";
  missingOperationBehavior:"legacy";
  activeRequires:"qualified_parity_certificate";
  rollbackMode:"legacy";
  retirementRequires:"full_manifest_coverage";
}

export interface CrossPlaneEntityArtifactV1 {
  artifact_schema_code:"athyper.meta-entity-plane-artifact";
  artifact_schema_version:"1.1";
  plane:OperationScopePlane;
  source:{
    entity_id:string;entity_code:string;release_id:string;release_hash:string;
    revision_id:string;revision_hash:string;contract_hash:string;
  };
  activation_contract:CrossPlaneArtifactActivationContractV1;
  contract:Readonly<Record<string,unknown>>;
  operation_scope_bindings:readonly CompiledOperationScopeBindingBlueprint[];
}

export function operationScopeActivationContract(plane:OperationScopePlane):CrossPlaneArtifactActivationContractV1{return {
  contractCode:"athyper.operation-scope-activation",contractVersion:"1.0",targetPlane:plane,
  coordinateBinding:"exact_release_artifact",initialMode:"shadow",missingOperationBehavior:"legacy",
  activeRequires:"qualified_parity_certificate",rollbackMode:"legacy",retirementRequires:"full_manifest_coverage",
}}

export function validateCrossPlaneEntityArtifact(artifact:CrossPlaneEntityArtifactV1):string[]{
  const problems:string[]=[];
  if(artifact.artifact_schema_code!=="athyper.meta-entity-plane-artifact")problems.push("artifact_schema_code.unsupported");
  if(artifact.artifact_schema_version!=="1.1")problems.push("artifact_schema_version.unsupported");
  for(const [name,value] of [["source.entity_id",artifact.source.entity_id],["source.release_id",artifact.source.release_id],["source.revision_id",artifact.source.revision_id]] as const)if(!UUID.test(value))problems.push(`${name}.invalid`);
  for(const [name,value] of [["source.release_hash",artifact.source.release_hash],["source.revision_hash",artifact.source.revision_hash],["source.contract_hash",artifact.source.contract_hash]] as const)if(!HASH.test(value))problems.push(`${name}.invalid`);
  if(!ENTITY_CODE.test(artifact.source.entity_code))problems.push("source.entity_code.invalid");
  if(!artifact.contract||Array.isArray(artifact.contract)||typeof artifact.contract!=="object")problems.push("contract.object_required");
  const expected=operationScopeActivationContract(artifact.plane);
  for(const key of Object.keys(expected) as Array<keyof CrossPlaneArtifactActivationContractV1>)if(artifact.activation_contract[key]!==expected[key])problems.push(`activation_contract.${key}.invalid`);
  const coordinates=new Set<string>();
  for(const binding of artifact.operation_scope_bindings){
    if(binding.targetPlane!==artifact.plane)problems.push("binding.target_plane_mismatch");
    if(binding.entityCode!==artifact.source.entity_code)problems.push("binding.entity_code_mismatch");
    const coordinate=`${binding.sourceEntityOperationId}:${binding.scopeKind}`;if(coordinates.has(coordinate))problems.push("binding.coordinate_duplicate");coordinates.add(coordinate);
    problems.push(...validateEntityOperationScopeBinding({bindingId:binding.sourceEntityOperationId,targetPlane:artifact.plane,tenantId:null,sourceEntityId:artifact.source.entity_id,sourceEntityOperationId:binding.sourceEntityOperationId,sourceReleaseHash:artifact.source.release_hash,sourceCompiledHash:"0".repeat(64),entityCode:binding.entityCode,operationKey:binding.operationKey,permissionCode:binding.permissionCode,decisionMode:binding.decisionMode,scopeKind:binding.scopeKind,coordinateSource:binding.coordinateSource,coordinateKey:binding.coordinateKey,resolverKey:binding.resolverKey,status:"draft"}).map(problem=>`binding.${problem}`));
  }
  return [...new Set(problems)];
}

export interface OperationScopeCompilationInput {
  targetPlane: OperationScopePlane;
  entityCode: string;
  operations: readonly {
    id: string;
    operation_code: string;
    permission_code: string;
    enabled: boolean;
    plane_filter: readonly (OperationScopePlane | "admin")[] | null;
    authorization?: {
      decision_mode: OperationDecisionMode;
      bindings: readonly {
        scope_kind: OperationScopeKind;
        coordinate_source: ScopeCoordinateSource;
        coordinate_key: string | null;
        resolver_key: string | null;
      }[];
    } | null;
  }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;
const ENTITY_CODE = /^[a-z][a-z0-9_.-]{1,126}$/u;
const OPERATION_KEY = /^[a-z][a-z0-9_.-]{1,126}$/u;
const PERMISSION_CODE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/u;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,126}$/u;
const RESOLVER_KEY = /^[a-z][a-z0-9_.:-]{1,126}$/u;

export function validateEntityOperationScopeBinding(binding: EntityOperationScopeBindingContract): string[] {
  const problems: string[] = [];
  for (const [name, value] of [
    ["binding_id", binding.bindingId], ["source_entity_id", binding.sourceEntityId],
    ["source_entity_operation_id", binding.sourceEntityOperationId],
  ] as const) if (!UUID.test(value)) problems.push(`${name}.invalid`);
  if (binding.tenantId !== null && !UUID.test(binding.tenantId)) problems.push("tenant_id.invalid");
  if (!HASH.test(binding.sourceReleaseHash)) problems.push("source_release_hash.invalid");
  if (!HASH.test(binding.sourceCompiledHash)) problems.push("source_compiled_hash.invalid");
  if (!ENTITY_CODE.test(binding.entityCode)) problems.push("entity_code.invalid");
  if (!OPERATION_KEY.test(binding.operationKey)) problems.push("operation_key.invalid");
  if (!PERMISSION_CODE.test(binding.permissionCode)) problems.push("permission_code.invalid");
  if (binding.permissionKind !== undefined && !["entity_operation", "capability"].includes(binding.permissionKind)) {
    problems.push("permission_kind.invalid");
  }

  const fieldSource = ["request_field", "record_field", "collection_field"].includes(binding.coordinateSource);
  if (fieldSource !== Boolean(binding.coordinateKey)) problems.push("coordinate_key.source_mismatch");
  if (binding.coordinateKey && !FIELD_KEY.test(binding.coordinateKey)) problems.push("coordinate_key.invalid");
  if ((binding.coordinateSource === "relation_resolver") !== Boolean(binding.resolverKey)) problems.push("resolver_key.source_mismatch");
  if (binding.resolverKey && !RESOLVER_KEY.test(binding.resolverKey)) problems.push("resolver_key.invalid");
  if (binding.scopeKind === "tenant" && binding.coordinateSource !== "tenant_context") problems.push("tenant_scope.context_required");
  if (binding.scopeKind !== "tenant" && binding.coordinateSource === "tenant_context") problems.push("non_tenant_scope.coordinate_required");
  if (binding.decisionMode === "collection" && ["request_field", "record_field"].includes(binding.coordinateSource)) problems.push("collection.coordinate_source_invalid");
  if (binding.decisionMode === "entity_resource" && binding.coordinateSource === "collection_field") problems.push("entity_resource.collection_field_invalid");
  return [...new Set(problems)];
}

export function compileOperationScopeBindingBlueprints(
  input: OperationScopeCompilationInput,
): CompiledOperationScopeBindingBlueprint[] {
  const blueprints: CompiledOperationScopeBindingBlueprint[] = [];
  for (const operation of input.operations) {
    if (!operation.enabled) continue;
    if (operation.plane_filter
        && !operation.plane_filter.includes(input.targetPlane)
        && !(input.targetPlane === "athyper" && operation.plane_filter.includes("admin"))) continue;
    if (!operation.authorization) continue;
    for (const binding of operation.authorization.bindings) {
      const blueprint: CompiledOperationScopeBindingBlueprint = {
        targetPlane: input.targetPlane,
        sourceEntityOperationId: operation.id,
        entityCode: input.entityCode,
        operationKey: operation.operation_code,
        permissionCode: operation.permission_code,
        decisionMode: operation.authorization.decision_mode,
        scopeKind: binding.scope_kind,
        coordinateSource: binding.coordinate_source,
        coordinateKey: binding.coordinate_key,
        resolverKey: binding.resolver_key,
      };
      const problems = validateEntityOperationScopeBinding({
        bindingId: operation.id,
        targetPlane: input.targetPlane,
        tenantId: null,
        sourceEntityId: operation.id,
        sourceEntityOperationId: operation.id,
        sourceReleaseHash: "0".repeat(64),
        sourceCompiledHash: "0".repeat(64),
        entityCode: blueprint.entityCode,
        operationKey: blueprint.operationKey,
        permissionCode: blueprint.permissionCode,
        decisionMode: blueprint.decisionMode,
        scopeKind: blueprint.scopeKind,
        coordinateSource: blueprint.coordinateSource,
        coordinateKey: blueprint.coordinateKey,
        resolverKey: blueprint.resolverKey,
        status: "draft",
      });
      if (problems.length > 0) {
        throw new Error(`Operation scope binding ${input.entityCode}.${operation.operation_code} is invalid: ${problems.join(", ")}`);
      }
      blueprints.push(blueprint);
    }
  }
  return blueprints.sort((left, right) =>
    left.operationKey.localeCompare(right.operationKey)
      || left.scopeKind.localeCompare(right.scopeKind));
}
