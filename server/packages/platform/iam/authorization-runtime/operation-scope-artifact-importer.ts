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
  sourceEntityId: string;
  sourceReleaseId: string;
  sourceReleaseHash: string;
  sourceCompiledArtifactId: string;
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
  sourceCompiledArtifactId:string;
  sourceCompiledHash:string;
  actorId:string;
  effectiveFrom:Date;
}

interface ResolvedPermissionRow {
  id: string;
  canonical_code: string;
}

interface ExistingBindingRow {
  id: string;
  source_entity_operation_id: string;
  source_compiled_hash: string;
  permission_code: string;
  decision_mode: string;
  scope_kind: string;
}

export function validateOperationScopeArtifactImport(input: OperationScopeArtifactImport): string[] {
  const problems: string[] = [];
  if (!input.expectedDatabaseName.trim()) problems.push("expected_database_name.required");
  if (!UUID.test(input.actorId)) problems.push("actor_id.invalid");
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
      sourceReleaseId: input.sourceReleaseId,
      sourceReleaseHash: input.sourceReleaseHash,
      sourceCompiledArtifactId: input.sourceCompiledArtifactId,
      sourceCompiledHash: input.sourceCompiledHash,
      entityCode: binding.entityCode,
      operationKey: binding.operationKey,
      permissionCode: binding.permissionCode,
      decisionMode: binding.decisionMode,
      scopeKind: binding.scopeKind,
      coordinateSource: binding.coordinateSource,
      coordinateKey: binding.coordinateKey,
      resolverKey: binding.resolverKey,
      missingValueBehavior: binding.missingValueBehavior,
      status: "published",
    });
    problems.push(...validation.map((problem) => `binding.${problem}`));
  }
  if (entityCodes.size > 1) problems.push("bindings.mixed_entity_codes");
  return [...new Set(problems)];
}

/** Compiler/admin connection only. Runtime application roles have no DML grant
 * on authz.entity_operation_scope_binding. */
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
      tenantId:input.tenantId,sourceEntityId:input.artifact.source.entity_id,
      sourceReleaseId:input.artifact.source.release_id,sourceReleaseHash:input.artifact.source.release_hash,
      sourceCompiledArtifactId:input.sourceCompiledArtifactId,sourceCompiledHash:input.sourceCompiledHash,
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

      const permissionCodes = [...new Set(input.bindings.map((binding) => binding.permissionCode))];
      const permissions = await trx.executeQuery<ResolvedPermissionRow>(CompiledQuery.raw(`
        SELECT id::text,canonical_code
          FROM authz.permission
         WHERE canonical_code=ANY($1::text[])
           AND permission_kind='entity_operation' AND status='published'
      `, [permissionCodes]));
      const permissionByCode = new Map(permissions.rows.map((row) => [row.canonical_code, row.id]));
      const missing = permissionCodes.filter((code) => !permissionByCode.has(code));
      if (missing.length > 0) {
        throw new Error(`operation_scope_artifact.permission_unresolved:${missing.sort().join(",")}`);
      }

      const existing = await trx.executeQuery<ExistingBindingRow>(CompiledQuery.raw(`
        SELECT binding.id::text,binding.source_entity_operation_id::text,
               binding.source_compiled_hash,permission.canonical_code AS permission_code,
               binding.decision_mode::text,binding.scope_kind::text
          FROM authz.entity_operation_scope_binding binding
          JOIN authz.permission permission ON permission.id=binding.permission_id
         WHERE binding.tenant_id IS NOT DISTINCT FROM $1::uuid
           AND binding.plane_code=$2 AND binding.source_entity_id=$3::uuid
           AND binding.source_release_hash=$4 AND binding.status='published'
         ORDER BY binding.source_entity_operation_id,binding.scope_kind
      `, [input.tenantId, input.targetPlane, input.sourceEntityId, input.sourceReleaseHash]));
      if (samePublishedBindingSet(existing.rows, input.bindings, input.sourceCompiledHash)) {
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

      const operationIds = input.bindings.map((binding) => binding.sourceEntityOperationId);
      const scopeKinds = input.bindings.map((binding) => binding.scopeKind);
      const clock = await trx.executeQuery<{ applied_at: Date }>(CompiledQuery.raw(
        "SELECT statement_timestamp() AS applied_at",
      ));
      const appliedAt = clock.rows[0]!.applied_at;
      if (input.effectiveFrom.getTime() > appliedAt.getTime()) {
        throw new Error("operation_scope_artifact.future_activation_not_supported");
      }
      const retired = await trx.executeQuery(CompiledQuery.raw(`
        UPDATE authz.entity_operation_scope_binding existing
           SET status='retired',effective_until=$4::timestamptz,
               retired_at=$4::timestamptz,retired_by=$5::uuid,updated_by=$5::uuid
         WHERE existing.tenant_id IS NOT DISTINCT FROM $1::uuid
           AND existing.plane_code=$2 AND existing.source_entity_id=$3::uuid
           AND existing.status='published'
           AND (existing.source_entity_operation_id,existing.scope_kind::text)
               IN (SELECT * FROM unnest($6::uuid[],$7::text[]))
        RETURNING id
      `, [
        input.tenantId,
        input.targetPlane,
        input.sourceEntityId,
        appliedAt,
        input.actorId,
        operationIds,
        scopeKinds,
      ]));

      const insertedBindingIds: string[] = [];
      for (const binding of input.bindings) {
        const result = await trx.executeQuery<{ id: string }>(CompiledQuery.raw(`
          INSERT INTO authz.entity_operation_scope_binding (
            tenant_id,plane_code,source_entity_id,source_entity_operation_id,
            source_release_id,source_release_hash,source_compiled_artifact_id,
            source_compiled_hash,entity_code,operation_key,permission_id,
            decision_mode,scope_kind,coordinate_source,coordinate_key,resolver_key,
            missing_value_behavior,status,effective_from,published_at,published_by,created_by
          ) VALUES (
            $1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,$8,$9,$10,$11::uuid,
            $12,$13,$14,$15,$16,'deny','published',$17::timestamptz,
            $18::timestamptz,$19::uuid,$19::uuid
          ) RETURNING id::text
        `, [
          input.tenantId,
          input.targetPlane,
          input.sourceEntityId,
          binding.sourceEntityOperationId,
          input.sourceReleaseId,
          input.sourceReleaseHash,
          input.sourceCompiledArtifactId,
          input.sourceCompiledHash,
          binding.entityCode,
          binding.operationKey,
          permissionByCode.get(binding.permissionCode),
          binding.decisionMode,
          binding.scopeKind,
          binding.coordinateSource,
          binding.coordinateKey,
          binding.resolverKey,
          input.effectiveFrom,
          appliedAt,
          input.actorId,
        ]));
        insertedBindingIds.push(result.rows[0]!.id);
      }
      return {
        targetPlane: input.targetPlane,
        sourceReleaseHash: input.sourceReleaseHash,
        sourceCompiledHash: input.sourceCompiledHash,
        insertedBindingIds,
        retiredBindingCount: retired.rows.length,
        noOp: false,
      };
    });
  }
}

function samePublishedBindingSet(
  existing: readonly ExistingBindingRow[],
  expected: readonly CompiledOperationScopeBindingBlueprint[],
  sourceCompiledHash: string,
): boolean {
  if (existing.length !== expected.length) return false;
  const expectedByCoordinate = new Map(expected.map((binding) => [
    `${binding.sourceEntityOperationId}:${binding.scopeKind}`,
    binding,
  ]));
  return existing.every((row) => {
    const binding = expectedByCoordinate.get(`${row.source_entity_operation_id}:${row.scope_kind}`);
    return binding !== undefined
      && row.source_compiled_hash === sourceCompiledHash
      && row.permission_code === binding.permissionCode
      && row.decision_mode === binding.decisionMode;
  });
}
