import { CompiledQuery, type Kysely } from "kysely";

import {
  validateEntityOperationScopeBinding,
  validateCrossPlaneEntityArtifact,
  type CompiledOperationScopeBindingBlueprint,
  type CrossPlaneEntityArtifactV1,
  type OperationScopePlane,
} from "@athyper/entity-operation-scope-contracts";

type AnyDb = Kysely<Record<string, never>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface OperationScopeArtifactImport {
  targetPlane: OperationScopePlane;
  expectedDatabaseName: string;
  tenantId: string | null;
  appliedReleaseId: string;
  sourceEntityId: string;
  sourceReleaseId: string;
  sourceReleaseHash: string;
  sourceCompiledHash: string;
  actorId: string;
  effectiveFrom: Date;
  bindings: readonly CompiledOperationScopeBindingBlueprint[];
}

export interface OperationScopeArtifactImportResult {
  targetPlane: OperationScopePlane;
  sourceReleaseHash: string;
  sourceCompiledHash: string;
  insertedBindingIds: readonly string[];
  retiredBindingCount: number;
  noOp: boolean;
}

export interface CrossPlaneEntityArtifactImport {
  artifact:CrossPlaneEntityArtifactV1;
  expectedDatabaseName:string;
  tenantId:string|null;
  appliedReleaseId:string;
  sourceCompiledHash:string;
  actorId:string;
  effectiveFrom:Date;
}

export function validateOperationScopeArtifactImport(input: OperationScopeArtifactImport): string[] {
  const problems: string[] = [];
  if (!input.expectedDatabaseName.trim()) problems.push("expected_database_name.required");
  if (!UUID.test(input.actorId)) problems.push("actor_id.invalid");
  if (!UUID.test(input.appliedReleaseId)) problems.push("applied_release_id.invalid");
  if (!UUID.test(input.sourceReleaseId)) problems.push("source_release_id.invalid");
  if (Number.isNaN(input.effectiveFrom.getTime())) problems.push("effective_from.invalid");
  if (input.bindings.length === 0) problems.push("bindings.required");
  const coordinates = new Set<string>();
  const entityCodes = new Set<string>();
  for (const binding of input.bindings) {
    if (binding.targetPlane !== input.targetPlane) problems.push("binding.target_plane_mismatch");
    const coordinate = `${binding.sourceEntityOperationId}:${binding.scopeKind}`;
    if (coordinates.has(coordinate)) problems.push("binding.coordinate_duplicate");
    coordinates.add(coordinate);
    entityCodes.add(binding.entityCode);
    const validation = validateEntityOperationScopeBinding({
      bindingId: binding.sourceEntityOperationId,
      targetPlane: input.targetPlane,
      tenantId: input.tenantId,
      sourceEntityId: input.sourceEntityId,
      sourceEntityOperationId: binding.sourceEntityOperationId,
      sourceReleaseHash: input.sourceReleaseHash,
      sourceCompiledHash: input.sourceCompiledHash,
      entityCode: binding.entityCode,
      operationKey: binding.operationKey,
      permissionCode: binding.permissionCode,
      decisionMode: binding.decisionMode,
      scopeKind: binding.scopeKind,
      coordinateSource: binding.coordinateSource,
      coordinateKey: binding.coordinateKey,
      resolverKey: binding.resolverKey,
      status: "published",
    });
    problems.push(...validation.map((problem) => `binding.${problem}`));
  }
  if (entityCodes.size > 1) problems.push("bindings.mixed_entity_codes");
  return [...new Set(problems)];
}

/** Publication/applier connection only. This stages normalized rows into an
 * existing runtime_meta release; activation remains owned by the atomic local
 * release lifecycle. Runtime application roles have no projection DML grant. */
export class SqlOperationScopeArtifactImporter {
  constructor(private readonly db: AnyDb) {}

  async importArtifact(input:CrossPlaneEntityArtifactImport):Promise<OperationScopeArtifactImportResult>{
    const problems=validateCrossPlaneEntityArtifact(input.artifact);
    if(problems.length)throw new Error(`operation_scope_artifact.envelope_invalid:${problems.join(",")}`);
    if(input.artifact.activation_contract.initialMode!=="shadow"
        ||input.artifact.activation_contract.activeRequires!=="qualified_parity_certificate"
        ||input.artifact.activation_contract.rollbackMode!=="legacy"){
      throw new Error("operation_scope_artifact.activation_contract_unsafe");
    }
    return this.import({targetPlane:input.artifact.plane,expectedDatabaseName:input.expectedDatabaseName,
      appliedReleaseId:input.appliedReleaseId,
      tenantId:input.tenantId,sourceEntityId:input.artifact.source.entity_id,
      sourceReleaseId:input.artifact.source.release_id,
      sourceReleaseHash:input.artifact.source.release_hash,
      sourceCompiledHash:input.sourceCompiledHash,
      actorId:input.actorId,effectiveFrom:input.effectiveFrom,bindings:input.artifact.operation_scope_bindings});
  }

  async import(input: OperationScopeArtifactImport): Promise<OperationScopeArtifactImportResult> {
    const problems = validateOperationScopeArtifactImport(input);
    if (problems.length > 0) throw new Error(`operation_scope_artifact.invalid:${problems.join(",")}`);

    return this.db.transaction().execute(async (trx) => {
      await trx.executeQuery(CompiledQuery.raw(
        "SELECT set_config('app.database_plane',$1,true),set_config('app.current_principal_id',$2,true)",
        [input.targetPlane, input.actorId],
      ));
      const database = await trx.executeQuery<{ database_name: string }>(CompiledQuery.raw(
        "SELECT current_database() AS database_name",
      ));
      if (database.rows[0]?.database_name !== input.expectedDatabaseName) {
        throw new Error("operation_scope_artifact.database_mismatch");
      }

      const existing = await trx.executeQuery<{id:string}>(CompiledQuery.raw(`
        SELECT scope.id::text
          FROM authz.entity_operation_binding operation
          JOIN authz.entity_operation_scope_binding scope
            ON scope.entity_operation_binding_id=operation.id
         WHERE operation.applied_release_id=$1::uuid
         ORDER BY operation.source_entity_operation_id,scope.scope_kind
      `,[input.appliedReleaseId]));
      if (existing.rows.length === input.bindings.length) {
        return {
          targetPlane: input.targetPlane,
          sourceReleaseHash: input.sourceReleaseHash,
          sourceCompiledHash: input.sourceCompiledHash,
          insertedBindingIds: existing.rows.map((row) => row.id),
          retiredBindingCount: 0,
          noOp: true,
        };
      }
      if (existing.rows.length > 0) throw new Error("operation_scope_artifact.release_coordinate_conflict");
      const compiledJson={source:{entity_id:input.sourceEntityId,release_hash:input.sourceReleaseHash},operation_scope_bindings:input.bindings};
      await trx.executeQuery(CompiledQuery.raw(
        "SELECT authz.fn_stage_entity_operation_projection($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::jsonb)",
        [input.appliedReleaseId,input.tenantId,input.targetPlane,input.sourceReleaseId,input.sourceCompiledHash,JSON.stringify(compiledJson)],
      ));
      const inserted = await trx.executeQuery<{id:string}>(CompiledQuery.raw(`
        SELECT scope.id::text FROM authz.entity_operation_binding operation
        JOIN authz.entity_operation_scope_binding scope ON scope.entity_operation_binding_id=operation.id
        WHERE operation.applied_release_id=$1::uuid
        ORDER BY operation.source_entity_operation_id,scope.scope_kind
      `,[input.appliedReleaseId]));
      return {
        targetPlane: input.targetPlane,
        sourceReleaseHash: input.sourceReleaseHash,
        sourceCompiledHash: input.sourceCompiledHash,
        insertedBindingIds:inserted.rows.map((row)=>row.id),
        retiredBindingCount: 0,
        noOp: false,
      };
    });
  }
}
