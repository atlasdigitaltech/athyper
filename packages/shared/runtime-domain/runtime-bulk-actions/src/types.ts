/**
 * @athyper/runtime-bulk-actions — public types.
 *
 * The bulk-actions engine is API-shape-agnostic: it accepts a `BulkClient`
 * abstraction so app shells decide where the actual fetch lives (relay,
 * direct, mocked in tests). This keeps relay quirks (X-CSRF-Token,
 * /api/relay/* path prefix) out of the shared package.
 */

import type {
  BulkActionResult,
  BulkPreflightResult,
} from "@athyper/api-contracts/entity-list";

/** Hard cap mirroring server BULK_MAX_IDS (bulk-action / bulk-crud / bulk-preflight routes). */
export const BULK_MAX_IDS = 500;

/** Default request body for preflight + bulk-action endpoints. */
export interface BulkActionRequest {
  action:    string;
  recordIds: string[];
  params?:   Record<string, unknown>;
}

/** Bulk PATCH (bulk-crud route) body. Different shape from bulk-action. */
export interface BulkPatchRequest {
  selectionMode: "ids" | "filter";
  ids?:          string[];
  patch:         Record<string, unknown>;
}

/** Bulk DELETE (bulk-crud route) body. */
export interface BulkDeleteRequest {
  selectionMode: "ids" | "filter";
  ids?:          string[];
}

/** Bulk export request (records export route). */
export interface BulkExportRequest {
  selectionMode: "ids" | "filter";
  ids?:          string[];
  format:        "csv" | "xlsx" | "json";
}

/**
 * Normalised result shape — absorbs both `bulk-action` (per-record
 * `{id,status,reason,policyAction}`) and `bulk-crud` (`{succeeded,failed,rows}`)
 * server responses. Surfaces always see the same shape.
 */
export interface NormalizedBulkResult {
  /** The action code that was executed. */
  action:    string;
  total:     number;
  succeeded: number;
  failed:    number;
  /** Per-record breakdown. May be empty for endpoints that only return counts. */
  records: Array<{
    id:           string;
    status:       "success" | "skipped" | "denied" | "requires_workflow" | "error";
    reason?:      string;
    policyAction?:"allow" | "deny" | "warn" | "require_workflow" | "escalate";
  }>;
  /** UI-friendly summary block. */
  summary: {
    success:           number;
    skipped:           number;
    denied:            number;
    requiresWorkflow:  number;
    error:             number;
  };
}

/**
 * Injectable client. App shells construct one from their RecordsClient and
 * pass it to the engine (via provider or hook arg). The engine never calls
 * `fetch` directly.
 */
export interface BulkClient {
  preflight: (entityCode: string, body: BulkActionRequest) => Promise<BulkPreflightResult>;
  action:    (entityCode: string, body: BulkActionRequest) => Promise<BulkActionResult>;
  /** Multi-field PATCH (e.g. Mass Edit). Optional — not all surfaces use it. */
  patch?:    (entityCode: string, body: BulkPatchRequest)  => Promise<NormalizedBulkResult>;
  /** Soft-delete batch. Optional — not all surfaces use it. */
  remove?:   (entityCode: string, body: BulkDeleteRequest) => Promise<NormalizedBulkResult>;
  /** Export selection. Returns a download URL. Optional — not all surfaces use it. */
  export?:   (entityCode: string, body: BulkExportRequest) => Promise<{ downloadUrl: string }>;
}

export interface BulkActionsConfig {
  bulkClient:         BulkClient;
  /** Max IDs per request. Mirrors server BULK_MAX_IDS. Default: 500. */
  maxIds?:            number;
  /** Debounce window for background preflight. Default: 300ms. */
  preflightDebounce?: number;
  /**
   * Above this selection size, background preflight is skipped to avoid
   * firing N parallel requests for huge selections; eligibility is then
   * resolved synchronously at action-click time. Default: 200.
   */
  preflightCap?:      number;
}

export type { BulkActionResult, BulkPreflightResult };
