/**
 * @athyper/api-contracts — Entity List (Smart List) Types
 *
 * Canonical shared types for the Smart List framework.
 *
 *   EntityListQueryState          — one shape for URL + store + saved_view.state_json + API request
 *   EntityListPresentationConfig  — presentation behavior per field (not metadata duplication)
 *   EntityActionEligibility       — per-record eligibility from bulk pre-flight check
 *   BulkPreflightResult           — structured mixed-validity check result
 *   BulkActionResult              — structured result from executed bulk action
 *
 * RULES enforced by this module:
 *
 *   1. EntityListQueryState is the ONLY shape that travels between URL params,
 *      Zustand store, saved_view.state_json, and the API records request.
 *      Never define a parallel filter/sort/page shape outside this type.
 *
 *   2. EntityListPresentationConfig is PRESENTATION ONLY. It does not repeat
 *      EntityField capability flags (is_sortable, is_filterable, is_aggregatable, etc.).
 *      The canonical source for capability is EntityField in api-contracts/metadata.
 *
 *   3. entity_field stays the source of type semantics. This config references
 *      field names from CompiledEntity, it does not re-define what fields can do.
 *
 *   4. principal_ui_preference and saved_view.state_json store OVERRIDES and
 *      CURRENT STATE, not system defaults. System defaults live in display_config
 *      and EntityListPresentationConfig, not in per-principal or per-view rows.
 *
 *   5. BulkPreflightResult and BulkActionResult share the same per-record status
 *      vocabulary so the UI can reuse one result renderer for both.
 *
 * Schema versioning:
 *   _v: 1 — bump this literal when a breaking change requires migration.
 *   Use z.literal(1).default(1) so existing rows without _v pass validation.
 */
import { z } from "zod";
import { UuidSchema } from "./common";

// ═══════════════════════════════════════════════════════════════
// ENTITY LIST QUERY STATE
// One canonical shape. Two storage targets: URL params + saved_view.state_json.
// ═══════════════════════════════════════════════════════════════

export const EntityListSortSchema = z.object({
  key: z.string(),
  dir: z.enum(["asc", "desc"]),
});
export type EntityListSort = z.infer<typeof EntityListSortSchema>;

/**
 * Filter map: field_name → selected values.
 * Semantics: OR within a field, AND across fields.
 * E.g. { status: ["posted", "draft"], currency: ["USD"] }
 */
export const EntityListFiltersSchema = z.record(z.string(), z.array(z.string()));
export type EntityListFilters = z.infer<typeof EntityListFiltersSchema>;

/**
 * Facet resolution scope — controls how expensive the facet query is.
 *   "none"  — no facets returned (default; avoids extra query on every load)
 *   "cheap" — enum + low-cardinality fields only (fast aggregation on indexed columns)
 *   "all"   — + high-cardinality fields on-demand (may be slow; user-triggered)
 *
 * The client sends this in every request so the server knows which facets to include.
 * "cheap" facets are always returned for filter-bar population.
 * "all" facets are requested explicitly (e.g. when the user opens a filter panel).
 */
export const FacetScopeSchema = z.enum(["none", "cheap", "all"]);
export type FacetScope = z.infer<typeof FacetScopeSchema>;

export const EntityListViewModeSchema = z.enum(["list", "board", "compact", "dashboard", "excel"]);
export type EntityListViewMode = z.infer<typeof EntityListViewModeSchema>;

export const EntityListQueryStateSchema = z.object({
  /**
   * Schema version. Increment only on breaking shape changes.
   * Default 1 so legacy saved_view rows without _v pass validation.
   */
  _v: z.literal(1).default(1),

  /** entity_code from control.entity — identifies the backing table. */
  entity: z.string(),

  /**
   * surface_code scoping — ties the state to a specific list surface.
   * E.g. "journal_entry.list", "vendor.list".
   * Optional: defaults to "<entity>.list" when absent.
   */
  surface: z.string().optional(),

  // ── Search ────────────────────────────────────────────────────

  /** Free-text search term applied server-side via tsvector or ILIKE. */
  search: z.string().optional(),

  /**
   * Search execution mode.
   * "server" (default) — query is sent to the server tsvector/ILIKE endpoint.
   * "client" — filter already-fetched rows in the browser (for small static lists).
   * Omitted from URL when "server" (the common case).
   */
  searchMode: z.enum(["client", "server"]).optional(),

  // ── Filters ───────────────────────────────────────────────────

  /**
   * Active filters. field_name → selected values (OR within, AND across).
   * Serialized to URL as: ?filter.status=posted,draft&filter.currency=USD
   */
  filters: EntityListFiltersSchema.optional(),

  // ── Sort ──────────────────────────────────────────────────────

  /** Active sort. Serialized to URL as: ?sort=amount:desc */
  sort: EntityListSortSchema.optional(),

  // ── Grouping ──────────────────────────────────────────────────

  /**
   * field_name to group records by, or null to clear grouping.
   * Only valid for fields where EntityField.is_groupable = true.
   */
  group: z.string().nullable().optional(),

  // ── Pagination ────────────────────────────────────────────────

  /** Current page (1-based). Omit for page 1 (cleaner URLs). */
  page: z.number().int().positive().optional(),
  /** Records per page. Server hard cap: 200. */
  pageSize: z.number().int().positive().max(200).optional(),

  // ── View ──────────────────────────────────────────────────────

  /** Active view mode. "list" is the default and is omitted from URL. */
  viewMode: EntityListViewModeSchema.optional(),

  /**
   * User column visibility override — ordered list of visible field names.
   * When absent, defaults come from display_config.list_columns + EntityListPresentationConfig.
   */
  columns: z.array(z.string()).optional(),

  /**
   * Density override for this list surface.
   * Overrides the principal_ui_profile density for this surface only.
   */
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),

  // ── Facets ────────────────────────────────────────────────────

  /**
   * Facet scope requested.
   * "none" = no facets (default).
   * "cheap" = enum + low-cardinality columns (always fast).
   * "all" = + high-cardinality columns (on-demand, may be slow).
   */
  facets: FacetScopeSchema.optional(),

  // ── Saved view tracking ───────────────────────────────────────

  /**
   * UUID of the active saved view currently loaded.
   * Present only when state exactly matches the saved view (no local modifications).
   * Cleared when the user modifies any part of the state after loading a view.
   */
  savedViewId: UuidSchema.optional(),

  /**
   * UUID of the saved view this state was LOADED from before any modifications.
   * Retained even after local modifications (savedViewId is cleared on modification).
   * Allows the UI to show "Modified from <view name>" + offer Save / Discard actions.
   */
  baseSavedViewId: UuidSchema.optional(),
});

export type EntityListQueryState = z.infer<typeof EntityListQueryStateSchema>;

/** Construct a minimal valid state for an entity (all optional fields absent). */
export function defaultEntityListState(entity: string): EntityListQueryState {
  return { _v: 1, entity };
}

/**
 * Extract the server-request subset from a canonical state.
 * Strips UI-only fields (viewMode, columns, density, savedViewId, etc.)
 * that the server does not consume.
 */
export function stateToApiParams(state: EntityListQueryState): {
  q?: string;
  filters?: EntityListFilters;
  sort?: EntityListSort;
  group?: string;
  page?: number;
  pageSize?: number;
  facets?: FacetScope;
} {
  return {
    ...(state.search      ? { q: state.search }           : {}),
    ...(state.filters     ? { filters: state.filters }    : {}),
    ...(state.sort        ? { sort: state.sort }          : {}),
    ...(state.group       ? { group: state.group }        : {}),
    ...(state.page        ? { page: state.page }          : {}),
    ...(state.pageSize    ? { pageSize: state.pageSize }  : {}),
    ...(state.facets      ? { facets: state.facets }      : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// ENTITY LIST PRESENTATION CONFIG
// PRESENTATION ONLY — does not repeat EntityField capability flags.
// Resolves display behavior for a list surface from the presentation layer,
// sitting between raw metadata (EntityField) and per-user overrides
// (principal_ui_preference + saved_view.state_json).
// ═══════════════════════════════════════════════════════════════

export const ColumnPresentationSchema = z.object({
  /** EntityField.name — identifies the field this config applies to. */
  fieldName: z.string(),

  /** Display label override. Falls back to EntityField.label when absent. */
  label: z.string().optional(),

  /** Default column width in pixels. */
  width: z.number().int().positive().optional(),

  /**
   * Frozen/pinned column — does not scroll horizontally.
   * Persisted to principal_ui_preference when user-configured.
   */
  pinned: z.boolean().optional(),
  pinnedByDefault: z.boolean().optional(),

  /**
   * Column visible by default in list mode.
   * Falls back to display_config.list_columns when absent.
   * NOT the same as EntityField.is_filterable — this is display-only.
   */
  defaultVisible: z.boolean().optional(),

  /**
   * Visible in compact card view (shows fewer columns than list mode).
   * When false, the field is hidden from compact cards.
   */
  compactVisible: z.boolean().optional(),

  /**
   * Included in XLSX / CSV export columns by default.
   * Respects EntityField.is_aggregatable for footer totals.
   */
  excelVisible: z.boolean().optional(),

  /**
   * Formatter identifier.
   * References EntityField.data_type + EntityField.format + money_config + datetime_config.
   * E.g. "currency", "percent", "date-short", "datetime-relative", "duration".
   * Falls back to the field renderer registry default when absent.
   */
  formatter: z.string().optional(),

  /**
   * Semantic intent resolver name for badge/chip rendering.
   * Must be a registered resolver in SemanticResolverRegistry.
   * E.g. "journalEntryStatusIntent", "apArStatusIntent", "kanbanStatusIntent",
   *      "adminStatusIntent", "closeRunStatusIntent".
   *
   * Resolvers live in @athyper/theme/domain-intents and are registered by name
   * so the config can declare the binding without importing the function.
   */
  semanticResolver: z.string().optional(),

  /**
   * Footer aggregation for excel/table totals row.
   * Only applied when EntityField.is_aggregatable = true.
   * null = no aggregation even if field is aggregatable.
   */
  aggregation: z.enum(["sum", "count", "avg", "min", "max"]).nullable().optional(),
});

export type ColumnPresentation = z.infer<typeof ColumnPresentationSchema>;

export const EntityListPresentationConfigSchema = z.object({
  /** Per-field presentation behavior. Not all fields need an entry — absent = use defaults. */
  columns: z.array(ColumnPresentationSchema),

  /**
   * Default view mode for this surface.
   * Falls back to "list" when absent.
   */
  defaultViewMode: EntityListViewModeSchema.optional(),

  /**
   * Default page size.
   * Falls back to 25 when absent. Server hard cap: 200.
   */
  defaultPageSize: z.number().int().positive().max(200).optional(),

  /** Default sort applied when no user/view sort is active. */
  defaultSort: EntityListSortSchema.optional(),

  /**
   * Default group field applied when no user/view group is active.
   * Must be a field where EntityField.is_groupable = true.
   */
  defaultGroup: z.string().optional(),
});

export type EntityListPresentationConfig = z.infer<typeof EntityListPresentationConfigSchema>;

// ═══════════════════════════════════════════════════════════════
// BULK PRE-FLIGHT
// Separate from execute — always call preflight before showing the confirm dialog.
// ═══════════════════════════════════════════════════════════════

/**
 * Per-record eligibility from the pre-flight check.
 * status vocabulary is identical to BulkActionRecordResult.status so the UI
 * can share one result renderer between pre-flight and post-execute views.
 */
export const EntityActionEligibilitySchema = z.object({
  recordId: z.string(),
  status: z.enum(["eligible", "skipped", "denied", "requires_workflow"]),
  /** Human-readable reason for skipped / denied / requires_workflow. */
  reason: z.string().optional(),
  /** Current lifecycle state at time of check. */
  currentState: z.string().optional(),
});
export type EntityActionEligibility = z.infer<typeof EntityActionEligibilitySchema>;

export const BulkPreflightResultSchema = z.object({
  action: z.string(),
  total: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  denied: z.number().int().nonnegative(),
  requiresWorkflow: z.number().int().nonnegative(),
  /** True when at least one record is eligible — use to enable/disable Confirm. */
  canProceed: z.boolean(),
  records: z.array(EntityActionEligibilitySchema),
});
export type BulkPreflightResult = z.infer<typeof BulkPreflightResultSchema>;

// ═══════════════════════════════════════════════════════════════
// BULK ACTION RESULT (post-execute)
// Same per-record status vocabulary as BulkPreflightResult for UI reuse.
// ═══════════════════════════════════════════════════════════════

export const BulkActionRecordResultSchema = z.object({
  id: z.string(),
  status: z.enum(["success", "skipped", "denied", "requires_workflow", "error"]),
  reason: z.string().optional(),
  /**
   * Policy engine outcome for this record.
   * Surfaced from policy_rule.action when a rule was evaluated.
   * "allow" = permitted (normal success); other values explain why the record
   * was skipped, denied, or routed to workflow.
   */
  policyAction: z.enum(["allow", "deny", "warn", "require_workflow", "escalate"]).optional(),
});
export type BulkActionRecordResult = z.infer<typeof BulkActionRecordResultSchema>;

export const BulkActionResultSchema = z.object({
  action: z.string(),
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  records: z.array(BulkActionRecordResultSchema),
  summary: z.object({
    success: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    denied: z.number().int().nonnegative(),
    requiresWorkflow: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  }),
});
export type BulkActionResult = z.infer<typeof BulkActionResultSchema>;
