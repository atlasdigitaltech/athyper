import {
  DEFAULT_DISPLAY_CONFIG,
  type ResolvedDisplayConfig,
  type DetailRenderer,
  type DetailProfile,
  type ListRenderer,
  type ViewMode,
} from "./displayConfig.defaults";

type RawDisplayConfig = Record<string, unknown>;

const DETAIL_RENDERERS = new Set<DetailRenderer>([
  "master", "document", "ledger",
]);
const DETAIL_PROFILES = new Set<DetailProfile>([
  "simple", "rich", "read-only",
]);
const LIST_RENDERERS = new Set<ListRenderer>([
  "table", "kanban", "dashboard", "spreadsheet",
]);
const VIEW_MODES = new Set<ViewMode>([
  "table", "kanban", "dashboard", "spreadsheet",
]);

function toDetailRenderer(v: unknown): DetailRenderer {
  return DETAIL_RENDERERS.has(v as DetailRenderer)
    ? (v as DetailRenderer)
    : DEFAULT_DISPLAY_CONFIG.detail_renderer;
}

function toDetailProfile(raw: RawDisplayConfig): DetailProfile {
  const v = raw["detail_profile"];
  return DETAIL_PROFILES.has(v as DetailProfile)
    ? (v as DetailProfile)
    : DEFAULT_DISPLAY_CONFIG.detail_profile;
}

function toListRenderer(v: unknown): ListRenderer {
  return LIST_RENDERERS.has(v as ListRenderer)
    ? (v as ListRenderer)
    : DEFAULT_DISPLAY_CONFIG.list_renderer;
}

function toViewModes(v: unknown): ViewMode[] {
  if (!Array.isArray(v)) return DEFAULT_DISPLAY_CONFIG.view_modes;
  const filtered = v.filter((m): m is ViewMode => VIEW_MODES.has(m as ViewMode));
  return filtered.length > 0 ? filtered : DEFAULT_DISPLAY_CONFIG.view_modes;
}

/**
 * Merge a raw display_config object with canonical defaults.
 * Returns a fully-resolved ResolvedDisplayConfig with no optional gaps
 * in the required fields. Pass entity.display_config directly.
 */
export function resolvePresentationConfig(raw: RawDisplayConfig): ResolvedDisplayConfig {
  const detail_renderer = toDetailRenderer(raw["detail_renderer"]);
  return {
    ...DEFAULT_DISPLAY_CONFIG,
    // Passthrough optional keys (title_field, subtitle_field, icon, color, etc.)
    ...raw,
    // Normalised required fields — validate enum membership, fall back to defaults
    detail_renderer,
    detail_profile:     toDetailProfile(raw),
    list_renderer:      toListRenderer(raw["list_renderer"]),
    view_modes:         toViewModes(raw["view_modes"]),
    list_columns:       Array.isArray(raw["list_columns"])
      ? (raw["list_columns"] as string[])
      : DEFAULT_DISPLAY_CONFIG.list_columns,
    default_sort_field: typeof raw["default_sort_field"] === "string"
      ? raw["default_sort_field"]
      : DEFAULT_DISPLAY_CONFIG.default_sort_field,
    default_sort_order: raw["default_sort_order"] === "asc" ? "asc" : "desc",
    // lines_renderer: null = no lines section; string = renderer key
    lines_renderer:     "lines_renderer" in raw
      ? (raw["lines_renderer"] as string | null)
      : DEFAULT_DISPLAY_CONFIG.lines_renderer,
    status_field_names: Array.isArray(raw["status_field_names"])
      ? (raw["status_field_names"] as string[])
      : DEFAULT_DISPLAY_CONFIG.status_field_names,
    alternate_flows:    Array.isArray(raw["alternate_flows"])
      ? (raw["alternate_flows"] as string[])
      : DEFAULT_DISPLAY_CONFIG.alternate_flows,
  };
}
