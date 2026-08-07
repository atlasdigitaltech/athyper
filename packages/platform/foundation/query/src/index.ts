/**
 * @athyper/platform-query
 *
 * TanStack Query (React Query v5) hooks for all platform domains.
 * Wraps @athyper/platform-api-client with cache management,
 * background revalidation, and optimistic mutations.
 *
 * Boot sequence (call once at app root):
 *   import { setClients, createPlatformQueryClient } from "@athyper/platform-query";
 *   setClients({ metadata, records, documents, workflow, platform, collab });
 *   const queryClient = createPlatformQueryClient({ onError: captureException });
 *
 * On token refresh:
 *   import { refreshClients } from "@athyper/platform-query";
 *   refreshClients({ ...rebuiltClients });
 */

// ── Boot ──────────────────────────────────────────────────────────────────────
export { setClients, refreshClients, type ClientBag } from "./client-store";
export { createPlatformQueryClient, type PlatformQueryClientOptions } from "./query-client";
export { queryKeys } from "./query-keys";

// ── Metadata ──────────────────────────────────────────────────────────────────
export {
  useCompiledEntity,
  useCatalogEntity,
  useEntityOperations,
  useLookupDomain,
  useStatusRoute,
  useEntityCapabilities,
  useEntityFlow,
} from "./hooks/metadata";

// ── Records ───────────────────────────────────────────────────────────────────
export {
  useEntityList,
  useEntityDetail,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "./hooks/records";

// ── Documents ─────────────────────────────────────────────────────────────────
export {
  useDocumentList,
  useDocumentDetail,
  useDocumentBundle,
  useCreateDocument,
  useDocumentStatusTransition,
} from "./hooks/documents";

// ── Workflow ──────────────────────────────────────────────────────────────────
export {
  useInbox,
  useInboxCount,
  useApprovalContext,
  useSubmitWorkflowAction,
  useWorkflowActivity,
  useRecentActivity,
} from "./hooks/workflow";

// ── Notifications ─────────────────────────────────────────────────────────────
export {
  useNotifications,
  useUnreadCount,
} from "./hooks/notifications";

// ── Saved Views ───────────────────────────────────────────────────────────────
export {
  useSavedViews,
  useSaveView,
  useUpdateView,
} from "./hooks/saved-views";

// ── Edit Lock ─────────────────────────────────────────────────────────────────
export {
  useEditLock,
  type EditLockState,
  type UseEditLockOptions,
} from "./hooks/edit-lock";

// ── Collaboration ─────────────────────────────────────────────────────────────
export {
  useComments,
  useTimeline,
  useReactions,
  useCommentActions,
  useDraft,
  useCollabUnreadCount,
  type EntityComment,
  type ReactionSummary,
  type TimelineEntry,
  type UseCommentsOptions,
  type UseTimelineOptions,
} from "./hooks/collab";

// ── Bookmarks ─────────────────────────────────────────────────────────────────
export {
  useRecordBookmarks,
  useBookmarksList,
  type BookmarkSnapshot,
  type BookmarkListItem,
  type BookmarkListGroup,
} from "./hooks/bookmarks";

// ── Comment Counts ────────────────────────────────────────────────────────────
export {
  useCommentCounts,
  type CommentCountEntry,
} from "./hooks/comment-counts";

// ── Recent Items ──────────────────────────────────────────────────────────────
export {
  useRecentItems,
  recordRecentVisit,
  type RecentItem,
} from "./hooks/recent-items";

// ── Submit Preflight ──────────────────────────────────────────────────────────
export {
  useSubmitPreflight,
  type SubmitPreflightIssue,
  type SubmitPreflightResult,
} from "./hooks/submit-preflight";
