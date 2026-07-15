/**
 * Bulk operation contracts for entity-runtime.
 *
 * All bulk mutations return BulkOperationResult, which models partial success
 * explicitly. The UI must handle the case where some rows fail and others
 * succeed — never assume all-or-nothing.
 */

/** A serialised representation of the active list filter state. */
export interface SerializedFilter {
  /** Filter field name → raw filter value */
  fields: Record<string, unknown>;
  /** Free-text search query (if any) */
  search?: string;
}

// ── Selection ─────────────────────────────────────────────────────────────────

/**
 * How the target set is specified.
 *   "ids"    — explicit list of record IDs (v1 default)
 *   "filter" — all records matching the active filter (reserved for v2)
 */
export type BulkSelectionMode = "ids" | "filter";

// ── Per-row result ────────────────────────────────────────────────────────────

export interface BulkRowResult {
  id:      string;
  success: boolean;
  error?:  {
    code:    string;
    message: string;
  };
}

export interface BulkOperationResult {
  succeeded: number;
  failed:    number;
  /** Per-row outcome — present for every input row */
  rows:      BulkRowResult[];
}

// ── Export ────────────────────────────────────────────────────────────────────

export interface BulkExportRequest {
  selectionMode: BulkSelectionMode;
  ids?:          string[];
  filter?:       SerializedFilter;
  format:        "csv" | "xlsx";
  /** Column subset; all visible columns if omitted */
  columns?:      string[];
}

export interface BulkExportResult {
  downloadUrl: string;
  expiresAt:   string;   // ISO-8601
  rowCount:    number;
}

// ── Pre-flight check ──────────────────────────────────────────────────────────
//
// Call POST /api/records/:entity/bulk-preflight BEFORE showing the confirm dialog.
// The result feeds the pre-confirm summary ("43 will post, 4 skipped, 2 denied").
// On confirm, call the execute route; never call execute without a preflight first.

export interface BulkPreflightRequest {
  action:        "status_transition" | "set_field";
  ids:           string[];
  /** Required for status_transition. */
  targetStatus?: string;
  /** Required for set_field. */
  field?:        string;
  value?:        unknown;
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface BulkUpdateRequest {
  selectionMode: BulkSelectionMode;
  ids?:          string[];
  filter?:       SerializedFilter;
  /** Single field → new value (v1); multi-field patch in v2 */
  patch:         Record<string, unknown>;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export interface BulkDeleteRequest {
  selectionMode: BulkSelectionMode;
  ids?:          string[];
  filter?:       SerializedFilter;
}
