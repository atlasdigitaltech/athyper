import { createHash } from "node:crypto";

import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";

import type { MetaEntityContractV21 } from "@athyper/api-contracts/meta-entity-contract-v21";

import {
  ContractApplicationError,
  type CompiledPlaneArtifact,
  type ContractApplicationRepository,
  type ContractApplicationTransaction,
  type ContractDiagnostic,
  type ContractProjectionPlan,
  type ContractVersionState,
  type ResolvedContractReferences,
} from "./contract-application.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransaction = Transaction<any>;

function json(value: unknown): string {
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(json(value)).digest("hex");
}

/**
 * Artifact owner ids remain stable across environments and releases. Projection
 * ids must additionally include the immutable entity version because the
 * relational owner tables use globally unique primary keys.
 */
function projectionId(versionId: string, artifactOwnerId: string): string {
  const hex = createHash("sha256")
    .update(`${versionId}\u0000${artifactOwnerId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function legacySurfaceMode(mode: MetaEntityContractV21["surfaces"][number]["mode"]): string {
  if (mode === "create" || mode === "edit" || mode === "list" || mode === "print") return mode;
  if (mode === "picker" || mode === "compact_card" || mode === "spreadsheet") return "list";
  return "view";
}

function legacySurfaceKind(kind: MetaEntityContractV21["surfaces"][number]["kind"]): string {
  const mapping: Record<MetaEntityContractV21["surfaces"][number]["kind"], string> = {
    TABLE: "list",
    CARDS: "summary_cards",
    FORM: "fields",
    DETAIL: "fields",
    PICKER: "list",
    PRINT: "print",
    COLLECTION: "child_records",
    HEADER: "document_identity_summary",
    CUSTOM: "custom",
  };
  return mapping[kind];
}

function legacyOperationSurface(surface: MetaEntityContractV21["operations"][number]["surface"]): string {
  return surface;
}

function legacyHandlerKind(kind: MetaEntityContractV21["operations"][number]["handler"]["kind"]): string {
  return kind.toUpperCase();
}

function toVersionState(row: {
  version_id: string;
  entity_code: string;
  tenant_id: string | null;
  status: ContractVersionState["status"];
  contract_schema_version: string | null;
  contract_hash: string | null;
  lock_version: number;
  submitted_by: string | null;
}): ContractVersionState {
  return {
    versionId: row.version_id,
    entityCode: row.entity_code,
    tenantId: row.tenant_id,
    status: row.status,
    contractSchemaVersion: row.contract_schema_version,
    contractHash: row.contract_hash,
    lockVersion: row.lock_version,
    submittedBy: row.submitted_by,
  };
}

export class PostgresContractApplicationRepository implements ContractApplicationRepository {
  constructor(
    private readonly db: AnyDb,
    private readonly compileVersionInTransaction?: (
      transaction: AnyTransaction,
      versionId: string,
    ) => Promise<unknown>,
  ) {}

  async transaction<T>(
    work: (transaction: ContractApplicationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction().execute((trx) =>
      work(new PostgresContractApplicationTransaction(
        trx,
        this.compileVersionInTransaction,
      )));
  }

  async readVersion(versionId: string): Promise<ContractVersionState | null> {
    const result = await sql<{
      version_id: string;
      entity_code: string;
      tenant_id: string | null;
      status: ContractVersionState["status"];
      contract_schema_version: string | null;
      contract_hash: string | null;
      lock_version: number;
      submitted_by: string | null;
    }>`
      SELECT ev.id::text AS version_id, e.entity_code,
             ev.tenant_id::text AS tenant_id, ev.status,
             ev.contract_schema_version, ev.contract_hash, ev.lock_version,
             ev.submitted_by::text AS submitted_by
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
       WHERE ev.id = ${versionId}::uuid
       LIMIT 1
    `.execute(this.db);
    return result.rows[0] ? toVersionState(result.rows[0]) : null;
  }

  async exportCanonicalContract(versionId: string): Promise<{
    contract: unknown;
    version: ContractVersionState;
  } | null> {
    const result = await sql<{
      contract_document: unknown;
      version_id: string;
      entity_code: string;
      tenant_id: string | null;
      status: ContractVersionState["status"];
      contract_schema_version: string | null;
      contract_hash: string | null;
      lock_version: number;
      submitted_by: string | null;
    }>`
      SELECT ev.contract_document, ev.id::text AS version_id, e.entity_code,
             ev.tenant_id::text AS tenant_id, ev.status,
             ev.contract_schema_version, ev.contract_hash, ev.lock_version,
             ev.submitted_by::text AS submitted_by
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
       WHERE ev.id = ${versionId}::uuid
         AND ev.contract_schema_version = '2.1'
       LIMIT 1
    `.execute(this.db);
    const row = result.rows[0];
    return row ? { contract: row.contract_document, version: toVersionState(row) } : null;
  }
}

export class PostgresContractApplicationTransaction implements ContractApplicationTransaction {
  constructor(
    private readonly trx: AnyTransaction,
    private readonly compileVersionInTransaction?: (
      transaction: AnyTransaction,
      versionId: string,
    ) => Promise<unknown>,
  ) {}

  async readVersionForUpdate(versionId: string): Promise<ContractVersionState | null> {
    const result = await sql<{
      version_id: string;
      entity_code: string;
      tenant_id: string | null;
      status: ContractVersionState["status"];
      contract_schema_version: string | null;
      contract_hash: string | null;
      lock_version: number;
      submitted_by: string | null;
    }>`
      SELECT ev.id::text AS version_id, e.entity_code,
             ev.tenant_id::text AS tenant_id, ev.status,
             ev.contract_schema_version, ev.contract_hash, ev.lock_version,
             ev.submitted_by::text AS submitted_by
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
       WHERE ev.id = ${versionId}::uuid
       FOR UPDATE OF ev
    `.execute(this.trx);
    return result.rows[0] ? toVersionState(result.rows[0]) : null;
  }

  async resolveReferences(
    version: ContractVersionState,
    contract: MetaEntityContractV21,
  ): Promise<ResolvedContractReferences> {
    const base = await sql<{ entity_id: string; module_id: string }>`
      SELECT e.id::text AS entity_id, m.id::text AS module_id
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
        JOIN shared.module m ON lower(m.code) = lower(${contract.catalog.module_code})
       WHERE ev.id = ${version.versionId}::uuid
         AND e.entity_code = ${contract.catalog.entity_code}
       LIMIT 1
    `.execute(this.trx);
    const owner = base.rows[0];
    if (!owner) {
      throw new ContractApplicationError(
        "CONTRACT_OWNER_NOT_FOUND",
        "The draft owner or module logical code could not be resolved.",
        422,
      );
    }

    const companyCodes = [...new Set(contract.numbering.configurations
      .map((configuration) => configuration.company_scope.company_code)
      .filter((value): value is string => value !== null))];
    const companyCodeIds = new Map<string, string>();
    if (companyCodes.length > 0) {
      const rows = await sql<{ code: string; id: string }>`
        SELECT code, id::text AS id
          FROM master.company_code
         WHERE code IN (${sql.join(companyCodes.map((code) => sql`${code}`))})
      `.execute(this.trx);
      for (const row of rows.rows) companyCodeIds.set(row.code, row.id);
      const missing = companyCodes.filter((code) => !companyCodeIds.has(code));
      if (missing.length > 0) {
        throw new ContractApplicationError(
          "COMPANY_CODE_NOT_FOUND",
          `Numbering company codes were not resolved: ${missing.join(", ")}`,
          422,
        );
      }
    }

    const targetCodes = [...new Set(contract.relations.map((relation) => relation.target_entity_code))];
    const targetEntityIds = new Map<string, string>();
    if (targetCodes.length > 0) {
      const rows = await sql<{ entity_code: string; id: string }>`
        SELECT entity_code, id::text AS id
          FROM control.entity
         WHERE entity_code IN (${sql.join(targetCodes.map((code) => sql`${code}`))})
           AND tenant_id IS NOT DISTINCT FROM ${version.tenantId}::uuid
      `.execute(this.trx);
      for (const row of rows.rows) targetEntityIds.set(row.entity_code, row.id);
      const missing = targetCodes.filter((code) => !targetEntityIds.has(code));
      if (missing.length > 0) {
        throw new ContractApplicationError(
          "TARGET_ENTITY_NOT_FOUND",
          `Relation targets were not resolved: ${missing.join(", ")}`,
          422,
        );
      }
    }

    const permissionCodes = new Set<string>([
      ...contract.operations.map((operation) => operation.permission_code),
      ...contract.operations.flatMap((operation) =>
        operation.action_rules.flatMap((rule) =>
          rule.required_permission ? [rule.required_permission] : [])),
      ...contract.surfaces.flatMap((surface) => surface.security.required_permissions),
      ...contract.flows.flatMap((flow) => [
        ...flow.required_permissions,
        ...flow.steps.flatMap((step) => step.required_permissions),
      ]),
    ]);
    if (permissionCodes.size > 0) {
      const values = [...permissionCodes];
      const rows = await sql<{ code: string }>`
        SELECT code FROM shared.permission
         WHERE code IN (${sql.join(values.map((code) => sql`${code}`))})
      `.execute(this.trx);
      const found = new Set(rows.rows.map((row) => row.code));
      const missing = values.filter((code) => !found.has(code));
      if (missing.length > 0) {
        throw new ContractApplicationError(
          "PERMISSION_NOT_FOUND",
          `Permission logical codes were not resolved: ${missing.join(", ")}`,
          422,
        );
      }
    }

    const handlerTargets = new Set(contract.operations.flatMap((operation) => [
      `${operation.handler.kind}:${operation.handler.target}`,
      ...(operation.execution ? [operation.execution.target] : []),
    ]));

    return {
      moduleId: owner.module_id,
      entityId: owner.entity_id,
      companyCodeIds,
      permissionCodes,
      handlerTargets,
      targetEntityIds,
    };
  }

  async validateProjection(plan: ContractProjectionPlan): Promise<readonly ContractDiagnostic[]> {
    const diagnostics: ContractDiagnostic[] = [];
    const versionId = plan.versionId;
    const artifactOwnedIds = [
      ...plan.canonicalContract.fields.map((field) => field.id),
      ...plan.canonicalContract.relations.map((relation) => relation.id),
      ...plan.canonicalContract.surfaces.map((surface) => surface.id),
      ...plan.canonicalContract.surfaces.flatMap((surface) => surface.bindings.map((binding) => binding.id)),
      ...plan.canonicalContract.operations.map((operation) => operation.id),
      ...plan.canonicalContract.operations.flatMap((operation) => operation.action_rules.map((rule) => rule.id)),
      ...plan.canonicalContract.numbering.configurations.map((configuration) => configuration.id),
      ...plan.canonicalContract.flows.flatMap((flow) => [
        flow.id,
        ...flow.steps.flatMap((step) => [
          step.id,
          ...step.sections.map((section) => section.id),
          ...step.fields.map((field) => field.id),
        ]),
      ]),
      ...(plan.canonicalContract.lifecycle
        ? [
            plan.canonicalContract.lifecycle.binding.id,
            ...plan.canonicalContract.lifecycle.states.flatMap((state) =>
              state.masks.map((mask) => mask.id)),
          ]
        : []),
    ];
    const ownedIds = artifactOwnedIds.map((id) => projectionId(versionId, id));
    if (ownedIds.length > 0) {
      const conflicts = await sql<{ owner: string; id: string }>`
        WITH requested(id) AS (
          SELECT unnest(${ownedIds}::uuid[])
        )
        SELECT owner, id::text AS id
          FROM (
            SELECT 'field' owner, f.id FROM control.entity_field f JOIN requested r ON r.id=f.id
             WHERE f.entity_version_id IS DISTINCT FROM ${versionId}::uuid
            UNION ALL
            SELECT 'relation', x.id FROM control.entity_relation x JOIN requested r ON r.id=x.id
             WHERE x.entity_version_id IS DISTINCT FROM ${versionId}::uuid
            UNION ALL
            SELECT 'surface', x.id FROM control.entity_surface x JOIN requested r ON r.id=x.id
             WHERE x.entity_version_id IS DISTINCT FROM ${versionId}::uuid
            UNION ALL
            SELECT 'operation', x.id FROM control.entity_operation x JOIN requested r ON r.id=x.id
             WHERE x.entity_version_id IS DISTINCT FROM ${versionId}::uuid
            UNION ALL
            SELECT 'numbering', x.id FROM control.entity_numbering_config x JOIN requested r ON r.id=x.id
             WHERE x.entity_version_id IS DISTINCT FROM ${versionId}::uuid
            UNION ALL
            SELECT 'flow', x.id FROM control.entity_flow x JOIN requested r ON r.id=x.id
             WHERE x.entity_version_id IS DISTINCT FROM ${versionId}::uuid
          ) conflicts
      `.execute(this.trx);
      diagnostics.push(...conflicts.rows.map((row) => ({
        severity: "error" as const,
        code: "PROJECTION_ID_OWNER_MISMATCH",
        path: "/",
        message: `${row.owner} id '${row.id}' belongs to another entity version.`,
      })));
    }

    const storage = plan.canonicalContract.runtime.storage;
    if (storage.backing_type !== "external" && storage.backing_type !== "virtual") {
      const backing = await sql<{ relation_kind: string | null }>`
        SELECT CASE
                 WHEN table_record.relkind='r' THEN 'table'
                 WHEN table_record.relkind='v' THEN 'view'
                 WHEN table_record.relkind='m' THEN 'materialized_view'
                 ELSE NULL
               END AS relation_kind
          FROM pg_class table_record
          JOIN pg_namespace schema_record ON schema_record.oid=table_record.relnamespace
         WHERE schema_record.nspname=${storage.table_schema}
           AND table_record.relname=${storage.table_name}
         LIMIT 1
      `.execute(this.trx);
      if (backing.rows[0]?.relation_kind !== storage.backing_type) {
        diagnostics.push({
          severity: "error",
          code: "PHYSICAL_BACKING_INVALID",
          path: "/runtime/storage",
          message: `Physical backing ${storage.table_schema}.${storage.table_name} does not resolve as ${storage.backing_type}.`,
        });
      } else {
        const requiredColumns = [...new Set([
          ...plan.canonicalContract.fields
            .filter((field) => field.runtime_enabled && !field.computed && field.column_name)
            .map((field) => field.column_name),
          storage.primary_key,
          storage.tenant_column,
        ].filter((value): value is string => Boolean(value)))];
        if (requiredColumns.length > 0) {
          const columns = await sql<{ column_name: string }>`
            SELECT column_name
              FROM information_schema.columns
             WHERE table_schema=${storage.table_schema}
               AND table_name=${storage.table_name}
               AND column_name IN (${sql.join(requiredColumns.map((column) => sql`${column}`))})
          `.execute(this.trx);
          const found = new Set(columns.rows.map((column) => column.column_name));
          for (const missing of requiredColumns.filter((column) => !found.has(column))) {
            diagnostics.push({
              severity: "error",
              code: "PHYSICAL_COLUMN_NOT_FOUND",
              path: "/runtime/storage",
              message: `Physical column '${missing}' was not found on ${storage.table_schema}.${storage.table_name}.`,
            });
          }
        }
      }
    }

    const numberingWithRuntimeState = await sql<{ id: string }>`
      SELECT config.id::text AS id
        FROM control.entity_numbering_config config
       WHERE config.entity_version_id = ${versionId}::uuid
         AND EXISTS (
           SELECT 1 FROM control.entity_numbering_counter counter
            WHERE counter.config_id = config.id
         )
         AND config.id <> ALL(${plan.canonicalContract.numbering.configurations.map(
           (item) => projectionId(plan.versionId, item.id),
         )}::uuid[])
    `.execute(this.trx);
    diagnostics.push(...numberingWithRuntimeState.rows.map((row) => ({
      severity: "error" as const,
      code: "NUMBERING_COUNTER_PROTECTED",
      path: "/numbering/configurations",
      message: `Numbering configuration '${row.id}' owns runtime counters and cannot be removed by metadata application.`,
    })));
    return diagnostics;
  }

  async applyProjection(plan: ContractProjectionPlan, actorId: string): Promise<void> {
    const contract = plan.canonicalContract;
    const versionId = plan.versionId;
    const tenantId = plan.tenantId;
    const entityId = plan.references.entityId;
    const mutableOwner = await sql<{ mutable: boolean }>`
      SELECT status IN ('DRAFT','IN_REVIEW') AS mutable
        FROM control.entity_version
       WHERE id=${versionId}::uuid
       FOR UPDATE
    `.execute(this.trx);
    if (mutableOwner.rows[0]?.mutable !== true) {
      throw new ContractApplicationError(
        "IMMUTABLE_VERSION_PROJECTION",
        "Projection replacement is allowed only for DRAFT or IN_REVIEW versions.",
        409,
      );
    }
    const fieldIds = new Map(contract.fields.map((field) => [
      field.id,
      projectionId(versionId, field.id),
    ]));
    const surfaceIds = new Map(contract.surfaces.map((surface) => [
      surface.id,
      projectionId(versionId, surface.id),
    ]));

    // Child-first, draft-version-only replacement. The numbering counter table
    // is intentionally absent from this projector.
    await sql`
      DELETE FROM control.entity_field_surface binding
       USING control.entity_surface surface
       WHERE binding.entity_surface_id = surface.id
         AND surface.entity_version_id = ${versionId}::uuid
    `.execute(this.trx);
    await sql`DELETE FROM control.entity_flow WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`DELETE FROM control.entity_action_rule WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`DELETE FROM control.entity_lifecycle_state_mask WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`DELETE FROM control.entity_lifecycle WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`
      DELETE FROM control.entity_numbering_config config
       WHERE config.entity_version_id = ${versionId}::uuid
         AND NOT EXISTS (
           SELECT 1 FROM control.entity_numbering_counter counter
            WHERE counter.config_id = config.id
         )
    `.execute(this.trx);
    await sql`DELETE FROM control.entity_operation WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`DELETE FROM control.entity_surface WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`DELETE FROM control.entity_relation WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);
    await sql`DELETE FROM control.entity_field WHERE entity_version_id = ${versionId}::uuid`.execute(this.trx);

    const runtime = contract.runtime;
    await sql`
      INSERT INTO control.entity_version_contract (
        entity_version_id, tenant_id, catalog_enabled, api_exposure, backing_type,
        table_schema, table_name, key_strategy, primary_key, tenant_column,
        read_capability, write_capability, read_handler, write_handler,
        source_kind, contract_hash, runtime_enabled, create_mode, draft_ttl_hours,
        governance_level, security_tier, mutability, identity_config, search_config,
        data_policy, concurrency_config, storage_config, contract_version,
        created_by, updated_at, updated_by
      )
      VALUES (
        ${versionId}::uuid, ${tenantId}::uuid, ${runtime.catalog_enabled},
        ${runtime.api_exposure}, ${runtime.storage.backing_type},
        ${runtime.storage.table_schema}, ${runtime.storage.table_name},
        ${runtime.storage.key_strategy}, ${runtime.storage.primary_key},
        ${runtime.storage.tenant_column}, ${runtime.capabilities.read},
        ${runtime.capabilities.write}, ${runtime.capabilities.read_handler},
        ${runtime.capabilities.write_handler}, 'explicit', ${plan.contractHash},
        ${runtime.runtime_enabled}, ${runtime.create_mode}, ${runtime.draft_ttl_hours},
        ${runtime.governance_level}, ${runtime.security_tier}, ${runtime.mutability},
        ${json(runtime.identity)}::jsonb, ${json(runtime.search)}::jsonb,
        ${json({
          ...runtime.data_policy,
          effective_policy_merge_order: contract.policy.merge_order,
          platform_baseline: contract.policy.platform_baseline,
          tenant_overlay: contract.policy.tenant_overlay,
          field_security: contract.policy.field_security,
        })}::jsonb,
        ${json(runtime.concurrency)}::jsonb, ${json(runtime.storage_config)}::jsonb,
        21, ${actorId}::uuid, now(), ${actorId}::uuid
      )
      ON CONFLICT (entity_version_id) DO UPDATE SET
        tenant_id=EXCLUDED.tenant_id, catalog_enabled=EXCLUDED.catalog_enabled,
        api_exposure=EXCLUDED.api_exposure, backing_type=EXCLUDED.backing_type,
        table_schema=EXCLUDED.table_schema, table_name=EXCLUDED.table_name,
        key_strategy=EXCLUDED.key_strategy, primary_key=EXCLUDED.primary_key,
        tenant_column=EXCLUDED.tenant_column, read_capability=EXCLUDED.read_capability,
        write_capability=EXCLUDED.write_capability, read_handler=EXCLUDED.read_handler,
        write_handler=EXCLUDED.write_handler, source_kind=EXCLUDED.source_kind,
        contract_hash=EXCLUDED.contract_hash, runtime_enabled=EXCLUDED.runtime_enabled,
        create_mode=EXCLUDED.create_mode, draft_ttl_hours=EXCLUDED.draft_ttl_hours,
        governance_level=EXCLUDED.governance_level, security_tier=EXCLUDED.security_tier,
        mutability=EXCLUDED.mutability, identity_config=EXCLUDED.identity_config,
        search_config=EXCLUDED.search_config, data_policy=EXCLUDED.data_policy,
        concurrency_config=EXCLUDED.concurrency_config, storage_config=EXCLUDED.storage_config,
        contract_version=EXCLUDED.contract_version, updated_at=now(), updated_by=EXCLUDED.updated_by
    `.execute(this.trx);

    for (const [index, field] of contract.fields.entries()) {
      await sql`
        INSERT INTO control.entity_field (
          id, tenant_id, entity_version_id, name, column_name, projection_alias_of,
          label, description, data_type, cardinality, origin, is_required, is_unique,
          unique_scope, is_read_only, is_deprecated, is_computed, is_write_once,
          is_active, runtime_enabled, compute_mode, compute_expr, default_value, defaults,
          is_filterable, is_sortable, is_groupable, is_aggregatable, semantic_roles,
          type_config, sort_order, created_by, updated_by
        ) VALUES (
          ${fieldIds.get(field.id)}::uuid, ${tenantId}::uuid, ${versionId}::uuid, ${field.name},
          ${field.column_name}, ${field.projection_alias_of ?? null}, ${field.label},
          ${field.description ?? null}, ${field.data_type}, ${field.cardinality}, ${field.origin},
          ${field.required}, ${field.unique}, ${field.unique_scope}, ${field.read_only},
          ${field.deprecated}, ${field.computed}, ${field.write_once}, true,
          ${field.runtime_enabled}, ${field.compute?.mode ?? null},
          ${field.compute ? json(field.compute.expression) : null}::jsonb,
          ${field.default_value === undefined ? null : json(field.default_value)}::jsonb,
          ${json(field.defaults)}::jsonb, ${field.capabilities.filterable},
          ${field.capabilities.sortable}, ${field.capabilities.groupable},
          ${field.capabilities.aggregatable}, ${field.semantic_roles},
          ${json({ ...field.type_config, contract_owner_id: field.id })}::jsonb, ${(index + 1) * 10},
          ${actorId}::uuid, ${actorId}::uuid
        )
      `.execute(this.trx);
    }

    for (const relation of contract.relations) {
      await sql`
        INSERT INTO control.entity_relation (
          id, tenant_id, entity_version_id, name, relation_code, relation_kind,
          target_entity, target_entity_code, resolution_kind, fk_field, target_key,
          source_field, target_field, source_type_field, source_type_value, source_id_field,
          polymorphic_type_field, polymorphic_type_value, polymorphic_id_field,
          source_line_field, runtime_role, on_delete, record_filter, mutation_owner,
          mutation_permissions, created_by, updated_by
        ) VALUES (
          ${projectionId(versionId, relation.id)}::uuid, ${tenantId}::uuid, ${versionId}::uuid, ${relation.code},
          ${relation.code}, ${relation.kind}, ${relation.target_entity_code},
          ${relation.target_entity_code}, ${relation.resolution}, ${relation.source_field},
          ${relation.target_field}, ${relation.source_field}, ${relation.target_field},
          ${relation.polymorphic?.type_field ?? null}, ${relation.polymorphic?.type_value ?? null},
          ${relation.polymorphic?.id_field ?? null}, ${relation.polymorphic?.type_field ?? null},
          ${relation.polymorphic?.type_value ?? null}, ${relation.polymorphic?.id_field ?? null},
          ${relation.source_line_field}, ${relation.runtime_role}, ${relation.on_delete},
          ${json(relation.record_filter)}::jsonb, ${relation.mutation.owner},
          ${relation.mutation.permissions}, ${actorId}::uuid, ${actorId}::uuid
        )
      `.execute(this.trx);
    }

    for (const surface of contract.surfaces) {
      await sql`
        INSERT INTO control.entity_surface (
          id, tenant_id, entity_id, entity_version_id, mode, v2_mode, surface_key,
          kind, v2_kind, placement, parent_surface_id, slot_key, label, group_keys,
          relation_name, renderer_key, composer_key, strategy_key, column_count,
          print_span, density, required_permissions, visibility_expr, sort_order,
          is_enabled, config, created_by, updated_by
        ) VALUES (
          ${surfaceIds.get(surface.id)}::uuid, ${tenantId}::uuid, ${entityId}::uuid, ${versionId}::uuid,
          ${legacySurfaceMode(surface.mode)}, ${surface.mode}, ${surface.surface_key},
          ${legacySurfaceKind(surface.kind)}, ${surface.kind}, ${surface.placement},
          ${surface.parent_surface_id ? surfaceIds.get(surface.parent_surface_id) : null}::uuid,
          ${surface.slot_key}, ${surface.label},
          ${surface.grouping.group_codes}, ${surface.grouping.relation_code},
          ${surface.renderer.key}, ${surface.renderer.composer_key},
          ${surface.renderer.strategy_key}, ${surface.layout.column_count},
          ${surface.layout.print_span}, ${surface.layout.density},
          ${surface.security.required_permissions},
          ${json(surface.security.visibility_condition)}::jsonb, ${surface.order},
          ${surface.enabled}, ${json({
            ...surface.renderer.config,
            contract_owner_id: surface.id,
          })}::jsonb,
          ${actorId}::uuid, ${actorId}::uuid
        )
      `.execute(this.trx);
      for (const binding of surface.bindings) {
        await sql`
          INSERT INTO control.entity_field_surface (
            id, tenant_id, entity_surface_id, entity_field_id, visible_override,
            required_override, readonly_override, sort_order, column_span, density,
            renderer_key, editor_key, visibility_expr, editability_expr,
            renderer_config, created_by, updated_by
          ) VALUES (
            ${projectionId(versionId, binding.id)}::uuid, ${tenantId}::uuid,
            ${surfaceIds.get(surface.id)}::uuid,
            ${fieldIds.get(binding.field_id)}::uuid, ${binding.visible}, ${binding.required},
            ${binding.read_only}, ${binding.order}, ${binding.column_span},
            ${binding.density}, ${binding.renderer_key}, ${binding.editor_key},
            ${json(binding.visibility_condition)}::jsonb,
            ${json(binding.editability_condition)}::jsonb,
            ${json({
              ...binding.renderer_config,
              group_code: binding.group_code,
              contract_owner_id: binding.id,
            })}::jsonb,
            ${actorId}::uuid, ${actorId}::uuid
          )
        `.execute(this.trx);
      }
    }

    for (const operation of contract.operations) {
      await sql`
        INSERT INTO control.entity_operation (
          id, tenant_id, entity_version_id, entity_name, permission_code,
          surface, placement, handler_type, handler_target, execution_target,
          is_record_required, record_required, sort_order, label_override,
          icon_override, is_enabled, selection_config, operation_code, label,
          icon, intent, confirmation, reason_required, plane_filter, created_by, updated_by
        ) VALUES (
          ${projectionId(versionId, operation.id)}::uuid, ${tenantId}::uuid, ${versionId}::uuid,
          ${contract.catalog.entity_code}, ${operation.permission_code},
          ${legacyOperationSurface(operation.surface)}, ${operation.placement},
          ${legacyHandlerKind(operation.handler.kind)}, ${operation.handler.target},
          ${operation.execution?.target ?? null}, ${operation.record_required},
          ${operation.record_required}, ${operation.order}, ${operation.label},
          ${operation.icon}, ${operation.enabled}, ${json({
            ...(operation.selection ?? {}),
            contract_owner_id: operation.id,
          })}::jsonb,
          ${operation.operation_code}, ${operation.label}, ${operation.icon},
          ${operation.intent}, ${json(operation.confirmation)}::jsonb,
          ${operation.reason_required}, ${operation.plane_filter},
          ${actorId}::uuid, ${actorId}::uuid
        )
      `.execute(this.trx);
      for (const rule of operation.action_rules) {
        await sql`
          INSERT INTO control.entity_action_rule (
            id, tenant_id, entity_version_id, entity_code, status, action_code,
            capability, required_permission, reason, description, metadata,
            created_by, updated_by
          ) VALUES (
            ${projectionId(versionId, rule.id)}::uuid, ${tenantId}::uuid, ${versionId}::uuid,
            ${contract.catalog.entity_code}, ${rule.status}, ${rule.action_code},
            ${rule.capability}, ${rule.required_permission}, ${rule.reason},
            ${rule.reason}, ${json({
              ...rule.metadata,
              condition: rule.condition,
              contract_owner_id: rule.id,
            })}::jsonb,
            ${actorId}::uuid, ${actorId}::uuid
          )
        `.execute(this.trx);
      }
    }

    for (const configuration of contract.numbering.configurations) {
      const segments = configuration.segments.map((segment) => ({
        ...segment,
        kind: segment.kind === "calendar_year"
          ? "year"
          : segment.kind === "literal" ? "static" : segment.kind,
      }));
      await sql`
        INSERT INTO control.entity_numbering_config (
          id, tenant_id, entity_id, entity_version_id, number_field,
          company_code_id, prefix, prefix_configurable, separator, segments,
          reset_strategy, uniqueness_scope, max_length, allowed_chars, metadata,
          status, created_by, updated_by
        ) VALUES (
          ${projectionId(versionId, configuration.id)}::uuid, ${tenantId}::uuid, ${entityId}::uuid,
          ${versionId}::uuid, ${configuration.field_scope.field_name},
          ${configuration.company_scope.company_code
            ? plan.references.companyCodeIds.get(configuration.company_scope.company_code)
            : null}::uuid,
          ${configuration.format.prefix}, ${configuration.format.prefix_configurable},
          ${configuration.format.separator}, ${json(segments)}::jsonb,
          ${configuration.reset_policy}, ${configuration.field_scope.uniqueness},
          ${configuration.format.max_length}, ${configuration.format.allowed_chars},
          ${json({
            ...configuration.metadata,
            contract_code: configuration.code,
            contract_owner_id: configuration.id,
            confirmation: configuration.confirmation,
            canonical_segments: configuration.segments,
          })}::jsonb,
          ${configuration.enabled ? "active" : "inactive"},
          ${actorId}::uuid, ${actorId}::uuid
        )
      `.execute(this.trx);
    }

    await this.applyLifecycle(plan, actorId);
    await this.applyFlows(plan, actorId);
  }

  private async applyLifecycle(plan: ContractProjectionPlan, actorId: string): Promise<void> {
    const lifecycle = plan.canonicalContract.lifecycle;
    if (!lifecycle) return;
    const definition = lifecycle.binding.definition;
    let lifecycleId: string;
    let lifecycleStateIds: Map<string, string>;
    if (definition.kind === "reference") {
      const resolved = await sql<{ id: string }>`
        SELECT id::text AS id FROM control.lifecycle
         WHERE code = ${definition.definition_code}
           AND version_no = ${definition.version}
           AND tenant_id IS NOT DISTINCT FROM ${plan.tenantId}::uuid
         LIMIT 1
      `.execute(this.trx);
      if (!resolved.rows[0]) {
        throw new ContractApplicationError(
          "LIFECYCLE_DEFINITION_NOT_FOUND",
          `Lifecycle '${definition.definition_code}' version ${definition.version} was not resolved.`,
          422,
        );
      }
      lifecycleId = resolved.rows[0].id;
      const resolvedStates = await sql<{ code: string; id: string }>`
        SELECT code, id::text AS id
          FROM control.lifecycle_state
         WHERE lifecycle_id = ${lifecycleId}::uuid
      `.execute(this.trx);
      lifecycleStateIds = new Map(resolvedStates.rows.map((state) => [state.code, state.id]));
      const missingState = lifecycle.states.find((state) => !lifecycleStateIds.has(state.code));
      if (missingState) {
        throw new ContractApplicationError(
          "LIFECYCLE_STATE_NOT_FOUND",
          `Lifecycle state '${missingState.code}' was not found in the referenced definition.`,
          422,
        );
      }
    } else {
      lifecycleId = definition.id;
      const lifecycleDefinitionHash = sha256({
        definition,
        code: lifecycle.binding.code,
        status_field: lifecycle.binding.status_field,
        states: lifecycle.states,
        transitions: lifecycle.transitions,
        command_handler: lifecycle.command_handler,
      });
      await sql`
        INSERT INTO control.lifecycle (
          id, tenant_id, code, name, version_no, definition_hash, is_active,
          config, created_by, updated_by
        ) VALUES (
          ${definition.id}::uuid, ${plan.tenantId}::uuid, ${lifecycle.binding.code},
          ${lifecycle.binding.code}, ${definition.version}, ${lifecycleDefinitionHash}, true,
          ${json({
            contract_lifecycle: lifecycle,
            status_field: lifecycle.binding.status_field,
            command_handler: lifecycle.command_handler,
          })}::jsonb, ${actorId}::uuid, ${actorId}::uuid
        )
        ON CONFLICT (id) DO NOTHING
      `.execute(this.trx);
      const immutable = await sql<{ definition_hash: string | null }>`
        SELECT definition_hash FROM control.lifecycle WHERE id = ${definition.id}::uuid
      `.execute(this.trx);
      if (immutable.rows[0]?.definition_hash !== lifecycleDefinitionHash) {
        throw new ContractApplicationError(
          "LIFECYCLE_DEFINITION_IMMUTABLE",
          "An owned lifecycle definition id cannot be reused with different content.",
          409,
        );
      }
      for (const [index, state] of lifecycle.states.entries()) {
        await sql`
          INSERT INTO control.lifecycle_state (
            id, tenant_id, lifecycle_id, code, name, is_initial, is_terminal,
            sort_order, config, state_flags, created_by, updated_by
          ) VALUES (
            ${state.id}::uuid, ${plan.tenantId}::uuid, ${lifecycleId}::uuid,
            ${state.code}, ${state.label}, ${state.initial}, ${state.terminal},
            ${(index + 1) * 10}, ${json(state.presentation)}::jsonb,
            ${json({
              is_mutable: state.capabilities.edit,
              is_deletable: state.capabilities.delete,
              is_reversible: state.capabilities.reversible,
              transition_to: state.capabilities.transition_to,
            })}::jsonb, ${actorId}::uuid, ${actorId}::uuid
          )
          ON CONFLICT (id) DO NOTHING
        `.execute(this.trx);
      }
      lifecycleStateIds = new Map(lifecycle.states.map((state) => [state.code, state.id]));
      for (const transition of lifecycle.transitions) {
        await sql`
          INSERT INTO control.lifecycle_transition (
            id, tenant_id, lifecycle_id, from_state_id, to_state_id,
            operation_code, is_active, config, created_by, updated_by
          ) VALUES (
            ${transition.id}::uuid, ${plan.tenantId}::uuid, ${lifecycleId}::uuid,
            ${lifecycleStateIds.get(transition.from)}::uuid,
            ${lifecycleStateIds.get(transition.to)}::uuid,
            ${transition.operation_code}, true,
            ${json({
              conditions: transition.conditions,
              gates: transition.gates,
              hooks: transition.hooks,
              timers: transition.timers,
            })}::jsonb, ${actorId}::uuid, ${actorId}::uuid
          )
          ON CONFLICT (id) DO NOTHING
        `.execute(this.trx);
      }
    }

    await sql`
      INSERT INTO control.entity_lifecycle (
        id, tenant_id, entity_name, entity_version_id, lifecycle_id,
        conditions, priority, created_by, updated_by
      ) VALUES (
        ${projectionId(plan.versionId, lifecycle.binding.id)}::uuid, ${plan.tenantId}::uuid,
        ${plan.entityCode}, ${plan.versionId}::uuid, ${lifecycleId}::uuid,
        ${json(lifecycle.binding.condition)}::jsonb, ${lifecycle.binding.priority},
        ${actorId}::uuid, ${actorId}::uuid
      )
    `.execute(this.trx);

    for (const state of lifecycle.states) {
      for (const mask of state.masks) {
        await sql`
          INSERT INTO control.entity_lifecycle_state_mask (
            id, tenant_id, entity_name, entity_version_id, lifecycle_state_id,
            record_status, can_edit, can_delete, can_transition_to,
            disabled_reason, applies_to_planes, created_by, updated_by
          ) VALUES (
            ${projectionId(plan.versionId, mask.id)}::uuid, ${plan.tenantId}::uuid, ${plan.entityCode},
            ${plan.versionId}::uuid, ${lifecycleStateIds.get(state.code)}::uuid, ${state.code},
            ${mask.edit}, ${mask.delete}, ${mask.transition_to},
            ${mask.disabled_reason}, ${mask.planes}, ${actorId}::uuid, ${actorId}::uuid
          )
        `.execute(this.trx);
      }
    }
  }

  private async applyFlows(plan: ContractProjectionPlan, actorId: string): Promise<void> {
    const fieldIds = new Map(plan.canonicalContract.fields.map((field) => [
      field.id,
      projectionId(plan.versionId, field.id),
    ]));
    for (const flow of plan.canonicalContract.flows) {
      const flowId = projectionId(plan.versionId, flow.id);
      await sql`
        INSERT INTO control.entity_flow (
          id, tenant_id, entity_version_id, flow_code, label, description,
          icon_key, trigger_context, is_default, config, version_no, status,
          created_by, updated_by
        ) VALUES (
          ${flowId}::uuid, ${plan.tenantId}::uuid, ${plan.versionId}::uuid,
          ${flow.flow_code}, ${flow.label}, ${flow.description}, ${flow.icon_key},
          ${flow.trigger_context}, ${flow.default},
          ${json({
            ...flow.config,
            condition: flow.condition,
            required_permissions: flow.required_permissions,
            writer_operation: flow.writer_operation,
            submit_operation: flow.submit_operation,
            contract_owner_id: flow.id,
          })}::jsonb, ${flow.version}, 'draft', ${actorId}::uuid, ${actorId}::uuid
        )
      `.execute(this.trx);
      for (const step of flow.steps) {
        const stepId = projectionId(plan.versionId, step.id);
        await sql`
          INSERT INTO control.entity_flow_step (
            id, tenant_id, flow_id, step_key, label, description, icon_key,
            sort_order, skip_when, advance_rule, layout_hint, created_by, updated_by
          ) VALUES (
            ${stepId}::uuid, ${plan.tenantId}::uuid, ${flowId}::uuid,
            ${step.step_key}, ${step.label}, ${step.description}, ${step.icon_key},
            ${step.order}, ${json(step.skip_when)}::jsonb,
            ${json({
              ...step.advance_rule,
              required_permissions: step.required_permissions,
              contract_owner_id: step.id,
            })}::jsonb,
            ${step.layout_hint}, ${actorId}::uuid, ${actorId}::uuid
          )
        `.execute(this.trx);
        const sections = new Map(step.sections.map((section) => [section.id, section.section_key]));
        for (const section of step.sections) {
          await sql`
            INSERT INTO control.entity_flow_section (
              id, tenant_id, flow_step_id, section_key, label, description,
              sort_order, collapse_default, visible_when, reveal_behavior,
              icon_key, help_text, created_by, updated_by
            ) VALUES (
              ${projectionId(plan.versionId, section.id)}::uuid,
              ${plan.tenantId}::uuid, ${stepId}::uuid,
              ${section.section_key}, ${section.label}, ${section.description},
              ${section.order}, ${section.collapsed}, ${json(section.visible_when)}::jsonb,
              ${section.reveal_behavior}, ${section.icon_key}, ${section.help_text},
              ${actorId}::uuid, ${actorId}::uuid
            )
          `.execute(this.trx);
        }
        for (const field of step.fields) {
          await sql`
            INSERT INTO control.entity_flow_field (
              id, tenant_id, flow_step_id, entity_field_id, mode, derivation_mode,
              visible_when, required_when, default_source, derive_expression,
              override_permission, override_requires_note, summary_role, ui_variant,
              format, span, help_text, placeholder, sort_order, section_key,
              metadata, created_by, updated_by
            ) VALUES (
              ${projectionId(plan.versionId, field.id)}::uuid,
              ${plan.tenantId}::uuid, ${stepId}::uuid,
              ${fieldIds.get(field.field_id)}::uuid, ${field.mode}, ${field.derivation?.mode ?? null},
              ${json(field.visible_when)}::jsonb, ${json(field.required_when)}::jsonb,
              ${field.derivation?.default_source ?? null},
              ${field.derivation?.expression ?? null},
              ${field.derivation?.override_permission ?? null},
              ${field.derivation?.override_requires_note ?? false},
              ${field.summary_role}, ${field.ui_variant}, ${field.format}, ${field.span},
              ${field.help_text}, ${field.placeholder}, ${field.order},
              ${field.section_id ? sections.get(field.section_id) : null},
              ${json({ ...field.metadata, contract_owner_id: field.id })}::jsonb,
              ${actorId}::uuid, ${actorId}::uuid
            )
          `.execute(this.trx);
        }
      }
    }
  }

  async persistCanonicalDocument(
    versionId: string,
    canonicalContract: MetaEntityContractV21,
    contractHash: string,
    expectedLockVersion: number,
    actorId: string,
  ): Promise<number> {
    const result = await sql<{ lock_version: number }>`
      UPDATE control.entity_version
         SET contract_schema_version = '2.1',
             contract_document = ${json(canonicalContract)}::jsonb,
             contract_hash = ${contractHash},
             projection_hash = ${contractHash},
             validation_status = 'VALID',
             validation_diagnostics = '[]'::jsonb,
             validated_at = now(),
             validated_by = ${actorId}::uuid,
             projected_at = now(),
             projected_by = ${actorId}::uuid,
             version_hash = ${contractHash},
             lock_version = lock_version + 1,
             updated_at = now(),
             updated_by = ${actorId}::uuid
       WHERE id = ${versionId}::uuid
         AND status = 'DRAFT'
         AND lock_version = ${expectedLockVersion}
       RETURNING lock_version
    `.execute(this.trx);
    if (!result.rows[0]) {
      throw new ContractApplicationError(
        "CONTRACT_WRITE_CONFLICT",
        "The draft changed while its projection was being applied.",
        409,
      );
    }
    return result.rows[0].lock_version;
  }

  async readCanonicalContractForUpdate(versionId: string): Promise<unknown | null> {
    const result = await sql<{ contract_document: unknown }>`
      SELECT contract_document
        FROM control.entity_version
       WHERE id = ${versionId}::uuid
       FOR UPDATE
    `.execute(this.trx);
    return result.rows[0]?.contract_document ?? null;
  }

  async readCurrentPublishedContract(versionId: string): Promise<unknown | null> {
    const result = await sql<{ contract_document: unknown }>`
      SELECT published.contract_document
        FROM control.entity_version candidate
        JOIN control.entity_publish_state state
          ON state.entity_id = candidate.entity_id
         AND state.tenant_id IS NOT DISTINCT FROM candidate.tenant_id
        JOIN control.entity_version published
          ON published.id = state.published_version_id
       WHERE candidate.id = ${versionId}::uuid
       LIMIT 1
    `.execute(this.trx);
    return result.rows[0]?.contract_document ?? null;
  }

  async compileVersion(versionId: string): Promise<unknown> {
    if (!this.compileVersionInTransaction) {
      throw new ContractApplicationError(
        "CONTRACT_COMPILER_UNAVAILABLE",
        "Atomic publication requires the transaction-bound metadata compiler.",
        503,
      );
    }
    return this.compileVersionInTransaction(this.trx, versionId);
  }

  async submit(input: {
    versionId: string;
    actorId: string;
    contractHash: string;
    requestKey: string | null;
  }): Promise<void> {
    const updated = await sql<{ entity_id: string; tenant_id: string | null }>`
      UPDATE control.entity_version
         SET status='IN_REVIEW', submitted_at=now(), submitted_by=${input.actorId}::uuid,
             updated_at=now(), updated_by=${input.actorId}::uuid
       WHERE id=${input.versionId}::uuid
         AND status='DRAFT'
         AND contract_hash=${input.contractHash}
         AND projection_hash=${input.contractHash}
         AND validation_status='VALID'
       RETURNING entity_id::text AS entity_id, tenant_id::text AS tenant_id
    `.execute(this.trx);
    const row = updated.rows[0];
    if (!row) {
      throw new ContractApplicationError(
        "CONTRACT_NOT_SUBMITTABLE",
        "Draft must be valid and materialized before submission.",
        409,
      );
    }
    await this.writeTransition({
      ...input,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      transition: "submitted",
      beforeHash: input.contractHash,
      afterHash: input.contractHash,
      diff: [],
      reason: null,
      ticketReference: null,
      sourceVersionId: null,
    });
  }

  async reject(input: {
    versionId: string;
    actorId: string;
    contractHash: string;
    reason: string;
    requestKey: string | null;
  }): Promise<void> {
    const updated = await sql<{ entity_id: string; tenant_id: string | null }>`
      UPDATE control.entity_version
         SET status='REJECTED', reviewed_at=now(), reviewed_by=${input.actorId}::uuid,
             updated_at=now(), updated_by=${input.actorId}::uuid
       WHERE id=${input.versionId}::uuid AND status='IN_REVIEW'
       RETURNING entity_id::text AS entity_id, tenant_id::text AS tenant_id
    `.execute(this.trx);
    const row = updated.rows[0];
    if (!row) {
      throw new ContractApplicationError("CONTRACT_NOT_REJECTABLE", "Version is no longer IN_REVIEW.", 409);
    }
    await this.writeTransition({
      ...input,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      transition: "rejected",
      beforeHash: input.contractHash,
      afterHash: input.contractHash,
      diff: [],
      ticketReference: null,
      sourceVersionId: null,
    });
  }

  async createDraft(input: {
    entityCode: string;
    tenantId: string | null;
    actorId: string;
    changeType: "structural" | "behavioral" | "governance" | "label" | "fix";
    changeSummary: string | null;
    baseVersionId: string | null;
  }): Promise<ContractVersionState> {
    const owner = await sql<{ id: string }>`
      SELECT id::text AS id
        FROM control.entity
       WHERE entity_code=${input.entityCode}
         AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid
       FOR UPDATE
    `.execute(this.trx);
    if (!owner.rows[0]) {
      throw new ContractApplicationError("ENTITY_NOT_FOUND", "Entity logical code was not found.", 404);
    }
    const existing = await sql<{
      version_id: string;
      entity_code: string;
      tenant_id: string | null;
      status: ContractVersionState["status"];
      contract_schema_version: string | null;
      contract_hash: string | null;
      lock_version: number;
      submitted_by: string | null;
    }>`
      SELECT version.id::text AS version_id, ${input.entityCode} AS entity_code,
             version.tenant_id::text AS tenant_id, version.status,
             version.contract_schema_version, version.contract_hash,
             version.lock_version, version.submitted_by::text AS submitted_by
        FROM control.entity_version version
       WHERE version.entity_id=${owner.rows[0].id}::uuid
         AND version.tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid
         AND version.status IN ('DRAFT','IN_REVIEW')
       LIMIT 1
    `.execute(this.trx);
    if (existing.rows[0]) return toVersionState(existing.rows[0]);

    const result = await sql<{
      version_id: string;
      entity_code: string;
      tenant_id: string | null;
      status: ContractVersionState["status"];
      contract_schema_version: string | null;
      contract_hash: string | null;
      lock_version: number;
      submitted_by: string | null;
    }>`
      INSERT INTO control.entity_version (
        tenant_id, entity_id, version_no, status, change_type, change_summary,
        base_version_id, derived_from_version_id, contract_schema_version,
        contract_document, validation_status, validation_diagnostics, created_by
      )
      SELECT ${input.tenantId}::uuid, entity.id,
             COALESCE(max(version.version_no), 0) + 1, 'DRAFT',
             ${input.changeType}, ${input.changeSummary},
             COALESCE(
               ${input.baseVersionId}::uuid,
               (
                 array_agg(version.id ORDER BY version.version_no DESC)
                   FILTER (WHERE version.status = 'EFFECTIVE')
               )[1]
             ),
             COALESCE(
               ${input.baseVersionId}::uuid,
               (
                 array_agg(version.id ORDER BY version.version_no DESC)
                   FILTER (WHERE version.status = 'EFFECTIVE')
               )[1]
             ),
             COALESCE(
               (
                 array_agg(version.contract_schema_version ORDER BY version.version_no DESC)
                   FILTER (WHERE version.id = ${input.baseVersionId}::uuid)
               )[1],
               (
                 array_agg(version.contract_schema_version ORDER BY version.version_no DESC)
                   FILTER (WHERE version.status = 'EFFECTIVE')
               )[1]
             ),
             COALESCE(
               (
                 array_agg(version.contract_document ORDER BY version.version_no DESC)
                   FILTER (WHERE version.id = ${input.baseVersionId}::uuid)
               )[1],
               (
                 array_agg(version.contract_document ORDER BY version.version_no DESC)
                   FILTER (WHERE version.status = 'EFFECTIVE')
               )[1]
             ),
             'NOT_VALIDATED', '[]'::jsonb,
             ${input.actorId}::uuid
        FROM control.entity entity
        LEFT JOIN control.entity_version version ON version.entity_id = entity.id
       WHERE entity.entity_code = ${input.entityCode}
         AND entity.id = ${owner.rows[0].id}::uuid
         AND entity.tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid
       GROUP BY entity.id
      RETURNING id::text AS version_id, ${input.entityCode} AS entity_code,
                tenant_id::text AS tenant_id, status, contract_schema_version,
                contract_hash, lock_version, submitted_by::text AS submitted_by
    `.execute(this.trx);
    if (!result.rows[0]) throw new ContractApplicationError("DRAFT_CREATE_FAILED", "Draft could not be created.", 409);
    const draft = toVersionState(result.rows[0]);
    const base = await sql<{ contract_hash: string | null; base_version_id: string | null }>`
      SELECT base.contract_hash, draft.base_version_id::text AS base_version_id
        FROM control.entity_version draft
        LEFT JOIN control.entity_version base ON base.id=draft.base_version_id
       WHERE draft.id=${draft.versionId}::uuid
    `.execute(this.trx);
    await this.writeTransition({
      versionId: draft.versionId,
      actorId: input.actorId,
      contractHash: null,
      requestKey: null,
      entityId: owner.rows[0].id,
      tenantId: input.tenantId,
      transition: "draft_created",
      beforeHash: base.rows[0]?.contract_hash ?? null,
      afterHash: base.rows[0]?.contract_hash ?? null,
      diff: [],
      reason: input.changeSummary,
      ticketReference: null,
      sourceVersionId: base.rows[0]?.base_version_id ?? null,
    });
    return draft;
  }

  async publish(input: {
    versionId: string;
    actorId: string;
    breakGlassReason: string | null;
    breakGlassTicket: string | null;
    contractHash: string | null;
    materializedHash: string;
    artifacts: readonly CompiledPlaneArtifact[];
    diff: readonly import("./contract-application.service.js").ContractDiffEntry[];
    requestKey: string | null;
    transition: "approved" | "rollback_published";
    sourceVersionId: string | null;
  }): Promise<void> {
    if (input.materializedHash !== input.contractHash) {
      throw new ContractApplicationError(
        "MATERIALIZED_HASH_MISMATCH",
        "Materialized projection hash does not match the canonical Contract hash.",
        409,
      );
    }
    const byPlane = new Map(input.artifacts.map((artifact) => [artifact.plane, artifact]));
    if (!byPlane.has("admin") || !byPlane.has("neon") || !byPlane.has("mesh")) {
      throw new ContractApplicationError("PLANE_ARTIFACTS_INCOMPLETE", "Admin, Neon and Mesh artifacts are required.", 422);
    }
    const publishedContract = byPlane.get("admin")?.compiledJson["contract_v21"] as
      | MetaEntityContractV21
      | undefined;
    if (!publishedContract) {
      throw new ContractApplicationError("ADMIN_ARTIFACT_INVALID", "Admin artifact is missing Contract v2.1.", 422);
    }
    const version = await sql<{
      entity_id: string;
      entity_code: string;
      tenant_id: string | null;
      before_hash: string | null;
    }>`
      SELECT ev.entity_id::text AS entity_id, entity.entity_code,
             ev.tenant_id::text AS tenant_id, state.contract_hash AS before_hash
        FROM control.entity_version ev
        JOIN control.entity entity ON entity.id=ev.entity_id
        JOIN control.entity_publish_state state ON state.entity_id=ev.entity_id
       WHERE ev.id = ${input.versionId}::uuid
         AND ev.status = 'IN_REVIEW'
         AND ev.contract_schema_version = '2.1'
         AND ev.contract_hash = ${input.contractHash}
         AND ev.projection_hash = ${input.materializedHash}
         AND ev.validation_status = 'VALID'
       FOR UPDATE OF ev, state
    `.execute(this.trx);
    const row = version.rows[0];
    if (!row) {
      throw new ContractApplicationError(
        "CONTRACT_NOT_PUBLISHABLE",
        "The selected draft is not a valid, fully projected Contract v2.1.",
        409,
      );
    }
    for (const artifact of input.artifacts) {
      await sql`
        INSERT INTO snapshot.entity_plane_compiled (
          tenant_id, entity_version_id, plane_key, contract_hash,
          materialized_hash, compiled_json, compiled_hash, created_by
        ) VALUES (
          ${row.tenant_id}::uuid, ${input.versionId}::uuid, ${artifact.plane},
          ${input.contractHash}, ${input.materializedHash},
          ${json(artifact.compiledJson)}::jsonb, ${artifact.compiledHash},
          ${input.actorId}::uuid
        )
        ON CONFLICT (entity_version_id, plane_key) DO NOTHING
      `.execute(this.trx);
      const verified = await sql<{ compiled_hash: string; contract_hash: string; materialized_hash: string }>`
        SELECT compiled_hash, contract_hash, materialized_hash
          FROM snapshot.entity_plane_compiled
         WHERE entity_version_id=${input.versionId}::uuid AND plane_key=${artifact.plane}
      `.execute(this.trx);
      const stored = verified.rows[0];
      if (!stored
          || stored.compiled_hash !== artifact.compiledHash
          || stored.contract_hash !== input.contractHash
          || stored.materialized_hash !== input.materializedHash) {
        throw new ContractApplicationError(
          "COMPILED_HASH_MISMATCH",
          `Stored ${artifact.plane} descriptor does not match publication input.`,
          409,
        );
      }
    }
    await sql`
      UPDATE control.entity_version
         SET status='SUPERSEDED', effective_to=now(), updated_at=now(), updated_by=${input.actorId}::uuid
       WHERE entity_id=${row.entity_id}::uuid AND status='EFFECTIVE' AND id<>${input.versionId}::uuid
    `.execute(this.trx);
    await sql`
      UPDATE control.entity_version
         SET status='EFFECTIVE', effective_from=COALESCE(effective_from,now()),
             reviewed_at=now(), reviewed_by=${input.actorId}::uuid,
             published_at=now(), published_by=${input.actorId}::uuid,
             approval_break_glass=${input.breakGlassReason !== null},
             approval_break_glass_reason=${input.breakGlassReason},
             approval_break_glass_ticket=${input.breakGlassTicket},
             updated_at=now(), updated_by=${input.actorId}::uuid
       WHERE id=${input.versionId}::uuid
    `.execute(this.trx);
    await sql`
      UPDATE control.entity
         SET module_id=COALESCE(
               (SELECT id FROM shared.module WHERE lower(code)=lower(${publishedContract.catalog.module_code}) LIMIT 1),
               module_id
             ),
             entity_code=${publishedContract.catalog.entity_code},
             slug=${publishedContract.catalog.slug},
             entity_class=${publishedContract.catalog.entity_class},
             ownership_model=${publishedContract.catalog.ownership_model},
             label_singular=${publishedContract.catalog.labels.singular},
             label_plural=${publishedContract.catalog.labels.plural},
             description=${publishedContract.catalog.labels.description},
             icon_key=${publishedContract.catalog.presentation.icon_key},
             color_token=${publishedContract.catalog.presentation.color_token},
             plane_eligibility=${publishedContract.catalog.plane_eligibility},
             status=${publishedContract.catalog.enabled ? "ACTIVE" : "SUSPENDED"},
             runtime_enabled=${publishedContract.runtime.runtime_enabled},
             backing_type=${publishedContract.runtime.storage.backing_type},
             table_schema=${publishedContract.runtime.storage.table_schema},
             table_name=${publishedContract.runtime.storage.table_name},
             primary_key=${publishedContract.runtime.storage.primary_key},
             tenant_column=${publishedContract.runtime.storage.tenant_column},
             read_capability=${publishedContract.runtime.capabilities.read},
             write_capability=${publishedContract.runtime.capabilities.write},
             create_mode=${publishedContract.runtime.create_mode},
             draft_ttl_hours=${publishedContract.runtime.draft_ttl_hours},
             governance_level=${publishedContract.runtime.governance_level},
             security_tier=${publishedContract.runtime.security_tier},
             mutability=${publishedContract.runtime.mutability},
             updated_at=now(), updated_by=${input.actorId}::uuid
       WHERE id=${row.entity_id}::uuid
    `.execute(this.trx);
    await sql`
      UPDATE control.entity_publish_state
         SET published_version_id=${input.versionId}::uuid,
             current_draft_version_id=NULL,
             contract_hash=${input.contractHash},
             materialized_hash=${input.materializedHash},
             admin_compiled_hash=${byPlane.get("admin")!.compiledHash},
             neon_compiled_hash=${byPlane.get("neon")!.compiledHash},
             mesh_compiled_hash=${byPlane.get("mesh")!.compiledHash},
             catalog_status='READY', execution_status='READY',
             readiness_status='READY', readiness_diagnostics='[]'::jsonb,
             ready_at=now(), last_compiled_at=now(),
             last_compiled_hash=${byPlane.get("neon")!.compiledHash},
             catalog_compiled_at=now(),
             catalog_compiled_hash=${byPlane.get("admin")!.compiledHash},
             execution_compiled_at=now(),
             execution_compiled_hash=${byPlane.get("neon")!.compiledHash},
             status_summary=${json({
               readiness: "READY",
               planes: {
                 admin: byPlane.get("admin")!.compiledHash,
                 neon: byPlane.get("neon")!.compiledHash,
                 mesh: byPlane.get("mesh")!.compiledHash,
               },
             })}::jsonb,
             updated_at=now(), updated_by=${input.actorId}::uuid
       WHERE entity_id=${row.entity_id}::uuid
    `.execute(this.trx);
    await this.writeTransition({
      versionId: input.versionId,
      actorId: input.actorId,
      contractHash: input.contractHash,
      requestKey: input.requestKey,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      transition: input.transition,
      beforeHash: row.before_hash,
      afterHash: input.contractHash,
      diff: input.diff,
      reason: input.breakGlassReason,
      ticketReference: input.breakGlassTicket,
      sourceVersionId: input.sourceVersionId,
    });
    await sql`
      INSERT INTO log.descriptor_cache_invalidation (
        tenant_id, entity_code, plane_key, reason,
        triggered_by_table, triggered_by_id, created_by
      ) VALUES (
        ${row.tenant_id}::uuid, ${row.entity_code}, NULL, 'version_publish',
        'control.entity_version', ${input.versionId}::uuid, ${input.actorId}::uuid
      )
    `.execute(this.trx);
    await sql`
      SELECT pg_notify('desc_invalidate', json_build_object(
        'tenant_id', ${row.tenant_id}::uuid,
        'entity_code', ${row.entity_code},
        'reason', 'version_publish',
        'source', 'control.entity_version',
        'at', extract(epoch from clock_timestamp())
      )::text)
    `.execute(this.trx);
  }

  async isPublishedReady(versionId: string, contractHash: string): Promise<boolean> {
    const result = await sql<{ ready: boolean }>`
      SELECT EXISTS (
        SELECT 1
          FROM control.entity_publish_state
         WHERE published_version_id=${versionId}::uuid
           AND contract_hash=${contractHash}
           AND materialized_hash=${contractHash}
           AND readiness_status='READY'
           AND admin_compiled_hash IS NOT NULL
           AND neon_compiled_hash IS NOT NULL
           AND mesh_compiled_hash IS NOT NULL
      ) AS ready
    `.execute(this.trx);
    return result.rows[0]?.ready === true;
  }

  async createRollbackVersion(input: {
    sourceVersionId: string;
    actorId: string;
    requestKey: string | null;
  }): Promise<ContractVersionState> {
    if (input.requestKey) {
      await sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`metadata.rollback:${input.requestKey}`}, 0))
      `.execute(this.trx);
      const replay = await sql<{
        version_id: string;
        entity_code: string;
        tenant_id: string | null;
        status: ContractVersionState["status"];
        contract_schema_version: string | null;
        contract_hash: string | null;
        lock_version: number;
        submitted_by: string | null;
      }>`
        SELECT ev.id::text AS version_id, entity.entity_code,
               ev.tenant_id::text AS tenant_id, ev.status,
               ev.contract_schema_version, ev.contract_hash, ev.lock_version,
               ev.submitted_by::text AS submitted_by
          FROM control.entity_contract_transition transition
          JOIN control.entity_version ev ON ev.id=transition.entity_version_id
          JOIN control.entity entity ON entity.id=ev.entity_id
         WHERE transition.transition='rollback_published'
           AND transition.request_key=${input.requestKey}
         LIMIT 1
      `.execute(this.trx);
      if (replay.rows[0]) return toVersionState(replay.rows[0]);
    }
    const result = await sql<{
      version_id: string;
      entity_code: string;
      tenant_id: string | null;
      status: ContractVersionState["status"];
      contract_schema_version: string | null;
      contract_hash: string | null;
      lock_version: number;
      submitted_by: string | null;
    }>`
      WITH source AS (
        SELECT source.*, entity.entity_code
          FROM control.entity_version source
          JOIN control.entity entity ON entity.id=source.entity_id
          JOIN control.entity_publish_state state ON state.entity_id=source.entity_id
         WHERE source.id=${input.sourceVersionId}::uuid
           AND source.status IN ('EFFECTIVE','SUPERSEDED')
           AND source.contract_schema_version='2.1'
         FOR UPDATE OF state
      ), inserted AS (
        INSERT INTO control.entity_version (
          tenant_id, entity_id, version_no, status, change_type, change_summary,
          base_version_id, derived_from_version_id, contract_schema_version,
          contract_document, contract_hash, projection_hash, validation_status,
          validation_diagnostics, validated_at, validated_by, submitted_at,
          submitted_by, created_by
        )
        SELECT tenant_id, entity_id,
               (SELECT COALESCE(max(v.version_no),0)+1 FROM control.entity_version v WHERE v.entity_id=source.entity_id),
               'IN_REVIEW', 'fix', 'Rollback publication from immutable version ' || source.id::text,
               source.id, source.id, source.contract_schema_version,
               source.contract_document, source.contract_hash, source.contract_hash,
               'VALID', '[]'::jsonb, now(), ${input.actorId}::uuid, now(),
               ${input.actorId}::uuid, ${input.actorId}::uuid
          FROM source
        RETURNING *
      )
      SELECT inserted.id::text AS version_id, source.entity_code,
             inserted.tenant_id::text AS tenant_id, inserted.status,
             inserted.contract_schema_version, inserted.contract_hash,
             inserted.lock_version, inserted.submitted_by::text AS submitted_by
        FROM inserted JOIN source ON source.entity_id=inserted.entity_id
    `.execute(this.trx);
    if (!result.rows[0]) {
      throw new ContractApplicationError(
        "ROLLBACK_SOURCE_INVALID",
        "Rollback source must be an immutable v2.1 EFFECTIVE or SUPERSEDED version.",
        422,
      );
    }
    return toVersionState(result.rows[0]);
  }

  private async writeTransition(input: {
    versionId: string;
    actorId: string;
    contractHash: string | null;
    requestKey: string | null;
    entityId: string;
    tenantId: string | null;
    transition: "draft_created" | "submitted" | "approved" | "rejected" | "rollback_published";
    beforeHash: string | null;
    afterHash: string | null;
    diff: readonly unknown[];
    reason: string | null;
    ticketReference: string | null;
    sourceVersionId: string | null;
  }): Promise<void> {
    await sql`
      INSERT INTO control.entity_contract_transition (
        tenant_id, entity_id, entity_version_id, transition, principal_id,
        before_hash, after_hash, contract_diff, reason, ticket_reference,
        request_key, source_version_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.entityId}::uuid, ${input.versionId}::uuid,
        ${input.transition}, ${input.actorId}::uuid, ${input.beforeHash},
        ${input.afterHash}, ${json(input.diff)}::jsonb, ${input.reason},
        ${input.ticketReference}, ${input.requestKey}, ${input.sourceVersionId}::uuid
      )
      ON CONFLICT (entity_id, transition, request_key)
        WHERE request_key IS NOT NULL DO NOTHING
    `.execute(this.trx);
  }
}
