import "server-only";

import { cache } from "react";
import {
  CompiledEntitySchema,
  EntityOperationSchema,
  type CompiledEntity,
  type EntityOperation,
} from "@athyper/api-contracts/metadata";
import {
  compileMetaEntityRuntimeDescriptor,
  MetaEntityLifecycleStateMaskSchema,
  type EntityRelationInput,
  type MetaEntityField,
  type MetaEntityLifecycleStateMask,
  type MetaEntityRuntimeDescriptor,
} from "@athyper/runtime-contracts";
import type { RuntimeCanvasFlags } from "@athyper/runtime-canvas/surfaces";
import { logDescriptorHealthInDev } from "@/lib/server/meta-entity-descriptor-health";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { buildPurchaseInvoiceDocumentRuntimeSurfaces } from "@/lib/server/pi-document-runtime-surfaces";

const METADATA_REVALIDATE_SECONDS = 300;
const warnedRuntimeMetadata = new Set<string>();

/**
 * Rollout registry for descriptor-driven canvas features.
 *
 * Add an entity code here to opt it into the new surface shell and/or grouped
 * forms. This is the single place to control the progressive rollout — no DB
 * migration or feature-flag service needed.
 *
 * Flags:
 *   descriptorSurfaceShell — enables the DescriptorSurfaceShell tab system
 *                            (replaces the legacy flat RuntimeDetailShell)
 *   groupedForms           — enables grouped WorkPanel sections in create/edit forms
 *                            (requires fieldGroups in the compiled descriptor)
 */
const CANVAS_FLAGS_REGISTRY: Record<string, RuntimeCanvasFlags> = {
  site:             { descriptorSurfaceShell: true, groupedForms: true },
  warehouse:        { descriptorSurfaceShell: true, groupedForms: true },
  purchase_invoice: { descriptorSurfaceShell: true, groupedForms: true, operationDispatch: true },
};

type PrototypeReferenceExpectation = {
  entity: string;
  valueField: string;
  labelField?: string;
  codeField?: string;
  scopeMode?: "tenant" | "legal_entity" | "company_code" | "unscoped";
};

type PrototypeContractExpectation = {
  titleField: string;
  subtitleField: string;
  listColumns: string[];
  fields: string[];
  referenceFields: Record<string, PrototypeReferenceExpectation>;
  lookupFields: Record<string, string>;
  groupKeys: Record<string, string>;
};

type RuntimeEntityPolicy = {
  access_mode?: string;
  company_scope_mode?: string;
  audit_mode?: string;
  field_scope_eval_order?: string;
};

const PROTOTYPE_ENTITY_CONTRACTS: Record<string, PrototypeContractExpectation> = {
  site: {
    titleField: "name",
    subtitleField: "code",
    listColumns: ["id", "code", "name", "company_code_id", "site_type", "country_code", "status"],
    fields: [
      "id",
      "tenant_id",
      "code",
      "name",
      "company_code_id",
      "description",
      "site_type",
      "parent_site_id",
      "level_no",
      "sort_order",
      "country_code",
      "timezone_code",
      "manager_id",
      "capacity_uom",
      "capacity_value",
      "metadata",
      "status",
      "is_active",
      "status_changed_at",
      "status_changed_by",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
    ],
    referenceFields: {
      company_code_id: { entity: "company_code", valueField: "id", scopeMode: "legal_entity" },
      parent_site_id: { entity: "site", valueField: "id", scopeMode: "legal_entity" },
      country_code: { entity: "country", valueField: "code", scopeMode: "unscoped" },
      timezone_code: { entity: "timezone", valueField: "code", scopeMode: "unscoped" },
      manager_id: { entity: "principal", valueField: "id", codeField: "login_email", scopeMode: "tenant" },
      capacity_uom: { entity: "uom", valueField: "code", scopeMode: "unscoped" },
    },
    lookupFields: {
      site_type: "master.site_type",
      status: "status",
    },
    groupKeys: {
      site_type: "profile",
      description: "profile",
      level_no: "profile",
      capacity_value: "profile",
      company_code_id: "reference",
      parent_site_id: "reference",
      country_code: "reference",
      timezone_code: "reference",
      manager_id: "reference",
      capacity_uom: "reference",
    },
  },
  warehouse: {
    titleField: "name",
    subtitleField: "code",
    listColumns: ["id", "code", "name", "site_id", "warehouse_type", "status"],
    fields: [
      "id",
      "tenant_id",
      "code",
      "name",
      "site_id",
      "description",
      "warehouse_type",
      "manager_id",
      "is_negative_stock_allowed",
      "metadata",
      "status",
      "is_active",
      "status_changed_at",
      "status_changed_by",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
    ],
    referenceFields: {
      site_id: { entity: "site", valueField: "id", scopeMode: "legal_entity" },
      manager_id: { entity: "principal", valueField: "id", codeField: "login_email", scopeMode: "tenant" },
    },
    lookupFields: {
      warehouse_type: "master.warehouse_type",
      status: "status",
    },
    groupKeys: {
      warehouse_type: "profile",
      description: "profile",
      is_negative_stock_allowed: "config",
      site_id: "reference",
      manager_id: "reference",
    },
  },
};

export const getMetaEntityRuntimeDescriptor = cache(
  async (routeEntity: string): Promise<MetaEntityRuntimeDescriptor | undefined> => {
    const entityCode = normalizeEntityCode(routeEntity);
    if (!entityCode) return undefined;

    const session = await getNeonServerSession();
    if (!session) return undefined;

    const headers = buildRuntimeHeaders(session);
    const compiled = await fetchCompiledEntity(entityCode, headers);
    if (!compiled) return undefined;

    // Phase 4: in addition to the legacy three fetches we now pull
    //   - control.entity_lifecycle_state_mask rows for this entity (per-status
    //     capability masks that the compiler embeds into the descriptor)
    //   - control.permission_alias map (allows entity_operation rows that still
    //     reference legacy codes like `edit` to resolve to canonical `update`)
    // Both are best-effort; on failure the compiler degrades gracefully to its
    // pre-Phase-4 behaviour.
    const [operations, entityPolicy, lifecycleStateMasks, permissionAliasMap] = await Promise.all([
      fetchEntityOperations(entityCode, headers),
      fetchEntityPolicy(entityCode, headers),
      fetchLifecycleStateMasks(entityCode, headers),
      fetchPermissionAliasMap(headers),
    ]);

    try {
      const canvasFlags = CANVAS_FLAGS_REGISTRY[entityCode] ?? {};
      const descriptor = compileMetaEntityRuntimeDescriptor(compiled, {
        operations,
        relations: inferRuntimeRelations(compiled),
        entityPolicy,
        lifecycleStateMasks,
        permissionAliasMap,
        compiledAt: compiled.compiled_at,
        extensions: {
          displayConfig: compiled.display_config,
          searchConfig: compiled.search_config,
          dataPolicy: compiled.data_policy,
          runtimeCanvasFlags: Object.keys(canvasFlags).length > 0 ? canvasFlags : undefined,
          bridge: {
            source: "neon.server.meta-entity-runtime",
            relationSource: "compiled-metadata-plus-current-ddl-overrides",
          },
        },
      });
      warnIfPrototypeContractDriftInDev(entityCode, compiled, descriptor);
      logDescriptorHealthInDev(descriptor, canvasFlags);
      return injectDocumentRuntimeSurfaces(entityCode, descriptor);
    } catch (error) {
      warnIfDescriptorCompileFailedInDev(entityCode, error);
      return undefined;
    }
  },
);

async function fetchCompiledEntity(
  entityCode: string,
  headers: Record<string, string>,
): Promise<CompiledEntity | null> {
  const response = await fetchMetadata(`/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`, headers);
  if (!response) return null;

  const json = await readJson(response);
  if (!json) return null;

  const parsed = CompiledEntitySchema.safeParse(json);
  if (!parsed.success) {
    warnIfCompiledEntityParseFailedInDev(entityCode, parsed.error);
    return null;
  }

  const entity = withRuntimeDisplayDefaults(parsed.data);
  warnIfMisconfiguredInDev(entityCode, entity);
  return entity;
}

async function fetchEntityOperations(
  entityCode: string,
  headers: Record<string, string>,
): Promise<EntityOperation[]> {
  const response = await fetchMetadata(`/api/metadata/entities/${encodeURIComponent(entityCode)}/operations`, headers);
  if (!response) return [];

  const json = await readJson(response);
  if (!json) return [];

  const parsed = EntityOperationSchema.array().safeParse(json);
  return parsed.success ? parsed.data : [];
}

async function fetchEntityPolicy(
  entityCode: string,
  headers: Record<string, string>,
): Promise<RuntimeEntityPolicy> {
  const response = await fetchMetadata(`/api/metadata/entities/${encodeURIComponent(entityCode)}/policy`, headers);
  // A missing policy row (404) means the entity is unconfigured — treat as open.
  // Actual security enforcement happens in the records API; this only affects capability
  // flags (canCreate, canEdit, etc.) in the compiled descriptor.
  if (!response) return { audit_mode: "enabled" };

  const json = await readJson(response);
  if (!isRecord(json)) return { audit_mode: "enabled" };

  return {
    access_mode: stringValue(json["access_mode"]),
    company_scope_mode: stringValue(json["company_scope_mode"]),
    audit_mode: stringValue(json["audit_mode"]) ?? "enabled",
    field_scope_eval_order: stringValue(json["field_scope_eval_order"]),
  };
}

async function fetchLifecycleStateMasks(
  entityCode: string,
  headers: Record<string, string>,
): Promise<MetaEntityLifecycleStateMask[]> {
  const response = await fetchMetadata(
    `/api/metadata/entities/${encodeURIComponent(entityCode)}/lifecycle-masks`,
    headers,
  );
  if (!response) return [];

  const json = await readJson(response);
  if (!Array.isArray(json)) return [];

  const parsed = MetaEntityLifecycleStateMaskSchema.array().safeParse(json);
  return parsed.success ? parsed.data : [];
}

async function fetchPermissionAliasMap(
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  const response = await fetchMetadata(`/api/metadata/permission-aliases`, headers);
  if (!response) return {};

  const json = await readJson(response);
  if (!isRecord(json)) return {};

  // Drop any non-string values defensively — the alias table only carries
  // alias_code → canonical_code text mappings.
  const out: Record<string, string> = {};
  for (const [alias, canonical] of Object.entries(json)) {
    if (typeof alias === "string" && typeof canonical === "string") out[alias] = canonical;
  }
  return out;
}

async function fetchMetadata(
  pathname: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  try {
    const response = await fetch(buildRuntimeUrl(pathname), {
      headers,
      next: { revalidate: METADATA_REVALIDATE_SECONDS },
    });

    return response.ok ? response : null;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferRuntimeRelations(entity: CompiledEntity): EntityRelationInput[] {
  return [
    ...inferLineItemRelations(entity),
    ...(CURRENT_DDL_RELATION_BRIDGE[entity.entity_code] ?? []),
  ];
}

function inferLineItemRelations(entity: CompiledEntity): EntityRelationInput[] {
  if (entity.feature_flags.has_lines !== true) return [];

  const lineEntityCode = entity.display_config.line_entity_code;
  if (!lineEntityCode) return [];

  return [
    {
      name: "lines",
      relation_kind: "has_many",
      target_entity: lineEntityCode,
      fk_field: `${entity.entity_code}_id`,
      ui_behavior: {
        surface: "lines_tab",
        label: "Line Items",
        display_mode: "grid",
      },
    },
  ];
}

const CURRENT_DDL_RELATION_BRIDGE: Record<string, EntityRelationInput[]> = {
  site: [
    {
      name: "warehouses",
      relation_kind: "has_many",
      target_entity: "warehouse",
      fk_field: "site_id",
      on_delete: "restrict",
      ui_behavior: {
        surface: "child_records",
        label: "Warehouses",
        display_mode: "table",
      },
    },
    {
      name: "cost_centers",
      relation_kind: "has_many",
      target_entity: "cost_center",
      fk_field: "site_id",
      on_delete: "set_null",
      ui_behavior: {
        surface: "child_records",
        label: "Cost Centers",
        display_mode: "table",
      },
    },
  ],
  warehouse: [
    {
      name: "site",
      relation_kind: "belongs_to",
      target_entity: "site",
      fk_field: "site_id",
      on_delete: "restrict",
      ui_behavior: {
        surface: "reference",
        label: "Site",
      },
    },
  ],
};

function normalizeEntityCode(routeEntity: string): string {
  return routeEntity.trim().replace(/-/g, "_");
}

function withRuntimeDisplayDefaults(entity: CompiledEntity): CompiledEntity {
  const titleField = entity.display_config.title_field ?? deriveTitleField(entity);
  if (!titleField) return entity;
  const listColumns = entity.display_config.list_columns?.length
    ? entity.display_config.list_columns
    : deriveListColumns(entity, titleField);

  return {
    ...entity,
    display_config: {
      ...entity.display_config,
      title_field: titleField,
      subtitle_field: entity.display_config.subtitle_field ?? deriveSubtitleField(entity, titleField),
      default_sort_field: entity.display_config.default_sort_field ?? titleField,
      default_sort_order: entity.display_config.default_sort_order ?? "asc",
      list_columns: listColumns,
    },
  };
}

function deriveTitleField(entity: CompiledEntity): string | undefined {
  return firstExistingField(entity, [
    "name",
    "display_name",
    "code",
    "document_no",
    "number",
    "id",
  ]);
}

function deriveSubtitleField(entity: CompiledEntity, titleField: string): string | undefined {
  return firstExistingField(entity, ["code", "name", "description", "status"], titleField);
}

function deriveListColumns(entity: CompiledEntity, titleField: string): string[] {
  const fieldNames = new Set(entity.fields.map((field) => field.name));
  const preferredColumns = [
    "id",
    "code",
    titleField,
    "name",
    "company_code_id",
    "site_id",
    "site_type",
    "warehouse_type",
    "country_code",
    "timezone_code",
    "status",
    "is_active",
    "updated_at",
  ];
  const columns = uniqueExistingFields(fieldNames, preferredColumns);
  if (columns.length >= 2) return columns.slice(0, 8);

  const descriptiveColumns = entity.fields
    .filter((field) => field.is_searchable || field.is_filterable || field.is_sortable)
    .map((field) => field.name);

  return uniqueExistingFields(fieldNames, [
    ...columns,
    ...descriptiveColumns,
    ...entity.fields.map((field) => field.name),
  ]).slice(0, 8);
}

function firstExistingField(
  entity: CompiledEntity,
  candidates: string[],
  exclude?: string,
): string | undefined {
  const fieldNames = new Set(entity.fields.map((field) => field.name));
  return candidates.find((field) => field !== exclude && fieldNames.has(field));
}

function uniqueExistingFields(fieldNames: Set<string>, candidates: string[]): string[] {
  const result: string[] = [];
  for (const candidate of candidates) {
    if (fieldNames.has(candidate) && !result.includes(candidate)) {
      result.push(candidate);
    }
  }
  return result;
}

function warnIfPrototypeContractDriftInDev(
  entityCode: string,
  entity: CompiledEntity,
  descriptor: MetaEntityRuntimeDescriptor,
): void {
  if (process.env.NODE_ENV !== "development") return;

  const expected = PROTOTYPE_ENTITY_CONTRACTS[entityCode];
  if (!expected) return;

  const warnings: string[] = [];
  if (entity.display_config.title_field !== expected.titleField) {
    warnings.push(`title_field expected ${expected.titleField}, got ${entity.display_config.title_field ?? "<empty>"}`);
  }
  if (entity.display_config.subtitle_field !== expected.subtitleField) {
    warnings.push(`subtitle_field expected ${expected.subtitleField}, got ${entity.display_config.subtitle_field ?? "<empty>"}`);
  }

  const listColumns = new Set(entity.display_config.list_columns ?? []);
  const missingListColumns = expected.listColumns.filter((fieldName) => !listColumns.has(fieldName));
  if (missingListColumns.length > 0) {
    warnings.push(`list_columns missing ${missingListColumns.join(", ")}`);
  }

  const fieldsByName = new Map(descriptor.fields.map((fieldItem) => [fieldItem.name, fieldItem]));
  const missingFields = expected.fields.filter((fieldName) => !fieldsByName.has(fieldName));
  if (missingFields.length > 0) {
    warnings.push(`compiled fields missing ${missingFields.join(", ")}`);
  }

  for (const [fieldName, groupKey] of Object.entries(expected.groupKeys)) {
    const fieldItem = fieldsByName.get(fieldName);
    if (fieldItem && fieldItem.groupKey !== groupKey) {
      warnings.push(`${fieldName} group_key expected ${groupKey}, got ${fieldItem.groupKey ?? "<empty>"}`);
    }
  }

  for (const [fieldName, domainCode] of Object.entries(expected.lookupFields)) {
    const fieldItem = fieldsByName.get(fieldName);
    if (!fieldItem) continue;
    if (fieldItem.optionSource?.kind !== "lookup") {
      warnings.push(`${fieldName} expected lookup optionSource`);
      continue;
    }
    if (fieldItem.optionSource.domainCode !== domainCode) {
      warnings.push(`${fieldName} lookup domain expected ${domainCode}, got ${fieldItem.optionSource.domainCode}`);
    }
  }

  for (const [fieldName, referenceExpectation] of Object.entries(expected.referenceFields)) {
    const fieldItem = fieldsByName.get(fieldName);
    if (!fieldItem) continue;
    warnings.push(...referenceContractWarnings(fieldName, fieldItem, referenceExpectation));
  }

  warnRuntimeMetadataOnce(entityCode, warnings);
}

function referenceContractWarnings(
  fieldName: string,
  fieldItem: MetaEntityField,
  expected: PrototypeReferenceExpectation,
): string[] {
  const warnings: string[] = [];
  const source = fieldItem.optionSource;
  if (source?.kind !== "reference") {
    return [`${fieldName} expected reference optionSource`];
  }

  if (source.entity !== expected.entity) {
    warnings.push(`${fieldName} reference entity expected ${expected.entity}, got ${source.entity}`);
  }
  if (source.valueField !== expected.valueField) {
    warnings.push(`${fieldName} value_field expected ${expected.valueField}, got ${source.valueField}`);
  }
  if (source.labelField !== (expected.labelField ?? "name")) {
    warnings.push(`${fieldName} label_field expected ${expected.labelField ?? "name"}, got ${source.labelField}`);
  }
  if (source.codeField !== (expected.codeField ?? "code")) {
    warnings.push(`${fieldName} code_field expected ${expected.codeField ?? "code"}, got ${source.codeField ?? "<empty>"}`);
  }
  if (source.scopeMode !== expected.scopeMode) {
    warnings.push(`${fieldName} scope_mode expected ${expected.scopeMode ?? "<empty>"}, got ${source.scopeMode ?? "<empty>"}`);
  }
  if (fieldItem.display?.renderer !== "reference_label") {
    warnings.push(`${fieldName} display renderer expected reference_label, got ${fieldItem.display?.renderer ?? "<empty>"}`);
  }
  if (fieldItem.display?.format !== "label_code") {
    warnings.push(`${fieldName} display format expected label_code, got ${fieldItem.display?.format ?? "<empty>"}`);
  }

  return warnings;
}

function warnIfMisconfiguredInDev(entityCode: string, entity: CompiledEntity): void {
  if (process.env.NODE_ENV !== "development") return;

  const warnings: string[] = [];
  if (entity.fields.length === 0) {
    warnings.push("no compiled fields");
  }
  if (!entity.display_config.list_columns?.length) {
    warnings.push("display_config.list_columns is empty");
  }
  if (!entity.display_config.title_field) {
    warnings.push("display_config.title_field is empty");
  }
  if (entity.feature_flags.has_lines === true && !entity.display_config.line_entity_code) {
    warnings.push("feature_flags.has_lines is true but display_config.line_entity_code is empty");
  }

  warnRuntimeMetadataOnce(entityCode, warnings);
}

function warnRuntimeMetadataOnce(entityCode: string, warnings: string[]): void {
  if (warnings.length === 0) return;

  const warningKey = `${entityCode}:${warnings.join(";")}`;
  if (warnedRuntimeMetadata.has(warningKey)) return;
  warnedRuntimeMetadata.add(warningKey);
  console.warn(`[neon-meta-entity-runtime] ${entityCode}: ${warnings.join("; ")}`);
}

function warnIfDescriptorCompileFailedInDev(entityCode: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(
    `[neon-meta-entity-runtime] ${entityCode}: descriptor compile failed`,
    error,
  );
}

function warnIfCompiledEntityParseFailedInDev(entityCode: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(
    `[neon-meta-entity-runtime] ${entityCode}: compiled metadata contract parse failed`,
    error,
  );
}

/**
 * Cleanup Plan v5 §P6 — descriptor surface injection for the document
 * runtime cutover.
 *
 * Appends the four PI document-runtime surfaces (document_header,
 * polymorphic_pc_lines, header_scope_pc_strip, postings_preview) so the
 * generic `[entity]/[id]` renderer mounts the descriptor-driven PI view.
 * Also drops the compiler-emitted `line_items` surface for PI — it would
 * otherwise render alongside `polymorphic_pc_lines` (both ask the user
 * to view document lines, the former fetching its own copy via the
 * standard records API and the latter reading from the canonical
 * DocumentRuntimeContext slice).
 *
 * Injection happens here (rather than via a stored entity_surface row)
 * because there is no `control.entity_surface` table — surfaces are
 * compiler outputs, not stored rows. A real registry is P7+ scope.
 *
 * Sprint 7 deleted the legacy PI route + client; Sprint 8 PR5 dropped
 * the `PI_VIA_DESCRIPTOR` flag (no fallback = no rollback to gate).
 * New document families (SI, GR, …) add their own branch here when
 * their composer + strategy + surfaces ship.
 */
function injectDocumentRuntimeSurfaces(
  entityCode: string,
  descriptor: MetaEntityRuntimeDescriptor,
): MetaEntityRuntimeDescriptor {
  if (entityCode !== "purchase_invoice") return descriptor;

  return {
    ...descriptor,
    surfaces: [
      // The compiler-emitted `line_items` surface is replaced by the
      // injected `polymorphic_pc_lines` below — single canonical lines
      // section per amendment 2 (no duplicate fetches, no duplicate UI).
      ...descriptor.surfaces.filter((s) => s.kind !== "line_items"),
      ...buildPurchaseInvoiceDocumentRuntimeSurfaces(),
    ],
  };
}
