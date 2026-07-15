/**
 * Result normalisation.
 *
 * `bulk-action` returns rich per-record entries (`{id,status,reason,policyAction}`)
 * with a top-level `summary` block. `bulk-crud` (used for PATCH/DELETE) returns
 * a leaner counts-only shape (`{succeeded, failed, rows:[{id,success,error?}]}`).
 *
 * Surfaces always work with `NormalizedBulkResult`. Adapter functions below
 * widen either response into that shape.
 */

import type { BulkActionResult } from "@athyper/api-contracts/entity-list";
import type { NormalizedBulkResult } from "./types";

export function fromBulkActionResult(
  res: BulkActionResult,
): NormalizedBulkResult {
  return {
    action:    res.action,
    total:     res.total,
    succeeded: res.succeeded,
    failed:    res.failed,
    records:   res.records.map((r) => ({
      id:           r.id,
      status:       r.status,
      reason:       r.reason,
      policyAction: r.policyAction,
    })),
    summary:   { ...res.summary },
  };
}

/**
 * `bulk-crud` PATCH/DELETE result shape (server returns this directly).
 * Per [bulk-crud.route.ts](../../../../server/packages/services/records/routes/bulk-crud.route.ts).
 */
export interface BulkCrudResult {
  ok:        boolean;
  succeeded: number;
  failed:    number;
  rows: Array<{
    id:      string;
    success: boolean;
    error?:  string;
  }>;
}

export function fromBulkCrudResult(
  action: string,
  res: BulkCrudResult,
): NormalizedBulkResult {
  const records = res.rows.map((r) => ({
    id:     r.id,
    status: r.success ? ("success" as const) : ("error" as const),
    reason: r.error,
  }));
  return {
    action,
    total:     res.succeeded + res.failed,
    succeeded: res.succeeded,
    failed:    res.failed,
    records,
    summary: {
      success:           res.succeeded,
      skipped:           0,
      denied:            0,
      requiresWorkflow:  0,
      error:             res.failed,
    },
  };
}
