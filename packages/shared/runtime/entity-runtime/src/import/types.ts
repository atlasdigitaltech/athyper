/**
 * Import operation contracts for entity-runtime.
 *
 * The wizard calls the same endpoint twice:
 *   1. dryRun: true  — validate only, zero side-effects, returns full result
 *   2. dryRun: false — execute import, returns same shape with side-effects
 *
 * This guarantees the user sees the exact same error set before committing.
 */

// ── Import mode ───────────────────────────────────────────────────────────────

export type ImportMode =
  | "create"   // insert only — reject rows whose key already exists
  | "update"   // update only — reject rows whose key does not exist
  | "upsert";  // insert if new, update if exists (match by natural key)

// ── Column mapping ────────────────────────────────────────────────────────────

export interface ColumnMapping {
  /** Header from the uploaded CSV/Excel file */
  csvHeader:  string;
  /** Entity field name to map to; null = skip this column */
  fieldName:  string | null;
  /**
   * Optional constant value that overrides the CSV cell value for every row.
   * Useful for applying defaults not present in the file (e.g. currency = "INR").
   */
  constant?:  unknown;
}

// ── Upload token ──────────────────────────────────────────────────────────────

export interface UploadTokenResponse {
  /** Server-issued reference to the uploaded file. Passed on all subsequent calls. */
  uploadToken: string;
  /** Column headers detected from the file */
  headers:     string[];
  /** Total data row count (excluding header) */
  rowCount:    number;
  /** First 50 rows as raw cell values for client-side preview */
  previewRows: unknown[][];
}

// ── Import request ────────────────────────────────────────────────────────────

export interface ImportRequest {
  entityCode:  string;
  uploadToken: string;
  mappings:    ColumnMapping[];
  mode:        ImportMode;
  /** true = validate only, no side-effects */
  dryRun:      boolean;
}

// ── Import result ─────────────────────────────────────────────────────────────

export interface ImportRowError {
  /** 1-based row number in the original file */
  row:     number;
  /** null = row-level error not tied to a specific field */
  field:   string | null;
  code:    string;
  message: string;
}

export interface ImportResult {
  mode:     ImportMode;
  dryRun:   boolean;
  totalRows: number;
  created:   number;
  updated:   number;
  skipped:   number;
  failed:    number;
  errors:    ImportRowError[];
  /**
   * Presigned URL to a downloadable CSV of all failed rows with error details.
   * Present only when failed > 0 and dryRun = false.
   */
  errorReportUrl?: string;
}

// ── Job status (polling) ──────────────────────────────────────────────────────

export interface ImportJobStatus {
  jobId:     string;
  status:    "queued" | "processing" | "completed" | "failed";
  processed: number;
  total:     number;
  result?:   ImportResult;   // present when status = "completed" | "failed"
}
