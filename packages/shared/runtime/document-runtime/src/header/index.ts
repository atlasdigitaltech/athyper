export { DocumentHeader, type DocumentHeaderProps, type MetadataCluster } from "./DocumentHeader";
export {
  ApprovableDocumentHeader,
  type ApprovableDocumentHeaderProps,
  type ApprovableDocumentHeaderTab,
} from "./ApprovableDocumentHeader";
export { useHeaderModePreference } from "./useHeaderModePreference";
export { buildApprovableHeaderFromRecord } from "./buildApprovableHeaderFromRecord";
export { mapDocumentHeaderModel, buildDocumentHeaderModel, type MapDocumentHeaderModelOpts } from "./mapDocumentHeaderModel";
export type {
  ApprovableDocumentHeaderDTO,
  ApprovableIdentity,
  ApprovableParty,
  ApprovableMoney,
  ApprovableDates,
  ApprovableDueMeta,
  ApprovableReference,
  ApprovableFlowStep,
  ApprovableAction,
  HeaderMode,
  ProgressStage,
  ProgressRail,
} from "./types";
