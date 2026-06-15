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
  type DocumentChildrenResult,
} from "./useDocumentChildren";

export {
  useDocumentLookup,
  type UseDocumentLookupOptions,
  type DocumentLookupResult,
} from "./useDocumentLookup";

// Sprint 4 — rules + affordance
export {
  useDocumentRules,
  type FieldRule,
  type ActionRule,
  type DocumentRuleSet,
  type UseDocumentRulesOptions,
  type DocumentRulesResult,
} from "./useDocumentRules";

export {
  useDocumentAffordance,
  resolveDocumentAffordance,
  type ActionAffordance,
  type LifecycleStateMask,
  type PermissionSet,
  type UseDocumentAffordanceOptions,
} from "./useDocumentAffordance";

// Sprint 5 — registries + provider
export {
  registerHeaderComposer,
  unregisterHeaderComposer,
  resolveHeaderComposer,
  listMissingHeaderComposers,
  type DocumentHeaderComposer,
  type DocumentHeaderComposerInput,
  type DocumentHeaderComposerOutput,
} from "./composer-registry";

export {
  registerSidecar,
  unregisterSidecar,
  resolveSidecar,
  listMissingSidecars,
  type SidecarRenderer,
} from "./sidecar-registry";

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
} from "./DocumentRuntimeContext";
