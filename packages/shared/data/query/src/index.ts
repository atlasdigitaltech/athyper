export {
  setClients,
  // Metadata
  useCompiledEntity,
  useEntityOperations,
  useLookupDomain,
  useStatusRoute,
  useEntityFlow,
  // Records
  useEntityList,
  useEntityDetail,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useEntityCapabilities,
  // Documents
  useDocumentList,
  useDocumentDetail,
  useCreateDocument,
  useDocumentStatusTransition,
  // Workflow
  useInbox,
  useInboxCount,
  useApprovalContext,
  useSubmitWorkflowAction,
  useWorkflowActivity,
  // Notifications
  useNotifications,
  useUnreadCount,
  // Saved Views
  useSavedViews,
  useSaveView,
  useUpdateView,
} from "./hooks";

export { useRecordBookmarks } from "./hooks/useRecordBookmarks";
export { useCommentCounts } from "./hooks/useCommentCounts";
export { useFilterPresets, type FilterPreset } from "./hooks/useFilterPresets";

export {
  // Collab
  useComments,
  useTimeline,
  useReactions,
  useCommentActions,
  useDraft,
  useCollabUnreadCount,
  // Collab types
  type EntityComment,
  type ReactionSummary,
  type TimelineEntry,
  type UseCommentsOptions,
  type UseTimelineOptions,
} from "./hooks/collab";
