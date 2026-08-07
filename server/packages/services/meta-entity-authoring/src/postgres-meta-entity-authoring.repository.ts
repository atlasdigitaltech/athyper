import type {
  MetaEntityCheckpointCommand,
  MetaEntityCheckpointResult,
  MetaEntityActivityItem,
  MetaEntityClassProfile,
  MetaEntityContractTestResult,
  MetaEntityContractTestRun,
  MetaEntityContractTestRunCommand,
  MetaEntityNumberingPreviewCommand,
  MetaEntityNumberingTestArtifact,
  MetaEntityChangeSetSummary,
  MetaEntityCreateChangeSetCommand,
  MetaEntityCreateCommand,
  MetaEntityPhase2Graph,
  MetaEntityModuleCoordinate,
  MetaEntityPolicyDefinitionRef,
  MetaEntityPublishCommand,
  MetaEntityReleaseResult,
  MetaEntityReleaseSummary,
  MetaEntitySaveCommand,
  MetaEntitySummary,
  MetaEntityValidationResult,
  MetaEntityWorkflowCommand,
} from "@athyper/meta-entity-authoring-contracts";
import { sql, type Kysely, type Transaction } from "kysely";
import { canonicalizeMetaEntityGraph, diffCanonicalPaths, toDatabaseMetaEntityGraph } from "./meta-entity-graph.js";
import {
  META_ENTITY_CONTRACT_RUNNER_CODE,
  META_ENTITY_CONTRACT_RUNNER_VERSION,
  type ContractTestExecution,
} from "./contract-test-runner.js";
import {
  MetaEntityAuthoringError,
  type MetaEntityActorContext,
  type MetaEntityAuthoringRepository,
  type MetaEntitySeparationOfDutiesFacts,
  type MetaEntityNumberingTestExecution,
  type MetaEntityWorkflowAction,
} from "./meta-entity-authoring.service.js";

// Schema-qualified SQL keeps this package independent of the legacy generated
// database model until the dedicated Prisma/Kysely regeneration wave.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;
type DbExecutor = Kysely<Database> | Transaction<Database>;

interface ChangeSetScopeRow {
  tenant_id: string | null;
  entity_id: string;
  lock_version: string | number | bigint;
  status: string;
  base_release_id: string | null;
}

interface RevisionRow {
  id: string;
  change_set_id: string;
  revision_no: number;
  contract_hash: string;
  revision_hash: string;
  changed_paths: string[];
  validation_status: "pending" | "valid" | "invalid";
  captured_at: Date | string;
  contract_json?: unknown;
}

interface ContractTestRunRow {
  id: string; entity_id: string; change_set_id: string; revision_id: string | null;
  source_lock_version: number | string | bigint; source_contract_hash: string;
  runner_code: string; runner_version: string; status: MetaEntityContractTestRun["status"];
  total_count: number; passed_count: number; failed_count: number; error_count: number;
  duration_ms: number; run_hash: string; executed_at: Date | string; executed_by: string;
}

interface ContractTestResultRow {
  id: string; test_run_id: string; ordinal: number; test_case_id: string; test_key: string;
  test_kind: MetaEntityContractTestResult["testKind"]; target_plane: MetaEntityContractTestResult["targetPlane"];
  expected_outcome: MetaEntityContractTestResult["expectedOutcome"]; actual_outcome: MetaEntityContractTestResult["actualOutcome"];
  assertion_passed: boolean; diagnostic_codes: string[]; diagnostics: MetaEntityContractTestResult["diagnostics"];
  actual_output: MetaEntityContractTestResult["actualOutput"]; duration_ms: number; result_hash: string;
}

interface NumberingTestArtifactRow {
  id: string; entity_id: string; change_set_id: string; source_lock_version: number | string | bigint;
  numbering_binding_id: string; binding_key: string; target_plane: "neon" | "mesh"; field_key: string;
  operation_key: string | null; policy_code: string; policy_revision: number; policy_source: "tenant" | "global" | null;
  binding_contract_json: MetaEntityNumberingTestArtifact["bindingContract"];
  policy_contract_json: MetaEntityNumberingTestArtifact["policyContract"];
  preview_input_json: MetaEntityNumberingTestArtifact["previewInput"];
  actual_output_json: MetaEntityNumberingTestArtifact["actualOutput"];
  diagnostic_codes: string[]; diagnostics: MetaEntityNumberingTestArtifact["diagnostics"];
  status: "passed" | "failed"; artifact_hash: string; executed_at: Date | string; executed_by: string;
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function camelizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
    camelizeDeep(child),
  ]));
}

function mapRevision(row: RevisionRow): MetaEntityCheckpointResult {
  return {
    id: row.id,
    changeSetId: row.change_set_id,
    revisionNo: Number(row.revision_no),
    contractHash: row.contract_hash,
    revisionHash: row.revision_hash,
    changedPaths: row.changed_paths,
    validationStatus: row.validation_status,
    capturedAt: asIso(row.captured_at),
  };
}

function mapTestRun(row: ContractTestRunRow): MetaEntityContractTestRun {
  return { id: row.id, entityId: row.entity_id, changeSetId: row.change_set_id, revisionId: row.revision_id,
    sourceLockVersion: Number(row.source_lock_version), sourceContractHash: row.source_contract_hash,
    runnerCode: row.runner_code, runnerVersion: row.runner_version, status: row.status,
    totalCount: Number(row.total_count), passedCount: Number(row.passed_count), failedCount: Number(row.failed_count),
    errorCount: Number(row.error_count), durationMs: Number(row.duration_ms), runHash: row.run_hash,
    executedAt: asIso(row.executed_at), executedBy: row.executed_by };
}

function mapTestResult(row: ContractTestResultRow): MetaEntityContractTestResult {
  return { id: row.id, testRunId: row.test_run_id, ordinal: Number(row.ordinal), testCaseId: row.test_case_id,
    testKey: row.test_key, testKind: row.test_kind, targetPlane: row.target_plane,
    expectedOutcome: row.expected_outcome, actualOutcome: row.actual_outcome, assertionPassed: row.assertion_passed,
    diagnosticCodes: row.diagnostic_codes, diagnostics: row.diagnostics, actualOutput: row.actual_output,
    durationMs: Number(row.duration_ms), resultHash: row.result_hash };
}

function mapNumberingTestArtifact(row: NumberingTestArtifactRow): MetaEntityNumberingTestArtifact {
  return {
    id: row.id, entityId: row.entity_id, changeSetId: row.change_set_id,
    sourceLockVersion: Number(row.source_lock_version), numberingBindingId: row.numbering_binding_id,
    bindingKey: row.binding_key, targetPlane: row.target_plane, fieldKey: row.field_key,
    operationKey: row.operation_key, policyCode: row.policy_code, policyRevision: Number(row.policy_revision),
    policySource: row.policy_source, bindingContract: row.binding_contract_json,
    policyContract: row.policy_contract_json, previewInput: row.preview_input_json,
    actualOutput: row.actual_output_json, diagnosticCodes: row.diagnostic_codes,
    diagnostics: row.diagnostics, status: row.status, artifactHash: row.artifact_hash,
    executedAt: asIso(row.executed_at), executedBy: row.executed_by,
  };
}

function databaseError(error: unknown): never {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === "40001") {
    throw new MetaEntityAuthoringError("STALE_LOCK_VERSION", "This change set was modified by another author.", 409);
  }
  if (candidate.code === "55000") {
    throw new MetaEntityAuthoringError("CHANGE_SET_NOT_EDITABLE", candidate.message ?? "The change set is not editable.", 409);
  }
  if (candidate.code === "23514" || candidate.code === "22023" || candidate.code === "23502") {
    throw new MetaEntityAuthoringError("CONTRACT_INVALID", candidate.message ?? "The Entity contract is invalid.", 422);
  }
  throw error;
}

export class PostgresMetaEntityAuthoringRepository implements MetaEntityAuthoringRepository {
  constructor(private readonly db: Kysely<Database>) {}

  listModuleCoordinates(context: MetaEntityActorContext): Promise<readonly MetaEntityModuleCoordinate[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        module_id: string; module_code: string; module_name: string; module_description: string | null;
        workspace_id: string; workspace_code: string; workspace_name: string;
      }>`
        SELECT module_row.id AS module_id, module_row.code AS module_code,
               module_row.name AS module_name, module_row.description AS module_description,
               workspace_row.id AS workspace_id, workspace_row.code AS workspace_code,
               workspace_row.name AS workspace_name
          FROM control.module AS module_row
          JOIN control.workspace_module AS placement
            ON placement.module_id = module_row.id
           AND placement.is_primary
           AND placement.status = 'active'
          JOIN control.workspace AS workspace_row ON workspace_row.id = placement.workspace_id
         WHERE module_row.status = 'active'
           AND workspace_row.status = 'active'
         ORDER BY workspace_row.sort_order, workspace_row.code, module_row.code
      `.execute(tx);
      return result.rows.map((row) => ({
        planeCode: "athyper" as const,
        workspaceCode: row.workspace_code,
        moduleCode: row.module_code,
        coordinateKey: `athyper:${row.workspace_code}:${row.module_code}`,
        moduleId: row.module_id,
        moduleName: row.module_name,
        moduleDescription: row.module_description,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
      }));
    });
  }

  private async setContext(tx: DbExecutor, context: MetaEntityActorContext): Promise<void> {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${context.tenantId}, true),
        set_config('app.current_principal_id', ${context.principalId}, true),
        set_config('app.current_actor_type', 'user', true),
        set_config('app.database_plane', 'athyper', true),
        set_config('application_name', 'meta-entity-authoring', true),
        set_config('app.correlation_id', ${context.correlationId ?? ""}, true)
    `.execute(tx);
  }

  private async inContext<T>(context: MetaEntityActorContext, work: (tx: Transaction<Database>) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction().execute(async (tx) => {
        await this.setContext(tx, context);
        return work(tx);
      });
    } catch (error) {
      databaseError(error);
    }
  }

  private async getScope(tx: DbExecutor, context: MetaEntityActorContext, changeSetId: string): Promise<ChangeSetScopeRow> {
    const result = await sql<ChangeSetScopeRow>`
      SELECT tenant_id, entity_id, lock_version, status, base_release_id
      FROM metadata.entity_change_set
      WHERE id = ${changeSetId}::uuid
        AND (tenant_id IS NULL OR tenant_id = ${context.tenantId}::uuid)
    `.execute(tx);
    const row = result.rows[0];
    if (!row) throw new MetaEntityAuthoringError("CHANGE_SET_NOT_FOUND", "Entity change set was not found.", 404);
    return row;
  }

  private assertTenantOwned(scope: ChangeSetScopeRow, context?: MetaEntityActorContext): void {
    if (scope.tenant_id === null
        && !(context?.authority === "central_package"
          && context.principalId === "00000000-0000-0000-0000-000000000000")) {
      throw new MetaEntityAuthoringError(
        "GLOBAL_PACKAGE_READ_ONLY",
        "Global package Entity contracts are read-only through tenant-scoped authoring APIs.",
        403,
      );
    }
  }

  loadSeparationOfDutiesFacts(
    context: MetaEntityActorContext,
    changeSetId: string,
    rollbackOfReleaseId?: string,
  ): Promise<MetaEntitySeparationOfDutiesFacts> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        entity_tenant_id: string | null;
        created_by: string;
        submitted_by: string | null;
        reviewed_by: string | null;
        approved_by: string | null;
        latest_revision_captured_by: string | null;
        latest_release_published_by: string | null;
        rollback_target_published_by: string | null;
      }>`
        SELECT e.tenant_id AS entity_tenant_id,
               cs.created_by, cs.submitted_by, cs.reviewed_by, cs.approved_by,
               revision.captured_by AS latest_revision_captured_by,
               latest_release.published_by AS latest_release_published_by,
               rollback_target.published_by AS rollback_target_published_by
          FROM metadata.entity_change_set AS cs
          JOIN metadata.entity AS e ON e.id = cs.entity_id
          LEFT JOIN LATERAL (
            SELECT captured_by
              FROM snapshot.entity_contract_revision
             WHERE change_set_id = cs.id
             ORDER BY revision_no DESC
             LIMIT 1
          ) AS revision ON true
          LEFT JOIN LATERAL (
            SELECT published_by
              FROM metadata.entity_release
             WHERE entity_id = cs.entity_id
             ORDER BY release_no DESC
             LIMIT 1
          ) AS latest_release ON true
          LEFT JOIN metadata.entity_release AS rollback_target
            ON rollback_target.id = ${rollbackOfReleaseId ?? null}::uuid
           AND rollback_target.entity_id = cs.entity_id
         WHERE cs.id = ${changeSetId}::uuid
           AND (cs.tenant_id IS NULL OR cs.tenant_id = ${context.tenantId}::uuid)
      `.execute(tx);
      const row = result.rows[0];
      if (!row) throw new MetaEntityAuthoringError("CHANGE_SET_NOT_FOUND", "Entity change set was not found.", 404);
      if (rollbackOfReleaseId && !row.rollback_target_published_by) {
        throw new MetaEntityAuthoringError("ROLLBACK_TARGET_NOT_FOUND", "The rollback target is not a release of this Entity.", 404);
      }
      return {
        entityTenantId: row.entity_tenant_id,
        createdBy: row.created_by,
        submittedBy: row.submitted_by,
        reviewedBy: row.reviewed_by,
        approvedBy: row.approved_by,
        latestRevisionCapturedBy: row.latest_revision_captured_by,
        latestReleasePublishedBy: row.latest_release_published_by,
        rollbackTargetPublishedBy: row.rollback_target_published_by,
      };
    });
  }

  listClassProfiles(context: MetaEntityActorContext): Promise<readonly MetaEntityClassProfile[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        entity_class: MetaEntityClassProfile["entityClass"];
        profile_version: number;
        fallback_name: string;
        description: string;
        default_backing_kind: MetaEntityClassProfile["defaultBackingKind"];
        default_api_exposure: MetaEntityClassProfile["defaultApiExposure"];
        default_read_mode: MetaEntityClassProfile["defaultReadMode"];
        default_write_mode: MetaEntityClassProfile["defaultWriteMode"];
        default_concurrency_mode: MetaEntityClassProfile["defaultConcurrencyMode"];
        default_change_policy: MetaEntityClassProfile["defaultChangePolicy"];
      }>`SELECT entity_class,profile_version,fallback_name,description,default_backing_kind,
          default_api_exposure,default_read_mode,default_write_mode,default_concurrency_mode,default_change_policy
        FROM metadata.entity_class_profile ORDER BY entity_class`.execute(tx);
      return result.rows.map((row) => ({
        entityClass: row.entity_class,
        profileVersion: Number(row.profile_version),
        fallbackName: row.fallback_name,
        description: row.description,
        defaultBackingKind: row.default_backing_kind,
        defaultApiExposure: row.default_api_exposure,
        defaultReadMode: row.default_read_mode,
        defaultWriteMode: row.default_write_mode,
        defaultConcurrencyMode: row.default_concurrency_mode,
        defaultChangePolicy: row.default_change_policy,
      }));
    });
  }

  listPolicyDefinitions(context: MetaEntityActorContext): Promise<readonly MetaEntityPolicyDefinitionRef[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; tenant_id: string | null; entity_type: string; name: string;
        description: string | null; version_no: number; status: MetaEntityPolicyDefinitionRef["status"];
      }>`SELECT id,tenant_id,entity_type,name,description,version_no,status
          FROM control.policy_definition
         WHERE tenant_id IS NULL OR tenant_id=${context.tenantId}::uuid
         ORDER BY entity_type,name,version_no DESC`.execute(tx);
      return result.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, entityType: row.entity_type, name: row.name,
        description: row.description, versionNo: Number(row.version_no), status: row.status,
      }));
    });
  }

  listEntities(context: MetaEntityActorContext): Promise<readonly MetaEntitySummary[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; tenant_id: string | null; module_code: string; entity_code: string;
        entity_class: MetaEntitySummary["entityClass"]; ownership_model: MetaEntitySummary["ownershipModel"];
        status: MetaEntitySummary["status"]; open_change_set_count: number; current_release_no: number | null;
      }>`
        SELECT e.id, e.tenant_id, m.code AS module_code, e.entity_code,
               e.entity_class, e.ownership_model, e.status,
               count(cs.id) FILTER (WHERE cs.status IN ('draft','in_review','rejected'))::int AS open_change_set_count,
               max(r.release_no)::int AS current_release_no
        FROM metadata.entity e
        JOIN control.module m ON m.id = e.module_id
        LEFT JOIN metadata.entity_change_set cs ON cs.entity_id = e.id
        LEFT JOIN metadata.entity_release r ON r.entity_id = e.id
        WHERE e.tenant_id IS NULL OR e.tenant_id = ${context.tenantId}::uuid
        GROUP BY e.id, m.code
        ORDER BY m.code, e.entity_code
      `.execute(tx);
      return result.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, moduleCode: row.module_code, entityCode: row.entity_code,
        entityClass: row.entity_class, ownershipModel: row.ownership_model, status: row.status,
        openChangeSetCount: Number(row.open_change_set_count),
        currentReleaseNo: row.current_release_no === null ? null : Number(row.current_release_no),
      }));
    });
  }

  createEntity(context: MetaEntityActorContext, command: MetaEntityCreateCommand): Promise<MetaEntitySummary> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; tenant_id: string; module_code: string; entity_code: string;
        entity_class: MetaEntitySummary["entityClass"]; ownership_model: MetaEntitySummary["ownershipModel"];
        status: MetaEntitySummary["status"];
      }>`
        WITH coordinate AS (
          SELECT module_row.id
            FROM control.module AS module_row
            JOIN control.workspace_module AS placement
              ON placement.module_id = module_row.id
             AND placement.is_primary
             AND placement.status = 'active'
            JOIN control.workspace AS workspace_row ON workspace_row.id = placement.workspace_id
           WHERE module_row.code = ${command.moduleCoordinate.moduleCode}
             AND workspace_row.code = ${command.moduleCoordinate.workspaceCode}
             AND module_row.status = 'active'
             AND workspace_row.status = 'active'
             AND ${command.moduleCoordinate.planeCode} = 'athyper'
        ), inserted AS (
          INSERT INTO metadata.entity (tenant_id,module_id,entity_code,entity_class,ownership_model,created_by)
          SELECT ${context.tenantId}::uuid,coordinate.id,${command.entityCode},
            ${command.entityClass}::metadata.entity_class_d,'tenant',${context.principalId}::uuid
          FROM coordinate
          RETURNING *
        ) SELECT i.id,i.tenant_id,m.code AS module_code,i.entity_code,i.entity_class,i.ownership_model,i.status
          FROM inserted i JOIN control.module m ON m.id=i.module_id
      `.execute(tx);
      const row = result.rows[0];
      if (!row) {
        throw new MetaEntityAuthoringError(
          "MODULE_COORDINATE_NOT_FOUND",
          "The canonical module coordinate is inactive or does not exist in the Athyper catalog.",
          422,
        );
      }
      const initial = await sql<{ id: string }>`
        INSERT INTO metadata.entity_change_set (
          tenant_id, entity_id, change_set_code, branch_code, title, change_summary, created_by
        ) VALUES (
          ${context.tenantId}::uuid, ${row.id}::uuid, ${command.initialChangeSet.changeSetCode}, 'main',
          ${command.initialChangeSet.title}, 'Initial canonical Entity contract', ${context.principalId}::uuid
        )
        RETURNING id
      `.execute(tx);
      const changeSetId = initial.rows[0]!.id;
      const profile = await sql<{ id: string }>`
        INSERT INTO metadata.entity_runtime_profile (
          tenant_id, entity_id, change_set_id, profile_key, backing_kind,
          storage_plane, storage_schema, storage_object, api_exposure,
          read_mode, write_mode, create_mode, concurrency_mode, created_by
        )
        SELECT ${context.tenantId}::uuid, ${row.id}::uuid, ${changeSetId}::uuid, 'default',
               profile.default_backing_kind, ${command.initialChangeSet.storagePlane},
               ${command.initialChangeSet.storageSchema}, ${command.initialChangeSet.storageObject},
               profile.default_api_exposure, profile.default_read_mode, profile.default_write_mode,
               'form_only', profile.default_concurrency_mode, ${context.principalId}::uuid
          FROM metadata.entity_class_profile AS profile
         WHERE profile.entity_class = ${command.entityClass}::metadata.entity_class_d
        RETURNING id
      `.execute(tx);
      if (!profile.rows[0]) {
        throw new MetaEntityAuthoringError(
          "ENTITY_CLASS_PROFILE_NOT_FOUND",
          "The selected Entity class has no canonical runtime defaults.",
          422,
        );
      }
      await sql`SELECT audit.append_event(p_event_code=>'metadata.entity.created',p_operation=>'create',
        p_entity_type=>'metadata.entity',p_entity_id=>${row.id}::uuid,
        p_new_values=>${JSON.stringify({ entity_code: row.entity_code, entity_class: row.entity_class })}::jsonb,
        p_correlation_id=>${context.correlationId ?? null}::uuid,p_request_id=>${context.requestId ?? null})`.execute(tx);
      await this.appendOutbox(tx, context, "metadata.entity.created", row.id, row.id, { entity_code: row.entity_code });
      await sql`SELECT audit.append_event(p_event_code=>'metadata.entity.change_set.created',p_operation=>'create',
        p_entity_type=>'metadata.entity',p_entity_id=>${row.id}::uuid,
        p_context=>${JSON.stringify({ change_set_id: changeSetId, change_set_code: command.initialChangeSet.changeSetCode })}::jsonb,
        p_correlation_id=>${context.correlationId ?? null}::uuid,p_request_id=>${context.requestId ?? null})`.execute(tx);
      await this.appendOutbox(tx, context, "metadata.entity.change_set.created", row.id, changeSetId, {
        change_set_code: command.initialChangeSet.changeSetCode,
      });
      return { id: row.id, tenantId: row.tenant_id, moduleCode: row.module_code, entityCode: row.entity_code,
        entityClass: row.entity_class, ownershipModel: row.ownership_model, status: row.status,
        openChangeSetCount: 0, currentReleaseNo: null };
    });
  }

  listChangeSets(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityChangeSetSummary[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; entity_id: string; change_set_code: string; branch_code: string; title: string;
        status: MetaEntityChangeSetSummary["status"]; lock_version: number | string;
        base_release_no: number | null; updated_at: Date | string | null;
      }>`
        SELECT cs.id, cs.entity_id, cs.change_set_code, cs.branch_code, cs.title, cs.status,
               cs.lock_version, base.release_no::int AS base_release_no, cs.updated_at
        FROM metadata.entity_change_set cs
        LEFT JOIN metadata.entity_release base ON base.id = cs.base_release_id
        WHERE cs.entity_id = ${entityId}::uuid
          AND (cs.tenant_id IS NULL OR cs.tenant_id = ${context.tenantId}::uuid)
        ORDER BY cs.created_at DESC
      `.execute(tx);
      return result.rows.map((row) => ({
        id: row.id, entityId: row.entity_id, code: row.change_set_code, branchCode: row.branch_code,
        title: row.title, status: row.status, lockVersion: Number(row.lock_version),
        baseReleaseNo: row.base_release_no === null ? null : Number(row.base_release_no),
        updatedAt: row.updated_at ? asIso(row.updated_at) : null,
      }));
    });
  }

  createChangeSet(
    context: MetaEntityActorContext,
    command: MetaEntityCreateChangeSetCommand,
  ): Promise<MetaEntityChangeSetSummary> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; entity_id: string; change_set_code: string; branch_code: string; title: string;
        status: MetaEntityChangeSetSummary["status"]; lock_version: number | string; updated_at: Date | string | null;
      }>`
        INSERT INTO metadata.entity_change_set (tenant_id,entity_id,change_set_code,branch_code,base_release_id,
          parent_change_set_id,title,change_summary,change_reason_code,ticket_reference,created_by)
        SELECT ${context.tenantId}::uuid,e.id,${command.changeSetCode},${command.branchCode ?? "main"},
          ${command.baseReleaseId ?? null}::uuid,${command.parentChangeSetId ?? null}::uuid,${command.title},
          ${command.changeSummary ?? null},${command.changeReasonCode ?? null},${command.ticketReference ?? null},
          ${context.principalId}::uuid
        FROM metadata.entity e WHERE e.id=${command.entityId}::uuid AND e.tenant_id=${context.tenantId}::uuid
        RETURNING id,entity_id,change_set_code,branch_code,title,status,lock_version,updated_at
      `.execute(tx);
      const row = result.rows[0];
      if (!row) throw new MetaEntityAuthoringError("ENTITY_NOT_FOUND", "Entity was not found.", 404);
      await sql`SELECT audit.append_event(p_event_code=>'metadata.entity.change_set.created',p_operation=>'create',
        p_entity_type=>'metadata.entity',p_entity_id=>${row.entity_id}::uuid,
        p_context=>${JSON.stringify({ change_set_id: row.id, change_set_code: row.change_set_code })}::jsonb,
        p_correlation_id=>${context.correlationId ?? null}::uuid,p_request_id=>${context.requestId ?? null})`.execute(tx);
      await this.appendOutbox(tx, context, "metadata.entity.change_set.created", row.entity_id, row.id, {});
      return { id: row.id, entityId: row.entity_id, code: row.change_set_code, branchCode: row.branch_code,
        title: row.title, status: row.status, lockVersion: Number(row.lock_version), baseReleaseNo: null,
        updatedAt: row.updated_at ? asIso(row.updated_at) : null };
    });
  }

  loadGraph(context: MetaEntityActorContext, changeSetId: string): Promise<MetaEntityPhase2Graph | null> {
    return this.inContext(context, async (tx) => this.loadGraphInTransaction(tx, context, changeSetId));
  }

  private async loadGraphInTransaction(
    tx: DbExecutor,
    context: MetaEntityActorContext,
    changeSetId: string,
  ): Promise<MetaEntityPhase2Graph | null> {
    const result = await sql<{ graph: MetaEntityPhase2Graph | null }>`
      SELECT CASE WHEN rp.id IS NULL THEN NULL ELSE jsonb_build_object(
        'runtimeProfile', jsonb_build_object(
          'id', rp.id, 'profileKey', rp.profile_key, 'backingKind', rp.backing_kind,
          'storagePlane', rp.storage_plane, 'storageSchema', rp.storage_schema, 'storageObject', rp.storage_object,
          'apiExposure', rp.api_exposure, 'readMode', rp.read_mode, 'writeMode', rp.write_mode,
          'readHandlerKey', rp.read_handler_key, 'writeHandlerKey', rp.write_handler_key,
          'createMode', rp.create_mode, 'concurrencyMode', rp.concurrency_mode,
          'recordVersionFieldKey', rp.record_version_field_key, 'tenantFieldKey', rp.tenant_field_key,
          'softDeleteFieldKey', rp.soft_delete_field_key, 'draftTtlHours', rp.draft_ttl_hours
        ),
        'fields', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', f.id, 'fieldKey', f.field_key, 'description', f.description, 'dataType', f.data_type,
          'typeConfig', f.type_config, 'cardinality', f.cardinality, 'valueOrigin', f.value_origin,
          'writeMode', f.write_mode, 'storagePath', f.storage_path, 'defaultSpec', f.default_spec,
          'computationSpec', f.computation_spec, 'validationSpec', f.validation_spec, 'status', f.status,
          'replacementFieldKey', f.replacement_field_key, 'deprecatedSinceReleaseNo', f.deprecated_since_release_no,
          'plannedRemovalReleaseNo', f.planned_removal_release_no,
          'keyUsageCount', (SELECT count(*)::int FROM metadata.entity_key_field kf WHERE kf.entity_field_id=f.id),
          'searchUsageCount', (SELECT count(*)::int FROM metadata.entity_search_field sf WHERE sf.entity_field_id=f.id),
          'relationUsageCount', (SELECT count(*)::int FROM metadata.entity_relation_field rf WHERE rf.source_field_id=f.id)
        ) ORDER BY f.field_key), '[]'::jsonb) FROM metadata.entity_field f WHERE f.change_set_id=rp.change_set_id),
        'keys', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', k.id, 'keyKey', k.key_key, 'keyKind', k.key_kind, 'uniquenessScope', k.uniqueness_scope,
          'nullSemantics', k.null_semantics, 'status', k.status, 'replacementKeyKey', k.replacement_key_key,
          'deprecatedSinceReleaseNo', k.deprecated_since_release_no, 'plannedRemovalReleaseNo', k.planned_removal_release_no,
          'fields', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', kf.id, 'entityFieldId', kf.entity_field_id,
                    'position', kf.position) ORDER BY kf.position), '[]'::jsonb)
                     FROM metadata.entity_key_field kf WHERE kf.entity_key_id=k.id)
        ) ORDER BY k.key_key), '[]'::jsonb) FROM metadata.entity_key k WHERE k.change_set_id=rp.change_set_id),
        'searchProfiles', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'searchKey', s.search_key, 'searchKind', s.search_kind, 'queryOperator', s.query_operator,
          'minimumQueryLength', s.minimum_query_length, 'languageCode', s.language_code,
          'normalizationMode', s.normalization_mode, 'isDefault', s.is_default, 'status', s.status,
          'replacementSearchKey', s.replacement_search_key, 'deprecatedSinceReleaseNo', s.deprecated_since_release_no,
          'plannedRemovalReleaseNo', s.planned_removal_release_no,
          'fields', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', sf.id, 'entityFieldId', sf.entity_field_id,
                    'position', sf.position, 'matchMode', sf.match_mode, 'weight', sf.weight::float8) ORDER BY sf.position), '[]'::jsonb)
                     FROM metadata.entity_search_field sf WHERE sf.entity_search_profile_id=s.id)
        ) ORDER BY s.search_key), '[]'::jsonb) FROM metadata.entity_search_profile s WHERE s.change_set_id=rp.change_set_id),
        'relations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'relationKey', r.relation_key, 'relationKind', r.relation_kind,
          'resolutionKind', r.resolution_kind, 'ownershipMode', r.ownership_mode, 'mutationMode', r.mutation_mode,
          'onDelete', r.on_delete, 'onUpdate', r.on_update, 'inverseRelationKey', r.inverse_relation_key,
          'status', r.status, 'replacementRelationKey', r.replacement_relation_key,
          'deprecatedSinceReleaseNo', r.deprecated_since_release_no, 'plannedRemovalReleaseNo', r.planned_removal_release_no,
          'targets', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'relationTargetKey', t.relation_target_key, 'targetEntityId', t.target_entity_id,
            'targetKeyKey', t.target_key_key, 'discriminatorValue', t.discriminator_value, 'isDefault', t.is_default,
            'fields', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', rf.id, 'sourceFieldId', rf.source_field_id,
                      'targetFieldKey', rf.target_field_key, 'position', rf.position) ORDER BY rf.position), '[]'::jsonb)
                       FROM metadata.entity_relation_field rf WHERE rf.entity_relation_target_id=t.id)
          ) ORDER BY t.relation_target_key), '[]'::jsonb) FROM metadata.entity_relation_target t WHERE t.entity_relation_id=r.id)
        ) ORDER BY r.relation_key), '[]'::jsonb) FROM metadata.entity_relation r WHERE r.change_set_id=rp.change_set_id),
        'surfaces', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', su.id, 'surfaceKey', su.surface_key, 'surfaceKind', su.surface_kind, 'title', su.title,
          'description', su.description, 'layoutKind', su.layout_kind, 'layoutConfig', su.layout_config,
          'isDefault', su.is_default, 'status', su.status, 'replacementSurfaceKey', su.replacement_surface_key,
          'deprecatedSinceReleaseNo', su.deprecated_since_release_no, 'plannedRemovalReleaseNo', su.planned_removal_release_no,
          'sections', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', ss.id, 'sectionKey', ss.section_key, 'parentSectionId', ss.parent_section_id,
            'sectionKind', ss.section_kind, 'title', ss.title, 'description', ss.description,
            'position', ss.position, 'columnCount', ss.column_count, 'collapsible', ss.collapsible,
            'collapsedByDefault', ss.collapsed_by_default, 'layoutConfig', ss.layout_config
          ) ORDER BY ss.position, ss.section_key), '[]'::jsonb) FROM metadata.entity_surface_section ss WHERE ss.entity_surface_id=su.id),
          'fieldBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', fb.id, 'bindingKey', fb.binding_key, 'entityFieldId', fb.entity_field_id,
            'sectionId', fb.entity_surface_section_id, 'position', fb.position,
            'labelOverride', fb.label_override, 'helpText', fb.help_text, 'placeholder', fb.placeholder,
            'widgetKey', fb.widget_key, 'columnSpan', fb.column_span,
            'showRequiredIndicator', fb.show_required_indicator, 'displayConfig', fb.display_config,
            'visibilityRule', fb.visibility_rule, 'editabilityRule', fb.editability_rule, 'status', fb.status
          ) ORDER BY fb.position, fb.binding_key), '[]'::jsonb) FROM metadata.entity_surface_field_binding fb WHERE fb.entity_surface_id=su.id)
        ) ORDER BY su.surface_key), '[]'::jsonb) FROM metadata.entity_surface su WHERE su.change_set_id=rp.change_set_id),
        'operations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', op.id, 'operationKey', op.operation_key, 'operationKind', op.operation_kind,
          'label', op.label, 'description', op.description, 'handlerKey', op.handler_key,
          'permissionCode', op.permission_code, 'executionMode', op.execution_mode,
          'idempotencyMode', op.idempotency_mode, 'inputSurfaceKey', op.input_surface_key,
          'confirmationSurfaceKey', op.confirmation_surface_key, 'resultSurfaceKey', op.result_surface_key,
          'requiresMfa', op.requires_mfa,
          'auditEventCode', op.audit_event_code, 'status', op.status,
          'replacementOperationKey', op.replacement_operation_key,
          'deprecatedSinceReleaseNo', op.deprecated_since_release_no, 'plannedRemovalReleaseNo', op.planned_removal_release_no
        ) ORDER BY op.operation_key), '[]'::jsonb) FROM metadata.entity_operation op WHERE op.change_set_id=rp.change_set_id),
        'surfaceOperations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'surfaceId', x.entity_surface_id, 'operationId', x.entity_operation_id,
          'sectionId', x.entity_surface_section_id, 'placementKey', x.placement_key,
          'interactionTarget', x.interaction_target, 'selectionMode', x.selection_mode, 'position', x.position,
          'labelOverride', x.label_override, 'iconKey', x.icon_key, 'presentationVariant', x.presentation_variant,
          'confirmationSurfaceId', x.confirmation_surface_id, 'visibilityRule', x.visibility_rule, 'status', x.status
        ) ORDER BY x.placement_key), '[]'::jsonb) FROM metadata.entity_surface_operation x WHERE x.change_set_id=rp.change_set_id),
        'operationRules', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'operationId', x.entity_operation_id, 'ruleKey', x.rule_key, 'priority', x.priority,
          'decision', x.decision, 'planeCode', x.plane_code, 'lifecycleStateCode', x.lifecycle_state_code,
          'lifecycleTransitionCode', x.lifecycle_transition_code, 'requiredCapabilityCode', x.required_capability_code,
          'reasonCode', x.reason_code, 'status', x.status
        ) ORDER BY x.entity_operation_id, x.priority), '[]'::jsonb) FROM metadata.entity_operation_rule x WHERE x.change_set_id=rp.change_set_id),
        'operationScopeBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id',x.id,'operationId',x.entity_operation_id,'bindingKey',x.binding_key,
          'targetPlane',x.target_plane,'decisionMode',x.decision_mode,'scopeKind',x.scope_kind,
          'coordinateSource',x.coordinate_source,'coordinateKey',x.coordinate_key,
          'resolverKey',x.resolver_key,'missingValueBehavior',x.missing_value_behavior,'status',x.status
        ) ORDER BY x.entity_operation_id,x.target_plane,x.scope_kind),'[]'::jsonb)
          FROM metadata.entity_operation_scope_binding x WHERE x.change_set_id=rp.change_set_id),
        'flows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'flowKey', x.flow_key, 'flowKind', x.flow_kind, 'title', x.title, 'description', x.description,
          'navigationMode', x.navigation_mode, 'entryOperationId', x.entry_operation_id,
          'completionOperationId', x.completion_operation_id, 'allowDraftResume', x.allow_draft_resume,
          'status', x.status, 'replacementFlowKey', x.replacement_flow_key,
          'deprecatedSinceReleaseNo', x.deprecated_since_release_no, 'plannedRemovalReleaseNo', x.planned_removal_release_no,
          'steps', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', step.id, 'stepKey', step.step_key, 'surfaceId', step.entity_surface_id, 'position', step.position,
            'titleOverride', step.title_override, 'description', step.description, 'entryCondition', step.entry_condition,
            'completionCondition', step.completion_condition, 'isOptional', step.is_optional
          ) ORDER BY step.position), '[]'::jsonb) FROM metadata.entity_flow_step step WHERE step.entity_flow_id=x.id)
        ) ORDER BY x.flow_key), '[]'::jsonb) FROM metadata.entity_flow x WHERE x.change_set_id=rp.change_set_id),
        'policyBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'bindingKey', x.binding_key, 'operationId', x.entity_operation_id,
          'policyDefinitionId', x.policy_definition_id, 'bindingStage', x.binding_stage,
          'enforcement', x.enforcement, 'priority', x.priority, 'inputMapping', x.input_mapping, 'status', x.status
        ) ORDER BY x.binding_key), '[]'::jsonb) FROM metadata.entity_policy_binding x WHERE x.change_set_id=rp.change_set_id),
        'fieldPolicyBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'bindingKey', x.binding_key, 'fieldId', x.entity_field_id, 'operationId', x.entity_operation_id,
          'policyDefinitionId', x.policy_definition_id, 'bindingStage', x.binding_stage,
          'enforcement', x.enforcement, 'priority', x.priority, 'inputMapping', x.input_mapping, 'status', x.status
        ) ORDER BY x.binding_key), '[]'::jsonb) FROM metadata.entity_field_policy_binding x WHERE x.change_set_id=rp.change_set_id),
        'testCases', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'testKey', x.test_key, 'testKind', x.test_kind, 'title', x.title, 'description', x.description,
          'targetPlane', x.target_plane, 'operationId', x.entity_operation_id, 'flowId', x.entity_flow_id,
          'inputContext', x.input_context, 'expectedOutcome', x.expected_outcome,
          'expectedDiagnosticCodes', to_jsonb(x.expected_diagnostic_codes), 'status', x.status
        ) ORDER BY x.test_key), '[]'::jsonb) FROM metadata.entity_contract_test_case x WHERE x.change_set_id=rp.change_set_id),
        'lifecycleBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id',x.id,'bindingKey',x.binding_key,'stateFieldId',x.entity_field_id,'targetPlane',x.target_plane,
          'lifecycleCode',x.lifecycle_code,'lifecycleRevision',x.lifecycle_revision,'required',x.required,'status',x.status
        ) ORDER BY x.binding_key),'[]'::jsonb) FROM metadata.entity_lifecycle_binding x WHERE x.change_set_id=rp.change_set_id),
        'lifecycleOperationBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id',x.id,'lifecycleBindingId',x.entity_lifecycle_binding_id,'operationId',x.entity_operation_id,
          'mappingKey',x.mapping_key,'transitionCode',x.transition_code,'status',x.status
        ) ORDER BY x.mapping_key),'[]'::jsonb) FROM metadata.entity_lifecycle_operation_binding x WHERE x.change_set_id=rp.change_set_id),
        'numberingBindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id',x.id,'bindingKey',x.binding_key,'fieldId',x.entity_field_id,'operationId',x.entity_operation_id,
          'targetPlane',x.target_plane,'policyCode',x.policy_code,'policyRevision',x.policy_revision,
          'assignmentMode',x.assignment_mode,'required',x.required,'status',x.status
        ) ORDER BY x.binding_key),'[]'::jsonb) FROM metadata.entity_numbering_binding x WHERE x.change_set_id=rp.change_set_id)
      ) END AS graph
      FROM metadata.entity_runtime_profile rp
      WHERE rp.change_set_id=${changeSetId}::uuid
        AND (rp.tenant_id IS NULL OR rp.tenant_id=${context.tenantId}::uuid)
    `.execute(tx);
    const graph = result.rows[0]?.graph;
    return graph ? camelizeDeep(graph) as MetaEntityPhase2Graph : null;
  }

  saveGraph(context: MetaEntityActorContext, command: MetaEntitySaveCommand): Promise<{ lockVersion: number; graph: MetaEntityPhase2Graph }> {
    return this.inContext(context, async (tx) => {
      const scope = await this.getScope(tx, context, command.changeSetId);
      this.assertTenantOwned(scope, context);
      const document = JSON.stringify(toDatabaseMetaEntityGraph(command.graph));
      const advanced = await sql<{ lock_version: string | number }>`
        SELECT metadata.fn_advance_entity_change_set(
          ${command.changeSetId}::uuid, ${command.expectedLockVersion}::bigint, ${context.principalId}::uuid
        ) AS lock_version
      `.execute(tx);
      const lockVersion = Number(advanced.rows[0]!.lock_version);

      await this.deleteMissingGraphRows(tx, command.changeSetId, document);
      await this.upsertGraphRows(tx, scope, context.principalId, command.changeSetId, document);
      await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(tx);
      await sql`SELECT metadata.fn_validate_entity_graph(${command.changeSetId}::uuid)`.execute(tx);

      const graph = await this.loadGraphInTransaction(tx, context, command.changeSetId);
      if (!graph) throw new MetaEntityAuthoringError("GRAPH_NOT_PERSISTED", "The Entity graph was not persisted.", 500);
      return { lockVersion, graph };
    });
  }

  private async deleteMissingGraphRows(tx: DbExecutor, changeSetId: string, document: string): Promise<void> {
    await sql`DELETE FROM metadata.entity_numbering_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'numbering_bindings') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_operation_scope_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'operation_scope_bindings') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_lifecycle_operation_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'lifecycle_operation_bindings') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_lifecycle_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'lifecycle_bindings') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_contract_test_case x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'test_cases') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_field_policy_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'field_policy_bindings') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_policy_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'policy_bindings') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_flow_step x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'flows') flow_row,
      jsonb_array_elements(flow_row->'steps') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_flow x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'flows') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_operation_rule x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'operation_rules') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_surface_operation x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'surface_operations') item WHERE item->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_surface_field_binding x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'surfaces') s,
      jsonb_array_elements(s->'field_bindings') f WHERE f->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_surface_section x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'surfaces') s,
      jsonb_array_elements(s->'sections') section_row WHERE section_row->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_operation x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'operations') op WHERE op->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_surface x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'surfaces') s WHERE s->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_relation_field x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'relations') r,
      jsonb_array_elements(r->'targets') t, jsonb_array_elements(t->'fields') f WHERE f->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_relation_target x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'relations') r,
      jsonb_array_elements(r->'targets') t WHERE t->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_key_field x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'keys') k,
      jsonb_array_elements(k->'fields') f WHERE f->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_search_field x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'search_profiles') s,
      jsonb_array_elements(s->'fields') f WHERE f->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_relation x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'relations') r WHERE r->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_key x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'keys') k WHERE k->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_search_profile x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'search_profiles') s WHERE s->>'id'=x.id::text)`.execute(tx);
    await sql`DELETE FROM metadata.entity_field x WHERE x.change_set_id=${changeSetId}::uuid AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${document}::jsonb->'fields') f WHERE f->>'id'=x.id::text)`.execute(tx);
  }

  private async upsertGraphRows(
    tx: DbExecutor,
    scope: ChangeSetScopeRow,
    actorId: string,
    changeSetId: string,
    document: string,
  ): Promise<void> {
    const tenantId = scope.tenant_id!;
    const entityId = scope.entity_id;
    await sql`
      INSERT INTO metadata.entity_runtime_profile (
        id,tenant_id,entity_id,change_set_id,profile_key,backing_kind,storage_plane,storage_schema,storage_object,
        api_exposure,read_mode,write_mode,read_handler_key,write_handler_key,create_mode,concurrency_mode,
        record_version_field_key,tenant_field_key,soft_delete_field_key,draft_ttl_hours,created_by
      ) SELECT
        (p->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,p->>'profile_key',
        (p->>'backing_kind')::metadata.entity_backing_kind_d,p->>'storage_plane',p->>'storage_schema',p->>'storage_object',
        (p->>'api_exposure')::metadata.entity_api_exposure_d,(p->>'read_mode')::metadata.entity_read_mode_d,
        (p->>'write_mode')::metadata.entity_write_mode_d,p->>'read_handler_key',p->>'write_handler_key',
        (p->>'create_mode')::metadata.entity_create_mode_d,(p->>'concurrency_mode')::metadata.entity_concurrency_mode_d,
        p->>'record_version_field_key',p->>'tenant_field_key',p->>'soft_delete_field_key',(p->>'draft_ttl_hours')::int,${actorId}::uuid
      FROM (SELECT ${document}::jsonb->'runtime_profile' AS p) source
      ON CONFLICT (id) DO UPDATE SET
        backing_kind=EXCLUDED.backing_kind,storage_plane=EXCLUDED.storage_plane,storage_schema=EXCLUDED.storage_schema,
        storage_object=EXCLUDED.storage_object,api_exposure=EXCLUDED.api_exposure,read_mode=EXCLUDED.read_mode,
        write_mode=EXCLUDED.write_mode,read_handler_key=EXCLUDED.read_handler_key,write_handler_key=EXCLUDED.write_handler_key,
        create_mode=EXCLUDED.create_mode,concurrency_mode=EXCLUDED.concurrency_mode,
        record_version_field_key=EXCLUDED.record_version_field_key,tenant_field_key=EXCLUDED.tenant_field_key,
        soft_delete_field_key=EXCLUDED.soft_delete_field_key,draft_ttl_hours=EXCLUDED.draft_ttl_hours,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_field (
        id,tenant_id,entity_id,change_set_id,field_key,description,data_type,type_config,cardinality,value_origin,
        write_mode,storage_path,default_spec,computation_spec,validation_spec,status,replacement_field_key,
        deprecated_since_release_no,planned_removal_release_no,created_by
      ) SELECT (f->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,f->>'field_key',f->>'description',
        (f->>'data_type')::metadata.entity_field_data_type_d,f->'type_config',(f->>'cardinality')::metadata.entity_field_cardinality_d,
        (f->>'value_origin')::metadata.entity_field_value_origin_d,(f->>'write_mode')::metadata.entity_field_write_mode_d,
        f->>'storage_path',NULLIF(f->'default_spec','null'::jsonb),NULLIF(f->'computation_spec','null'::jsonb),
        NULLIF(f->'validation_spec','null'::jsonb),(f->>'status')::metadata.entity_member_status_d,
        f->>'replacement_field_key',(f->>'deprecated_since_release_no')::bigint,(f->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'fields') f
      ON CONFLICT (id) DO UPDATE SET description=EXCLUDED.description,data_type=EXCLUDED.data_type,type_config=EXCLUDED.type_config,
        cardinality=EXCLUDED.cardinality,value_origin=EXCLUDED.value_origin,write_mode=EXCLUDED.write_mode,
        storage_path=EXCLUDED.storage_path,default_spec=EXCLUDED.default_spec,computation_spec=EXCLUDED.computation_spec,
        validation_spec=EXCLUDED.validation_spec,status=EXCLUDED.status,replacement_field_key=EXCLUDED.replacement_field_key,
        deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,planned_removal_release_no=EXCLUDED.planned_removal_release_no,
        updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_key (id,tenant_id,entity_id,change_set_id,key_key,key_kind,uniqueness_scope,null_semantics,
        status,replacement_key_key,deprecated_since_release_no,planned_removal_release_no,created_by)
      SELECT (k->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,k->>'key_key',
        (k->>'key_kind')::metadata.entity_key_kind_d,(k->>'uniqueness_scope')::metadata.entity_uniqueness_scope_d,
        (k->>'null_semantics')::metadata.entity_null_semantics_d,(k->>'status')::metadata.entity_member_status_d,
        k->>'replacement_key_key',(k->>'deprecated_since_release_no')::bigint,(k->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'keys') k
      ON CONFLICT (id) DO UPDATE SET key_kind=EXCLUDED.key_kind,uniqueness_scope=EXCLUDED.uniqueness_scope,
        null_semantics=EXCLUDED.null_semantics,status=EXCLUDED.status,replacement_key_key=EXCLUDED.replacement_key_key,
        deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,planned_removal_release_no=EXCLUDED.planned_removal_release_no,
        updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_search_profile (id,tenant_id,entity_id,change_set_id,search_key,search_kind,query_operator,
        minimum_query_length,language_code,normalization_mode,is_default,status,replacement_search_key,
        deprecated_since_release_no,planned_removal_release_no,created_by)
      SELECT (s->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,s->>'search_key',
        (s->>'search_kind')::metadata.entity_search_kind_d,(s->>'query_operator')::metadata.entity_search_operator_d,
        (s->>'minimum_query_length')::smallint,s->>'language_code',(s->>'normalization_mode')::metadata.entity_search_normalization_d,
        (s->>'is_default')::boolean,(s->>'status')::metadata.entity_member_status_d,s->>'replacement_search_key',
        (s->>'deprecated_since_release_no')::bigint,(s->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'search_profiles') s
      ON CONFLICT (id) DO UPDATE SET search_kind=EXCLUDED.search_kind,query_operator=EXCLUDED.query_operator,
        minimum_query_length=EXCLUDED.minimum_query_length,language_code=EXCLUDED.language_code,
        normalization_mode=EXCLUDED.normalization_mode,is_default=EXCLUDED.is_default,status=EXCLUDED.status,
        replacement_search_key=EXCLUDED.replacement_search_key,deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,
        planned_removal_release_no=EXCLUDED.planned_removal_release_no,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_relation (id,tenant_id,entity_id,change_set_id,relation_key,relation_kind,resolution_kind,
        ownership_mode,mutation_mode,on_delete,on_update,inverse_relation_key,status,replacement_relation_key,
        deprecated_since_release_no,planned_removal_release_no,created_by)
      SELECT (r->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,r->>'relation_key',
        (r->>'relation_kind')::metadata.entity_relation_kind_d,(r->>'resolution_kind')::metadata.entity_relation_resolution_d,
        (r->>'ownership_mode')::metadata.entity_relation_ownership_d,(r->>'mutation_mode')::metadata.entity_relation_mutation_d,
        (r->>'on_delete')::metadata.entity_relation_delete_action_d,(r->>'on_update')::metadata.entity_relation_update_action_d,
        r->>'inverse_relation_key',(r->>'status')::metadata.entity_member_status_d,r->>'replacement_relation_key',
        (r->>'deprecated_since_release_no')::bigint,(r->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'relations') r
      ON CONFLICT (id) DO UPDATE SET relation_kind=EXCLUDED.relation_kind,resolution_kind=EXCLUDED.resolution_kind,
        ownership_mode=EXCLUDED.ownership_mode,mutation_mode=EXCLUDED.mutation_mode,on_delete=EXCLUDED.on_delete,
        on_update=EXCLUDED.on_update,inverse_relation_key=EXCLUDED.inverse_relation_key,status=EXCLUDED.status,
        replacement_relation_key=EXCLUDED.replacement_relation_key,deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,
        planned_removal_release_no=EXCLUDED.planned_removal_release_no,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_key_field (id,tenant_id,entity_id,change_set_id,entity_key_id,entity_field_id,position,created_by)
      SELECT (f->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,(k->>'id')::uuid,
        (f->>'entity_field_id')::uuid,(f->>'position')::smallint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'keys') k, jsonb_array_elements(k->'fields') f
      ON CONFLICT (id) DO UPDATE SET entity_field_id=EXCLUDED.entity_field_id,position=EXCLUDED.position,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_search_field (id,tenant_id,entity_id,change_set_id,entity_search_profile_id,entity_field_id,
        position,match_mode,weight,created_by)
      SELECT (f->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,(s->>'id')::uuid,
        (f->>'entity_field_id')::uuid,(f->>'position')::smallint,(f->>'match_mode')::metadata.entity_search_match_mode_d,
        (f->>'weight')::numeric,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'search_profiles') s, jsonb_array_elements(s->'fields') f
      ON CONFLICT (id) DO UPDATE SET entity_field_id=EXCLUDED.entity_field_id,position=EXCLUDED.position,
        match_mode=EXCLUDED.match_mode,weight=EXCLUDED.weight,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_relation_target (id,tenant_id,entity_id,change_set_id,entity_relation_id,
        relation_target_key,target_entity_id,target_key_key,discriminator_value,is_default,created_by)
      SELECT (t->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,(r->>'id')::uuid,
        t->>'relation_target_key',(t->>'target_entity_id')::uuid,t->>'target_key_key',t->>'discriminator_value',
        (t->>'is_default')::boolean,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'relations') r, jsonb_array_elements(r->'targets') t
      ON CONFLICT (id) DO UPDATE SET target_entity_id=EXCLUDED.target_entity_id,target_key_key=EXCLUDED.target_key_key,
        discriminator_value=EXCLUDED.discriminator_value,is_default=EXCLUDED.is_default,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_relation_field (id,tenant_id,entity_id,change_set_id,entity_relation_target_id,
        source_field_id,target_field_key,position,created_by)
      SELECT (f->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,(t->>'id')::uuid,
        (f->>'source_field_id')::uuid,f->>'target_field_key',(f->>'position')::smallint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'relations') r,
        jsonb_array_elements(r->'targets') t, jsonb_array_elements(t->'fields') f
      ON CONFLICT (id) DO UPDATE SET source_field_id=EXCLUDED.source_field_id,target_field_key=EXCLUDED.target_field_key,
        position=EXCLUDED.position,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_surface (id,tenant_id,entity_id,change_set_id,surface_key,surface_kind,title,
        description,layout_kind,layout_config,is_default,status,replacement_surface_key,
        deprecated_since_release_no,planned_removal_release_no,created_by)
      SELECT (s->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,s->>'surface_key',
        (s->>'surface_kind')::metadata.entity_surface_kind_d,s->>'title',s->>'description',
        (s->>'layout_kind')::metadata.entity_surface_layout_d,s->'layout_config',(s->>'is_default')::boolean,
        (s->>'status')::metadata.entity_member_status_d,s->>'replacement_surface_key',
        (s->>'deprecated_since_release_no')::bigint,(s->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'surfaces') s
      ON CONFLICT (id) DO UPDATE SET surface_kind=EXCLUDED.surface_kind,title=EXCLUDED.title,
        description=EXCLUDED.description,layout_kind=EXCLUDED.layout_kind,layout_config=EXCLUDED.layout_config,
        is_default=EXCLUDED.is_default,status=EXCLUDED.status,replacement_surface_key=EXCLUDED.replacement_surface_key,
        deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,
        planned_removal_release_no=EXCLUDED.planned_removal_release_no,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_surface_section (id,tenant_id,entity_id,change_set_id,entity_surface_id,
        section_key,parent_section_id,section_kind,title,description,position,column_count,collapsible,
        collapsed_by_default,layout_config,created_by)
      SELECT (section_row->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,(s->>'id')::uuid,
        section_row->>'section_key',(section_row->>'parent_section_id')::uuid,
        (section_row->>'section_kind')::metadata.entity_surface_section_kind_d,section_row->>'title',
        section_row->>'description',(section_row->>'position')::smallint,(section_row->>'column_count')::smallint,
        (section_row->>'collapsible')::boolean,(section_row->>'collapsed_by_default')::boolean,
        section_row->'layout_config',${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'surfaces') s,
        jsonb_array_elements(s->'sections') section_row
      ON CONFLICT (id) DO UPDATE SET parent_section_id=EXCLUDED.parent_section_id,
        section_kind=EXCLUDED.section_kind,title=EXCLUDED.title,description=EXCLUDED.description,
        position=EXCLUDED.position,column_count=EXCLUDED.column_count,collapsible=EXCLUDED.collapsible,
        collapsed_by_default=EXCLUDED.collapsed_by_default,layout_config=EXCLUDED.layout_config,
        updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_surface_field_binding (id,tenant_id,entity_id,change_set_id,entity_surface_id,
        entity_surface_section_id,entity_field_id,binding_key,position,label_override,help_text,placeholder,
        widget_key,column_span,show_required_indicator,display_config,visibility_rule,editability_rule,status,created_by)
      SELECT (f->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,(s->>'id')::uuid,
        (f->>'section_id')::uuid,(f->>'entity_field_id')::uuid,f->>'binding_key',(f->>'position')::smallint,
        f->>'label_override',f->>'help_text',f->>'placeholder',f->>'widget_key',(f->>'column_span')::smallint,
        (f->>'show_required_indicator')::boolean,f->'display_config',NULLIF(f->'visibility_rule','null'::jsonb),
        NULLIF(f->'editability_rule','null'::jsonb),(f->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'surfaces') s,
        jsonb_array_elements(s->'field_bindings') f
      ON CONFLICT (id) DO UPDATE SET entity_surface_section_id=EXCLUDED.entity_surface_section_id,
        entity_field_id=EXCLUDED.entity_field_id,position=EXCLUDED.position,label_override=EXCLUDED.label_override,
        help_text=EXCLUDED.help_text,placeholder=EXCLUDED.placeholder,widget_key=EXCLUDED.widget_key,
        column_span=EXCLUDED.column_span,show_required_indicator=EXCLUDED.show_required_indicator,
        display_config=EXCLUDED.display_config,visibility_rule=EXCLUDED.visibility_rule,
        editability_rule=EXCLUDED.editability_rule,status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_operation (id,tenant_id,entity_id,change_set_id,operation_key,operation_kind,
        label,description,handler_key,permission_code,execution_mode,idempotency_mode,input_surface_key,
        confirmation_surface_key,result_surface_key,requires_mfa,audit_event_code,
        status,replacement_operation_key,deprecated_since_release_no,planned_removal_release_no,created_by)
      SELECT (op->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,op->>'operation_key',
        (op->>'operation_kind')::metadata.entity_operation_kind_d,op->>'label',op->>'description',op->>'handler_key',
        op->>'permission_code',(op->>'execution_mode')::metadata.entity_operation_execution_d,
        (op->>'idempotency_mode')::metadata.entity_operation_idempotency_d,op->>'input_surface_key',
        op->>'confirmation_surface_key',op->>'result_surface_key',
        (op->>'requires_mfa')::boolean,op->>'audit_event_code',(op->>'status')::metadata.entity_member_status_d,
        op->>'replacement_operation_key',(op->>'deprecated_since_release_no')::bigint,
        (op->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'operations') op
      ON CONFLICT (id) DO UPDATE SET operation_kind=EXCLUDED.operation_kind,label=EXCLUDED.label,
        description=EXCLUDED.description,handler_key=EXCLUDED.handler_key,permission_code=EXCLUDED.permission_code,
        execution_mode=EXCLUDED.execution_mode,idempotency_mode=EXCLUDED.idempotency_mode,
        input_surface_key=EXCLUDED.input_surface_key,confirmation_surface_key=EXCLUDED.confirmation_surface_key,
        result_surface_key=EXCLUDED.result_surface_key,
        requires_mfa=EXCLUDED.requires_mfa,audit_event_code=EXCLUDED.audit_event_code,status=EXCLUDED.status,
        replacement_operation_key=EXCLUDED.replacement_operation_key,
        deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,
        planned_removal_release_no=EXCLUDED.planned_removal_release_no,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_surface_operation (
        id,tenant_id,entity_id,change_set_id,entity_surface_id,entity_operation_id,entity_surface_section_id,
        placement_key,interaction_target,selection_mode,position,label_override,icon_key,presentation_variant,
        confirmation_surface_id,visibility_rule,status,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'surface_id')::uuid,(x->>'operation_id')::uuid,(x->>'section_id')::uuid,x->>'placement_key',
        (x->>'interaction_target')::metadata.entity_surface_operation_target_d,
        (x->>'selection_mode')::metadata.entity_surface_operation_selection_d,(x->>'position')::smallint,
        x->>'label_override',x->>'icon_key',x->>'presentation_variant',(x->>'confirmation_surface_id')::uuid,
        NULLIF(x->'visibility_rule','null'::jsonb),(x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'surface_operations') x
      ON CONFLICT (id) DO UPDATE SET entity_operation_id=EXCLUDED.entity_operation_id,
        entity_surface_section_id=EXCLUDED.entity_surface_section_id,interaction_target=EXCLUDED.interaction_target,
        selection_mode=EXCLUDED.selection_mode,position=EXCLUDED.position,label_override=EXCLUDED.label_override,
        icon_key=EXCLUDED.icon_key,presentation_variant=EXCLUDED.presentation_variant,
        confirmation_surface_id=EXCLUDED.confirmation_surface_id,visibility_rule=EXCLUDED.visibility_rule,
        status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_operation_rule (
        id,tenant_id,entity_id,change_set_id,entity_operation_id,rule_key,priority,decision,plane_code,
        lifecycle_state_code,lifecycle_transition_code,required_capability_code,reason_code,status,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'operation_id')::uuid,x->>'rule_key',(x->>'priority')::smallint,
        (x->>'decision')::metadata.entity_operation_rule_decision_d,x->>'plane_code',x->>'lifecycle_state_code',
        x->>'lifecycle_transition_code',x->>'required_capability_code',x->>'reason_code',
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'operation_rules') x
      ON CONFLICT (id) DO UPDATE SET priority=EXCLUDED.priority,decision=EXCLUDED.decision,plane_code=EXCLUDED.plane_code,
        lifecycle_state_code=EXCLUDED.lifecycle_state_code,lifecycle_transition_code=EXCLUDED.lifecycle_transition_code,
        required_capability_code=EXCLUDED.required_capability_code,reason_code=EXCLUDED.reason_code,
        status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_operation_scope_binding (
        id,tenant_id,entity_id,change_set_id,entity_operation_id,binding_key,target_plane,
        decision_mode,scope_kind,coordinate_source,coordinate_key,resolver_key,
        missing_value_behavior,status,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'operation_id')::uuid,x->>'binding_key',x->>'target_plane',x->>'decision_mode',
        x->>'scope_kind',x->>'coordinate_source',x->>'coordinate_key',x->>'resolver_key',
        x->>'missing_value_behavior',(x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'operation_scope_bindings') x
      ON CONFLICT (id) DO UPDATE SET decision_mode=EXCLUDED.decision_mode,
        coordinate_source=EXCLUDED.coordinate_source,coordinate_key=EXCLUDED.coordinate_key,
        resolver_key=EXCLUDED.resolver_key,missing_value_behavior=EXCLUDED.missing_value_behavior,
        status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_flow (
        id,tenant_id,entity_id,change_set_id,flow_key,flow_kind,title,description,navigation_mode,
        entry_operation_id,completion_operation_id,allow_draft_resume,status,replacement_flow_key,
        deprecated_since_release_no,planned_removal_release_no,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,x->>'flow_key',
        (x->>'flow_kind')::metadata.entity_flow_kind_d,x->>'title',x->>'description',
        (x->>'navigation_mode')::metadata.entity_flow_navigation_d,(x->>'entry_operation_id')::uuid,
        (x->>'completion_operation_id')::uuid,(x->>'allow_draft_resume')::boolean,
        (x->>'status')::metadata.entity_member_status_d,x->>'replacement_flow_key',
        (x->>'deprecated_since_release_no')::bigint,(x->>'planned_removal_release_no')::bigint,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'flows') x
      ON CONFLICT (id) DO UPDATE SET flow_kind=EXCLUDED.flow_kind,title=EXCLUDED.title,description=EXCLUDED.description,
        navigation_mode=EXCLUDED.navigation_mode,entry_operation_id=EXCLUDED.entry_operation_id,
        completion_operation_id=EXCLUDED.completion_operation_id,allow_draft_resume=EXCLUDED.allow_draft_resume,
        status=EXCLUDED.status,replacement_flow_key=EXCLUDED.replacement_flow_key,
        deprecated_since_release_no=EXCLUDED.deprecated_since_release_no,
        planned_removal_release_no=EXCLUDED.planned_removal_release_no,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_flow_step (
        id,tenant_id,entity_id,change_set_id,entity_flow_id,entity_surface_id,step_key,position,title_override,
        description,entry_condition,completion_condition,is_optional,created_by
      ) SELECT (step->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (flow_row->>'id')::uuid,(step->>'surface_id')::uuid,step->>'step_key',(step->>'position')::smallint,
        step->>'title_override',step->>'description',NULLIF(step->'entry_condition','null'::jsonb),
        NULLIF(step->'completion_condition','null'::jsonb),(step->>'is_optional')::boolean,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'flows') flow_row,
        jsonb_array_elements(flow_row->'steps') step
      ON CONFLICT (id) DO UPDATE SET entity_surface_id=EXCLUDED.entity_surface_id,position=EXCLUDED.position,
        title_override=EXCLUDED.title_override,description=EXCLUDED.description,
        entry_condition=EXCLUDED.entry_condition,completion_condition=EXCLUDED.completion_condition,
        is_optional=EXCLUDED.is_optional,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_policy_binding (
        id,tenant_id,entity_id,change_set_id,entity_operation_id,policy_definition_id,binding_key,binding_stage,
        enforcement,priority,input_mapping,status,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'operation_id')::uuid,(x->>'policy_definition_id')::uuid,x->>'binding_key',
        (x->>'binding_stage')::metadata.entity_policy_binding_stage_d,
        (x->>'enforcement')::metadata.entity_policy_enforcement_d,(x->>'priority')::smallint,x->'input_mapping',
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'policy_bindings') x
      ON CONFLICT (id) DO UPDATE SET entity_operation_id=EXCLUDED.entity_operation_id,
        policy_definition_id=EXCLUDED.policy_definition_id,binding_stage=EXCLUDED.binding_stage,
        enforcement=EXCLUDED.enforcement,priority=EXCLUDED.priority,input_mapping=EXCLUDED.input_mapping,
        status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_field_policy_binding (
        id,tenant_id,entity_id,change_set_id,entity_field_id,entity_operation_id,policy_definition_id,binding_key,
        binding_stage,enforcement,priority,input_mapping,status,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'field_id')::uuid,(x->>'operation_id')::uuid,(x->>'policy_definition_id')::uuid,x->>'binding_key',
        (x->>'binding_stage')::metadata.entity_policy_binding_stage_d,
        (x->>'enforcement')::metadata.entity_policy_enforcement_d,(x->>'priority')::smallint,x->'input_mapping',
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'field_policy_bindings') x
      ON CONFLICT (id) DO UPDATE SET entity_field_id=EXCLUDED.entity_field_id,
        entity_operation_id=EXCLUDED.entity_operation_id,policy_definition_id=EXCLUDED.policy_definition_id,
        binding_stage=EXCLUDED.binding_stage,enforcement=EXCLUDED.enforcement,priority=EXCLUDED.priority,
        input_mapping=EXCLUDED.input_mapping,status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_contract_test_case (
        id,tenant_id,entity_id,change_set_id,test_key,test_kind,title,description,target_plane,
        entity_operation_id,entity_flow_id,input_context,expected_outcome,expected_diagnostic_codes,status,created_by
      ) SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,x->>'test_key',
        (x->>'test_kind')::metadata.entity_contract_test_kind_d,x->>'title',x->>'description',x->>'target_plane',
        (x->>'operation_id')::uuid,(x->>'flow_id')::uuid,x->'input_context',
        (x->>'expected_outcome')::metadata.entity_contract_test_outcome_d,
        ARRAY(SELECT jsonb_array_elements_text(x->'expected_diagnostic_codes')),
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'test_cases') x
      ON CONFLICT (id) DO UPDATE SET test_kind=EXCLUDED.test_kind,title=EXCLUDED.title,description=EXCLUDED.description,
        target_plane=EXCLUDED.target_plane,entity_operation_id=EXCLUDED.entity_operation_id,
        entity_flow_id=EXCLUDED.entity_flow_id,input_context=EXCLUDED.input_context,
        expected_outcome=EXCLUDED.expected_outcome,expected_diagnostic_codes=EXCLUDED.expected_diagnostic_codes,
        status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_lifecycle_binding (id,tenant_id,entity_id,change_set_id,entity_field_id,binding_key,
        target_plane,lifecycle_code,lifecycle_revision,required,status,created_by)
      SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'state_field_id')::uuid,x->>'binding_key',x->>'target_plane',x->>'lifecycle_code',
        (x->>'lifecycle_revision')::integer,(x->>'required')::boolean,
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'lifecycle_bindings') x
      ON CONFLICT (id) DO UPDATE SET entity_field_id=EXCLUDED.entity_field_id,target_plane=EXCLUDED.target_plane,
        lifecycle_code=EXCLUDED.lifecycle_code,lifecycle_revision=EXCLUDED.lifecycle_revision,
        required=EXCLUDED.required,status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_lifecycle_operation_binding (id,tenant_id,entity_id,change_set_id,
        entity_lifecycle_binding_id,entity_operation_id,mapping_key,transition_code,status,created_by)
      SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'lifecycle_binding_id')::uuid,(x->>'operation_id')::uuid,x->>'mapping_key',x->>'transition_code',
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'lifecycle_operation_bindings') x
      ON CONFLICT (id) DO UPDATE SET transition_code=EXCLUDED.transition_code,status=EXCLUDED.status,updated_by=${actorId}::uuid
    `.execute(tx);
    await sql`
      INSERT INTO metadata.entity_numbering_binding (id,tenant_id,entity_id,change_set_id,entity_field_id,
        entity_operation_id,binding_key,target_plane,policy_code,policy_revision,assignment_mode,required,status,created_by)
      SELECT (x->>'id')::uuid,${tenantId}::uuid,${entityId}::uuid,${changeSetId}::uuid,
        (x->>'field_id')::uuid,(x->>'operation_id')::uuid,x->>'binding_key',x->>'target_plane',
        x->>'policy_code',(x->>'policy_revision')::integer,x->>'assignment_mode',(x->>'required')::boolean,
        (x->>'status')::metadata.entity_member_status_d,${actorId}::uuid
      FROM jsonb_array_elements(${document}::jsonb->'numbering_bindings') x
      ON CONFLICT (id) DO UPDATE SET entity_field_id=EXCLUDED.entity_field_id,
        entity_operation_id=EXCLUDED.entity_operation_id,target_plane=EXCLUDED.target_plane,
        policy_code=EXCLUDED.policy_code,policy_revision=EXCLUDED.policy_revision,
        assignment_mode=EXCLUDED.assignment_mode,required=EXCLUDED.required,status=EXCLUDED.status,
        updated_by=${actorId}::uuid
    `.execute(tx);
  }

  checkpoint(
    context: MetaEntityActorContext,
    command: MetaEntityCheckpointCommand,
    canonicalContract: unknown,
    diagnostics: MetaEntityValidationResult["diagnostics"],
  ): Promise<MetaEntityCheckpointResult> {
    return this.inContext(context, async (tx) => {
      const scope = await this.getScope(tx, context, command.changeSetId);
      this.assertTenantOwned(scope);
      if (Number(scope.lock_version) !== command.expectedLockVersion) {
        throw new MetaEntityAuthoringError("STALE_LOCK_VERSION", "This change set was modified by another author.", 409);
      }
      const previousResult = await sql<RevisionRow>`
        SELECT * FROM snapshot.entity_contract_revision WHERE change_set_id=${command.changeSetId}::uuid
        ORDER BY revision_no DESC LIMIT 1
      `.execute(tx);
      const previous = previousResult.rows[0];
      const changedPaths = diffCanonicalPaths(previous?.contract_json ?? {}, canonicalContract);
      const audit = await sql<{ id: string }>`SELECT audit.append_event(
        p_event_code=>'metadata.entity.change_set.checkpointed',p_operation=>'create',
        p_entity_type=>'metadata.entity',p_entity_id=>${scope.entity_id}::uuid,
        p_context=>${JSON.stringify({ change_set_id: command.changeSetId, lock_version: command.expectedLockVersion })}::jsonb,
        p_correlation_id=>${command.correlationId ?? context.correlationId ?? null}::uuid,
        p_request_id=>${context.requestId ?? null}
      ) AS id`.execute(tx);
      const inserted = await sql<RevisionRow>`
        INSERT INTO snapshot.entity_contract_revision (
          tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,base_release_id,
          contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,
          changed_paths,compatibility_level,validation_status,validation_diagnostics,audit_event_id,correlation_id,captured_by
        ) VALUES (
          ${context.tenantId}::uuid,${scope.entity_id}::uuid,${command.changeSetId}::uuid,${(previous?.revision_no ?? 0) + 1},
          ${previous?.id ?? null}::uuid,${scope.base_release_id}::uuid,'athyper.meta_entity','5.2',${JSON.stringify(canonicalContract)}::jsonb,
          repeat('0',64),repeat('0',64),1,ARRAY[${sql.join(changedPaths)}]::text[],
          ${command.compatibilityLevel}::metadata.compatibility_level_d,'valid',${JSON.stringify(diagnostics)}::jsonb,
          ${audit.rows[0]!.id}::uuid,${command.correlationId ?? context.correlationId ?? null}::uuid,${context.principalId}::uuid
        ) RETURNING id,change_set_id,revision_no,contract_hash,revision_hash,changed_paths,validation_status,captured_at
      `.execute(tx);
      const row = inserted.rows[0]!;
      await this.appendOutbox(tx, context, "metadata.entity.change_set.checkpointed", scope.entity_id, command.changeSetId, {
        revision_id: row.id, revision_no: row.revision_no, contract_hash: row.contract_hash,
      }, row.id);
      return mapRevision(row);
    });
  }

  listRevisions(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityCheckpointResult[]> {
    return this.inContext(context, async (tx) => {
      await this.getScope(tx, context, changeSetId);
      const result = await sql<RevisionRow>`SELECT id,change_set_id,revision_no,contract_hash,revision_hash,
        changed_paths,validation_status,captured_at FROM snapshot.entity_contract_revision
        WHERE change_set_id=${changeSetId}::uuid ORDER BY revision_no DESC`.execute(tx);
      return result.rows.map(mapRevision);
    });
  }

  diffRevisions(context: MetaEntityActorContext, leftRevisionId: string, rightRevisionId: string): Promise<readonly string[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{ id: string; contract_json: unknown }>`
        SELECT id,contract_json FROM snapshot.entity_contract_revision
        WHERE id IN (${leftRevisionId}::uuid,${rightRevisionId}::uuid)
          AND (tenant_id IS NULL OR tenant_id=${context.tenantId}::uuid)
      `.execute(tx);
      const left = result.rows.find((row) => row.id === leftRevisionId);
      const right = result.rows.find((row) => row.id === rightRevisionId);
      if (!left || !right) throw new MetaEntityAuthoringError("REVISION_NOT_FOUND", "One or both revisions were not found.", 404);
      return diffCanonicalPaths(left.contract_json, right.contract_json);
    });
  }

  transition(
    context: MetaEntityActorContext,
    action: MetaEntityWorkflowAction,
    command: MetaEntityWorkflowCommand,
  ): Promise<MetaEntityChangeSetSummary> {
    return this.inContext(context, async (tx) => {
      const scope = await this.getScope(tx, context, command.changeSetId);
      this.assertTenantOwned(scope);
      if (Number(scope.lock_version) !== command.expectedLockVersion) {
        throw new MetaEntityAuthoringError("STALE_LOCK_VERSION", "This change set was modified by another author.", 409);
      }
      const target = { submit: "in_review", return_to_draft: "draft", approve: "approved", reject: "rejected", abandon: "abandoned" }[action];
      if (action === "submit" || action === "approve") {
        const latest = await sql<{ validation_status: string; contract_hash: string; current_hash: string }>`
          SELECT r.validation_status,r.contract_hash,snapshot.fn_compute_entity_contract_hash(${JSON.stringify(
            canonicalizeMetaEntityGraph((await this.loadGraphInTransaction(tx, context, command.changeSetId))!),
          )}::jsonb) AS current_hash
          FROM snapshot.entity_contract_revision r WHERE r.change_set_id=${command.changeSetId}::uuid
          ORDER BY r.revision_no DESC LIMIT 1
        `.execute(tx);
        if (!latest.rows[0] || latest.rows[0].validation_status !== "valid" || latest.rows[0].contract_hash !== latest.rows[0].current_hash) {
          throw new MetaEntityAuthoringError("CHECKPOINT_REQUIRED", "Create a valid checkpoint for the current graph first.", 409);
        }
      }
      const updated = await sql<{
        id: string; entity_id: string; change_set_code: string; branch_code: string; title: string;
        status: MetaEntityChangeSetSummary["status"]; lock_version: number; updated_at: Date | string | null;
      }>`UPDATE metadata.entity_change_set SET status=${target}::metadata.entity_change_set_status_d,
          rejection_reason=${action === "reject" ? command.reason ?? null : null},updated_by=${context.principalId}::uuid
        WHERE id=${command.changeSetId}::uuid RETURNING id,entity_id,change_set_code,branch_code,title,status,lock_version,updated_at
      `.execute(tx);
      const row = updated.rows[0]!;
      const eventCode = `metadata.entity.change_set.${target}`;
      await sql`SELECT audit.append_event(p_event_code=>${eventCode},p_operation=>${action === "approve" ? "approve" : action === "reject" ? "reject" : "update"}::audit.operation_d,
        p_entity_type=>'metadata.entity',p_entity_id=>${scope.entity_id}::uuid,
        p_old_values=>${JSON.stringify({ status: scope.status })}::jsonb,p_new_values=>${JSON.stringify({ status: target })}::jsonb,
        p_context=>${JSON.stringify({ change_set_id: command.changeSetId, reason: command.reason ?? null })}::jsonb,
        p_correlation_id=>${command.correlationId ?? context.correlationId ?? null}::uuid,p_request_id=>${context.requestId ?? null})`.execute(tx);
      await this.appendOutbox(tx, context, eventCode, scope.entity_id, command.changeSetId, { status: target },
        `${command.changeSetId}:${target}:${row.lock_version}`);
      return { id: row.id, entityId: row.entity_id, code: row.change_set_code, branchCode: row.branch_code,
        title: row.title, status: row.status, lockVersion: Number(row.lock_version), baseReleaseNo: null,
        updatedAt: row.updated_at ? asIso(row.updated_at) : null };
    });
  }

  publish(context: MetaEntityActorContext, command: MetaEntityPublishCommand): Promise<MetaEntityReleaseResult> {
    return this.inContext(context, async (tx) => {
      const releaseKind = command.releaseKind ?? "publish";
      const scope = await this.getScope(tx, context, command.changeSetId);
      this.assertTenantOwned(scope);
      if (scope.status !== "approved") throw new MetaEntityAuthoringError("CHANGE_SET_NOT_APPROVED", "Approve the change set before publication.", 409);
      if (Number(scope.lock_version) !== command.expectedLockVersion) throw new MetaEntityAuthoringError("STALE_LOCK_VERSION", "This change set was modified by another author.", 409);
      const head = await sql<{ id: string; release_no: number | string }>`SELECT id,release_no FROM metadata.entity_release
        WHERE entity_id=${scope.entity_id}::uuid AND tenant_id=${context.tenantId}::uuid ORDER BY release_no DESC LIMIT 1`.execute(tx);
      const previous = head.rows[0];
      const eventCode = releaseKind === "rollback"
        ? "metadata.entity.release.rolled_back"
        : releaseKind === "retire"
          ? "metadata.entity.release.retired"
          : "metadata.entity.release.published";
      const audit = await sql<{ id: string }>`SELECT audit.append_event(p_event_code=>${eventCode},
        p_operation=>'execute',p_entity_type=>'metadata.entity',p_entity_id=>${scope.entity_id}::uuid,
        p_context=>${JSON.stringify({ change_set_id: command.changeSetId, revision_id: command.revisionId,
          release_kind: releaseKind, rollback_of_release_id: command.rollbackOfReleaseId ?? null })}::jsonb,
        p_correlation_id=>${command.correlationId ?? context.correlationId ?? null}::uuid,p_request_id=>${context.requestId ?? null}) AS id`.execute(tx);
      const result = await sql<{ id: string; entity_id: string; change_set_id: string; revision_id: string; release_no: number; release_hash: string; published_at: Date | string }>`
        INSERT INTO metadata.entity_release (tenant_id,entity_id,change_set_id,revision_id,release_no,version_label,
          release_kind,supersedes_release_id,rollback_of_release_id,contract_schema_code,contract_schema_version,contract_hash,revision_hash,
          release_hash,compatibility_level,target_planes,minimum_runtime_version,audit_event_id,publication_reason,
          ticket_reference,correlation_id,published_by)
        VALUES (${context.tenantId}::uuid,${scope.entity_id}::uuid,${command.changeSetId}::uuid,${command.revisionId}::uuid,
          ${Number(previous?.release_no ?? 0) + 1},${command.versionLabel ?? null},${releaseKind}::metadata.entity_release_kind_d,
          ${previous?.id ?? null}::uuid,${command.rollbackOfReleaseId ?? null}::uuid,
          'pending','0.0',repeat('0',64),repeat('0',64),repeat('0',64),'backward_compatible',
          ARRAY[${sql.join(command.targetPlanes)}]::text[],${command.minimumRuntimeVersion ?? null},${audit.rows[0]!.id}::uuid,
          ${command.reason ?? null},${command.ticketReference ?? null},${command.correlationId ?? context.correlationId ?? null}::uuid,
          ${context.principalId}::uuid)
        RETURNING id,entity_id,change_set_id,revision_id,release_no,release_hash,published_at
      `.execute(tx);
      const row = result.rows[0]!;
      await this.appendOutbox(tx, context, eventCode, scope.entity_id, command.changeSetId, {
        release_id: row.id, revision_id: row.revision_id, release_no: row.release_no,
      }, row.id);
      return { id: row.id, entityId: row.entity_id, changeSetId: row.change_set_id, revisionId: row.revision_id,
        releaseNo: Number(row.release_no), releaseHash: row.release_hash, publishedAt: asIso(row.published_at) };
    });
  }

  listReleases(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityReleaseSummary[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; entity_id: string; change_set_id: string; revision_id: string;
        release_no: number | string; release_hash: string; published_at: Date | string;
        release_kind: MetaEntityReleaseSummary["releaseKind"]; version_label: string | null;
        rollback_of_release_id: string | null; target_planes: MetaEntityReleaseSummary["targetPlanes"];
        published_by: string;
      }>`
        SELECT id, entity_id, change_set_id, revision_id, release_no, release_hash, published_at,
               release_kind, version_label, rollback_of_release_id, target_planes, published_by
          FROM metadata.entity_release
         WHERE entity_id = ${entityId}::uuid
           AND (tenant_id IS NULL OR tenant_id = ${context.tenantId}::uuid)
         ORDER BY release_no DESC
      `.execute(tx);
      return result.rows.map((row) => ({
        id: row.id,
        entityId: row.entity_id,
        changeSetId: row.change_set_id,
        revisionId: row.revision_id,
        releaseNo: Number(row.release_no),
        releaseHash: row.release_hash,
        publishedAt: asIso(row.published_at),
        releaseKind: row.release_kind,
        versionLabel: row.version_label,
        rollbackOfReleaseId: row.rollback_of_release_id,
        targetPlanes: row.target_planes,
        publishedBy: row.published_by,
      }));
    });
  }

  listActivity(context: MetaEntityActorContext, entityId: string): Promise<readonly MetaEntityActivityItem[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<{
        id: string; event_code: string; operation: string; outcome: string; severity: string;
        actor_principal_id: string | null; occurred_at: Date | string; correlation_id: string | null;
        context: Record<string, unknown>;
      }>`
        SELECT id, event_code, operation, outcome, severity, actor_principal_id,
               occurred_at, correlation_id, context
          FROM audit.audit_log
         WHERE entity_type = 'metadata.entity'
           AND entity_id = ${entityId}::uuid
           AND (tenant_id IS NULL OR tenant_id = ${context.tenantId}::uuid)
         ORDER BY occurred_at DESC, id DESC
         LIMIT 200
      `.execute(tx);
      return result.rows.map((row) => ({
        id: row.id,
        eventCode: row.event_code,
        operation: row.operation,
        outcome: row.outcome,
        severity: row.severity,
        actorPrincipalId: row.actor_principal_id,
        occurredAt: asIso(row.occurred_at),
        correlationId: row.correlation_id,
        context: row.context,
      }));
    });
  }

  persistContractTestRun(
    context: MetaEntityActorContext,
    command: MetaEntityContractTestRunCommand,
    execution: ContractTestExecution,
  ): Promise<MetaEntityContractTestRun> {
    return this.inContext(context, async (tx) => {
      const scope = await this.getScope(tx, context, command.changeSetId);
      if (Number(scope.lock_version) !== command.expectedLockVersion) {
        throw new MetaEntityAuthoringError("STALE_LOCK_VERSION", "The graph changed while its contract tests were executing.", 409);
      }
      const revision = await sql<{ id: string }>`
        SELECT id FROM snapshot.entity_contract_revision
         WHERE change_set_id=${command.changeSetId}::uuid
           AND contract_hash=${execution.sourceContractHash}
         ORDER BY revision_no DESC LIMIT 1
      `.execute(tx);
      const passedCount = execution.results.filter((item) => item.assertionPassed).length;
      const errorCount = execution.results.filter((item) => !item.assertionPassed && item.actualOutcome === "error").length;
      const failedCount = execution.results.length - passedCount - errorCount;
      const audit = await sql<{ id: string }>`SELECT audit.append_event(
        p_event_code=>'metadata.entity.contract_tests.executed',p_operation=>'execute',
        p_entity_type=>'metadata.entity',p_entity_id=>${scope.entity_id}::uuid,
        p_outcome=>${execution.status === "passed" ? "success" : "failure"},
        p_severity=>${execution.status === "passed" ? "info" : "warning"},
        p_context=>${JSON.stringify({ change_set_id: command.changeSetId, source_lock_version: command.expectedLockVersion,
          source_contract_hash: execution.sourceContractHash, total_count: execution.results.length,
          passed_count: passedCount, failed_count: failedCount, error_count: errorCount })}::jsonb,
        p_correlation_id=>${command.correlationId ?? context.correlationId ?? null}::uuid,
        p_request_id=>${context.requestId ?? null}
      ) AS id`.execute(tx);
      const inserted = await sql<ContractTestRunRow>`
        INSERT INTO snapshot.entity_contract_test_run (
          tenant_id,source_tenant_id,entity_id,change_set_id,revision_id,source_lock_version,
          contract_schema_code,contract_schema_version,source_contract_json,source_contract_hash,
          runner_code,runner_version,status,total_count,passed_count,failed_count,error_count,duration_ms,
          run_hash,audit_event_id,correlation_id,executed_by
        ) VALUES (
          ${context.tenantId}::uuid,${scope.tenant_id}::uuid,${scope.entity_id}::uuid,${command.changeSetId}::uuid,
          ${revision.rows[0]?.id ?? null}::uuid,${command.expectedLockVersion},'athyper.meta_entity','5.2',
          ${JSON.stringify(execution.canonicalContract)}::jsonb,${execution.sourceContractHash},
          ${META_ENTITY_CONTRACT_RUNNER_CODE},${META_ENTITY_CONTRACT_RUNNER_VERSION},
          ${execution.status}::snapshot.entity_contract_test_run_status_d,${execution.results.length},${passedCount},
          ${failedCount},${errorCount},${execution.durationMs},${execution.runHash},${audit.rows[0]!.id}::uuid,
          ${command.correlationId ?? context.correlationId ?? null}::uuid,${context.principalId}::uuid
        ) RETURNING id,entity_id,change_set_id,revision_id,source_lock_version,source_contract_hash,runner_code,
          runner_version,status,total_count,passed_count,failed_count,error_count,duration_ms,run_hash,executed_at,executed_by
      `.execute(tx);
      const run = inserted.rows[0]!;
      const results: MetaEntityContractTestResult[] = [];
      for (const item of execution.results) {
        const diagnosticCodes = item.diagnostics.map((entry) => entry.code).sort();
        const result = await sql<ContractTestResultRow>`
          INSERT INTO snapshot.entity_contract_test_result (
            tenant_id,test_run_id,ordinal,test_case_id,test_key,test_kind,target_plane,definition_json,
            definition_hash,expected_outcome,actual_outcome,assertion_passed,diagnostic_codes,diagnostics,
            actual_output,duration_ms,result_hash
          ) VALUES (
            ${context.tenantId}::uuid,${run.id}::uuid,${item.ordinal},${item.testCase.id}::uuid,${item.testCase.testKey},
            ${item.testCase.testKind}::metadata.entity_contract_test_kind_d,${item.testCase.targetPlane},
            ${JSON.stringify(item.testCase)}::jsonb,${item.definitionHash},
            ${item.testCase.expectedOutcome}::metadata.entity_contract_test_outcome_d,
            ${item.actualOutcome}::snapshot.entity_contract_test_actual_outcome_d,${item.assertionPassed},
            ARRAY[${sql.join(diagnosticCodes)}]::text[],${JSON.stringify(item.diagnostics)}::jsonb,
            ${JSON.stringify(item.actualOutput)}::jsonb,${item.durationMs},${item.resultHash}
          ) RETURNING id,test_run_id,ordinal,test_case_id,test_key,test_kind,target_plane,expected_outcome,
            actual_outcome,assertion_passed,diagnostic_codes,diagnostics,actual_output,duration_ms,result_hash
        `.execute(tx);
        results.push(mapTestResult(result.rows[0]!));
      }
      await this.appendOutbox(tx, context, "metadata.entity.contract_tests.executed", scope.entity_id, command.changeSetId,
        { test_run_id: run.id, status: execution.status, source_contract_hash: execution.sourceContractHash }, run.id);
      return { ...mapTestRun(run), results };
    });
  }

  listContractTestRuns(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityContractTestRun[]> {
    return this.inContext(context, async (tx) => {
      await this.getScope(tx, context, changeSetId);
      const result = await sql<ContractTestRunRow>`SELECT id,entity_id,change_set_id,revision_id,source_lock_version,
        source_contract_hash,runner_code,runner_version,status,total_count,passed_count,failed_count,error_count,
        duration_ms,run_hash,executed_at,executed_by FROM snapshot.entity_contract_test_run
        WHERE tenant_id=${context.tenantId}::uuid AND change_set_id=${changeSetId}::uuid
        ORDER BY executed_at DESC,id DESC LIMIT 100`.execute(tx);
      return result.rows.map(mapTestRun);
    });
  }

  listContractTestResults(context: MetaEntityActorContext, testRunId: string): Promise<readonly MetaEntityContractTestResult[]> {
    return this.inContext(context, async (tx) => {
      const result = await sql<ContractTestResultRow>`SELECT id,test_run_id,ordinal,test_case_id,test_key,test_kind,
        target_plane,expected_outcome,actual_outcome,assertion_passed,diagnostic_codes,diagnostics,actual_output,
        duration_ms,result_hash FROM snapshot.entity_contract_test_result
        WHERE tenant_id=${context.tenantId}::uuid AND test_run_id=${testRunId}::uuid ORDER BY ordinal`.execute(tx);
      if (!result.rows.length) {
        const run = await sql<{ id: string }>`SELECT id FROM snapshot.entity_contract_test_run
          WHERE tenant_id=${context.tenantId}::uuid AND id=${testRunId}::uuid`.execute(tx);
        if (!run.rows[0]) throw new MetaEntityAuthoringError("TEST_RUN_NOT_FOUND", "Contract test run was not found.", 404);
      }
      return result.rows.map(mapTestResult);
    });
  }

  persistNumberingTestArtifact(
    context: MetaEntityActorContext,
    command: MetaEntityNumberingPreviewCommand,
    execution: MetaEntityNumberingTestExecution,
  ): Promise<MetaEntityNumberingTestArtifact> {
    return this.inContext(context, async (tx) => {
      const scope = await this.getScope(tx, context, command.changeSetId);
      if (Number(scope.lock_version) !== command.expectedLockVersion) {
        throw new MetaEntityAuthoringError("STALE_LOCK_VERSION", "The graph changed while its numbering policy was being tested.", 409);
      }
      const binding = execution.bindingContract;
      const policyTest = execution.policyTest;
      const audit = await sql<{ id: string }>`SELECT audit.append_event(
        p_event_code=>'metadata.entity.numbering_policy.tested',p_operation=>'execute',
        p_entity_type=>'metadata.entity',p_entity_id=>${scope.entity_id}::uuid,
        p_outcome=>${execution.status === "passed" ? "success" : "failure"},
        p_severity=>${execution.status === "passed" ? "info" : "warning"},
        p_context=>${JSON.stringify({ change_set_id: command.changeSetId, numbering_binding_id: command.numberingBindingId,
          target_plane: binding.targetPlane, policy_code: binding.policyCode, policy_revision: binding.policyRevision,
          diagnostic_codes: execution.diagnosticCodes })}::jsonb,
        p_correlation_id=>${command.correlationId ?? context.correlationId ?? null}::uuid,
        p_request_id=>${context.requestId ?? null}
      ) AS id`.execute(tx);
      const zeroHash = "0".repeat(64);
      const inserted = await sql<NumberingTestArtifactRow>`
        INSERT INTO snapshot.entity_numbering_test_artifact (
          tenant_id,source_tenant_id,entity_id,change_set_id,source_lock_version,numbering_binding_id,
          binding_key,target_plane,field_key,operation_key,policy_code,policy_revision,policy_source,
          binding_contract_json,policy_contract_json,preview_input_json,actual_output_json,
          diagnostic_codes,diagnostics,status,binding_contract_hash,policy_contract_hash,
          preview_input_hash,actual_output_hash,artifact_hash,audit_event_id,correlation_id,executed_by
        ) VALUES (
          ${context.tenantId}::uuid,${scope.tenant_id}::uuid,${scope.entity_id}::uuid,${command.changeSetId}::uuid,
          ${command.expectedLockVersion},${command.numberingBindingId}::uuid,${String(binding.bindingKey)},
          ${String(binding.targetPlane)},${String(binding.fieldKey)},${binding.operationKey == null ? null : String(binding.operationKey)},
          ${String(binding.policyCode)},${Number(binding.policyRevision)},${policyTest?.policySource ?? null},
          ${JSON.stringify(binding)}::jsonb,${policyTest ? JSON.stringify(policyTest.policy) : null}::jsonb,
          ${JSON.stringify({ nextValue: command.nextValue, occurredAt: command.occurredAt,
            scopeKey: command.scopeKey ?? null, fiscalYear: command.fiscalYear ?? null })}::jsonb,
          ${JSON.stringify(policyTest?.preview ?? {})}::jsonb,ARRAY[${sql.join([...execution.diagnosticCodes])}]::text[],
          ${JSON.stringify(execution.diagnostics)}::jsonb,${execution.status},${zeroHash},${policyTest ? zeroHash : null},
          ${zeroHash},${zeroHash},${zeroHash},${audit.rows[0]!.id}::uuid,
          ${command.correlationId ?? context.correlationId ?? null}::uuid,${context.principalId}::uuid
        ) RETURNING id,entity_id,change_set_id,source_lock_version,numbering_binding_id,binding_key,target_plane,
          field_key,operation_key,policy_code,policy_revision,policy_source,binding_contract_json,policy_contract_json,
          preview_input_json,actual_output_json,diagnostic_codes,diagnostics,status,artifact_hash,executed_at,executed_by
      `.execute(tx);
      const artifact = mapNumberingTestArtifact(inserted.rows[0]!);
      await this.appendOutbox(tx, context, "metadata.entity.numbering_policy.tested", scope.entity_id, command.changeSetId,
        { numbering_test_artifact_id: artifact.id, numbering_binding_id: command.numberingBindingId,
          target_plane: artifact.targetPlane, status: artifact.status, artifact_hash: artifact.artifactHash }, artifact.id);
      return artifact;
    });
  }

  listNumberingTestArtifacts(context: MetaEntityActorContext, changeSetId: string): Promise<readonly MetaEntityNumberingTestArtifact[]> {
    return this.inContext(context, async (tx) => {
      await this.getScope(tx, context, changeSetId);
      const result = await sql<NumberingTestArtifactRow>`SELECT id,entity_id,change_set_id,source_lock_version,
        numbering_binding_id,binding_key,target_plane,field_key,operation_key,policy_code,policy_revision,policy_source,
        binding_contract_json,policy_contract_json,preview_input_json,actual_output_json,diagnostic_codes,diagnostics,
        status,artifact_hash,executed_at,executed_by FROM snapshot.entity_numbering_test_artifact
        WHERE tenant_id=${context.tenantId}::uuid AND change_set_id=${changeSetId}::uuid
        ORDER BY executed_at DESC,id DESC LIMIT 100`.execute(tx);
      return result.rows.map(mapNumberingTestArtifact);
    });
  }

  private async appendOutbox(
    tx: DbExecutor,
    context: MetaEntityActorContext,
    eventType: string,
    entityId: string,
    changeSetId: string,
    payload: Record<string, unknown>,
    eventKey = `${eventType}:${changeSetId}`,
  ): Promise<void> {
    await sql`INSERT INTO event.outbox (tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,
      aggregate_id,actor_id,source,correlation_id,partition_key,payload,created_by)
      VALUES (${context.tenantId}::uuid,'metadata.entity.authoring',${eventType},${eventKey},'metadata.entity',
        ${entityId}::uuid,'metadata.entity',${entityId}::uuid,${context.principalId}::uuid,'meta-entity-authoring',
        ${context.correlationId ?? null}::uuid,${entityId},${JSON.stringify({ change_set_id: changeSetId, ...payload })}::jsonb,
        ${context.principalId}::uuid)`.execute(tx);
  }
}
