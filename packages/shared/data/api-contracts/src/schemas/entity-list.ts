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
// FILTER VALUE — typed operator-based filter entries
// ═══════════════════════════════════════════════════════════════

/**
 * Relative range tokens resolved server-side against the tenant calendar + user timezone.
 * Prefixed with @ in URL encoding: ?filter.invoice_date=@this_month
 */
export const RELATIVE_RANGE_TOKENS = [
  "today", "yesterday",
  "this_week", "last_week",
  "this_month", "last_month",
  "this_quarter", "last_quarter",
  "this_year", "last_year",
  "ytd", "qtd", "mtd",
  "this_period", "last_period",
] as const;
export const RelativeRangeTokenSchema = z.enum(RELATIVE_RANGE_TOKENS);
export type RelativeRangeToken = z.infer<typeof RelativeRangeTokenSchema>;

const Primitive = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Typed filter value with an explicit operator.
 * URL sigil encoding:
 *   eq/in      → v1,v2 (no sigil, backward compat) or in:v1,v2
 *   not_in     → not_in:v1,v2
 *   gt         → >value
 *   lt         → <value
 *   gte        → >=value
 *   lte        → <=value
 *   between    → between:from,to
 *   is_null    → null
 *   is_not_null→ notnull
 *   ilike      → ~value
 *   relative_range → @token
 */
export const FilterValueSchema = z.union([
  z.object({ op: z.enum(["eq", "in", "not_in"]), value: z.array(Primitive) }),
  z.object({ op: z.enum(["gt", "lt", "gte", "lte"]), value: z.union([z.number(), z.string()]) }),
  z.object({ op: z.literal("between"), value: z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])]) }),
  z.object({ op: z.enum(["is_null", "is_not_null"]) }),
  z.object({ op: z.literal("ilike"), value: z.string() }),
  z.object({ op: z.literal("relative_range"), value: RelativeRangeTokenSchema }),
]);
export type FilterValue = z.infer<typeof FilterValueSchema>;

/**
 * A filter entry: either legacy string[] (semantics: in) or a typed FilterValue.
 * string[] is the backward-compatible format written by the checkbox facet panel.
 */
export type FilterEntry = string[] | FilterValue;

/**
 * Filter map: field_name → FilterEntry.
 * Semantics: AND across fields.
 * string[] values → OR within (eq/in); FilterValue uses explicit operator.
 */
export const EntityListFiltersSchema = z.record(
  z.string(),
  z.union([z.array(z.string()), FilterValueSchema]),
);
export type EntityListFilters = z.infer<typeof EntityListFiltersSchema>;

// ── Sigil serialization ────────────────────────────────────────────────────────

/**
 * Parse a URL sigil string into a FilterEntry.
 * Handles both legacy comma-separated values and operator-prefixed expressions.
 */
export function parseFilterSigil(raw: string): FilterEntry {
  if (!raw) return [];

  // Null operators
  if (raw === "null")    return { op: "is_null" };
  if (raw === "notnull") return { op: "is_not_null" };

  // Relative range: @token
  if (raw.startsWith("@")) {
    const token = raw.slice(1) as RelativeRangeToken;
    if ((RELATIVE_RANGE_TOKENS as readonly string[]).includes(token)) {
      return { op: "relative_range", value: token };
    }
  }

  // ILIKE: ~value
  if (raw.startsWith("~")) {
    return { op: "ilike", value: raw.slice(1) };
  }

  // Comparison operators
  if (raw.startsWith(">=")) return { op: "gte", value: coerceNumOrStr(raw.slice(2)) };
  if (raw.startsWith("<=")) return { op: "lte", value: coerceNumOrStr(raw.slice(2)) };
  if (raw.startsWith(">"))  return { op: "gt",  value: coerceNumOrStr(raw.slice(1)) };
  if (raw.startsWith("<"))  return { op: "lt",  value: coerceNumOrStr(raw.slice(1)) };

  // Prefix operators
  if (raw.startsWith("between:")) {
    const [a, b] = raw.slice("between:".length).split(",");
    if (a !== undefined && b !== undefined) {
      return { op: "between", value: [coerceNumOrStr(a), coerceNumOrStr(b)] };
    }
  }
  if (raw.startsWith("not_in:")) {
    const vals = raw.slice("not_in:".length).split(",").filter(Boolean);
    return { op: "not_in", value: vals };
  }
  if (raw.startsWith("in:")) {
    const vals = raw.slice("in:".length).split(",").filter(Boolean);
    return { op: "in", value: vals };
  }

  // Default: comma-separated values → legacy string[] (in semantics)
  return raw.split(",").filter(Boolean);
}

/**
 * Serialize a FilterEntry to a URL sigil string.
 * string[] produces a plain comma-separated string (backward compat, no operator prefix).
 */
export function serializeFilterEntry(entry: FilterEntry): string {
  if (Array.isArray(entry)) return entry.join(",");

  switch (entry.op) {
    case "eq":
    case "in":
      return (entry.value as (string | number | boolean)[]).map(String).join(",");
    case "not_in":
      return `not_in:${(entry.value as (string | number | boolean)[]).map(String).join(",")}`;
    case "gt":  return `>${entry.value}`;
    case "lt":  return `<${entry.value}`;
    case "gte": return `>=${entry.value}`;
    case "lte": return `<=${entry.value}`;
    case "between": {
      const [a, b] = entry.value as [string | number, string | number];
      return `between:${a},${b}`;
    }
    case "is_null":     return "null";
    case "is_not_null": return "notnull";
    case "ilike":       return `~${entry.value}`;
    case "relative_range": return `@${entry.value}`;
    default: return "";
  }
}

/**
 * Extract string values from a filter entry for checkbox-style UI (enum/boolean facets).
 * Returns [] for operator types that can't be represented as a value list.
 */
export function getFilterStringValues(entry: FilterEntry | undefined): string[] {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  if (entry.op === "in" || entry.op === "eq" || entry.op === "not_in") {
    return (entry.value as (string | number | boolean)[]).map(String);
  }
  return [];
}

/**
 * Human-readable summary of a filter entry for display in filter chips.
 */
export function describeFilterEntry(entry: FilterEntry): string {
  if (Array.isArray(entry)) return entry.join(", ");

  switch (entry.op) {
    case "eq":
    case "in":
      return (entry.value as (string | number | boolean)[]).map(String).join(", ");
    case "not_in":
      return `not ${(entry.value as (string | number | boolean)[]).map(String).join(", ")}`;
    case "gt":  return `> ${entry.value}`;
    case "lt":  return `< ${entry.value}`;
    case "gte": return `≥ ${entry.value}`;
    case "lte": return `≤ ${entry.value}`;
    case "between": {
      const [a, b] = entry.value as [string | number, string | number];
      return `${a} – ${b}`;
    }
    case "is_null":     return "is empty";
    case "is_not_null": return "is not empty";
    case "ilike":       return `contains ${entry.value}`;
    case "relative_range":
      return RELATIVE_RANGE_LABEL[entry.value] ?? entry.value;
    default: return String(entry);
  }
}

const RELATIVE_RANGE_LABEL: Record<RelativeRangeToken, string> = {
  today: "Today", yesterday: "Yesterday",
  this_week: "This Week", last_week: "Last Week",
  this_month: "This Month", last_month: "Last Month",
  this_quarter: "This Quarter", last_quarter: "Last Quarter",
  this_year: "This Year", last_year: "Last Year",
  ytd: "Year to Date", qtd: "Quarter to Date", mtd: "Month to Date",
  this_period: "This Period", last_period: "Last Period",
};

function coerceNumOrStr(s: string): number | string {
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

// ═══════════════════════════════════════════════════════════════
// CANONICAL STATE — stable serialization for modification detection
// ═══════════════════════════════════════════════════════════════

function canonicalFilterEntry(entry: FilterEntry): unknown {
  if (Array.isArray(entry)) return [...entry].sort();
  if (entry.op === "in" || entry.op === "eq" || entry.op === "not_in") {
    const vals = (entry.value as (string | number | boolean)[]).map(String);
    return { op: entry.op, value: [...vals].sort() };
  }
  return entry;
}

/**
 * Produce a stable, order-independent string representation of the query
 * dimensions that determine "is this the same view?".
 * Field order in filters and value order in eq/in/not_in are normalized.
 * UI-only fields (density, columns, viewMode) are deliberately excluded.
 */
export function canonicalizeQueryState(state: EntityListQueryState): string {
  return JSON.stringify({
    q:       state.search   ?? null,
    sort:    state.sort?.length ? state.sort.map((s) => `${s.key}:${s.dir}`).join(",") : null,
    group:   state.group    ?? null,
    filters: state.filters
      ? Object.fromEntries(
          Object.entries(state.filters)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonicalFilterEntry(v as FilterEntry)]),
        )
      : null,
  });
}

/** djb2 hash → compact base-36 string for URL use. */
export function hashQueryState(state: EntityListQueryState): string {
  const s = canonicalizeQueryState(state);
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = (((h << 5) + h) + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

// ═══════════════════════════════════════════════════════════════
// ENTITY LIST QUERY STATE
// One canonical shape. Two storage targets: URL params + saved_view.state_json.
// ═══════════════════════════════════════════════════════════════

export const EntityListSortEntrySchema = z.object({
  key:   z.string(),
  dir:   z.enum(["asc", "desc"]),
  nulls: z.enum(["first", "last"]).optional(),
});
export type EntityListSortEntry = z.infer<typeof EntityListSortEntrySchema>;

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
   * E.g. "journal_entry.list", "supplier.list".
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
   * Active filters. field_name → FilterEntry (string[] or FilterValue).
   * Serialized to URL as: ?filter.status=posted,draft&filter.amount=>50000
   */
  filters: EntityListFiltersSchema.optional(),

  // ── Sort ──────────────────────────────────────────────────────

  /**
   * Active sort entries (priority-ordered). Primary sort first.
   * URL: ?sort=field1:desc,field2:asc,field3:asc:nfirst
   *   - "nfirst" suffix = NULLS FIRST; absent = NULLS LAST (default)
   */
  sort: z.array(EntityListSortEntrySchema).optional(),

  // ── Grouping ──────────────────────────────────────────────────

  /**
   * field_name to group records by, or null to clear grouping.
   * Only valid for fields where EntityField.is_groupable = true.
   */
  group: z.string().nullable().optional(),

  // ── Pagination ────────────────────────────────────────────────

  /** Current page (1-based). Omit for page 1 (cleaner URLs). */
  page: z.number().int().positive().optional(),
  /** Records per page. Server hard cap: 500; lower tenant limits may come from api.pagination.max_page_size. */
  pageSize: z.number().int().positive().max(500).optional(),

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

  /**
   * Pinned (frozen) column names for the spreadsheet view.
   * Pinned columns render first and remain sticky while the table scrolls horizontally.
   * URL: ?pinned=col1,col2   Persisted in saved_view.state_json.
   */
  pinnedCols: z.array(z.string()).optional(),

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
  sort?: EntityListSortEntry[];
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
   * Falls back to 25 when absent. Server default hard cap: 500.
   */
  defaultPageSize: z.number().int().positive().max(500).optional(),

  /** Default sort applied when no user/view sort is active. */
  defaultSort: z.array(EntityListSortEntrySchema).optional(),

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
