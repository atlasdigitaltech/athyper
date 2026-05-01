/**
 * ResolvedDisplayConfig — the normalised, defaults-applied display config type.
 *
 * All optional fields in the raw display_config are filled with canonical
 * defaults after passing through resolvePresentationConfig(). Consumers
 * should always work with this type, never the raw JSONB shape.
 */

export type DetailRenderer = "master" | "document" | "ledger";
export type DetailProfile  = "simple" | "rich" | "read-only";
export type ListRenderer   = "table" | "kanban" | "dashboard" | "spreadsheet";
export type ViewMode       = "table" | "kanban" | "dashboard" | "spreadsheet";

export interface ResolvedDisplayConfig {
  // ── Rendering strategy ───────────────────────────────────────────────────
  detail_renderer: DetailRenderer;
  /** Richness of the master detail page. Defaults to "simple". */
  detail_profile:  DetailProfile;
  list_renderer:   ListRenderer;
  view_modes:      ViewMode[];

  // ── List presentation ────────────────────────────────────────────────────
  list_columns:       string[];
  default_sort_field: string;
  default_sort_order: "asc" | "desc";
  search_fields?:     string[];

  // ── Lines (document entities only) ───────────────────────────────────────
  /** null = no lines section; string = registered renderer key */
  lines_renderer: string | null;

  // ── Status / lifecycle ───────────────────────────────────────────────────
  /** Fields whose value is fed to statusToIntent(). Default: ["status"]. */
  status_field_names: string[];

  // ── Alternate flows ───────────────────────────────────────────────────────
  /** Alternate intake flow codes. Default: [] (single default flow). */
  alternate_flows: string[];

  // ── Display identity ──────────────────────────────────────────────────────
  title_field?:    string;
  subtitle_field?: string;
  icon?:           string;
  color?:          string;

  // ── Document header field-map ─────────────────────────────────────────────
  document_header?: Record<string, string | undefined>;

  // ── Action grouping ───────────────────────────────────────────────────────
  action_groups?: Record<string, {
    primary?: string[];
    working?: string[];
    output?: string[];
  }>;
}

/** Canonical defaults applied when a display_config key is absent or null. */
export const DEFAULT_DISPLAY_CONFIG: ResolvedDisplayConfig = {
  detail_renderer:    "master",
  detail_profile:     "simple",
  list_renderer:      "table",
  view_modes:         ["table"],
  list_columns:       ["code", "name", "status"],
  default_sort_field: "updated_at",
  default_sort_order: "desc",
  lines_renderer:     null,
  status_field_names: ["status"],
  alternate_flows:    [],
};
