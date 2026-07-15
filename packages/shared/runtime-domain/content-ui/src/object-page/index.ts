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
} from "./use-scroll-intent";

export {
  useDocumentScrollSpy,
  type UseDocumentScrollSpyOptions,
  type UseDocumentScrollSpyReturn,
} from "./use-document-scroll-spy";

export {
  useDocumentPageController,
  type UseDocumentPageControllerOptions,
  type UseDocumentPageControllerReturn,
} from "./use-document-page-controller";

export {
  usePinOnScroll,
  type UsePinOnScrollOptions,
} from "./use-pin-on-scroll";

export {
  DocumentSection,
  type DocumentSectionProps,
} from "./document-section";

export {
  DocumentObjectPage,
  type DocumentObjectPageProps,
} from "./document-object-page";

export {
  DocumentSectionSkeleton,
  type DocumentSectionSkeletonProps,
} from "./document-section-skeleton";

export {
  useLazyDocumentSections,
  type UseLazyDocumentSectionsOptions,
  type UseLazyDocumentSectionsReturn,
} from "./use-lazy-document-sections";

export {
  EditDraftProvider,
  useEditDraftContext,
  useLineEditState,
  type EditDraftProviderProps,
} from "./edit-draft-context";

export {
  useDocumentEditDraft,
  type UseDocumentEditDraftOptions,
  type UseDocumentEditDraftReturn,
  type DocumentSaveStatus,
  type DocumentEditDraftLoadCallback,
  type DocumentEditDraftSaveCallback,
  type DocumentEditDraftSaveOutcome,
  type DocumentEditDraftSaveResult,
  type DocumentEditDraftConflictResult,
  type DocumentEditDraftValidationResult,
  type DocumentEditDraftNetworkErrorResult,
} from "./use-document-edit-draft";

export {
  useDocumentDirtyMap,
  type UseDocumentDirtyMapOptions,
  type UseDocumentDirtyMapReturn,
} from "./use-document-dirty-map";
