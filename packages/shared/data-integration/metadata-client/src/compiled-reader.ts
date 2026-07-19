/**
 * @athyper/metadata-client — Compiled Reader
 *
 * Reads snapshot.entity_compiled and resolves:
 *   - Which fields to display in list/detail/form views
 *   - Field groups → form sections / tabs
 *   - Display config (title field, default sort, list columns)
 *   - Feature flags (attachments, comments, workflow, etc.)
 *
 * This is the PRIMARY source for all three rendering runtimes.
 * Unknown entity codes fail here — before any partial rendering.
 */
import {
  type CompiledEntity,
  type EntityField,
  type FieldGroup,
  type DetailTab,
  type EntityClassProfile,
  type OverlayTabChange,
  CANONICAL_TAB_ORDER,
  type MasterConfig,
  type MasterTab,
  type MasterTabSection,
  type SummaryCardsConfig,
} from "@athyper/api-contracts/metadata";
import {
  type EntityListPresentationConfig,
  type ColumnPresentation,
} from "@athyper/api-contracts/entity-list";

export interface ResolvedListConfig {
  columns: EntityField[];
  searchFields: EntityField[];
  defaultSortField: string | undefined;
  defaultSortOrder: "asc" | "desc";
  titleField: string | undefined;
}

export interface ResolvedDetailConfig {
  headerFields: EntityField[];
  sections: Array<{ group: FieldGroup; fields: EntityField[] }>;
  titleField: EntityField | undefined;
  subtitleField: EntityField | undefined;
}

export interface ResolvedFormConfig {
  sections: Array<{ group: FieldGroup; fields: EntityField[] }>;
  requiredFields: EntityField[];
  validationRules: Map<string, Record<string, unknown>>;
}

/** Canonical v2 surface bindings projected into the legacy field model. */
export function resolveContractSurfaceFieldNames(entity: CompiledEntity, modes: string[]): string[] {
  const contract = entity.contract_v2;
  if (!contract) return [];
  const fieldsById = new Map(contract.fields.map((field) => [field.id, field.name]));
  const bindings = contract.surfaces
    .filter((surface) => surface.surface.is_enabled && modes.includes(surface.surface.mode))
    .sort((left, right) => left.surface.surface_key.localeCompare(right.surface.surface_key))
    .flatMap((surface) => surface.fields
      .filter((binding) => binding.visible)
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)))
    .map((binding) => fieldsById.get(binding.entity_field_id))
    .filter((name): name is string => Boolean(name));
  return [...new Set(bindings)];
}

function contractListFieldNames(entity: CompiledEntity): string[] {
  return resolveContractSurfaceFieldNames(entity, ["list", "spreadsheet", "compact_card"]);
}

function contractIdentity(entity: CompiledEntity): { titleField?: string; subtitleField?: string } {
  const identity = entity.contract_v2?.version_contract.identity_config;
  return {
    titleField: identity?.display_identity.title_field,
    subtitleField: identity?.display_identity.subtitle_field ?? undefined,
  };
}

/**
 * Resolve list view configuration from a compiled entity.
 *
 * Column-selection semantics:
 *   - If `display_config.list_columns` is a non-empty array, it is
 *     authoritative for BOTH membership AND order. Unknown field names are
 *     silently dropped; fields not listed are NOT re-added by sort_order.
 *   - If `list_columns` is absent or empty, fall back to the heuristic:
 *     filterable-or-sortable fields, top 8, ordered by `sort_order`.
 *
 * This locked behaviour lets seed data (or tenant overrides) opt entities
 * into descriptor-driven column ordering — the embedded entity-list grid
 * depends on it. Existing callers whose entities don't declare
 * `list_columns` are unchanged (the fallback path is identical to the
 * previous implementation).
 */
export function resolveListConfig(entity: CompiledEntity): ResolvedListConfig {
  const { fields, display_config } = entity;

  const canonicalListColumns = contractListFieldNames(entity);
  const listColumnNames = canonicalListColumns.length > 0
    ? canonicalListColumns
    : display_config.list_columns;
  const hasAuthoritativeList = Array.isArray(listColumnNames) && listColumnNames.length > 0;

  let columns: EntityField[];
  if (hasAuthoritativeList) {
    const fieldByName = new Map(fields.map((f) => [f.name, f]));
    columns = listColumnNames
      .map((name) => fieldByName.get(name))
      .filter((f): f is EntityField => f !== undefined);
  } else {
    columns = fields
      .filter((f) => f.is_filterable || f.is_sortable)
      .slice(0, 8)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const canonicalSearchFieldNames = entity.contract_v2?.version_contract.search_config.fields.map((field) => field.field);
  const searchFieldNames = entity.contract_v2
    ? (entity.contract_v2.version_contract.search_config.enabled ? canonicalSearchFieldNames : [])
    : entity.search_config?.enabled === false
    ? []
    : entity.search_config?.fields?.length
      ? entity.search_config.fields
      : undefined;
  const searchFields = searchFieldNames
    ? fields.filter((f) => searchFieldNames.includes(f.name))
    : fields.filter((f) => f.is_searchable);

  return {
    columns,
    searchFields,
    defaultSortField: display_config.default_sort_field,
    defaultSortOrder: display_config.default_sort_order ?? "asc",
    titleField: contractIdentity(entity).titleField ?? display_config.title_field,
  };
}

/**
 * Resolve detail view configuration — header fields + tabbed sections.
 */
export function resolveDetailConfig(entity: CompiledEntity): ResolvedDetailConfig {
  const { fields, field_groups, display_config } = entity;

  const identity = contractIdentity(entity);
  const titleFieldName = identity.titleField ?? display_config.title_field;
  const subtitleFieldName = identity.subtitleField ?? display_config.subtitle_field;
  const titleField = titleFieldName
    ? fields.find((f) => f.name === titleFieldName)
    : undefined;

  const subtitleField = subtitleFieldName
    ? fields.find((f) => f.name === subtitleFieldName)
    : undefined;

  // Top header: title + subtitle + key identifying fields
  const detailFields = resolveContractSurfaceFieldNames(entity, ["detail", "header"]);
  const headerFields = (detailFields.length > 0
    ? detailFields.map((name) => fields.find((field) => field.name === name)).filter((field): field is EntityField => Boolean(field))
    : fields.filter((f) => f.group_key === null || f.group_key === "identity")
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, 6));

  // Sections from field groups
  const sections = [...field_groups]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => ({
      group,
      fields: fields
        .filter((f) => group.fields.includes(f.name))
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((s) => s.fields.length > 0);

  return { headerFields, sections, titleField, subtitleField };
}

/**
 * Resolve form configuration — editable sections + validation.
 */
function isEditableByContract(field: CompiledEntity["fields"][number]): boolean {
  const editability = field.editability;
  if (editability && typeof editability === "object" && !Array.isArray(editability)) {
    if (editability["editable"] === false) return false;
    const editableIn = editability["editable_in"];
    if (Array.isArray(editableIn) && editableIn.length === 0) return false;
  }
  return true;
}

export function resolveFormConfig(entity: CompiledEntity): ResolvedFormConfig {
  const { fields, field_groups } = entity;

  const formBindings = resolveContractSurfaceFieldNames(entity, ["create", "edit"]);
  const canonicalEditable = formBindings.length > 0
    ? new Set(formBindings)
    : null;

  const editableFields = fields.filter((f) => (
    (!canonicalEditable || canonicalEditable.has(f.name)) &&
    !f.is_readonly &&
    f.origin !== "system" &&
    f.is_computed !== true &&
    f.is_write_once !== true &&
    isEditableByContract(f)
  ));

  let sections = [...field_groups]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => ({
      group,
      fields: editableFields
        .filter((f) => group.fields.includes(f.name))
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((s) => s.fields.length > 0);

  // Fallback: if no field groups are defined, show all editable fields in a single section
  if (sections.length === 0 && editableFields.length > 0) {
    sections = [
      {
        group: {
          group_key: "general",
          label:       "General",
          description: null,
          sort_order:  0,
          columns:     2 as const,
          page_span:   "half" as const,
          fields:      editableFields.map((f) => f.name),
        },
        fields: editableFields.sort((a, b) => a.sort_order - b.sort_order),
      },
    ];
  }

  const requiredFields = editableFields.filter((f) => f.is_required);

  const validationRules = new Map<string, Record<string, unknown>>();
  for (const field of editableFields) {
    if (field.validation_rules) {
      validationRules.set(field.name, field.validation_rules);
    }
  }

  return { sections, requiredFields, validationRules };
}

// ── Renderer family resolution (RUNTIME_ROUTING_SPEC §2) ─────────────────────

/**
 * Selects the detail-page renderer shell for the shared /app/[entity]/[id] route.
 *
 * This is NOT a route resolver — all families share the same URL contract.
 * The family determines which runtime detail shell is dispatched inside
 * the shared record route (RUNTIME_ROUTING_SPEC section 8).
 *
 * Families:
 *   "master"       — simple field-grid for reference/master entities.
 *                    Covers all simple entity classes (MASTER, CONTROL, REFERENCE,
 *                    DIMENSION, LOOKUP, LEDGER, LOG, AGGREGATE).
 *   "document"     — rich document shell with process health,
 *                    KPI strip, lines/distributions tabs, workflow, approvals.
 *   "ledger"       — read-only log view; no edit ops, no runtime form.
 *
 * Richness within "master" is controlled by display_config.detail_profile:
 *   "simple"    — field grid + tabs only.
 *   "rich"      — EntityIdentityBar + KPI rail + platform panels (master_config).
 *   "read-only" — simple but all edit operations are hidden.
 *
 * Resolution order:
 *   1. display_config.detail_renderer — explicit DB value ("master" | "document" | "ledger")
 *   2. feature_flags.has_workflow/is_approvable = true → "document"
 *   3. entity_class/document_header/table_schema document signals → "document"
 *   4. fallback → "master"
 */
export type RendererFamily = "master" | "document" | "ledger";

const RENDERER_FAMILIES = new Set<RendererFamily>(["master", "document", "ledger"]);

function normalizeRendererFamily(value: unknown): RendererFamily | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliased = normalized === "document_detail" ? "document" : normalized;
  return RENDERER_FAMILIES.has(aliased as RendererFamily)
    ? aliased as RendererFamily
    : undefined;
}

export function resolveRendererFamily(entity: CompiledEntity): RendererFamily {
  const contract = entity.contract_v2;
  if (contract) {
    const detailSurface = contract.surfaces.find((surface) =>
      surface.surface.is_enabled && ["detail", "header"].includes(surface.surface.mode),
    );
    const contractRenderer = normalizeRendererFamily(detailSurface?.surface.renderer_key);
    if (contractRenderer) return contractRenderer;

    const entityClass = contract.catalog.entity_class.trim().toUpperCase();
    if (entityClass === "LEDGER" || entityClass === "LOG") return "ledger";
    if (entityClass === "DOCUMENT" || entityClass === "DOCUMENT_RELATION") return "document";
    return "master";
  }

  const explicit = normalizeRendererFamily(entity.display_config.detail_renderer);
  if (explicit) return explicit;

  if (entity.feature_flags?.has_workflow || entity.feature_flags?.is_approvable) return "document";

  const entityClass = typeof entity.entity_class === "string"
    ? entity.entity_class.trim().toUpperCase()
    : "";
  if (entityClass === "DOCUMENT" || entityClass === "DOCUMENT_RELATION") return "document";

  if (entity.display_config.document_header) return "document";

  const tableSchema = typeof entity.table_schema === "string"
    ? entity.table_schema.trim().toLowerCase()
    : "";
  if (tableSchema === "document") return "document";

  return "master";
}

// ── Master config types and resolver ─────────────────────────────────────────
// MasterConfig, MasterTab, MasterTabSection, SummaryCardsConfig are canonical
// in @athyper/api-contracts/metadata — imported and re-exported from there.
export type { MasterConfig, MasterTab, MasterTabSection, SummaryCardsConfig };

const DEFAULT_MASTER_TABS: MasterTab[] = [
  { id: "__profile",     label: "Profile",     renderer: "fields"      },
  { id: "__comments",    label: "Comments",    renderer: "comments"    },
  { id: "__attachments", label: "Attachments", renderer: "attachments" },
  { id: "__activity",    label: "Activity",    renderer: "activity"    },
];

const DEFAULT_PLATFORM_PANELS: NonNullable<MasterConfig["platform_panels"]> = [
  "comments",
  "attachments",
  "activity",
];

function applyFeatureFlagsToPanels(
  panels: NonNullable<MasterConfig["platform_panels"]>,
  flags: CompiledEntity["feature_flags"],
): NonNullable<MasterConfig["platform_panels"]> {
  return panels.filter((p) => {
    if (p === "attachments") return flags.has_attachments !== false;
    if (p === "comments")    return flags.comments_enabled !== false;
    return true;
  });
}

function applyFeatureFlagsToTabs(
  tabs: MasterTab[],
  flags: CompiledEntity["feature_flags"],
): MasterTab[] {
  return tabs.filter((t) => {
    if (t.renderer === "attachments") return flags.has_attachments !== false;
    if (t.renderer === "comments")    return flags.comments_enabled !== false;
    return true;
  });
}

/**
 * Resolve master_config from a compiled entity.
 * Returns defaults when the entity has no explicit master_config.
 * Both tabs and platform_panels are filtered by feature_flags so
 * toggling a flag in MetaStudio immediately gates the surface.
 */
export function resolveMasterConfig(entity: CompiledEntity): MasterConfig {
  const cfg   = entity.display_config.master_config;
  const flags = entity.feature_flags;
  if (!cfg) {
    return {
      tabs:            applyFeatureFlagsToTabs(DEFAULT_MASTER_TABS, flags),
      platform_panels: applyFeatureFlagsToPanels(DEFAULT_PLATFORM_PANELS, flags),
    };
  }
  return {
    ...cfg,
    tabs:            applyFeatureFlagsToTabs(cfg.tabs ?? DEFAULT_MASTER_TABS, flags),
    platform_panels: applyFeatureFlagsToPanels(cfg.platform_panels ?? DEFAULT_PLATFORM_PANELS, flags),
  };
}

// ── Semantic resolver detection ───────────────────────────────────────────────

function detectSemanticResolver(entity: CompiledEntity, fieldName: string): string | undefined {
  const explicitStatusFields = [
    entity.contract_v2?.lifecycle?.status_field,
    ...(entity.display_config.status_field_names ?? []),
    entity.display_config.document_header?.status_field,
  ].filter((name): name is string => Boolean(name));
  if (!explicitStatusFields.includes(fieldName)) return undefined;
  // Use the per-entity status_resolver from display_config (set in entity engine seeds).
  // This is the authoritative source — no entity code matching needed.
  return entity.display_config.status_resolver ?? "kanbanStatusIntent";
}

// ── Formatter detection from field type ──────────────────────────────────────

const NUMERIC_TYPES = new Set(["integer", "bigint", "decimal", "numeric", "money"]);
const DATE_TYPES    = new Set(["date"]);
const DT_TYPES      = new Set(["datetime", "timestamptz"]);

function detectFormatter(field: EntityField): string | undefined {
  if (field.data_type === "money")                                    return "currency";
  if (field.data_type === "decimal" && field.format === "percent")   return "percent";
  if (DATE_TYPES.has(field.data_type))                               return "date-short";
  if (DT_TYPES.has(field.data_type))                                 return "datetime-relative";
  return undefined;
}

/**
 * Derive EntityListPresentationConfig from compiled entity metadata.
 *
 * PRESENTATION ONLY — does not repeat capability flags from EntityField.
 * Sources in precedence order that the consumer should apply:
 *   1. EntityListPresentationConfig (system defaults, from this function)
 *   2. principal_ui_preference overrides (per-user, per-surface)
 *   3. saved_view.state_json overrides (per-view columns / sort)
 *   4. URL query params (session-level, from useEntityListUrl)
 *
 * The config here establishes the baseline that all higher layers override.
 */
export function resolvePresentationConfig(entity: CompiledEntity): EntityListPresentationConfig {
  const { fields, display_config } = entity;

  // Determine which fields appear in the list
  const canonicalListColumns = contractListFieldNames(entity);
  const listColumnNames = canonicalListColumns.length > 0
    ? canonicalListColumns
    : display_config.list_columns;
  const listFields: EntityField[] = listColumnNames
    ? fields.filter((f) => listColumnNames.includes(f.name))
    : fields.filter((f) => f.is_filterable || f.is_sortable).slice(0, 8);

  const sortedFields = [...listFields].sort((a, b) => a.sort_order - b.sort_order);

  const columns: ColumnPresentation[] = sortedFields.map((field, idx) => {
    const col: ColumnPresentation = { fieldName: field.name };

    // Semantic badge resolver for status-like fields
    const resolver = detectSemanticResolver(entity, field.name);
    if (resolver) col.semanticResolver = resolver;

    // Formatter from data_type
    const fmt = detectFormatter(field);
    if (fmt) col.formatter = fmt;

    // Footer aggregation when field is aggregatable
    if (field.is_aggregatable) {
      col.aggregation = NUMERIC_TYPES.has(field.data_type) ? "sum" : "count";
    }

    // Compact visibility: show only the first 3 fields (by sort_order).
    // Use the map index — avoids an O(n) indexOf call per field.
    col.compactVisible = idx < 3;

    // Excel: all list fields are exported by default
    col.excelVisible = true;

    return col;
  });

  return {
    columns,
    defaultViewMode:  "list",
    defaultPageSize:  25,
    defaultSort: display_config.default_sort_field
      ? [{ key: display_config.default_sort_field, dir: display_config.default_sort_order ?? "asc" }]
      : undefined,
  };
}

// ── Tab resolver (RUNTIME_ROUTING_SPEC §3.1) ──────────────────────────────────

function pushIfMissing(tabs: DetailTab[], tab: DetailTab): void {
  if (!tabs.includes(tab)) tabs.push(tab);
}

function removeIfPresent(tabs: DetailTab[], tab: DetailTab): void {
  const idx = tabs.indexOf(tab);
  if (idx !== -1) tabs.splice(idx, 1);
}

/**
 * Resolve the ordered set of detail-page tabs for an entity.
 *
 * Three-layer resolution (RUNTIME_ROUTING_SPEC §3.1):
 *   Layer 1: entity_class_profile.default_tabs — class-level structural tabs
 *   Layer 2: entity.feature_flags — per-entity capability flags
 *   Layer 3: overlayTabs — tenant-level additions / removals
 *
 * @param meta          Compiled entity descriptor
 * @param classProfile  Optional class profile; pass null to skip Layer 1
 * @param overlayTabs   Tenant overlay changes; pass [] when not available
 */
export function resolveTabs(
  meta: CompiledEntity,
  classProfile: EntityClassProfile | null,
  overlayTabs: OverlayTabChange[],
): DetailTab[] {
  const tabs: DetailTab[] = ["overview"];
  const flags = meta.feature_flags ?? {};
  const hasWorkflow = Boolean(flags.has_workflow ?? flags.is_approvable);

  // ── Layer 1: class-driven structural defaults ─────────────────────────────
  if (classProfile?.default_tabs?.includes("lines"))         pushIfMissing(tabs, "lines");
  if (classProfile?.default_tabs?.includes("distributions")) pushIfMissing(tabs, "distributions");

  // ── Layer 2: feature-flag overrides ──────────────────────────────────────
  // Approval workflow inline tab (compact summary)
  if (hasWorkflow)
    tabs.push("workflow");

  // Attachments — on by default unless explicitly disabled
  if (flags.has_attachments !== false)
    tabs.push("attachments");

  if (flags.version_control)
    tabs.push("versions");

  if (flags.comments_enabled)
    tabs.push("comments");

  // Full approval history panel — coexists with workflow (compact) tab
  if (flags.is_approvable)
    tabs.push("approvals");

  if (flags.event_history)
    tabs.push("events");

  // Per-record validation
  if (flags.quality_checks)  tabs.push("quality");
  // Record-scoped reports
  if (flags.record_reports)  tabs.push("reports");
  // Work items assigned to this record
  if (flags.has_tasks)       tabs.push("tasks");
  // Notification subscribers
  if (flags.has_watchers)    tabs.push("watchers");
  // Policy / business-rule bindings
  if (flags.has_rules)       tabs.push("rules");
  // Webhook / external-sync events
  if (flags.has_integrations) tabs.push("integrations");

  if (flags.has_lines)
    pushIfMissing(tabs, "lines");

  if (flags.has_accounting_distribution)
    pushIfMissing(tabs, "distributions");

  // ── Layer 3: tenant overlay additions / removals ──────────────────────────
  for (const ot of overlayTabs) {
    if (ot.operation === "add")    pushIfMissing(tabs, ot.tab);
    if (ot.operation === "remove") removeIfPresent(tabs, ot.tab);
  }

  // ── Sort to canonical order (RUNTIME_ROUTING_SPEC §3.2) ───────────────────
  tabs.sort((a, b) => {
    const ai = CANONICAL_TAB_ORDER.indexOf(a);
    const bi = CANONICAL_TAB_ORDER.indexOf(b);
    const aIdx = ai === -1 ? CANONICAL_TAB_ORDER.length : ai;
    const bIdx = bi === -1 ? CANONICAL_TAB_ORDER.length : bi;
    return aIdx - bIdx;
  });

  return tabs;
}
