/**
 * @athyper/runtime-bulk-actions
 *
 * Entity-aware bulk action engine. Extracted from EntityListPage's
 * BulkActionDialog so any selection-bearing surface can consume it.
 *
 * Layer 2 of the three-layer floating-selection-bar architecture:
 *   - Layer 1: @athyper/ui FloatingSelectionBar (pure UI)
 *   - Layer 2: @athyper/runtime-bulk-actions    (this package)
 *   - Layer 3: surface adapters                 (EntityBulkActionBar, etc.)
 */

export {
  RuntimeBulkActionsProvider,
  useBulkActionsConfig,
  type RuntimeBulkActionsProviderProps,
} from "./provider";

export {
  BULK_MAX_IDS,
  type BulkActionRequest,
  type BulkActionsConfig,
  type BulkActionResult,
  type BulkClient,
  type BulkDeleteRequest,
  type BulkExportRequest,
  type BulkPatchRequest,
  type BulkPreflightResult,
  type NormalizedBulkResult,
} from "./types";

export {
  fromBulkActionResult,
  fromBulkCrudResult,
  type BulkCrudResult,
} from "./normalize";

export {
  useBulkPreflight,
  type UseBulkPreflightArgs,
} from "./use-bulk-preflight";

export {
  useBulkActionRunner,
  type BulkPhase,
  type BulkRunnerState,
  type UseBulkActionRunnerArgs,
} from "./use-bulk-action-runner";

export {
  bulkActionCode,
  filterBulkOperations,
  mapOperationsToActions,
  type MapOperationsToActionsOptions,
} from "./map-operations-to-actions";

export { BulkConfirmDialog, type BulkConfirmDialogProps } from "./bulk-confirm-dialog";
export { BulkResultDialog,  type BulkResultDialogProps  } from "./bulk-result-dialog";
