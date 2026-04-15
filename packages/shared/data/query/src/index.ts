export {
  setClients,
  // Metadata
  useCompiledEntity,
  useEntityOperations,
  useLookupDomain,
  // Records
  useEntityList,
  useEntityDetail,
  useCreateEntity,
  useUpdateEntity,
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
