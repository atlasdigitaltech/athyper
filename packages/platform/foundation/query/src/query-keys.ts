/**
 * @athyper/platform-query — Canonical Query Keys
 *
 * Every hook derives its cache key from this module.
 * The key hierarchy ensures prefix-based invalidation works correctly:
 *   byType(code)         = ["entity", code, "list"]
 *   byTypeFiltered(...)  = ["entity", code, "list", params]   ← prefix of byType
 *
 * Rules:
 *   - Metadata keys are long-lived (5–10 min stale).
 *   - List keys share a stable prefix so entity-level invalidation
 *     (`invalidateQueries({ queryKey: entityList.byType(code) })`) clears
 *     both unfiltered and filtered variants via prefix matching.
 *   - Never use raw string arrays in hooks — always reference this module.
 */

export const queryKeys = {
  // ── Metadata ──────────────────────────────────────────────────────────────
  compiledEntity: {
    all:    ["meta", "compiled"] as const,
    byCode: (code: string) => ["meta", "compiled", code] as const,
  },
  catalogEntity: {
    all:    ["meta", "catalog"] as const,
    byCode: (code: string) => ["meta", "catalog", code] as const,
  },
  entityOperations: {
    byEntity: (entity: string) => ["meta", "operations", entity] as const,
  },
  lookupDomain: {
    all:    ["meta", "lookup"] as const,
    byCode: (code: string) => ["meta", "lookup", code] as const,
  },
  statusRoute: {
    byEntity: (entity: string) => ["meta", "status-route", entity] as const,
  },
  capabilities: {
    byEntity: (entity: string) => ["meta", "capabilities", entity] as const,
  },
  entityFlow: {
    byCode: (entityCode: string, trigger: string) =>
      ["meta", "flow", entityCode, trigger] as const,
  },

  // ── Records ───────────────────────────────────────────────────────────────
  entityList: {
    // Prefix — invalidating this key clears filtered variants too.
    byType:         (code: string) =>
      ["entity", code, "list"] as const,
    byTypeFiltered: (code: string, params: Record<string, unknown>) =>
      ["entity", code, "list", params] as const,
  },
  entityDetail: {
    byId: (code: string, id: string) => ["entity", code, "detail", id] as const,
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  documentList: {
    byType:         (docType: string) =>
      ["doc", docType, "list"] as const,
    byTypeFiltered: (docType: string, params: Record<string, unknown>) =>
      ["doc", docType, "list", params] as const,
  },
  documentDetail: {
    byId: (docType: string, id: string) => ["doc", docType, "detail", id] as const,
  },
  documentBundle: {
    byId: (docType: string, id: string) => ["doc", docType, "bundle", id] as const,
  },

  // ── Workflow ──────────────────────────────────────────────────────────────
  workflowInbox: {
    all:   ["workflow", "inbox"] as const,
    count: ["workflow", "inbox", "count"] as const,
  },
  approvalContext: {
    byRequest: (requestId: string) =>
      ["workflow", "approval-context", requestId] as const,
  },
  workflowActivity: {
    byRequest: (requestId: string) =>
      ["workflow", "activity", requestId] as const,
  },
  recentActivity: {
    byLimit: (limit: number) => ["workflow", "recent-activity", limit] as const,
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    all:         ["notifications"] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },

  // ── Saved Views ───────────────────────────────────────────────────────────
  savedViews: {
    byEntity: (entityCode: string) => ["saved-views", entityCode] as const,
  },

  // ── Collaboration ─────────────────────────────────────────────────────────
  collab: {
    comments: (entityType: string, entityId: string) =>
      ["collab", "comments", entityType, entityId] as const,
    replies: (parentId: string) =>
      ["collab", "replies", parentId] as const,
    timeline: (entityType?: string, entityId?: string) =>
      ["collab", "timeline", entityType ?? "", entityId ?? ""] as const,
    reactions: (commentId: string) =>
      ["collab", "reactions", commentId] as const,
    draft: (entityType: string, entityId: string, parentCommentId?: string) =>
      ["collab", "draft", entityType, entityId, parentCommentId ?? ""] as const,
    unreadCount: (entityType: string, entityId: string) =>
      ["collab", "unread-count", entityType, entityId] as const,
    bookmarks: ["collab", "bookmarks"] as const,
    batchCount: (entityCode: string, batchKey: string) =>
      ["collab", "comment-counts", entityCode, batchKey] as const,
  },

  // ── Submit Preflight ──────────────────────────────────────────────────────
  submitPreflight: {
    byRecord: (entityCode: string, recordId: string) =>
      ["submit-preflight", entityCode, recordId] as const,
  },
};
