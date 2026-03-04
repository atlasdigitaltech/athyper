// components/mesh/list/explorer-capabilities.ts
//
// Meta-driven capability rules engine.
// Determines which view modes and features are available based on config.

import type { ExplorerCapabilities, ListPageConfig, ViewPreset } from "./types";

// ─── Compute Capabilities ───────────────────────────────────

/**
 * Derive explorer capabilities from a ListPageConfig.
 * Used by ViewSwitcher to enable/disable view modes with tooltips.
 */
export function computeCapabilities<T>(
  config: ListPageConfig<T>,
): ExplorerCapabilities {
  const groupableColumns = config.columns
    .filter((c) => c.groupable)
    .map((c) => c.id);

  const boardCandidateColumns = config.kanban
    ? config.columns.filter((c) => c.groupable || c.sortKey).map((c) => c.id)
    : [];

  return {
    supportsBoard: !!config.kanban,
    supportsTimeline: !!config.timeline,
    supportsTree: !!config.tree,
    supportsGroup: groupableColumns.length > 0,
    supportsCards: !!config.cardRenderer,
    supportsAdjustableColumns: config.columns.length >= 3,
    groupableColumns,
    boardCandidateColumns,
  };
}

// ─── Capability Reason Messages ─────────────────────────────

/**
 * Get a human-readable reason why a view mode is unavailable.
 * Returns null if the view is available.
 */
export function getUnavailableReason<T>(
  mode: string,
  config: ListPageConfig<T>,
  capabilities: ExplorerCapabilities,
): string | null {
  switch (mode) {
    case "kanban":
      if (!capabilities.supportsBoard) {
        return "Board view requires a kanban configuration with status/stage lanes";
      }
      return null;
    case "card-grid":
      if (!capabilities.supportsCards) {
        return "Card view requires a card renderer to be defined";
      }
      return null;
    case "table-columns":
      if (!capabilities.supportsAdjustableColumns) {
        return "Adjustable columns requires at least 3 column definitions";
      }
      return null;
    case "timeline":
      if (!capabilities.supportsTimeline) {
        return "Timeline mapping not configured";
      }
      return null;
    case "tree":
      if (!capabilities.supportsTree) {
        return "Tree view requires a hierarchical entity with parent field configured";
      }
      return null;
    default:
      return null;
  }
}

// ─── Preset Validation ──────────────────────────────────────

/**
 * Validate and self-heal a preset against the current config.
 * Removes references to columns/fields that no longer exist.
 * Falls back to defaults if the preset becomes invalid.
 */
export function validatePresetAgainstConfig<T>(
  preset: ViewPreset,
  config: ListPageConfig<T>,
): ViewPreset {
  const validColumnIds = new Set(config.columns.map((c) => c.id));
  const sortableColumnIds = new Set(
    config.columns.filter((c) => c.sortKey).map((c) => c.sortKey!),
  );
  const groupableColumnIds = new Set(
    config.columns.filter((c) => c.groupable).map((c) => c.id),
  );

  const healed = { ...preset };

  // Validate view mode
  const available = config.availableViews ?? ["table", "card-grid"];
  if (healed.viewMode && !available.includes(healed.viewMode)) {
    healed.viewMode = config.defaultViewMode ?? available[0] ?? "table";
  }

  // Validate column visibility — remove unknown columns
  if (healed.columnVisibility) {
    const cleaned: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(healed.columnVisibility)) {
      if (validColumnIds.has(k)) cleaned[k] = v;
    }
    healed.columnVisibility = cleaned;
  }

  // Validate column order — remove unknown, append missing
  if (healed.columnOrder) {
    const validOrder = healed.columnOrder.filter((id) =>
      validColumnIds.has(id),
    );
    const missing = config.columns
      .map((c) => c.id)
      .filter((id) => !validOrder.includes(id));
    healed.columnOrder = [...validOrder, ...missing];
  }

  // Validate sort rules — remove invalid field references
  if (healed.sortRules) {
    healed.sortRules = healed.sortRules.filter((r) =>
      sortableColumnIds.has(r.fieldId),
    );
  }

  // Validate legacy sort
  if (healed.sortKey && !sortableColumnIds.has(healed.sortKey)) {
    healed.sortKey = null;
    healed.sortDir = undefined;
  }

  // Validate group-by — remove invalid field references
  if (healed.groupBy) {
    healed.groupBy = healed.groupBy.filter((r) =>
      groupableColumnIds.has(r.fieldId),
    );
  }

  // Validate column sizing — remove unknown columns
  if (healed.columnSizing) {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(healed.columnSizing)) {
      if (validColumnIds.has(k)) cleaned[k] = v;
    }
    healed.columnSizing = cleaned;
  }

  // Validate filter bar fields — remove unknown
  if (healed.filterBarFields) {
    healed.filterBarFields = healed.filterBarFields.filter(
      (id) =>
        config.columns.some((c) => c.id === id && c.filterable) ||
        config.quickFilters.some((f) => f.id === id),
    );
  }

  return healed;
}
