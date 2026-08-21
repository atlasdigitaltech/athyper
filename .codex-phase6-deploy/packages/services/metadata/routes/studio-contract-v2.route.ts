/**
 * Strict Meta Entity Contract v2 Studio boundary.
 *
 * This route is intentionally version-scoped. A user edits one DRAFT graph,
 * validates the entire graph, and only then uses the existing submit/approve
 * workflow. No legacy aliases or catch-all feature/display objects are
 * accepted here.
 */

import { createHash } from "node:crypto";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { MetaEntityContractV2Schema } from "@athyper/api-contracts/meta-entity-contract-v2";
import type { MetaEntityContractV2 } from "@athyper/api-contracts/meta-entity-contract-v2";
import { PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY } from "@athyper/api-contracts/entity-cache-policy";
import { readEffectivePermissionContext } from "@athyper/svc-iam";
import { verifyBearer } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface StudioContractV2RoutesDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

function principalId(claims: Record<string, unknown>): string | null {
  const value = claims["sub"] ?? claims["principal_id"];
  return typeof value === "string" && value.trim() ? value : null;
}

function tenantId(claims: Record<string, unknown>): string | null {
  const value = claims["tenant_id"];
  return typeof value === "string" && value.trim() ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function contractHash(contract: MetaEntityContractV2): string {
  const material = {
    ...contract,
    version_contract: {
      ...contract.version_contract,
      contract_hash: null,
    },
  };
  return createHash("sha256").update(canonicalJson(material)).digest("hex");
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value.trim() ? value : null;
}

function code(value: unknown, fallback: string): string {
  const normalized = String(value ?? fallback).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^([^a-z_])/, "_$1");
  return /^[a-z_][a-z0-9_]*$/.test(normalized) ? normalized : fallback;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function surfaceConfig(value: unknown): Record<string, unknown> {
  const source = record(value) ?? {};
  const features = record(source["features"]);
  const canonicalFeatures = features
    ? {
        ...(typeof features["saved_views"] === "boolean" ? { saved_views: features["saved_views"] } : {}),
        ...(typeof features["column_customization"] === "boolean" ? { column_customization: features["column_customization"] } : {}),
        ...(typeof features["grouping"] === "boolean" ? { grouping: features["grouping"] } : {}),
        ...(typeof features["multi_sort"] === "boolean" ? { multi_sort: features["multi_sort"] } : {}),
        ...(typeof features["max_sort_levels"] === "number" ? { max_sort_levels: features["max_sort_levels"] } : {}),
        ...(typeof features["max_page_size"] === "number" ? { max_page_size: features["max_page_size"] } : {}),
      }
    : undefined;
  return {
    ...(typeof source["default_surface"] === "string" ? { default_surface: code(source["default_surface"], "default_list") } : {}),
    ...(Array.isArray(source["available_surfaces"]) ? { available_surfaces: source["available_surfaces"].filter((item): item is string => typeof item === "string").map((item) => code(item, "surface")) } : {}),
    ...(canonicalFeatures ? { features: canonicalFeatures } : {}),
    renderer_config: record(source["renderer_config"]) ?? {},
  };
}

function confirmation(value: unknown): Record<string, unknown> {
  const source = record(value) ?? {};
  return {
    required: source["required"] === true,
    code: typeof source["code"] === "string" && source["code"].trim() ? code(source["code"], "confirmation") : null,
    ...(typeof source["message"] === "string" && source["message"].trim() ? { message: source["message"] } : {}),
  };
}

function legacySurfaceMode(mode: string): string {
  if (mode === "detail" || mode === "compact_card" || mode === "spreadsheet" || mode === "picker" || mode === "line_editor" || mode === "child_collection" || mode === "header") return "view";
  return mode;
}

function legacySurfaceKind(kind: string): string {
  if (kind === "TABLE") return "list";
  if (kind === "FORM" || kind === "DETAIL") return "fields";
  if (kind === "COLLECTION") return "document_lines";
  if (kind === "PRINT") return "print";
  return "custom";
}

function legacyOperationValue(value: string): string {
  return value.toUpperCase();
}

async function readStagedContract(
  db: AnyDb,
  versionId: string,
): Promise<{
  contract: MetaEntityContractV2;
  entityId: string;
  entityCode: string;
  entityName: string;
  versionNo: number;
} | null> {
  const row = await sql<{
    entity_id: string;
    entity_code: string;
    entity_name: string;
    version_no: number;
    contract_document: unknown;
    behaviors: unknown;
  }>`
    SELECT ev.entity_id::text AS entity_id, ev.version_no,
           ev.contract_document, ev.behaviors,
           e.entity_code, e.name AS entity_name
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ev.id = ${versionId}::uuid
       AND ev.tenant_id IS NULL
       AND e.tenant_id IS NULL
     LIMIT 1
  `.execute(db);
  const current = row.rows[0];
  if (!current) return null;
  const authored = record(current.contract_document)
    ?? record(record(current.behaviors)?.["studio_contract_v2"]);
  if (!authored) return null;
  const parsed = MetaEntityContractV2Schema.safeParse(authored);
  if (!parsed.success) {
    throw new Error(`Stored Contract v2 for version '${versionId}' is invalid: ${parsed.error.message}`);
  }
  return {
    contract: parsed.data,
    entityId: current.entity_id,
    entityCode: current.entity_code,
    entityName: current.entity_name,
    versionNo: Number(current.version_no),
  };
}

/**
 * Publish the owners that intentionally remain entity-scoped in the legacy
 * storage model. Draft saves stage these values in the canonical
 * entity_version.contract_document;
 * this function is called inside the version-publish transaction so a DRAFT
 * never leaks catalog, lifecycle, or numbering changes into the effective
 * runtime.
 */
export async function publishStagedContractV2(
  db: AnyDb,
  versionId: string,
  principal: string,
): Promise<void> {
  const staged = await readStagedContract(db, versionId);
  if (!staged) return;
  const { contract, entityId, entityCode, entityName, versionNo } = staged;
  const catalog = contract.catalog;
  const persistedCatalogStatus = catalog.status === "RETIRED" ? "ARCHIVED" : catalog.status;

  await sql`
    UPDATE control.entity
       SET module_id = COALESCE(
             (SELECT m.id::text FROM shared.module m WHERE lower(m.code) = lower(${catalog.module_id}) LIMIT 1),
             module_id
           ),
           entity_code = ${catalog.entity_code},
           slug = ${catalog.slug},
           entity_class = ${catalog.entity_class},
           ownership_model = ${catalog.ownership_model},
           label_singular = ${catalog.label_singular},
           label_plural = ${catalog.label_plural},
           description = ${catalog.description ?? null},
           icon_key = ${catalog.icon_key ?? null},
           color_token = ${catalog.color_token ?? null},
           plane_eligibility = ${catalog.plane_eligibility},
           status_changed_at = CASE WHEN status IS DISTINCT FROM ${persistedCatalogStatus} THEN now() ELSE status_changed_at END,
           status_changed_by = CASE WHEN status IS DISTINCT FROM ${persistedCatalogStatus} THEN ${principal}::uuid ELSE status_changed_by END,
           status = ${persistedCatalogStatus},
           updated_at = now(),
           updated_by = ${principal}::uuid
     WHERE id = ${entityId}::uuid
       AND tenant_id IS NULL
  `.execute(db);

  await sql`
    UPDATE control.entity_numbering_config
       SET status = 'inactive', updated_at = now(), updated_by = ${principal}::uuid
     WHERE entity_id = ${entityId}::uuid
       AND tenant_id IS NULL
       AND status = 'active'
  `.execute(db);
  if (contract.numbering) {
    const numbering = contract.numbering;
    await sql`
      INSERT INTO control.entity_numbering_config (
        id, tenant_id, entity_id, entity_version_id, number_field, company_code_id, prefix, prefix_configurable, separator,
        segments, reset_strategy, uniqueness_scope, max_length, allowed_chars, metadata, status,
        created_by, updated_at, updated_by
      )
      VALUES (
        ${numbering.id}::uuid, NULL::uuid, ${entityId}::uuid, ${versionId}::uuid, ${numbering.number_field},
        ${numbering.company_code_id ?? null}::uuid, ${numbering.prefix}, ${numbering.prefix_configurable},
        ${numbering.separator}, ${json(numbering.segments)}::jsonb, ${numbering.reset_strategy},
        ${numbering.uniqueness_scope}, ${numbering.max_length}, ${numbering.allowed_chars},
        ${json(numbering.metadata)}::jsonb, ${numbering.status}, ${principal}::uuid, now(), ${principal}::uuid
      )
      ON CONFLICT (id) DO UPDATE SET
        entity_version_id = EXCLUDED.entity_version_id,
        company_code_id = EXCLUDED.company_code_id, number_field = EXCLUDED.number_field,
        prefix = EXCLUDED.prefix, prefix_configurable = EXCLUDED.prefix_configurable,
        separator = EXCLUDED.separator, segments = EXCLUDED.segments,
        reset_strategy = EXCLUDED.reset_strategy, uniqueness_scope = EXCLUDED.uniqueness_scope,
        max_length = EXCLUDED.max_length, allowed_chars = EXCLUDED.allowed_chars,
        metadata = EXCLUDED.metadata, status = EXCLUDED.status,
        updated_at = now(), updated_by = EXCLUDED.updated_by
    `.execute(db);
  }

  const boundNames = [...new Set([entityCode, entityName, catalog.entity_code])];
  const existingTransitions = await sql<{
    from_state: string;
    to_state: string;
    operation_code: string;
  }>`
    SELECT fs.code AS from_state, ts.code AS to_state, lt.operation_code
      FROM control.entity_lifecycle el
      JOIN control.lifecycle_transition lt ON lt.lifecycle_id = el.lifecycle_id
      JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
      JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
     WHERE el.tenant_id IS NULL
       AND el.entity_name IN (${sql.join(boundNames.map((value) => sql`${value}`))})
       AND lt.is_active
     ORDER BY el.priority, fs.code, ts.code
  `.execute(db);
  const transitionOperations = new Map(
    existingTransitions.rows.map((row) => [`${row.from_state}:${row.to_state}`, row.operation_code]),
  );

  await sql`
    DELETE FROM control.entity_lifecycle
     WHERE tenant_id IS NULL
       AND entity_name IN (${sql.join(boundNames.map((value) => sql`${value}`))})
       AND (entity_version_id IS NULL OR entity_version_id = ${versionId}::uuid)
  `.execute(db);

  if (contract.lifecycle) {
    const lifecycle = contract.lifecycle;
    const lifecycleCode = `meta_${catalog.entity_code}_v${versionNo}`;
    const insertedLifecycle = await sql<{ id: string }>`
      INSERT INTO control.lifecycle (
        tenant_id, code, name, description, version_no, is_active, config, created_by, updated_by
      )
      VALUES (
        NULL, ${lifecycleCode}, ${`${catalog.label_singular} v${versionNo}`},
        ${`Contract v2 lifecycle for ${catalog.entity_code} version ${versionNo}`},
        ${versionNo}, true,
        ${json({ status_field: lifecycle.status_field, command_handler: lifecycle.command_handler ?? null })}::jsonb,
        ${principal}::uuid, ${principal}::uuid
      )
      ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, version_no = EXCLUDED.version_no,
        is_active = true, config = EXCLUDED.config, updated_at = now(), updated_by = EXCLUDED.updated_by
      RETURNING id::text AS id
    `.execute(db);
    const lifecycleId = insertedLifecycle.rows[0]?.id;
    if (!lifecycleId) throw new Error(`Unable to materialize lifecycle '${lifecycleCode}'.`);

    const stateIds = new Map<string, string>();
    let sortOrder = 0;
    for (const [stateCode, state] of Object.entries(lifecycle.states)) {
      sortOrder += 10;
      const insertedState = await sql<{ id: string }>`
        INSERT INTO control.lifecycle_state (
          tenant_id, lifecycle_id, code, name, is_initial, is_terminal, sort_order,
          config, state_flags, created_by, updated_by
        )
        VALUES (
          NULL, ${lifecycleId}::uuid, ${stateCode}, ${state.label}, ${state.is_initial},
          ${state.is_terminal}, ${sortOrder},
          ${json({ badge: state.badge ?? null, icon: state.icon ?? null, color: state.color ?? null })}::jsonb,
          ${json({
            is_mutable: state.is_editable,
            is_deletable: state.is_deletable,
            is_reversible: state.is_reversible,
          })}::jsonb,
          ${principal}::uuid, ${principal}::uuid
        )
        ON CONFLICT (lifecycle_id, code) DO UPDATE SET
          name = EXCLUDED.name, is_initial = EXCLUDED.is_initial, is_terminal = EXCLUDED.is_terminal,
          sort_order = EXCLUDED.sort_order, config = EXCLUDED.config, state_flags = EXCLUDED.state_flags,
          updated_at = now(), updated_by = EXCLUDED.updated_by
        RETURNING id::text AS id
      `.execute(db);
      const stateId = insertedState.rows[0]?.id;
      if (!stateId) throw new Error(`Unable to materialize lifecycle state '${stateCode}'.`);
      stateIds.set(stateCode, stateId);
    }

    for (const [fromState, targets] of Object.entries(lifecycle.allowed_transitions)) {
      for (const toState of targets) {
        const fromId = stateIds.get(fromState);
        const toId = stateIds.get(toState);
        if (!fromId || !toId) throw new Error(`Lifecycle transition '${fromState}' -> '${toState}' references an unknown state.`);
        const operation = transitionOperations.get(`${fromState}:${toState}`)
          ?? contract.operations.find((candidate) =>
            candidate.operation_code === toState
            || candidate.operation_code === `transition_${toState}`)?.permission_code;
        if (!operation) {
          throw new Error(
            `Lifecycle transition '${fromState}' -> '${toState}' has no operation mapping. `
            + `Keep an existing edge or add an operation named '${toState}' or 'transition_${toState}'.`,
          );
        }
        await sql`
          INSERT INTO control.lifecycle_transition (
            tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, is_active,
            config, created_by, updated_by
          )
          VALUES (
            NULL, ${lifecycleId}::uuid, ${fromId}::uuid, ${toId}::uuid, ${operation}, true,
            '{}'::jsonb, ${principal}::uuid, ${principal}::uuid
          )
          ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO UPDATE SET
            operation_code = EXCLUDED.operation_code, is_active = true,
            updated_at = now(), updated_by = EXCLUDED.updated_by
        `.execute(db);
      }
    }

    await sql`
      INSERT INTO control.entity_lifecycle (
        tenant_id, entity_name, entity_version_id, lifecycle_id, conditions, priority, created_by, updated_by
      )
      VALUES (
        NULL, ${catalog.entity_code}, ${versionId}::uuid, ${lifecycleId}::uuid, NULL, 100,
        ${principal}::uuid, ${principal}::uuid
      )
      ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO UPDATE SET
        entity_version_id = EXCLUDED.entity_version_id,
        priority = EXCLUDED.priority, updated_at = now(), updated_by = EXCLUDED.updated_by
    `.execute(db);
  }

  await sql`
    UPDATE control.entity_flow
       SET status = 'active', effective_from = COALESCE(effective_from, now()),
           updated_at = now(), updated_by = ${principal}::uuid
     WHERE entity_version_id = ${versionId}::uuid
       AND tenant_id IS NULL
       AND status = 'draft'
  `.execute(db);
}

async function materializeDraftContract(db: AnyDb, versionId: string, principal: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const source = await sql<{ entity_id: string; entity_code: string; source_version_id: string }>`
      SELECT ev.entity_id::text AS entity_id, e.entity_code,
             (SELECT source.id::text FROM control.entity_version source
               WHERE source.entity_id = ev.entity_id AND source.status = 'EFFECTIVE'
               ORDER BY source.version_no DESC LIMIT 1) AS source_version_id
        FROM control.entity_version ev
        JOIN control.entity e ON e.id = ev.entity_id
       WHERE ev.id = ${versionId}::uuid AND ev.status = 'DRAFT'
       LIMIT 1
    `.execute(trx);
    const sourceRow = source.rows[0];
    if (!sourceRow?.source_version_id) return;

    await sql`
      INSERT INTO control.entity_version_contract (
        entity_version_id, tenant_id, catalog_enabled, api_exposure, backing_type, table_schema, table_name,
        key_strategy, primary_key, tenant_column, read_capability, write_capability, read_handler, write_handler,
        source_kind, contract_hash, runtime_enabled, create_mode, draft_ttl_hours, governance_level, security_tier,
        mutability, identity_config, search_config, data_policy, concurrency_config, storage_config, contract_version,
        created_by, updated_by
      )
      SELECT ${versionId}::uuid, c.tenant_id, c.catalog_enabled, c.api_exposure, c.backing_type, c.table_schema, c.table_name,
             c.key_strategy, c.primary_key, c.tenant_column, c.read_capability, c.write_capability, c.read_handler, c.write_handler,
             'explicit', NULL, c.runtime_enabled, c.create_mode, c.draft_ttl_hours, c.governance_level, c.security_tier,
             c.mutability, c.identity_config, c.search_config, c.data_policy, c.concurrency_config, c.storage_config, 2,
             ${principal}::uuid, ${principal}::uuid
        FROM control.entity_version_contract c
       WHERE c.entity_version_id = ${sourceRow.source_version_id}::uuid
      ON CONFLICT (entity_version_id) DO NOTHING
    `.execute(trx);

    await sql`
      INSERT INTO control.entity_field (
        id, tenant_id, entity_version_id, name, column_name, projection_alias_of, label, description, data_type,
        cardinality, origin, is_required, is_unique, unique_scope, is_filterable, is_sortable, is_groupable,
        is_aggregatable, is_read_only, is_deprecated, is_computed, is_write_once, runtime_enabled, compute_mode,
        compute_expr, default_value, defaults, sort_order, created_by, semantic_roles, type_config
      )
      SELECT shared.uuidv7(), f.tenant_id, ${versionId}::uuid, f.name, f.column_name, f.projection_alias_of, f.label, f.description,
             f.data_type, f.cardinality, f.origin, f.is_required, f.is_unique, f.unique_scope, f.is_filterable, f.is_sortable,
             f.is_groupable, f.is_aggregatable, f.is_read_only, f.is_deprecated, f.is_computed, f.is_write_once, f.runtime_enabled,
             f.compute_mode, f.compute_expr, f.default_value, f.defaults, f.sort_order, ${principal}::uuid,
             f.semantic_roles, f.type_config
        FROM control.entity_field f
       WHERE f.entity_version_id = ${sourceRow.source_version_id}::uuid AND f.tenant_id IS NULL AND f.is_active
         AND NOT EXISTS (
           SELECT 1 FROM control.entity_field existing
            WHERE existing.entity_version_id = ${versionId}::uuid AND existing.name = f.name
         )
    `.execute(trx);

    await sql`
      INSERT INTO control.entity_relation (
        id, tenant_id, entity_version_id, name, relation_kind, target_entity, resolution_kind, fk_field, target_key,
        source_type_field, source_type_value, source_id_field, source_line_field, runtime_role, on_delete, record_filter,
        relation_code, target_entity_code, source_field, target_field, polymorphic_type_field, polymorphic_type_value,
        polymorphic_id_field, mutation_owner, mutation_permissions, created_by
      )
      SELECT shared.uuidv7(), r.tenant_id, ${versionId}::uuid, r.name, r.relation_kind, r.target_entity, r.resolution_kind,
             r.fk_field, r.target_key, r.source_type_field, r.source_type_value, r.source_id_field, r.source_line_field,
             r.runtime_role, r.on_delete, r.record_filter, r.relation_code, r.target_entity_code, r.source_field, r.target_field,
             r.polymorphic_type_field, r.polymorphic_type_value, r.polymorphic_id_field, r.mutation_owner,
             r.mutation_permissions, ${principal}::uuid
        FROM control.entity_relation r
       WHERE r.entity_version_id = ${sourceRow.source_version_id}::uuid AND r.tenant_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM control.entity_relation existing
            WHERE existing.entity_version_id = ${versionId}::uuid AND existing.name = r.name
         )
    `.execute(trx);

    await sql`
      INSERT INTO control.entity_surface (
        id, tenant_id, entity_id, entity_version_id, mode, surface_key, kind, placement, parent_surface_id, slot_key,
        label, icon_key, group_keys, relation_name, renderer_key, composer_key, strategy_key, column_count, print_span,
        density, required_permissions, visibility_expr, sort_order, is_enabled, config, created_by, v2_mode, v2_kind
      )
      SELECT shared.uuidv7(), s.tenant_id, s.entity_id, ${versionId}::uuid, s.mode, s.surface_key, s.kind, s.placement,
             NULL, s.slot_key, s.label, s.icon_key, s.group_keys, s.relation_name, s.renderer_key, s.composer_key, s.strategy_key,
             s.column_count, s.print_span, s.density, s.required_permissions, s.visibility_expr, s.sort_order, s.is_enabled,
             s.config, ${principal}::uuid, s.v2_mode, s.v2_kind
        FROM control.entity_surface s
       WHERE s.entity_id = ${sourceRow.entity_id}::uuid
         AND (s.entity_version_id = ${sourceRow.source_version_id}::uuid OR s.entity_version_id IS NULL)
         AND s.tenant_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM control.entity_surface existing
            WHERE existing.entity_version_id = ${versionId}::uuid AND existing.surface_key = s.surface_key AND existing.mode = s.mode
         )
    `.execute(trx);

    await sql`
      INSERT INTO control.entity_field_surface (
        id, tenant_id, entity_surface_id, entity_field_id, visible_override, required_override, readonly_override,
        sort_order, column_span, density, renderer_key, editor_key, visibility_expr, editability_expr, renderer_config, created_by
      )
      SELECT shared.uuidv7(), b.tenant_id, target_surface.id, target_field.id, b.visible_override, b.required_override,
             b.readonly_override, b.sort_order, b.column_span, b.density, b.renderer_key, b.editor_key, b.visibility_expr,
             b.editability_expr, b.renderer_config, ${principal}::uuid
        FROM control.entity_field_surface b
        JOIN control.entity_surface source_surface ON source_surface.id = b.entity_surface_id
        JOIN control.entity_surface target_surface ON target_surface.entity_version_id = ${versionId}::uuid
          AND target_surface.surface_key = source_surface.surface_key AND target_surface.mode = source_surface.mode
        JOIN control.entity_field source_field ON source_field.id = b.entity_field_id
        JOIN control.entity_field target_field ON target_field.entity_version_id = ${versionId}::uuid
          AND target_field.name = source_field.name
       WHERE (source_surface.entity_version_id = ${sourceRow.source_version_id}::uuid OR source_surface.entity_version_id IS NULL)
         AND b.tenant_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM control.entity_field_surface existing
            WHERE existing.entity_surface_id = target_surface.id AND existing.entity_field_id = target_field.id
         )
    `.execute(trx);

    await sql`
      INSERT INTO control.entity_operation (
        id, tenant_id, entity_version_id, entity_name, permission_code, surface, placement, handler_type, handler_target,
        execution_target, is_record_required, sort_order, label_override, icon_override, is_enabled, selection_config,
        operation_code, label, icon, intent, confirmation, reason_required, record_required, created_by
      )
      SELECT shared.uuidv7(), o.tenant_id, ${versionId}::uuid, ${sourceRow.entity_code}, o.permission_code, o.surface, o.placement,
             o.handler_type, o.handler_target, o.execution_target, o.is_record_required, o.sort_order, o.label_override,
             o.icon_override, o.is_enabled, o.selection_config, o.operation_code, o.label, o.icon, o.intent, o.confirmation,
             o.reason_required, o.record_required, ${principal}::uuid
        FROM control.entity_operation o
       WHERE o.tenant_id IS NULL AND (o.entity_version_id = ${sourceRow.source_version_id}::uuid OR o.entity_version_id IS NULL)
         AND NOT EXISTS (
           SELECT 1 FROM control.entity_operation existing
            WHERE existing.entity_version_id = ${versionId}::uuid AND existing.permission_code = o.permission_code
         )
    `.execute(trx);
  });
}

export function createStudioContractV2Routes(router: Router, deps: StudioContractV2RoutesDeps): Router {
  const guard: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      const verifiedPrincipal = claims ? principalId(claims) : null;
      if (!claims || !verifiedPrincipal) return;
      const requiredPermission = req.method === "GET"
        ? "metadata.contract.view"
        : "metadata.contract.edit";
      const permissionContext = readEffectivePermissionContext(res);
      const permitted = permissionContext?.planeKey === "admin"
        && permissionContext.principalId === verifiedPrincipal
        && permissionContext.allowed.has(requiredPermission)
        && !permissionContext.denied.has(requiredPermission)
        && !permissionContext.planLocked.has(requiredPermission)
        && !permissionContext.planeExcluded.has(requiredPermission);
      if (!permitted) {
        res.status(403).json({
          error: "METADATA_CONTRACT_FORBIDDEN",
          message: "Admin-plane metadata contract permission is required.",
          required_permission: requiredPermission,
        });
        return;
      }
      (req as typeof req & { metaPrincipalId: string; metaTenantId: string | null }).metaPrincipalId = verifiedPrincipal;
      (req as typeof req & { metaPrincipalId: string; metaTenantId: string | null }).metaTenantId = tenantId(claims);
      next();
    } catch (error) {
      deps.logger?.error("studio_contract_v2_auth_error", { error: String(error) });
      next(error);
    }
  };

  const getContract: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params["id"]);
      const contract = await sql<Record<string, unknown>>`
        SELECT c.*, ev.status AS version_status,
               ev.contract_document AS canonical_contract_document,
               ev.behaviors AS version_behaviors,
               ev.lock_version AS workflow_lock_version,
               ev.contract_hash AS workflow_contract_hash,
               e.id::text AS catalog_id, e.tenant_id::text AS catalog_tenant_id,
               COALESCE(
                 (SELECT m.code
                    FROM shared.module m
                   WHERE m.id::text = e.module_id OR lower(m.code) = lower(e.module_id)
                   ORDER BY CASE WHEN m.id::text = e.module_id THEN 0 ELSE 1 END
                   LIMIT 1),
                 lower(e.module_id)
               ) AS module_code,
               e.entity_code, e.name, e.slug, e.entity_class, e.ownership_model,
               e.label_singular, e.label_plural, e.description, e.icon_key,
               e.color_token, e.plane_eligibility, e.status, e.is_active,
               e.status_changed_at, e.status_changed_by::text AS status_changed_by
          FROM control.entity_version_contract c
          JOIN control.entity_version ev ON ev.id = c.entity_version_id
          JOIN control.entity e ON e.id = ev.entity_id
         WHERE c.entity_version_id = ${id}::uuid
           AND c.tenant_id IS NULL
         LIMIT 1
      `.execute(deps.db);
      const row = contract.rows[0];
      if (!row) {
        res.status(404).json({ error: "NOT_FOUND", message: `v2 contract '${id}' not found` });
        return;
      }
      const stagedContract = record(row["canonical_contract_document"])
        ?? record(record(row["version_behaviors"])?.["studio_contract_v2"]);
      if (stagedContract) {
        const parsedStaged = MetaEntityContractV2Schema.safeParse(stagedContract);
        if (parsedStaged.success) {
          res.json({
            ...parsedStaged.data,
            version_status: row["version_status"],
            workflow_lock_version: row["workflow_lock_version"],
            workflow_contract_hash: row["workflow_contract_hash"],
          });
          return;
        }
      }

      const fields = await sql<Record<string, unknown>>`
        SELECT id::text AS id, tenant_id::text AS tenant_id, entity_version_id::text AS entity_version_id,
               name, column_name, projection_alias_of, COALESCE(label, name) AS label, description, data_type, cardinality, origin,
               is_required, is_unique, unique_scope, is_read_only, is_deprecated, is_computed, is_write_once,
               runtime_enabled, compute_mode, compute_expr, default_value, defaults,
               is_filterable, is_sortable, is_groupable, is_aggregatable, COALESCE(semantic_roles, '{}') AS semantic_roles,
               COALESCE(type_config, '{"kind":"scalar"}'::jsonb) AS type_config
          FROM control.entity_field
         WHERE entity_version_id = ${id}::uuid AND tenant_id IS NULL AND is_active
         ORDER BY sort_order, name
      `.execute(deps.db);
      const relations = await sql<Record<string, unknown>>`
        SELECT id::text AS id, tenant_id::text AS tenant_id, entity_version_id::text AS entity_version_id,
               COALESCE(relation_code, name) AS relation_code, relation_kind,
               COALESCE(target_entity_code, target_entity) AS target_entity_code, resolution_kind,
               COALESCE(source_field, fk_field) AS source_field,
               COALESCE(target_field, target_key, 'id') AS target_field,
               polymorphic_type_field, polymorphic_type_value, polymorphic_id_field, source_line_field,
               runtime_role, on_delete, COALESCE(record_filter, '{}'::jsonb) AS record_filter,
               COALESCE(mutation_owner, 'read_only') AS mutation_owner, COALESCE(mutation_permissions, '{}') AS mutation_permissions
          FROM control.entity_relation
         WHERE entity_version_id = ${id}::uuid AND tenant_id IS NULL
         ORDER BY COALESCE(relation_code, name)
      `.execute(deps.db);
      const surfaces = await sql<Record<string, unknown>>`
        SELECT id::text AS id, tenant_id::text AS tenant_id,
               COALESCE(entity_version_id, ${id}::uuid)::text AS entity_version_id,
               surface_key, COALESCE(v2_mode, CASE mode WHEN 'view' THEN 'detail' ELSE mode END) AS mode,
               COALESCE(v2_kind, CASE WHEN mode = 'list' THEN 'TABLE' ELSE 'CUSTOM' END) AS kind,
               renderer_key, label, is_enabled, config
         FROM control.entity_surface
         WHERE entity_id = (SELECT entity_id FROM control.entity_version WHERE id = ${id}::uuid)
           AND tenant_id IS NULL
           AND (
             entity_version_id = ${id}::uuid
             OR (
               entity_version_id IS NULL
               AND NOT EXISTS (
                 SELECT 1
                   FROM control.entity_surface versioned_surface
                  WHERE versioned_surface.entity_version_id = ${id}::uuid
                    AND versioned_surface.tenant_id IS NULL
               )
             )
           )
         ORDER BY sort_order, surface_key
      `.execute(deps.db);
      const surfaceIds = surfaces.rows.map((surface) => surface["id"]);
      const bindings = surfaceIds.length === 0
        ? { rows: [] as Record<string, unknown>[] }
        : await sql<Record<string, unknown>>`
            SELECT id::text AS id, tenant_id::text AS tenant_id, entity_surface_id::text AS entity_surface_id,
                   entity_field_id::text AS entity_field_id, COALESCE(visible_override, true) AS visible,
                   required_override, readonly_override, sort_order, column_span, density,
                   renderer_key, editor_key, visibility_expr, editability_expr, renderer_config
              FROM control.entity_field_surface
             WHERE tenant_id IS NULL
               AND entity_surface_id IN (${sql.join(surfaceIds.map((value) => sql`${value}::uuid`))})
             ORDER BY sort_order NULLS LAST
          `.execute(deps.db);

      const groupedSurfaces = surfaces.rows.map((surface) => ({
        surface: {
          id: surface["id"],
          tenant_id: surface["tenant_id"] ?? null,
          entity_version_id: surface["entity_version_id"],
          surface_key: surface["surface_key"],
          mode: surface["mode"],
          kind: surface["kind"],
          renderer_key: surface["renderer_key"] ?? "runtime_default",
          label: surface["label"] ?? null,
          is_enabled: surface["is_enabled"] ?? true,
          config: surfaceConfig(surface["config"]),
        },
        fields: bindings.rows.filter((binding) => binding["entity_surface_id"] === surface["id"]),
      }));
      const operationRows = await sql<Record<string, unknown>>`
        SELECT id::text AS id, tenant_id::text AS tenant_id, COALESCE(entity_version_id, ${id}::uuid)::text AS entity_version_id,
               COALESCE(operation_code, lower(permission_code)) AS operation_code, permission_code,
               lower(surface) AS surface, lower(placement) AS placement, lower(handler_type) AS handler_type,
               handler_target, execution_target, COALESCE(record_required, is_record_required) AS record_required,
               COALESCE(label, label_override, permission_code) AS label, COALESCE(icon, icon_override) AS icon,
               intent, confirmation, reason_required, selection_config, sort_order, is_enabled AS enabled
         FROM control.entity_operation
         WHERE tenant_id IS NULL
           AND (
             entity_version_id = ${id}::uuid
             OR (
               entity_version_id IS NULL
               AND entity_name = ${row["entity_code"]}
               AND NOT EXISTS (
                 SELECT 1
                   FROM control.entity_operation versioned_operation
                  WHERE versioned_operation.entity_version_id = ${id}::uuid
                    AND versioned_operation.tenant_id IS NULL
               )
             )
           )
         ORDER BY sort_order, operation_code
      `.execute(deps.db);
      const numberingRows = await sql<Record<string, unknown>>`
        SELECT n.id::text AS id, n.entity_id::text AS entity_id, n.number_field, n.company_code_id::text AS company_code_id,
               n.prefix, n.prefix_configurable, n.separator, n.segments, n.reset_strategy, n.uniqueness_scope,
               n.max_length, n.allowed_chars, n.metadata, n.status
          FROM control.entity_numbering_config n
         WHERE n.entity_id = ${row["catalog_id"]}::uuid AND n.tenant_id IS NULL AND n.is_active
         ORDER BY n.company_code_id NULLS FIRST
         LIMIT 1
      `.execute(deps.db);
      const requestTenantId = (req as typeof req & { metaTenantId: string | null }).metaTenantId;
      const policyRows = requestTenantId
        ? await sql<Record<string, unknown>>`
            SELECT access_mode, company_scope_mode, audit_mode, retention_policy, default_filters, cache_flags
              FROM control.entity_policy
             WHERE tenant_id = ${requestTenantId}::uuid AND entity_id = ${row["catalog_id"]}::uuid
               AND (entity_version_id = ${id}::uuid OR entity_version_id IS NULL)
             ORDER BY (entity_version_id IS NULL), updated_at DESC NULLS LAST
             LIMIT 1
          `.execute(deps.db)
        : { rows: [] as Record<string, unknown>[] };
      const policy = policyRows.rows[0]
        ? {
            access_mode: policyRows.rows[0]["access_mode"], company_scope_mode: policyRows.rows[0]["company_scope_mode"],
            audit_mode: policyRows.rows[0]["audit_mode"], retention_policy: record(policyRows.rows[0]["retention_policy"]) ?? {},
            default_filters: record(policyRows.rows[0]["default_filters"]) ?? {},
            cache_flags: record(policyRows.rows[0]["cache_flags"]) ?? {},
            cache_policy: record(record(policyRows.rows[0]["cache_flags"])?.["cache_policy"]) ?? {
              ...PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
              source: "platform",
            },
          }
        : {
            access_mode: "default_deny",
            company_scope_mode: "none",
            audit_mode: "enabled",
            retention_policy: {},
            default_filters: {},
            cache_flags: {},
            cache_policy: { ...PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY, source: "platform" },
          };
      const lifecycleRows = await sql<Record<string, unknown>>`
        SELECT el.lifecycle_id::text AS lifecycle_id, lc.code AS lifecycle_code, lc.config AS lifecycle_config,
               ls.code AS state_code, ls.name AS state_name, ls.is_initial, ls.is_terminal,
               ls.config AS state_config, ls.state_flags
          FROM control.entity_lifecycle el
          JOIN control.lifecycle lc ON lc.id = el.lifecycle_id
          JOIN control.lifecycle_state ls ON ls.lifecycle_id = lc.id
         WHERE el.entity_name IN (${sql.join([row["entity_code"], row["name"]].filter((value): value is string => typeof value === "string").map((value) => sql`${value}`))})
           AND el.tenant_id IS NULL AND lc.tenant_id IS NULL AND lc.is_active
         ORDER BY el.priority, ls.sort_order, ls.code
      `.execute(deps.db);
      const lifecycleId = lifecycleRows.rows[0]?.["lifecycle_id"];
      const transitionRows = lifecycleId
        ? await sql<Record<string, unknown>>`
            SELECT fs.code AS from_state, ts.code AS to_state, lt.operation_code
              FROM control.lifecycle_transition lt
              JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
              JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
             WHERE lt.lifecycle_id = ${lifecycleId}::uuid AND lt.tenant_id IS NULL AND lt.is_active
             ORDER BY fs.sort_order, ts.sort_order, ts.code
          `.execute(deps.db)
        : { rows: [] as Record<string, unknown>[] };
      const allowedTransitions: Record<string, string[]> = {};
      for (const state of lifecycleRows.rows) allowedTransitions[String(state["state_code"])] = [];
      for (const transition of transitionRows.rows) {
        const from = String(transition["from_state"]);
        const to = String(transition["to_state"]);
        const targets = allowedTransitions[from] ?? (allowedTransitions[from] = []);
        if (!targets.includes(to)) targets.push(to);
      }
      const lifecycle = lifecycleRows.rows[0]
        ? {
            status_field: code(record(lifecycleRows.rows[0]["lifecycle_config"])?.["status_field"], "status"),
            states: Object.fromEntries(lifecycleRows.rows.map((state) => {
              const config = record(state["state_config"]) ?? {};
              const flags = record(state["state_flags"]) ?? {};
              const terminal = state["is_terminal"] === true;
              return [String(state["state_code"]), {
                label: String(state["state_name"] ?? state["state_code"]),
                badge: typeof config["badge"] === "string" ? code(config["badge"], "state") : null,
                icon: typeof config["icon"] === "string" ? code(config["icon"], "state") : null,
                color: typeof config["color"] === "string" ? code(config["color"], "state") : null,
                is_initial: state["is_initial"] === true, is_terminal: terminal,
                is_editable: typeof flags["is_mutable"] === "boolean" ? flags["is_mutable"] : !terminal,
                is_deletable: typeof flags["is_deletable"] === "boolean" ? flags["is_deletable"] : !terminal,
                is_reversible: flags["is_reversible"] === true,
              }];
            })),
            allowed_transitions: allowedTransitions,
            command_handler: typeof record(lifecycleRows.rows[0]["lifecycle_config"])?.["command_handler"] === "string"
              ? record(lifecycleRows.rows[0]["lifecycle_config"])?.["command_handler"] : null,
          }
        : null;
      const flowRows = await sql<Record<string, unknown>>`
        SELECT flow_code, config
          FROM control.entity_flow
         WHERE entity_version_id = ${id}::uuid
           AND tenant_id IS NULL
           AND status IN ('draft', 'active')
         ORDER BY flow_code
      `.execute(deps.db);

      res.json({
        contract_version: 2,
        version_status: row["version_status"],
        workflow_lock_version: row["workflow_lock_version"],
        workflow_contract_hash: row["workflow_contract_hash"],
        catalog: {
          id: row["catalog_id"], tenant_id: row["catalog_tenant_id"] ?? null, module_id: row["module_code"],
          entity_code: row["entity_code"], slug: row["slug"], entity_class: row["entity_class"],
          ownership_model: row["ownership_model"], label_singular: row["label_singular"],
          label_plural: row["label_plural"], description: row["description"] ?? null,
          icon_key: row["icon_key"] ?? null, color_token: row["color_token"] ?? null,
          plane_eligibility: row["plane_eligibility"],
          status: row["status"] === "ARCHIVED" ? "RETIRED" : row["status"],
          is_active: row["is_active"],
          status_changed_at: iso(row["status_changed_at"]),
          status_changed_by: row["status_changed_by"] ?? null,
        },
        version_contract: {
          id: row["id"], tenant_id: row["tenant_id"] ?? null, entity_version_id: row["entity_version_id"],
          runtime_enabled: row["runtime_enabled"], api_exposure: row["api_exposure"],
          backing_type: row["backing_type"], table_schema: row["table_schema"], table_name: row["table_name"],
          primary_key: row["primary_key"] ?? "id", tenant_column: row["tenant_column"] ?? null,
          read_capability: row["read_capability"], write_capability: row["write_capability"],
          create_mode: row["create_mode"], draft_ttl_hours: row["draft_ttl_hours"] ?? null,
          governance_level: row["governance_level"], security_tier: row["security_tier"], mutability: row["mutability"],
          read_handler: row["read_handler"] ?? null, write_handler: row["write_handler"] ?? null,
          source_kind: row["source_kind"], contract_hash: row["contract_hash"] ?? null,
          identity_config: row["identity_config"] ?? {}, search_config: row["search_config"] ?? {},
          data_policy: row["data_policy"] ?? {}, concurrency_config: row["concurrency_config"] ?? {},
          storage_config: row["storage_config"] ?? {},
        },
        fields: fields.rows,
        relations: relations.rows,
        surfaces: groupedSurfaces,
        operations: operationRows.rows.map((operation) => ({
          id: operation["id"], tenant_id: operation["tenant_id"] ?? null, entity_version_id: operation["entity_version_id"],
          operation_code: code(operation["operation_code"], "operation"), permission_code: code(operation["permission_code"], "permission"),
          surface: ["list", "detail", "both", "picker", "hidden"].includes(String(operation["surface"])) ? operation["surface"] : "both",
          placement: ["primary", "toolbar", "overflow", "context", "command"].includes(String(operation["placement"])) ? operation["placement"] : "toolbar",
          handler_type: ["navigate", "api", "modal", "inline"].includes(String(operation["handler_type"])) ? operation["handler_type"] : "api",
          handler_target: operation["handler_target"] ?? null, execution_target: operation["execution_target"] ?? null,
          record_required: operation["record_required"] === true, label: String(operation["label"] ?? operation["operation_code"]),
          icon: operation["icon"] ?? null, intent: ["success", "warning", "danger"].includes(String(operation["intent"])) ? operation["intent"] : "neutral",
          confirmation: confirmation(operation["confirmation"]),
          reason_required: operation["reason_required"] === true, selection_config: record(operation["selection_config"]),
          sort_order: Number(operation["sort_order"] ?? 0), enabled: operation["enabled"] !== false,
        })),
        lifecycle,
        numbering: numberingRows.rows[0] ? {
          id: numberingRows.rows[0]["id"], entity_id: numberingRows.rows[0]["entity_id"], number_field: numberingRows.rows[0]["number_field"],
          company_code_id: numberingRows.rows[0]["company_code_id"] ?? null, prefix: numberingRows.rows[0]["prefix"] ?? "",
          prefix_configurable: numberingRows.rows[0]["prefix_configurable"] !== false,
          separator: numberingRows.rows[0]["separator"] ?? "-", segments: Array.isArray(numberingRows.rows[0]["segments"]) ? numberingRows.rows[0]["segments"] : [],
          reset_strategy: numberingRows.rows[0]["reset_strategy"], uniqueness_scope: numberingRows.rows[0]["uniqueness_scope"],
          max_length: numberingRows.rows[0]["max_length"] ?? null, allowed_chars: numberingRows.rows[0]["allowed_chars"] ?? "any",
          metadata: record(numberingRows.rows[0]["metadata"]) ?? {},
          status: numberingRows.rows[0]["status"] === "inactive" ? "inactive" : "active",
        } : null,
        policy,
        flows: flowRows.rows.map((flow) => {
          const config = record(flow["config"]) ?? {};
          const graph = Array.isArray(config["create_graph"]) ? config["create_graph"] : [];
          return {
            flow_code: code(flow["flow_code"], "default_flow"),
            entry_operation: typeof config["entry_operation"] === "string"
              ? code(config["entry_operation"], "operation")
              : null,
            create_graph: graph
              .filter((value): value is string => typeof value === "string")
              .map((value) => code(value, "operation")),
          };
        }),
      });
    } catch (error) {
      deps.logger?.error("studio_contract_v2_get_error", { error: String(error) });
      next(error);
    }
  };

  const validateAndSave: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params["id"]);
      const body = record(req.body) ?? {};
      const { version_status: _versionStatus, ...authoredBody } = body;
      const parsed = MetaEntityContractV2Schema.safeParse(authoredBody);
      if (!parsed.success) {
        res.status(422).json({
          error: "META_ENTITY_CONTRACT_V2_INVALID",
          message: "The complete v2 graph must pass strict validation before it can be saved.",
          issues: parsed.error.issues,
        });
        return;
      }
      const draft = await sql<{
        status: string;
        lock_version: number;
        contract_hash: string | null;
        contract_schema_version: string | null;
        entity_version_id: string;
        version_contract_id: string | null;
        catalog_id: string;
        entity_code: string;
      }>`
        SELECT ev.status, ev.lock_version, ev.contract_hash, ev.contract_schema_version,
               ev.id::text AS entity_version_id,
               c.id::text AS version_contract_id,
               e.id::text AS catalog_id, e.entity_code
          FROM control.entity_version ev
          JOIN control.entity e ON e.id = ev.entity_id
          LEFT JOIN control.entity_version_contract c
            ON c.entity_version_id = ev.id AND c.tenant_id IS NULL
         WHERE ev.id = ${id}::uuid AND ev.tenant_id IS NULL AND e.tenant_id IS NULL
         LIMIT 1
      `.execute(deps.db);
      const current = draft.rows[0];
      if (!current) {
        res.status(404).json({ error: "NOT_FOUND", message: `Version '${id}' not found` });
        return;
      }
      if (current.contract_schema_version === "2.1") {
        res.status(409).json({
          error: "CONTRACT_V21_REQUIRED",
          message: "A Contract v2.1 draft must be edited through the owner-scoped v2.1 API.",
        });
        return;
      }
      if (current.status !== "DRAFT") {
        res.status(409).json({ error: "DRAFT_REQUIRED", message: "Contract v2 can only be edited while the version is DRAFT." });
        return;
      }
      const expectedLockVersion = Number(req.headers["x-contract-lock-version"]);
      const expectedHashHeader = req.headers["if-match"];
      const expectedHash = typeof expectedHashHeader === "string"
        ? expectedHashHeader.replace(/^W\//, "").replaceAll("\"", "")
        : null;
      if (!Number.isInteger(expectedLockVersion)
          || expectedLockVersion < 0
          || (current.contract_hash !== null && expectedHash !== current.contract_hash)
          || (current.contract_hash === null && expectedHash !== "*")) {
        res.status(412).json({
          error: "CONTRACT_PRECONDITION_REQUIRED",
          message: "Reload the DRAFT and save with its current contract hash and lock version.",
          current_contract_hash: current.contract_hash,
          current_lock_version: current.lock_version,
        });
        return;
      }
      if (parsed.data.version_contract.entity_version_id !== id) {
        res.status(422).json({ error: "VERSION_MISMATCH", message: "version_contract.entity_version_id must match the route id." });
        return;
      }
      if (!current.version_contract_id || parsed.data.version_contract.id !== current.version_contract_id) {
        res.status(422).json({
          error: "VERSION_CONTRACT_ID_MISMATCH",
          message: "version_contract.id must match the control row owned by this entity version.",
        });
        return;
      }
      if (parsed.data.catalog.id !== current.catalog_id) {
        res.status(422).json({ error: "CATALOG_MISMATCH", message: "catalog.id must match the entity bound to this version." });
        return;
      }
      if (parsed.data.catalog.entity_code !== current.entity_code) {
        res.status(422).json({
          error: "ENTITY_CODE_IMMUTABLE",
          message: "catalog.entity_code is stable identity and cannot be renamed through a version edit.",
        });
        return;
      }
      if (parsed.data.numbering && parsed.data.numbering.entity_id !== current.catalog_id) {
        res.status(422).json({
          error: "NUMBERING_ENTITY_MISMATCH",
          message: "numbering.entity_id must match catalog.id.",
        });
        return;
      }

      const tenantScopeValues: Array<[string, string | null]> = [
        ["catalog.tenant_id", parsed.data.catalog.tenant_id],
        ["version_contract.tenant_id", parsed.data.version_contract.tenant_id],
        ...parsed.data.fields.map((field, index) => [`fields.${index}.tenant_id`, field.tenant_id] as [string, string | null]),
        ...parsed.data.relations.map((relation, index) => [`relations.${index}.tenant_id`, relation.tenant_id] as [string, string | null]),
        ...parsed.data.surfaces.flatMap((entry, surfaceIndex) => [
          [`surfaces.${surfaceIndex}.surface.tenant_id`, entry.surface.tenant_id] as [string, string | null],
          ...entry.fields.map((binding, bindingIndex) =>
            [`surfaces.${surfaceIndex}.fields.${bindingIndex}.tenant_id`, binding.tenant_id] as [string, string | null]),
        ]),
        ...parsed.data.operations.map((operation, index) =>
          [`operations.${index}.tenant_id`, operation.tenant_id] as [string, string | null]),
      ];
      const tenantScopeConflicts = tenantScopeValues
        .filter(([, value]) => value !== null)
        .map(([path, value]) => ({ path, value }));
      if (tenantScopeConflicts.length > 0) {
        res.status(422).json({
          error: "PLATFORM_SCOPE_REQUIRED",
          message: "This Studio route edits platform metadata; all row tenant_id properties must be null.",
          issues: tenantScopeConflicts,
        });
        return;
      }

      const expectedCatalogActive = parsed.data.catalog.status === "ACTIVE"
        || parsed.data.catalog.status === "DEPRECATED";
      if (parsed.data.catalog.is_active !== expectedCatalogActive) {
        res.status(422).json({
          error: "CATALOG_ACTIVE_STATUS_MISMATCH",
          message: "catalog.is_active must match the status-derived control.entity value.",
        });
        return;
      }
      const moduleExists = await sql<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM shared.module
           WHERE lower(code) = lower(${parsed.data.catalog.module_id})
        ) AS exists
      `.execute(deps.db);
      if (moduleExists.rows[0]?.exists !== true) {
        res.status(422).json({
          error: "MODULE_NOT_FOUND",
          message: `catalog.module_id '${parsed.data.catalog.module_id}' does not identify a registered module code.`,
        });
        return;
      }

      const persistedIds = [
        ["catalog.id", parsed.data.catalog.id],
        ["version_contract.id", parsed.data.version_contract.id],
        ...parsed.data.fields.map((field, index) => [`fields.${index}.id`, field.id]),
        ...parsed.data.relations.map((relation, index) => [`relations.${index}.id`, relation.id]),
        ...parsed.data.surfaces.flatMap((entry, surfaceIndex) => [
          [`surfaces.${surfaceIndex}.surface.id`, entry.surface.id],
          ...entry.fields.flatMap((binding, bindingIndex) => [
            [`surfaces.${surfaceIndex}.fields.${bindingIndex}.id`, binding.id],
            [`surfaces.${surfaceIndex}.fields.${bindingIndex}.entity_surface_id`, binding.entity_surface_id],
            [`surfaces.${surfaceIndex}.fields.${bindingIndex}.entity_field_id`, binding.entity_field_id],
          ]),
        ]),
        ...parsed.data.operations.map((operation, index) => [`operations.${index}.id`, operation.id]),
        ...(parsed.data.numbering ? [["numbering.id", parsed.data.numbering.id]] : []),
      ] as Array<[string, string]>;
      const invalidIds = persistedIds
        .filter(([, value]) => !isUuid(value))
        .map(([path, value]) => ({ path, value }));
      if (invalidIds.length > 0) {
        res.status(422).json({
          error: "CONTRACT_ID_INVALID",
          message: "Studio-persisted contract ids must be UUID values.",
          issues: invalidIds,
        });
        return;
      }

      const fieldIds = parsed.data.fields.map((field) => field.id);
      const relationIds = parsed.data.relations.map((relation) => relation.id);
      const surfaceIds = parsed.data.surfaces.map((entry) => entry.surface.id);
      const bindingIds = parsed.data.surfaces.flatMap((entry) => entry.fields.map((binding) => binding.id));
      const operationIds = parsed.data.operations.map((operation) => operation.id);
      const foreignOwners: Array<{ owner: string; id: string }> = [];
      if (fieldIds.length > 0) {
        const rows = await sql<{ id: string }>`
          SELECT id::text AS id FROM control.entity_field
           WHERE id IN (${sql.join(fieldIds.map((value) => sql`${value}::uuid`))})
             AND entity_version_id IS DISTINCT FROM ${id}::uuid
        `.execute(deps.db);
        foreignOwners.push(...rows.rows.map((row) => ({ owner: "fields", id: row.id })));
      }
      if (relationIds.length > 0) {
        const rows = await sql<{ id: string }>`
          SELECT id::text AS id FROM control.entity_relation
           WHERE id IN (${sql.join(relationIds.map((value) => sql`${value}::uuid`))})
             AND entity_version_id IS DISTINCT FROM ${id}::uuid
        `.execute(deps.db);
        foreignOwners.push(...rows.rows.map((row) => ({ owner: "relations", id: row.id })));
      }
      if (surfaceIds.length > 0) {
        const rows = await sql<{ id: string }>`
          SELECT id::text AS id FROM control.entity_surface
           WHERE id IN (${sql.join(surfaceIds.map((value) => sql`${value}::uuid`))})
             AND entity_version_id IS DISTINCT FROM ${id}::uuid
        `.execute(deps.db);
        foreignOwners.push(...rows.rows.map((row) => ({ owner: "surfaces", id: row.id })));
      }
      if (bindingIds.length > 0) {
        const rows = await sql<{ id: string }>`
          SELECT binding.id::text AS id
            FROM control.entity_field_surface binding
            JOIN control.entity_surface surface ON surface.id = binding.entity_surface_id
           WHERE binding.id IN (${sql.join(bindingIds.map((value) => sql`${value}::uuid`))})
             AND surface.entity_version_id IS DISTINCT FROM ${id}::uuid
        `.execute(deps.db);
        foreignOwners.push(...rows.rows.map((row) => ({ owner: "surface fields", id: row.id })));
      }
      if (operationIds.length > 0) {
        const rows = await sql<{ id: string }>`
          SELECT id::text AS id FROM control.entity_operation
           WHERE id IN (${sql.join(operationIds.map((value) => sql`${value}::uuid`))})
             AND entity_version_id IS DISTINCT FROM ${id}::uuid
        `.execute(deps.db);
        foreignOwners.push(...rows.rows.map((row) => ({ owner: "operations", id: row.id })));
      }
      if (parsed.data.numbering) {
        const rows = await sql<{ id: string }>`
          SELECT id::text AS id FROM control.entity_numbering_config
           WHERE id = ${parsed.data.numbering.id}::uuid
             AND entity_id IS DISTINCT FROM ${current.catalog_id}::uuid
        `.execute(deps.db);
        foreignOwners.push(...rows.rows.map((row) => ({ owner: "numbering", id: row.id })));
      }
      if (foreignOwners.length > 0) {
        res.status(422).json({
          error: "CONTRACT_ID_OWNERSHIP_MISMATCH",
          message: "Contract row ids may not reference rows owned by another entity version.",
          conflicts: foreignOwners,
        });
        return;
      }

      parsed.data.version_contract.contract_hash = contractHash(parsed.data);
      const c = parsed.data.version_contract;
      const principal = (req as typeof req & { metaPrincipalId: string }).metaPrincipalId;
      await materializeDraftContract(deps.db, id, principal);
      const requestTenantId = (req as typeof req & { metaTenantId: string | null }).metaTenantId;
      await deps.db.transaction().execute(async (trx) => {
        const canonicalUpdate = await sql<{ lock_version: number }>`
          UPDATE control.entity_version
             SET contract_schema_version = '2.0',
                 contract_document = ${json(parsed.data)}::jsonb,
                 contract_hash = ${c.contract_hash},
                 validation_status = 'VALID',
                 validation_diagnostics = '[]'::jsonb,
                 validated_at = now(),
                 validated_by = ${principal}::uuid,
                 version_hash = ${c.contract_hash},
                 lock_version = lock_version + 1,
                 updated_at = now(),
                 updated_by = ${principal}::uuid
           WHERE id = ${id}::uuid
             AND status = 'DRAFT'
             AND lock_version = ${expectedLockVersion}
             AND contract_hash IS NOT DISTINCT FROM ${current.contract_hash}
           RETURNING lock_version
        `.execute(trx);
        if (!canonicalUpdate.rows[0]) {
          const error = new Error("Contract changed after it was loaded.");
          (error as Error & { code?: string }).code = "CONTRACT_WRITE_CONFLICT";
          throw error;
        }

        await sql`
          UPDATE control.entity_version_contract
             SET runtime_enabled = ${c.runtime_enabled},
                 api_exposure = ${c.api_exposure}, backing_type = ${c.backing_type},
                 table_schema = ${c.table_schema}, table_name = ${c.table_name},
                 primary_key = ${c.primary_key}, tenant_column = ${c.tenant_column},
                 read_capability = ${c.read_capability}, write_capability = ${c.write_capability},
                 create_mode = ${c.create_mode}, draft_ttl_hours = ${c.draft_ttl_hours},
                 governance_level = ${c.governance_level}, security_tier = ${c.security_tier}, mutability = ${c.mutability},
                 read_handler = ${c.read_handler ?? null}, write_handler = ${c.write_handler ?? null},
                 source_kind = ${c.source_kind}, contract_hash = ${c.contract_hash},
                 identity_config = ${json(c.identity_config)}::jsonb,
                 search_config = ${json(c.search_config)}::jsonb, data_policy = ${json(c.data_policy)}::jsonb,
                 concurrency_config = ${json(c.concurrency_config)}::jsonb, storage_config = ${json(c.storage_config)}::jsonb,
                 contract_version = 2, updated_at = now(), updated_by = ${principal}::uuid
           WHERE entity_version_id = ${id}::uuid AND tenant_id IS NULL
        `.execute(trx);

        for (const [fieldIndex, field] of parsed.data.fields.entries()) {
          await sql`
            INSERT INTO control.entity_field (
              id, tenant_id, entity_version_id, name, column_name, projection_alias_of,
              label, description, data_type, cardinality, origin,
              is_required, is_unique, unique_scope, is_read_only, is_deprecated,
              is_computed, is_write_once, is_active, runtime_enabled,
              compute_mode, compute_expr, default_value, defaults,
              is_filterable, is_sortable, is_groupable, is_aggregatable,
              semantic_roles, type_config, sort_order, created_by, updated_at, updated_by
            )
            VALUES (
              ${field.id}::uuid, NULL, ${id}::uuid, ${field.name}, ${field.column_name},
              ${field.projection_alias_of ?? null}, ${field.label}, ${field.description ?? null},
              ${field.data_type}, ${field.cardinality}, ${field.origin},
              ${field.is_required}, ${field.is_unique}, ${field.unique_scope},
              ${field.is_read_only}, ${field.is_deprecated}, ${field.is_computed},
              ${field.is_write_once}, true, ${field.runtime_enabled},
              ${field.compute_mode ?? null}, ${field.compute_expr ? json(field.compute_expr) : null}::jsonb,
              ${field.default_value === undefined ? null : json(field.default_value)}::jsonb,
              ${field.defaults ? json(field.defaults) : null}::jsonb,
              ${field.is_filterable}, ${field.is_sortable}, ${field.is_groupable},
              ${field.is_aggregatable}, ${field.semantic_roles}, ${json(field.type_config)}::jsonb,
              ${Math.min((fieldIndex + 1) * 10, 32760)}, ${principal}::uuid, now(), ${principal}::uuid
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name, column_name = EXCLUDED.column_name,
              projection_alias_of = EXCLUDED.projection_alias_of, label = EXCLUDED.label,
              description = EXCLUDED.description, data_type = EXCLUDED.data_type,
              cardinality = EXCLUDED.cardinality, origin = EXCLUDED.origin,
              is_required = EXCLUDED.is_required, is_unique = EXCLUDED.is_unique,
              unique_scope = EXCLUDED.unique_scope, is_read_only = EXCLUDED.is_read_only,
              is_deprecated = EXCLUDED.is_deprecated, is_computed = EXCLUDED.is_computed,
              is_write_once = EXCLUDED.is_write_once, is_active = true,
              runtime_enabled = EXCLUDED.runtime_enabled, compute_mode = EXCLUDED.compute_mode,
              compute_expr = EXCLUDED.compute_expr, default_value = EXCLUDED.default_value,
              defaults = EXCLUDED.defaults, is_filterable = EXCLUDED.is_filterable,
              is_sortable = EXCLUDED.is_sortable, is_groupable = EXCLUDED.is_groupable,
              is_aggregatable = EXCLUDED.is_aggregatable,
              semantic_roles = EXCLUDED.semantic_roles, type_config = EXCLUDED.type_config,
              sort_order = EXCLUDED.sort_order, updated_at = now(), updated_by = EXCLUDED.updated_by
          `.execute(trx);
        }

        for (const relation of parsed.data.relations) {
          await sql`
            INSERT INTO control.entity_relation (
              id, tenant_id, entity_version_id, name, relation_code, relation_kind,
              target_entity, target_entity_code, resolution_kind,
              fk_field, target_key, source_field, target_field,
              source_type_field, source_type_value, source_id_field,
              polymorphic_type_field, polymorphic_type_value, polymorphic_id_field,
              source_line_field, runtime_role, on_delete, record_filter,
              mutation_owner, mutation_permissions, created_by, updated_at, updated_by
            )
            VALUES (
              ${relation.id}::uuid, NULL, ${id}::uuid, ${relation.relation_code},
              ${relation.relation_code}, ${relation.relation_kind},
              ${relation.target_entity_code}, ${relation.target_entity_code},
              ${relation.resolution_kind}, ${relation.source_field}, ${relation.target_field},
              ${relation.source_field}, ${relation.target_field},
              ${relation.polymorphic_type_field ?? null}, ${relation.polymorphic_type_value ?? null},
              ${relation.polymorphic_id_field ?? null}, ${relation.polymorphic_type_field ?? null},
              ${relation.polymorphic_type_value ?? null}, ${relation.polymorphic_id_field ?? null},
              ${relation.source_line_field ?? null}, ${relation.runtime_role ?? null},
              ${relation.on_delete}, ${json(relation.record_filter)}::jsonb,
              ${relation.mutation_owner}, ${relation.mutation_permissions},
              ${principal}::uuid, now(), ${principal}::uuid
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name, relation_code = EXCLUDED.relation_code,
              relation_kind = EXCLUDED.relation_kind, target_entity = EXCLUDED.target_entity,
              target_entity_code = EXCLUDED.target_entity_code,
              resolution_kind = EXCLUDED.resolution_kind, fk_field = EXCLUDED.fk_field,
              target_key = EXCLUDED.target_key, source_field = EXCLUDED.source_field,
              target_field = EXCLUDED.target_field,
              source_type_field = EXCLUDED.source_type_field,
              source_type_value = EXCLUDED.source_type_value,
              source_id_field = EXCLUDED.source_id_field,
              polymorphic_type_field = EXCLUDED.polymorphic_type_field,
              polymorphic_type_value = EXCLUDED.polymorphic_type_value,
              polymorphic_id_field = EXCLUDED.polymorphic_id_field,
              source_line_field = EXCLUDED.source_line_field,
              runtime_role = EXCLUDED.runtime_role, on_delete = EXCLUDED.on_delete,
              record_filter = EXCLUDED.record_filter, mutation_owner = EXCLUDED.mutation_owner,
              mutation_permissions = EXCLUDED.mutation_permissions,
              updated_at = now(), updated_by = EXCLUDED.updated_by
          `.execute(trx);
        }

        if (requestTenantId) {
          const policy = parsed.data.policy;
          const persistedCacheFlags = {
            ...policy.cache_flags,
            cache_policy: policy.cache_policy,
          };
          await sql`
            INSERT INTO control.entity_policy (
              id, tenant_id, entity_id, entity_version_id, access_mode, company_scope_mode, audit_mode,
              retention_policy, default_filters, cache_flags, created_by, updated_at, updated_by
            )
            VALUES (
              shared.uuidv7(), ${requestTenantId}::uuid, ${current.catalog_id}::uuid, ${id}::uuid,
              ${policy.access_mode}, ${policy.company_scope_mode}, ${policy.audit_mode},
              ${json(policy.retention_policy)}::jsonb, ${json(policy.default_filters)}::jsonb, ${json(persistedCacheFlags)}::jsonb,
              ${principal}::uuid, now(), ${principal}::uuid
            )
            ON CONFLICT (tenant_id, entity_id, entity_version_id) DO UPDATE SET
              access_mode = EXCLUDED.access_mode, company_scope_mode = EXCLUDED.company_scope_mode,
              audit_mode = EXCLUDED.audit_mode, retention_policy = EXCLUDED.retention_policy,
              default_filters = EXCLUDED.default_filters, cache_flags = EXCLUDED.cache_flags,
              updated_at = now(), updated_by = EXCLUDED.updated_by
          `.execute(trx);
        }

        for (const surfaceEntry of parsed.data.surfaces) {
          const surface = surfaceEntry.surface;
          await sql`
            INSERT INTO control.entity_surface (
              id, tenant_id, entity_id, entity_version_id, mode, surface_key, kind, placement,
              renderer_key, label, is_enabled, config, created_by, updated_at, updated_by, v2_mode, v2_kind
            )
            VALUES (
              ${surface.id}::uuid, ${surface.tenant_id}::uuid, ${current.catalog_id}::uuid, ${id}::uuid,
              ${legacySurfaceMode(surface.mode)}, ${surface.surface_key}, ${legacySurfaceKind(surface.kind)}, 'main',
              ${surface.renderer_key}, ${surface.label ?? null}, ${surface.is_enabled}, ${json(surface.config)}::jsonb,
              ${principal}::uuid, now(), ${principal}::uuid, ${surface.mode}, ${surface.kind}
            )
            ON CONFLICT (id) DO UPDATE SET
              entity_version_id = EXCLUDED.entity_version_id, mode = EXCLUDED.mode, surface_key = EXCLUDED.surface_key,
              kind = EXCLUDED.kind, renderer_key = EXCLUDED.renderer_key, label = EXCLUDED.label,
              is_enabled = EXCLUDED.is_enabled, config = EXCLUDED.config, v2_mode = EXCLUDED.v2_mode,
              v2_kind = EXCLUDED.v2_kind, updated_at = now(), updated_by = EXCLUDED.updated_by
          `.execute(trx);

          for (const binding of surfaceEntry.fields) {
            await sql`
              INSERT INTO control.entity_field_surface (
                id, tenant_id, entity_surface_id, entity_field_id, visible_override, required_override,
                readonly_override, sort_order, column_span, density, renderer_key, editor_key,
                visibility_expr, editability_expr, renderer_config, created_by, updated_at, updated_by
              )
              VALUES (
                ${binding.id}::uuid, ${binding.tenant_id}::uuid, ${surface.id}::uuid, ${binding.entity_field_id}::uuid,
                ${binding.visible}, ${binding.required_override}, ${binding.readonly_override}, ${binding.sort_order},
                ${binding.column_span}, ${binding.density}, ${binding.renderer_key}, ${binding.editor_key},
                ${binding.visibility_expr ? json(binding.visibility_expr) : null}::jsonb,
                ${binding.editability_expr ? json(binding.editability_expr) : null}::jsonb,
                ${json(binding.renderer_config)}::jsonb, ${principal}::uuid, now(), ${principal}::uuid
              )
              ON CONFLICT (id) DO UPDATE SET
                entity_surface_id = EXCLUDED.entity_surface_id, entity_field_id = EXCLUDED.entity_field_id,
                visible_override = EXCLUDED.visible_override, required_override = EXCLUDED.required_override,
                readonly_override = EXCLUDED.readonly_override, sort_order = EXCLUDED.sort_order,
                column_span = EXCLUDED.column_span, density = EXCLUDED.density, renderer_key = EXCLUDED.renderer_key,
                editor_key = EXCLUDED.editor_key, visibility_expr = EXCLUDED.visibility_expr,
                editability_expr = EXCLUDED.editability_expr, renderer_config = EXCLUDED.renderer_config,
                updated_at = now(), updated_by = EXCLUDED.updated_by
            `.execute(trx);
          }
        }

        for (const operation of parsed.data.operations) {
          await sql`
            INSERT INTO control.entity_operation (
              id, tenant_id, entity_version_id, entity_name, operation_code, permission_code, surface, placement,
              handler_type, handler_target, execution_target, is_record_required, record_required, label,
              label_override, icon, icon_override, intent, confirmation, reason_required, selection_config,
              sort_order, is_enabled, created_by, updated_at, updated_by
            )
            VALUES (
              ${operation.id}::uuid, ${operation.tenant_id}::uuid, ${id}::uuid, ${current.entity_code},
              ${operation.operation_code}, ${operation.permission_code}, ${legacyOperationValue(operation.surface)},
              ${legacyOperationValue(operation.placement)}, ${legacyOperationValue(operation.handler_type)},
              ${operation.handler_target ?? null}, ${operation.execution_target ?? null}, ${operation.record_required},
              ${operation.record_required}, ${operation.label}, ${operation.label}, ${operation.icon ?? null},
              ${operation.icon ?? null}, ${operation.intent}, ${json(operation.confirmation)}::jsonb, ${operation.reason_required},
              ${operation.selection_config ? json(operation.selection_config) : null}::jsonb, ${operation.sort_order},
              ${operation.enabled}, ${principal}::uuid, now(), ${principal}::uuid
            )
            ON CONFLICT (id) DO UPDATE SET
              entity_version_id = EXCLUDED.entity_version_id, entity_name = EXCLUDED.entity_name,
              operation_code = EXCLUDED.operation_code, permission_code = EXCLUDED.permission_code,
              surface = EXCLUDED.surface, placement = EXCLUDED.placement, handler_type = EXCLUDED.handler_type,
              handler_target = EXCLUDED.handler_target, execution_target = EXCLUDED.execution_target,
              is_record_required = EXCLUDED.is_record_required, record_required = EXCLUDED.record_required,
              label = EXCLUDED.label, label_override = EXCLUDED.label_override, icon = EXCLUDED.icon,
              icon_override = EXCLUDED.icon_override, intent = EXCLUDED.intent, confirmation = EXCLUDED.confirmation,
              reason_required = EXCLUDED.reason_required, selection_config = EXCLUDED.selection_config,
              sort_order = EXCLUDED.sort_order, is_enabled = EXCLUDED.is_enabled,
              updated_at = now(), updated_by = EXCLUDED.updated_by
          `.execute(trx);
        }

        for (const [flowIndex, flow] of parsed.data.flows.entries()) {
          await sql`
            INSERT INTO control.entity_flow (
              tenant_id, entity_version_id, flow_code, label, trigger_context, is_default,
              config, version_no, status, created_by, updated_at, updated_by
            )
            VALUES (
              NULL, ${id}::uuid, ${flow.flow_code},
              ${flow.flow_code.replaceAll("_", " ")}, 'new', ${flowIndex === 0},
              ${json({ entry_operation: flow.entry_operation, create_graph: flow.create_graph })}::jsonb,
              1, 'draft', ${principal}::uuid, now(), ${principal}::uuid
            )
            ON CONFLICT (tenant_id, entity_version_id, flow_code, version_no) DO UPDATE SET
              label = EXCLUDED.label, trigger_context = EXCLUDED.trigger_context,
              is_default = EXCLUDED.is_default, config = EXCLUDED.config, status = 'draft',
              updated_at = now(), updated_by = EXCLUDED.updated_by
          `.execute(trx);
        }
        if (parsed.data.flows.length === 0) {
          await sql`
            DELETE FROM control.entity_flow
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
          `.execute(trx);
        } else {
          const flowCodes = parsed.data.flows.map((flow) => flow.flow_code);
          await sql`
            DELETE FROM control.entity_flow
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
               AND flow_code NOT IN (${sql.join(flowCodes.map((value) => sql`${value}`))})
          `.execute(trx);
        }

        const authoredSurfaces = parsed.data.surfaces.map((entry) => entry.surface.id);
        const authoredBindings = parsed.data.surfaces.flatMap((entry) => entry.fields.map((binding) => binding.id));
        if (authoredBindings.length === 0) {
          await sql`
            DELETE FROM control.entity_field_surface binding
             USING control.entity_surface surface
             WHERE binding.entity_surface_id = surface.id
               AND surface.entity_version_id = ${id}::uuid
               AND surface.tenant_id IS NULL
          `.execute(trx);
        } else {
          await sql`
            DELETE FROM control.entity_field_surface binding
             USING control.entity_surface surface
             WHERE binding.entity_surface_id = surface.id
               AND surface.entity_version_id = ${id}::uuid
               AND surface.tenant_id IS NULL
               AND binding.id NOT IN (${sql.join(authoredBindings.map((value) => sql`${value}::uuid`))})
          `.execute(trx);
        }

        if (authoredSurfaces.length === 0) {
          await sql`
            DELETE FROM control.entity_surface
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
          `.execute(trx);
        } else {
          await sql`
            DELETE FROM control.entity_surface
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
               AND id NOT IN (${sql.join(authoredSurfaces.map((value) => sql`${value}::uuid`))})
          `.execute(trx);
        }

        const authoredOperations = parsed.data.operations.map((operation) => operation.id);
        if (authoredOperations.length === 0) {
          await sql`
            DELETE FROM control.entity_operation
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
          `.execute(trx);
        } else {
          await sql`
            DELETE FROM control.entity_operation
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
               AND id NOT IN (${sql.join(authoredOperations.map((value) => sql`${value}::uuid`))})
          `.execute(trx);
        }

        const authoredRelations = parsed.data.relations.map((relation) => relation.id);
        if (authoredRelations.length === 0) {
          await sql`
            DELETE FROM control.entity_relation
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
          `.execute(trx);
        } else {
          await sql`
            DELETE FROM control.entity_relation
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
               AND id NOT IN (${sql.join(authoredRelations.map((value) => sql`${value}::uuid`))})
          `.execute(trx);
        }

        const authoredFields = parsed.data.fields.map((field) => field.id);
        if (authoredFields.length === 0) {
          await sql`
            DELETE FROM control.entity_field
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
          `.execute(trx);
        } else {
          await sql`
            DELETE FROM control.entity_field
             WHERE entity_version_id = ${id}::uuid
               AND tenant_id IS NULL
               AND id NOT IN (${sql.join(authoredFields.map((value) => sql`${value}::uuid`))})
          `.execute(trx);
        }
      });

      res.json({
        saved: true,
        contract_version: 2,
        entity_version_id: id,
        contract_hash: parsed.data.version_contract.contract_hash,
      });
    } catch (error) {
      if (error instanceof Error
          && (error as Error & { code?: string }).code === "CONTRACT_WRITE_CONFLICT") {
        res.status(409).json({
          error: "CONTRACT_WRITE_CONFLICT",
          message: "The DRAFT changed while it was being saved. Reload before applying your changes again.",
        });
        return;
      }
      deps.logger?.error("studio_contract_v2_save_error", { error: String(error) });
      next(error);
    }
  };

  router.get("/metadata/studio/entity-versions/:id/contract-v2", guard, getContract);
  router.put("/metadata/studio/entity-versions/:id/contract-v2", guard, validateAndSave);
  return router;
}
