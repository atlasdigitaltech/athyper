export {
  type DocumentSectionDescriptor,
  type ScrollIntentSource,
  type SectionLoadPolicy,
  getSectionElementId,
  getSectionHash,
} from "./types";

export {
  parseCssVarPx,
  prefersReducedMotion,
  hasScrollEnd,
  composeRegisterSectionRef,
} from "./utils";

export {
  useScrollIntent,
  type UseScrollIntentReturn,
} from "./useScrollIntent";

export {
  useDocumentScrollSpy,
  type UseDocumentScrollSpyOptions,
  type UseDocumentScrollSpyReturn,
} from "./useDocumentScrollSpy";

export {
  useDocumentPageController,
  type UseDocumentPageControllerOptions,
  type UseDocumentPageControllerReturn,
} from "./useDocumentPageController";

export {
  usePinOnScroll,
  type UsePinOnScrollOptions,
} from "./usePinOnScroll";

export {
  DocumentSection,
  type DocumentSectionProps,
} from "./DocumentSection";

export {
  DocumentObjectPage,
  type DocumentObjectPageProps,
} from "./DocumentObjectPage";

export {
  DocumentSectionSkeleton,
  type DocumentSectionSkeletonProps,
} from "./DocumentSectionSkeleton";

export {
  useLazyDocumentSections,
  type UseLazyDocumentSectionsOptions,
  type UseLazyDocumentSectionsReturn,
} from "./useLazyDocumentSections";

export {
  EditSessionProvider,
  useEditSessionContext,
  useLineEditState,
  type EditSessionProviderProps,
} from "./EditSessionContext";

export {
  useDocumentChangeStream,
  type UseDocumentChangeStreamOptions,
  type DocumentChangeEvent,
  type DocumentChangeEventType,
} from "./useDocumentChangeStream";

export {
  useDocumentEditSession,
  type UseDocumentEditSessionOptions,
  type UseDocumentEditSessionReturn,
  type DocumentSaveStatus,
  type DocumentEditSessionLoadCallback,
  type DocumentEditSessionSaveCallback,
  type DocumentEditSessionSaveOutcome,
  type DocumentEditSessionSaveResult,
  type DocumentEditSessionConflictResult,
  type DocumentEditSessionValidationResult,
  type DocumentEditSessionNetworkErrorResult,
} from "./useDocumentEditSession";

export {
  useDocumentDirtyMap,
  type UseDocumentDirtyMapOptions,
  type UseDocumentDirtyMapReturn,
} from "./useDocumentDirtyMap";
