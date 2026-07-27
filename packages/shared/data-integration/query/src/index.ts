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
  useRecentActivity,
  // Notifications
  useNotifications,
  useUnreadCount,
  // Saved Views
  useSavedViews,
  useSaveView,
  useUpdateView,
} from "./hooks";

export {
  useRecordBookmarks,
  useBookmarksList,
  type BookmarkSnapshot,
  type BookmarkListItem,
  type BookmarkListGroup,
  type BookmarkRequest,
} from "./hooks/use-record-bookmarks";
export { useCommentCounts } from "./hooks/use-comment-counts";
export { useFilterPresets, type FilterPreset } from "./hooks/use-filter-presets";
export { useRecentItems, recordRecentVisit, type RecentItem } from "./hooks/use-recent-items";
export {
  useSubmitPreflight,
  type SubmitPreflightIssue,
  type SubmitPreflightResult,
} from "./hooks/use-submit-preflight";

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
