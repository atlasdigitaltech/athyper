/**
 * @athyper/runtime-canvas/document-runtime
 *
 * Sprint 3 + 4 + 5 exports.
 */

// Sprint 3 — hooks
export {
  useDocumentChildren,
  type UseDocumentChildrenOptions,
  type DocumentChildBindings,
  type DocumentChildRelations,
  type DocumentChildrenResult,
} from "./use-document-children";

export {
  useDocumentLookup,
  type UseDocumentLookupOptions,
  type DocumentLookupResult,
} from "./use-document-lookup";

// Phase 2b — generic Components controller (sourceDocType-parameterized).
// Wraps the pricing-component-actions helpers + lookup loading so PO/Payment
// surfaces don't have to repeat the six-lookup + three-action ceremony.
export {
  useDocumentComponentsController,
  type DocumentComponentLookupCodes,
  type UseDocumentComponentsControllerOptions,
  type DocumentComponentsControllerResult,
} from "./use-document-components-controller";

// Sprint 4 — rules + affordance
export {
  useDocumentRules,
  type FieldRule,
  type ActionRule,
  type DocumentRuleSet,
  type UseDocumentRulesOptions,
  type DocumentRulesResult,
} from "./use-document-rules";

export {
  useDocumentAffordance,
  resolveDocumentAffordance,
  type ActionAffordance,
  type LifecycleStateMask,
  type PermissionSet,
  type UseDocumentAffordanceOptions,
} from "./use-document-affordance";

export {
  markDocumentEditPerformance,
  markDocumentEditPerformanceOnce,
  markDocumentEditPerformanceWithReason,
} from "./document-edit-performance-marks";

// Sprint 5 — registries + provider
export {
  registerPostingStrategy,
  unregisterPostingStrategy,
  resolvePostingStrategy,
  listMissingPostingStrategies,
  type PostingStrategyHandle,
} from "./strategy-registry";

export { aggregateToolbarActions } from "./action-registry";

export {
  DocumentRuntimeContextProvider,
  useDocumentRuntimeContext,
  useOptionalDocumentRuntimeContext,
  type DocumentRuntimeContextValue,
  type DocumentRuntimeContextProviderProps,
  type DocumentRuntimeConflict,
} from "./document-runtime-context";

export {
  DocumentEditCoordinatorProvider,
  useDocumentEditCoordinator,
  useOptionalDocumentEditCoordinator,
  useDocumentEditCore,
  useDocumentEditSection,
  useOptionalDocumentEditSection,
  useDocumentAddressDataProvider,
  buildDocumentEditEndpoints,
  buildDocumentEditCoreQueryKey,
  buildDocumentEditSectionQueryKey,
  buildDocumentEditAddressQueryKey,
  isDocumentEditSectionAutoLoad,
  fetchDocumentEditCore,
  fetchDocumentEditOpen,
  fetchDocumentEditSection,
  resolveDocumentEditFieldChange,
  applyDocumentEditReaction,
  incrementDocumentEditTelemetryCounter,
  readDocumentEditTelemetryCounters,
  type DocumentEditCoordinatorIdentity,
  type DocumentEditCoordinatorEndpoints,
  type DocumentEditCoordinatorProps,
  type DocumentEditCoordinatorValue,
  type DocumentEditFetch,
  type DocumentEditOpenResult,
  type DocumentEditTransport,
  type DocumentEditSectionEntry,
  type DocumentEditSectionQueryOptions,
} from "./document-edit-coordinator";
