/**
 * @athyper/api-contracts — Query Key Factories
 *
 * Canonical TanStack Query key factories. Every query in the application
 * MUST use these factories for consistent cache invalidation.
 *
 * Invalidation targets (from ADR-005):
 *   Descriptor recompile → invalidate compiledEntity, entityList, entityOperations, lifecycleRoute
 */

export const queryKeys = {
  // ── Metadata ──────────────────────────────────────────────
  compiledEntity: {
    all: ["compiled-entity"] as const,
    byCode: (code: string) => ["compiled-entity", code] as const,
  },
  entityOperations: {
    all: ["entity-operations"] as const,
    byEntity: (name: string) => ["entity-operations", name] as const,
  },
  lifecycleRoute: {
    all: ["lifecycle-route"] as const,
    byEntity: (name: string) => ["lifecycle-route", name] as const,
  },
  statusRoute: {
    all: ["status-route"] as const,
    byEntity: (name: string) => ["status-route", name] as const,
  },

  // ── Lookups ───────────────────────────────────────────────
  lookupDomain: {
    all: ["lookup-domain"] as const,
    byCode: (code: string) => ["lookup-domain", code] as const,
    hotSet: ["lookup-domain", "hot-set"] as const,
  },

  // ── Master Records ────────────────────────────────────────
  entityList: {
    all: ["entity-list"] as const,
    byType: (code: string) => ["entity-list", code] as const,
    byTypeFiltered: (code: string, filters: Record<string, unknown>) =>
      ["entity-list", code, filters] as const,
  },
  entityDetail: {
    byId: (code: string, id: string) => ["entity-detail", code, id] as const,
  },

  // ── Documents ─────────────────────────────────────────────
  documentList: {
    all: ["document-list"] as const,
    byType: (type: string) => ["document-list", type] as const,
  },
  documentDetail: {
    byId: (type: string, id: string) => ["document-detail", type, id] as const,
  },
  documentLines: {
    byDocument: (type: string, id: string) => ["document-lines", type, id] as const,
  },

  // ── Ledger ────────────────────────────────────────────────
  journalEntries: {
    all: ["journal-entries"] as const,
  },
  postingLines: {
    byJournal: (id: string) => ["posting-lines", id] as const,
    byEntity: (type: string, id: string) => ["posting-lines", type, id] as const,
  },
  balances: {
    byAccount: (id: string) => ["balances", id] as const,
  },

  // ── Workflow ──────────────────────────────────────────────
  workflowInbox: {
    all: ["workflow-inbox"] as const,
    count: ["workflow-inbox", "count"] as const,
  },
  approvalContext: {
    byRequest: (requestId: string) => ["approval-context", requestId] as const,
  },
  workflowActivity: {
    byRequest: (requestId: string) => ["workflow-activity", requestId] as const,
  },

  // ── Dashboard ─────────────────────────────────────────────
  dashboard: {
    byWorkbench: (code: string) => ["dashboard", code] as const,
    widgetData: (id: string) => ["dashboard", "widget", id] as const,
  },

  // ── Saved Views ───────────────────────────────────────────
  savedViews: {
    byEntity: (code: string) => ["saved-views", code] as const,
  },

  // ── Navigation ────────────────────────────────────────────
  moduleTree: { all: ["module-tree"] as const },
  capabilities: {
    byEntity: (name: string) => ["capabilities", name] as const,
  },

  // ── Platform Reference Data ───────────────────────────────
  // shared.* ISO/code-list tables. staleTime = 1 hour (seeded, rarely changes).
  ref: {
    currencies:           (opts?: Record<string, unknown>) => ["ref", "currencies",           opts ?? {}] as const,
    countries:            (opts?: Record<string, unknown>) => ["ref", "countries",            opts ?? {}] as const,
    stateRegions:         (country: string, opts?: Record<string, unknown>) => ["ref", "state-regions", country, opts ?? {}] as const,
    languages:            (opts?: Record<string, unknown>) => ["ref", "languages",            opts ?? {}] as const,
    locales:              (opts?: Record<string, unknown>) => ["ref", "locales",              opts ?? {}] as const,
    timezones:            (opts?: Record<string, unknown>) => ["ref", "timezones",            opts ?? {}] as const,
    uom:                  (opts?: Record<string, unknown>) => ["ref", "uom",                  opts ?? {}] as const,
    // admin tier
    workspaces:           (opts?: Record<string, unknown>) => ["ref", "workspaces",           opts ?? {}] as const,
    modules:              (opts?: Record<string, unknown>) => ["ref", "modules",              opts ?? {}] as const,
    personas:             (opts?: Record<string, unknown>) => ["ref", "personas",             opts ?? {}] as const,
    permissionCategories: (opts?: Record<string, unknown>) => ["ref", "permission-categories", opts ?? {}] as const,
    permissions:          (opts?: Record<string, unknown>) => ["ref", "permissions",          opts ?? {}] as const,
    roles:                (opts?: Record<string, unknown>) => ["ref", "roles",                opts ?? {}] as const,
  },

  // ── Notifications ─────────────────────────────────────────
  notifications: {
    all: ["notifications"] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },

  // ── Collaboration ─────────────────────────────────────────
  collab: {
    bookmarks: ["collab", "bookmarks"] as const,
    comments: (entityType: string, entityId: string) =>
      ["collab", "comments", entityType, entityId] as const,
    replies: (commentId: string) =>
      ["collab", "replies", commentId] as const,
    reactions: (commentId: string) =>
      ["collab", "reactions", commentId] as const,
    draft: (entityType: string, entityId: string, parentId?: string) =>
      ["collab", "draft", entityType, entityId, parentId ?? null] as const,
    timeline: (entityType?: string, entityId?: string) =>
      ["collab", "timeline", entityType ?? null, entityId ?? null] as const,
    unreadCount: (entityType: string, entityId: string) =>
      ["collab", "unread", entityType, entityId] as const,
  },

  // ── Cross-entity search (Meilisearch) ──────────────────────
  search: {
    all: ["search"] as const,
    global: (params: {
      q:            string;
      entity_type?: string;
      page?:        number;
      page_size?:   number;
      sort?:        "relevance" | "updated_desc" | "title_asc";
    }) => ["search", "global", params] as const,
  },
} as const;
