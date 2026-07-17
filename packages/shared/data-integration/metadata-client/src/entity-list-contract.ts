/**
 * @athyper/metadata-client — Entity List Contract
 *
 * resolveEntityListContract(entity) produces one normalized, sanitized list
 * model from CompiledEntity. Runtime list pages should consume this as their single
 * source of truth for all list configuration, replacing local heuristics.
 *
 * Contract precedence:
 *   1. Explicit display_config / identity_config / search_config values
 *   2. Feature-flag derived fallbacks (archetype, has_workflow, etc.)
 *   3. Canonical defaults (server search, 25 rows, list mode)
 */

import type { CompiledEntity, EntityListFeatures } from "@athyper/api-contracts/metadata";
import type {
  EntityListViewMode,
  ColumnPresentation,
  EntityListSortEntry,
} from "@athyper/api-contracts/entity-list";
import { resolvePresentationConfig } from "./compiled-reader";
import { normalizeEntityListFeatures } from "@athyper/api-contracts/metadata-normalizers";

// Maps display_config v2 canonical view-mode names → EntityListViewMode names.
// Canonical: "table" | "compact" | "kanban" | "dashboard" | "spreadsheet"
// UI-level:  "list"  | "compact" | "board"  | "dashboard" | "excel"
const B5_VIEW_MODE: Record<string, EntityListViewMode> = {
  table:       "list",
  compact:     "compact",
  kanban:      "board",
  dashboard:   "dashboard",
  spreadsheet: "excel",
};

export type EntityListArchetype = "doc" | "rich" | "simple";

export interface EntityListContract {
  /** "doc" for workflow/approvable entities; "simple" for reference/control; "rich" for everything else */
  archetype: EntityListArchetype;

  // ── View modes ────────────────────────────────────────────────────────────
  /**
   * When display_config.view_modes is explicitly set (non-default), it wins over
   * archetype heuristics. When absent, archetype drives the allowed set.
   */
  allowedViewModes: EntityListViewMode[];
  /**
   * Explicit default from list_renderer, or "list" fallback.
   * Runtime list pages should prefer this over responsive heuristics when set.
   */
  defaultViewMode: EntityListViewMode;

  // ── Columns ───────────────────────────────────────────────────────────────
  /**
   * Column presentation config for the default table view.
   * PII fields are excluded — safe to render directly.
   */
  visibleColumns: ColumnPresentation[];
  /**
   * Fields the user may add/remove via ColumnDrawer and URL ?cols=.
   * PII, computed, and system-internal fields excluded.
   * Superset of visibleColumns — includes extra non-default selectable fields.
   */
  selectableColumns: { name: string; label: string }[];
  /**
   * Allowed field names for URL ?cols= sanitization.
   * Derived from selectableColumns — any URL-requested name absent here is dropped.
   */
  allowedColumnNames: string[];
  /** Fields exported to excel (excelVisible=true subset of visibleColumns). */
  exportColumns: { name: string; label: string }[];

  // ── Sort / page ───────────────────────────────────────────────────────────
  defaultSort: EntityListSortEntry[] | undefined;
  defaultPageSize: number;

  // ── Search ────────────────────────────────────────────────────────────────
  /** "server" = full-text via ?q=, "client" = in-view filter, "both" = expose both paths. */
  searchMode: "server" | "client" | "both";
  searchableFieldNames: string[];
  /** Canonical presentation feature overrides from display_config.list_features. */
  listFeatures: EntityListFeatures;

  // ── Navigation / identity ─────────────────────────────────────────────────
  /** Ordered field names tried when building the record detail href. */
  navFieldNames: string[];
  /**
   * When true, always navigate to the record UUID (/app/entity/uuid).
   * Applies to RELATION/DOCUMENT_RELATION classes, entities with parent bindings,
   * and entities with no business keys but at least one reference field.
   */
  usesIdNavigation: boolean;

  // ── Status ────────────────────────────────────────────────────────────────
  /**
   * Deterministic from display_config.status_field_names + document_header.status_field.
   * No semantic resolver heuristics. Used for quick-status chips AND compact-card badges.
   */
  statusFieldNames: string[];

  // ── Org-context scope ────────────────────────────────────────────────────
  /**
   * Describes which org-context boundary restricts this entity's list view.
   *
   *   "none"          — tenant scope only (no extra org boundary)
   *   "company_code"  — list is scoped to active company code(s); entity has company_code_id
   *                     or IS company_code
   *   "legal_entity"  — list is scoped to active legal entity directly; entity has
   *                     legal_entity_id or IS legal_entity
   *
   * Enforcement is always server-side (records.route.ts reads X-Org-Context-Type /
   * X-Legal-Entity-ID and applies the WHERE clause). This field is UI-only metadata
   * for showing a non-removable "Legal Entity scope" or "Company scope" chip.
   */
  scopeMode: "none" | "company_code" | "legal_entity";
  /**
   * The field that carries the scope boundary (e.g., "company_code_id", "legal_entity_id").
   * Undefined when scopeMode is "none".
   */
  scopeFieldName: string | undefined;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveArchetype(entity: CompiledEntity): EntityListArchetype {
  const dc = entity.display_config;
  if (
    dc.detail_renderer === "document" ||
    entity.entity_class === "DOCUMENT" ||
    entity.feature_flags.has_workflow ||
    entity.feature_flags.is_approvable
  ) return "doc";

  if (
    dc.detail_profile === "simple" ||
    dc.detail_profile === "read-only" ||
    entity.entity_class === "REFERENCE" ||
    entity.entity_class === "CONTROL"
  ) return "simple";

  return "rich";
}

function archetypeDefaultModes(archetype: EntityListArchetype): EntityListViewMode[] {
  if (archetype === "simple") return ["list", "excel"];
  if (archetype === "doc")    return ["list", "compact", "board", "excel"];
  return ["list", "compact", "board", "dashboard", "excel"];
}

function resolveAllowedViewModes(entity: CompiledEntity, archetype: EntityListArchetype): EntityListViewMode[] {
  const rawModes = entity.display_config.view_modes;
  // Treat absent or the legacy ["table"] singleton (B.5 backfill placeholder) as "not configured".
  const isExplicitlySet = rawModes && rawModes.length > 0 &&
    !(rawModes.length === 1 && rawModes[0] === "table");

  if (isExplicitlySet) {
    // DB contract wins — no archetype override applied on top
    const mapped = rawModes
      .map((m) => B5_VIEW_MODE[m])
      .filter((m): m is EntityListViewMode => m !== undefined);
    return mapped.length > 0 ? mapped : archetypeDefaultModes(archetype);
  }

  return archetypeDefaultModes(archetype);
}

function resolveDefaultViewMode(entity: CompiledEntity, allowedModes: EntityListViewMode[]): EntityListViewMode {
  const renderer = entity.display_config.list_renderer;
  const fromRenderer = renderer ? B5_VIEW_MODE[renderer] : undefined;
  if (fromRenderer && allowedModes.includes(fromRenderer)) return fromRenderer;
  return allowedModes.includes("list") ? "list" : (allowedModes[0] ?? "list");
}

function resolveSearchableFieldNames(entity: CompiledEntity): string[] {
  if (entity.search_config?.enabled === false) return [];
  const configured = entity.search_config?.fields;
  if (configured?.length) return configured;
  return entity.fields.filter((f) => f.is_searchable).map((f) => f.name);
}

function resolveStatusFieldNames(entity: CompiledEntity): string[] {
  const fromDc = entity.display_config.status_field_names;
  if (fromDc?.length) return fromDc;
  const fromDocHeader = entity.display_config.document_header?.status_field;
  if (fromDocHeader) return [fromDocHeader];
  return [];
}

function resolveNavFieldNames(entity: CompiledEntity): string[] {
  const dc = entity.display_config;
  const identity = entity.identity_config;

  const seen = new Set(["id", "tenant_id"]);
  const result: string[] = [];

  const addHeuristic = (name: string | undefined) => {
    // Heuristic fields (number_field, title_field): skip FK-like _id suffixes
    if (!name || seen.has(name) || name.endsWith("_id")) return;
    seen.add(name);
    result.push(name);
  };

  const addIdentityKey = (name: string | undefined) => {
    // Explicit identity contract fields: trust as-is — external_id / employee_id are valid nav targets
    if (!name || seen.has(name) || name === "tenant_id") return;
    seen.add(name);
    result.push(name);
  };

  addHeuristic(dc.document_header?.number_field);
  addHeuristic(dc.title_field);

  for (const name of identity?.business_key_fields ?? []) addIdentityKey(name);
  for (const name of identity?.natural_key_fields ?? [])  addIdentityKey(name);

  return result;
}

function resolveUsesIdNavigation(entity: CompiledEntity): boolean {
  const flags = entity.feature_flags as Record<string, unknown>;
  const parent = entity.identity_config?.parent;
  const hasParentBinding = !!(parent?.field ?? parent?.entity);

  // Structural entity-class and feature-flag cases
  if (
    entity.entity_class === "RELATION" ||
    entity.entity_class === "DOCUMENT_RELATION" ||
    flags["requires_owner_type_scope"] === true ||
    hasParentBinding ||
    typeof flags["parent_fk"] === "string" ||
    typeof flags["parent_entity"] === "string"
  ) return true;

  // When there are no declared business keys the UUID is the only stable nav target.
  // This covers association/link entities that lack a display identifier.
  const identity = entity.identity_config;
  const businessKeys = [
    ...(identity?.business_key_fields ?? []),
    ...(identity?.natural_key_fields ?? []).filter((n) => n !== "id" && n !== "tenant_id"),
  ];
  if (businessKeys.length === 0) {
    const hasRefField = entity.fields.some((f) => {
      const n = f.name.toLowerCase();
      return n !== "id" && n !== "tenant_id" && (n.endsWith("_id") || f.data_type === "reference");
    });
    if (hasRefField) return true;
  }

  return false;
}

function resolveSelectableColumns(
  entity: CompiledEntity,
  piiFieldNames: Set<string>,
  visibleColumnNameSet: Set<string>,
): { name: string; label: string }[] {
  const listColumnNames = entity.display_config.list_columns;

  const eligible = listColumnNames?.length
    ? entity.fields.filter((f) => listColumnNames.includes(f.name))
    : entity.fields.filter((f) => (f.is_filterable || f.is_sortable) && !f.is_computed);

  return eligible
    .filter((f) => {
      if (f.is_pii) return false;
      if (f.is_computed) return false;
      // Exclude system fields not already in the visible columns contract
      if (f.origin === "system" && !visibleColumnNameSet.has(f.name)) return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({ name: f.name, label: f.label ?? f.name }));
}

function resolveScope(entity: CompiledEntity): { scopeMode: EntityListContract["scopeMode"]; scopeFieldName: string | undefined } {
  const code = entity.entity_code.toLowerCase();
  const fieldNames = new Set(entity.fields.map((f) => f.name));

  // NOTE: these entity code checks are intentionally hardcoded platform constants.
  // "legal_entity" and "company_code" are structural org-context entities whose
  // codes are fixed in the entity engine seed and must not be renamed.

  // Entity IS the legal entity — scoped to its own id
  if (code === "legal_entity") return { scopeMode: "legal_entity", scopeFieldName: "id" };

  // Entity IS or has direct legal_entity_id (e.g., company_code)
  if (code === "company_code" || fieldNames.has("legal_entity_id")) {
    return { scopeMode: "legal_entity", scopeFieldName: "legal_entity_id" };
  }

  // Entity has company_code_id — scoped to active company code(s) of the LE
  if (fieldNames.has("company_code_id")) {
    return { scopeMode: "company_code", scopeFieldName: "company_code_id" };
  }

  // Entity has site_id — indirect company scope via site → company_code chain
  if (fieldNames.has("site_id")) {
    return { scopeMode: "company_code", scopeFieldName: "site_id" };
  }

  return { scopeMode: "none", scopeFieldName: undefined };
}

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Produce one normalized EntityListContract from a compiled entity descriptor.
 *
 * Runtime list pages use this as their single source of truth, replacing
 * local archetype heuristics, status field guesses, and column-picker bypass.
 */
export function resolveEntityListContract(entity: CompiledEntity): EntityListContract {
  const archetype = resolveArchetype(entity);
  const allowedViewModes = resolveAllowedViewModes(entity, archetype);
  const defaultViewMode = resolveDefaultViewMode(entity, allowedViewModes);

  // PII field name set — used to sanitize all column lists
  const piiFieldNames = new Set(entity.fields.filter((f) => f.is_pii).map((f) => f.name));

  const rawPresentationConfig = resolvePresentationConfig(entity);
  // Exclude PII from the rendered column list — a saved view or URL cannot surface them
  const visibleColumns = rawPresentationConfig.columns.filter((c) => !piiFieldNames.has(c.fieldName));
  const visibleColumnNameSet = new Set(visibleColumns.map((c) => c.fieldName));

  const selectableColumns = resolveSelectableColumns(entity, piiFieldNames, visibleColumnNameSet);
  const allowedColumnNames = selectableColumns.map((c) => c.name);

  const exportColumns = visibleColumns
    .filter((c) => c.excelVisible !== false)
    .map((c) => ({
      name: c.fieldName,
      label: entity.fields.find((f) => f.name === c.fieldName)?.label ?? c.fieldName,
    }));

  const searchableFieldNames = resolveSearchableFieldNames(entity);
  const listFeatures = normalizeEntityListFeatures(
    entity.display_config.list_features ?? (entity.display_config as Record<string, unknown>)["listFeatures"],
  ) as EntityListFeatures | undefined;
  const configuredSearchMode = listFeatures?.search_mode;
  const searchMode: EntityListContract["searchMode"] =
    entity.search_config?.enabled === false
      ? "client"
      : configuredSearchMode ?? (searchableFieldNames.length > 0 ? "server" : "client");

  const { scopeMode, scopeFieldName } = resolveScope(entity);

  return {
    archetype,
    allowedViewModes,
    defaultViewMode,
    visibleColumns,
    selectableColumns,
    allowedColumnNames,
    exportColumns,
    defaultSort: rawPresentationConfig.defaultSort,
    defaultPageSize: rawPresentationConfig.defaultPageSize ?? 25,
    searchMode,
    searchableFieldNames,
    listFeatures: listFeatures ?? {},
    navFieldNames: resolveNavFieldNames(entity),
    usesIdNavigation: resolveUsesIdNavigation(entity),
    statusFieldNames: resolveStatusFieldNames(entity),
    scopeMode,
    scopeFieldName,
  };
}
