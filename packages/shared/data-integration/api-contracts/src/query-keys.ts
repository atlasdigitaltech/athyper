/**
 * @athyper/api-contracts — Query Key Factories
 *
 * Canonical TanStack Query key factories. Every query in the application
 * MUST use these factories for consistent cache invalidation.
 *
 * Invalidation targets (from ADR-005):
 *   Descriptor recompile → invalidate compiledEntity, entityList, entityOperations, lifecycleRoute
 */

export interface SecurityScopedQueryIdentity {
  tenantId: string;
  planeKey?: string;
  realmKey?: string;
  effectivePrincipal: string;
  permissionStamp: string;
}

export const queryKeys = {
  // ── Metadata ──────────────────────────────────────────────
  compiledEntity: {
    all: ["compiled-entity"] as const,
    byCode: (code: string) => ["compiled-entity", code] as const,
    securityScoped: (code: string, scope: SecurityScopedQueryIdentity) => [
      "compiled-entity",
      scope.tenantId,
      scope.planeKey ?? "",
      scope.realmKey ?? "",
      scope.effectivePrincipal,
      scope.permissionStamp,
      code,
    ] as const,
  },
  catalogEntity: {
    all: ["catalog-entity"] as const,
    byCode: (code: string) => ["catalog-entity", code] as const,
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

  /**
   * Canonical cache namespace for a record object page. `cacheScopeKey` is
   * produced by the effective workspace-manifest resolver and already varies
   * by tenant, principal, permission stamp, descriptor, record and record
   * state. Keeping it in every key prevents data crossing an authorization or
   * lifecycle boundary while the explicit entity/record parts retain useful
   * prefix invalidation and readable query diagnostics.
   */
  recordWorkspace: {
    all: ["record-workspace"] as const,
    root: (input: RecordWorkspaceKeyInput) => [
      "record-workspace",
      input.entityCode,
      input.recordId,
      input.cacheScopeKey,
    ] as const,
    manifest: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "manifest",
    ] as const,
    recordCore: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "record-core",
    ] as const,
    processState: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "process-state",
    ] as const,
    approvals: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "approvals",
    ] as const,
    lifecycleTimeline: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "lifecycle-timeline",
    ] as const,
    snapshotsRoot: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "snapshots",
    ] as const,
    snapshots: (input: RecordWorkspaceKeyInput, params?: RecordWorkspaceCollectionParams) => [
      ...queryKeys.recordWorkspace.snapshotsRoot(input),
      canonicalRecordWorkspaceParams(params),
    ] as const,
    snapshot: (input: RecordWorkspaceKeyInput, snapshotId: string) => [
      ...queryKeys.recordWorkspace.root(input),
      "snapshot",
      snapshotId,
    ] as const,
    snapshotCompareRoot: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "snapshot-compare",
    ] as const,
    snapshotCompare: (
      input: RecordWorkspaceKeyInput,
      leftSnapshotId: string,
      rightSnapshotId: string,
    ) => [
      ...queryKeys.recordWorkspace.snapshotCompareRoot(input),
      leftSnapshotId,
      rightSnapshotId,
    ] as const,
    auditLog: (input: RecordWorkspaceKeyInput, params?: RecordWorkspaceCollectionParams) => [
      ...queryKeys.recordWorkspace.root(input),
      "audit-log",
      canonicalRecordWorkspaceParams(params),
    ] as const,
    childCollection: (
      input: RecordWorkspaceKeyInput,
      collectionKey: string,
      params?: RecordWorkspaceCollectionParams,
    ) => [
      ...queryKeys.recordWorkspace.childCollectionRoot(input, collectionKey),
      canonicalRecordWorkspaceParams(params),
    ] as const,
    childCollectionRoot: (
      input: RecordWorkspaceKeyInput,
      collectionKey: string,
    ) => [
      ...queryKeys.recordWorkspace.childCollectionsRoot(input),
      collectionKey,
    ] as const,
    childCollectionsRoot: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "child-collection",
    ] as const,
    comments: (input: RecordWorkspaceKeyInput, params?: RecordWorkspaceCollectionParams) => [
      ...queryKeys.recordWorkspace.root(input),
      "comments",
      canonicalRecordWorkspaceParams(params),
    ] as const,
    commentSummary: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "comments-summary",
    ] as const,
    commentEnrichment: (input: RecordWorkspaceKeyInput, commentIds: readonly string[]) => [
      ...queryKeys.recordWorkspace.root(input),
      "comments-enrichment",
      [...new Set(commentIds)].sort(),
    ] as const,
    attachments: (input: RecordWorkspaceKeyInput, params?: RecordWorkspaceCollectionParams) => [
      ...queryKeys.recordWorkspace.root(input),
      "attachments",
      canonicalRecordWorkspaceParams(params),
    ] as const,
    attachmentWorkspace: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "attachment-workspace",
    ] as const,
    attachmentFolders: (input: RecordWorkspaceKeyInput) => [
      ...queryKeys.recordWorkspace.root(input),
      "attachment-folders",
    ] as const,
    activity: (input: RecordWorkspaceKeyInput, params?: RecordWorkspaceCollectionParams) => [
      ...queryKeys.recordWorkspace.root(input),
      "activity",
      canonicalRecordWorkspaceParams(params),
    ] as const,
    support: (input: RecordWorkspaceKeyInput, supportKey: string) => [
      ...queryKeys.recordWorkspace.root(input),
      "support",
      supportKey,
    ] as const,
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
  /**
   * Canonical cache keys for the document edit runtime. These keys are shared
   * by OPEN hydration, coordinator selectors, deferred node hydration, and
   * event-driven invalidation; document surfaces must not create their own
   * transport-specific key families.
   */
  documentWorkspace: {
    root: (input: DocumentWorkspaceKeyInput) => [
      "document-workspace",
      input.tenantId,
      input.entityCode,
      input.documentId,
      input.projectionHash,
    ] as const,
    core: (input: DocumentWorkspaceKeyInput, documentVersion: string) => [
      ...queryKeys.documentWorkspace.root(input),
      "core",
      documentVersion,
    ] as const,
    rules: (input: DocumentWorkspaceKeyInput, documentVersion: string) => [
      ...queryKeys.documentWorkspace.root(input),
      "rules",
      documentVersion,
    ] as const,
    node: (input: DocumentWorkspaceKeyInput, nodeKey: string, options: DocumentWorkspaceNodeKeyOptions = {}) => [
      ...queryKeys.documentWorkspace.root(input),
      "node",
      nodeKey,
      options.nodeVersion ?? null,
      canonicalDocumentWorkspaceParentIds(options.parentIds),
      options.cursor ?? null,
      options.filterHash ?? null,
      options.ordering ?? null,
    ] as const,
    summary: (input: DocumentWorkspaceKeyInput, summaryKey: string, documentVersion: string) => [
      ...queryKeys.documentWorkspace.root(input),
      "summary",
      summaryKey,
      documentVersion,
    ] as const,
    descriptor: (input: Pick<DocumentWorkspaceKeyInput, "tenantId" | "projectionHash">, descriptorHash: string) => [
      "document-workspace-descriptor",
      input.tenantId,
      input.projectionHash,
      descriptorHash,
    ] as const,
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

export interface DocumentWorkspaceKeyInput {
  tenantId: string;
  entityCode: string;
  documentId: string;
  /** Authorization-scoped cache discriminator, never a user display value. */
  projectionHash: string;
}

export interface RecordWorkspaceKeyInput {
  entityCode: string;
  recordId: string;
  /** Opaque authorization- and record-state-sensitive key from the manifest. */
  cacheScopeKey: string;
}

export type RecordWorkspaceCollectionParamValue = string | number | boolean | null;
export type RecordWorkspaceCollectionParams = Readonly<Record<string, RecordWorkspaceCollectionParamValue>>;

/**
 * TanStack hashes object keys deterministically, but normalizing here also
 * makes serialized diagnostics and adapter tests stable across callers.
 */
export function canonicalRecordWorkspaceParams(
  params: RecordWorkspaceCollectionParams | undefined,
): RecordWorkspaceCollectionParams {
  if (!params) return {};
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export interface DocumentWorkspaceNodeKeyOptions {
  nodeVersion?: string;
  parentIds?: readonly string[];
  cursor?: string | null;
  filterHash?: string | null;
  ordering?: string | null;
}

/**
 * Parent-ID order is not semantically meaningful for multi-parent hydration.
 * Canonicalizing here prevents separate caches and duplicate requests for the
 * same parent set requested by different surfaces.
 */
export function canonicalDocumentWorkspaceParentIds(parentIds: readonly string[] | undefined): string[] {
  if (!parentIds || parentIds.length === 0) return [];
  return [...new Set(parentIds.map((id) => id.toLowerCase()))].sort();
}
