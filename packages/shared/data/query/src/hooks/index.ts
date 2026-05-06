/**
 * @athyper/query — React Query Hooks
 *
 * Wraps api-client methods with TanStack Query for:
 *   - declarative cache management
 *   - background revalidation
 *   - loading/error states
 *
 * All hooks use canonical query keys from api-contracts/query-keys.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { type CompiledEntity, type LookupDomainBundle, type EntityOperation, type StatusRoute, type EntityCapability } from "@athyper/api-contracts/metadata";
import { type MasterRecord } from "@athyper/api-contracts/records";
import { type InboxItem, type ApprovalAction, type ApprovalContext, type WorkflowEvent, type ActivityEntry } from "@athyper/api-contracts/workflow";
import { type Notification, type SavedView } from "@athyper/api-contracts/platform";
import { type MetadataClient, type RecordsClient, type WorkflowClient, type PlatformClient, type DocumentsClient, type EntityListParams } from "@athyper/api-client";
import { type DocumentDetail, type FlowBundle, type StatusTransitionRequest } from "@athyper/api-contracts/documents";

// ── Client singletons ───────────────────────────────────────────
// Initialized once at app boot via setClients().

let _metadataClient: MetadataClient | null = null;
let _recordsClient: RecordsClient | null = null;
let _workflowClient: WorkflowClient | null = null;
let _platformClient: PlatformClient | null = null;
let _documentsClient: DocumentsClient | null = null;

export function setClients(
  metadata: MetadataClient,
  records: RecordsClient,
  workflow?: WorkflowClient,
  platform?: PlatformClient,
  documents?: DocumentsClient,
) {
  _metadataClient = metadata;
  _recordsClient = records;
  if (workflow) _workflowClient = workflow;
  if (platform) _platformClient = platform;
  if (documents) _documentsClient = documents;
}

function meta(): MetadataClient {
  if (!_metadataClient) throw new Error("MetadataClient not initialized. Call setClients() first.");
  return _metadataClient;
}

function records(): RecordsClient {
  if (!_recordsClient) throw new Error("RecordsClient not initialized. Call setClients() first.");
  return _recordsClient;
}

function workflow(): WorkflowClient {
  if (!_workflowClient) throw new Error("WorkflowClient not initialized. Call setClients() with a WorkflowClient first.");
  return _workflowClient;
}

function platform(): PlatformClient {
  if (!_platformClient) throw new Error("PlatformClient not initialized. Call setClients() with a PlatformClient first.");
  return _platformClient;
}

function documents(): DocumentsClient {
  if (!_documentsClient) throw new Error("DocumentsClient not initialized. Call setClients() with a DocumentsClient first.");
  return _documentsClient;
}

// ── Metadata Hooks ──────────────────────────────────────────────

export function useCompiledEntity(entityCode: string) {
  return useQuery<CompiledEntity>({
    queryKey: queryKeys.compiledEntity.byCode(entityCode),
    queryFn: () => meta().getCompiledEntity(entityCode),
    staleTime: 5 * 60 * 1000, // compiled entities change infrequently
  });
}

export function useEntityOperations(entityName: string) {
  return useQuery<EntityOperation[]>({
    queryKey: queryKeys.entityOperations.byEntity(entityName),
    queryFn: () => meta().getEntityOperations(entityName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLookupDomain(domainCode: string, opts?: { enabled?: boolean }) {
  return useQuery<LookupDomainBundle>({
    queryKey: queryKeys.lookupDomain.byCode(domainCode),
    queryFn: () => meta().getLookupDomainBundle(domainCode),
    staleTime: 10 * 60 * 1000,
    enabled: !!domainCode && (opts?.enabled ?? true),
  });
}

export function useStatusRoute(entityName: string) {
  return useQuery<StatusRoute>({
    queryKey: queryKeys.statusRoute.byEntity(entityName),
    queryFn: () => meta().getStatusRoute(entityName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEntityCapabilities(entityName: string) {
  return useQuery<EntityCapability[]>({
    queryKey: queryKeys.capabilities.byEntity(entityName),
    queryFn: () => meta().getEntityCapabilities(entityName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEntityFlow(entityCode: string, trigger: string = "new") {
  return useQuery<FlowBundle | null>({
    queryKey: ["meta", "flow", entityCode, trigger],
    queryFn: () => meta().getEntityFlow(entityCode, trigger),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

// ── Records Hooks ───────────────────────────────────────────────

export function useEntityList(
  entityCode: string,
  params?: EntityListParams,
) {
  // Build a stable, complete cache key from all request params.
  // Sort, filters, search, page, pageSize, and facets all determine unique data.
  const cacheKey = params ? {
    ...(params.q        ? { _q:      params.q                    } : {}),
    ...(params.sort?.length ? { _sort: params.sort.map((s) => `${s.key}:${s.dir}`).join(",") } : {}),
    ...(params.page     ? { _page:   params.page                 } : {}),
    ...(params.pageSize ? { _size:   params.pageSize             } : {}),
    ...(params.facets   ? { _facets: params.facets               } : {}),
    ...(params.filters  ? params.filters                         : {}),
  } : undefined;

  return useQuery({
    queryKey: cacheKey && Object.keys(cacheKey).length > 0
      ? queryKeys.entityList.byTypeFiltered(entityCode, cacheKey)
      : queryKeys.entityList.byType(entityCode),
    queryFn: () => records().list(entityCode, params),
    staleTime: 30 * 1000,
  });
}

export function useEntityDetail(entityCode: string, id: string) {
  return useQuery<MasterRecord>({
    queryKey: queryKeys.entityDetail.byId(entityCode, id),
    queryFn: () => records().get(entityCode, id),
    staleTime: 60 * 1000,
  });
}

// ── Record Mutations ────────────────────────────────────────────

export function useCreateEntity(entityCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => records().create(entityCode, { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
    },
  });
}

export function useUpdateEntity(entityCode: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => records().update(entityCode, id, { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
      queryClient.invalidateQueries({ queryKey: ["activity", entityCode] });
    },
  });
}

export function useDeleteEntity(entityCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => records().remove(entityCode, id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
    },
  });
}

// ── Document Hooks ──────────────────────────────────────────────

export function useDocumentList(docType: string, params?: Record<string, string>) {
  return useQuery<{ data: unknown[]; pagination: unknown }>({
    queryKey: params
      ? [...queryKeys.documentList.byType(docType), params]
      : queryKeys.documentList.byType(docType),
    queryFn: () => documents().list(docType, params),
    staleTime: 30 * 1000,
  });
}

export function useDocumentDetail(docType: string, id: string) {
  return useQuery<DocumentDetail>({
    queryKey: queryKeys.documentDetail.byId(docType, id),
    queryFn: () => documents().get(docType, id),
    staleTime: 60 * 1000,
  });
}

export function useCreateDocument(docType: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => documents().create(docType, { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentList.byType(docType) });
    },
  });
}

export function useDocumentStatusTransition(docType: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StatusTransitionRequest) => documents().transition(docType, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentDetail.byId(docType, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentList.byType(docType) });
    },
  });
}

// ── Workflow Hooks ──────────────────────────────────────────────

export function useInbox(params?: Record<string, string>) {
  return useQuery<{ data: InboxItem[]; pagination: unknown }>({
    queryKey: params
      ? [...queryKeys.workflowInbox.all, params]
      : queryKeys.workflowInbox.all,
    queryFn: () => workflow().getInbox(params),
    staleTime: 30 * 1000,
  });
}

export function useInboxCount() {
  return useQuery<{ count: number }>({
    queryKey: queryKeys.workflowInbox.count,
    queryFn: () => workflow().getInboxCount(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // poll every minute for badge freshness
  });
}

export function useApprovalContext(requestId: string, enabled = true) {
  return useQuery<ApprovalContext>({
    queryKey: queryKeys.approvalContext.byRequest(requestId),
    queryFn: () => workflow().getApprovalContext(requestId),
    staleTime: 30 * 1000,
    enabled: enabled && !!requestId,
  });
}

export function useSubmitWorkflowAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, action }: { workItemId: string; action: ApprovalAction }) =>
      workflow().submitAction(workItemId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowInbox.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowInbox.count });
    },
  });
}

export function useWorkflowActivity(requestId: string, enabled = true) {
  return useQuery<{ items: WorkflowEvent[] }>({
    queryKey: queryKeys.workflowActivity.byRequest(requestId),
    queryFn: () => workflow().getActivity(requestId),
    staleTime: 30 * 1000,
    enabled: enabled && !!requestId,
  });
}

export function useRecentActivity(limit = 20) {
  return useQuery<{ data: ActivityEntry[] }>({
    queryKey: ["activity", "recent", limit],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/relay/api/activity/recent?limit=${limit}`, { signal });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ActivityEntry[] }>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ── Notifications Hooks ─────────────────────────────────────────

export function useNotifications(params?: Record<string, string>) {
  return useQuery<{ data: Notification[] }>({
    queryKey: params
      ? [...queryKeys.notifications.all, params]
      : queryKeys.notifications.all,
    queryFn: () => platform().getNotifications(params),
    staleTime: 30 * 1000,
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: () => platform().getUnreadCount(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ── Saved Views Hooks ───────────────────────────────────────────

export function useSavedViews(entityCode: string) {
  return useQuery<SavedView[]>({
    queryKey: queryKeys.savedViews.byEntity(entityCode),
    queryFn: () => platform().getSavedViews(entityCode),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (view: Omit<SavedView, "id" | "created_by" | "created_at">) =>
      platform().saveSavedView(view),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedViews.byEntity(variables.entity_code),
      });
    },
  });
}

export function useUpdateView(entityCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId, config, name }: { viewId: string; config: SavedView["config"]; name?: string }) =>
      platform().updateSavedView(entityCode, viewId, { config, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedViews.byEntity(entityCode) });
    },
  });
}

// ── Edit Lock Hook ──────────────────────────────────────────────
//
// Manages the full pessimistic-lock lifecycle for a single record:
//   1. acquire()   — POST /:entity/:id/lock; returns lock_token + row_version
//   2. heartbeat   — PUT /:entity/:id/lock/heartbeat every `heartbeatMs` ms
//   3. release()   — DELETE /:entity/:id/lock (idempotent; called on unmount too)
//
// apiFetch must be an auth-aware fetch wrapper that prepends the API base URL
// and injects the Authorization header. Example:
//   (path, init) => fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } })

export interface EditLockState {
  isLocked:   boolean;
  lockToken:  string | null;
  rowVersion: number | null;
  error:      string | null;
}

export interface UseEditLockOptions {
  entityCode:       string;
  recordId:         string;
  apiFetch:         (path: string, init?: RequestInit) => Promise<Response>;
  heartbeatMs?:     number;
  onVersionChange?: (version: number) => void;
}

export function useEditLock(opts: UseEditLockOptions): EditLockState & {
  acquire:  () => Promise<{ lockToken: string; rowVersion: number } | null>;
  release:  () => Promise<void>;
} {
  const { entityCode, recordId, apiFetch, heartbeatMs = 30_000, onVersionChange } = opts;

  const [state, setState] = useState<EditLockState>({
    isLocked: false, lockToken: null, rowVersion: null, error: null,
  });

  // Keep refs stable across renders so the interval closure always reads current values
  const lockTokenRef    = useRef<string | null>(null);
  const apiFetchRef     = useRef(apiFetch);
  const onVersionRef    = useRef(onVersionChange);
  apiFetchRef.current   = apiFetch;
  onVersionRef.current  = onVersionChange;

  const lockPath = `/api/records/${entityCode}/${recordId}/lock`;

  const acquire = useCallback(async () => {
    try {
      const res  = await apiFetchRef.current(lockPath, { method: "POST" });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setState((s) => ({ ...s, error: String(data["error"] ?? "LOCK_FAILED") }));
        return null;
      }
      const token   = data["lock_token"]   as string;
      const version = data["row_version"]  as number;
      lockTokenRef.current = token;
      setState({ isLocked: true, lockToken: token, rowVersion: version, error: null });
      onVersionRef.current?.(version);
      return { lockToken: token, rowVersion: version };
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
      return null;
    }
  }, [lockPath]);

  const release = useCallback(async () => {
    const token = lockTokenRef.current;
    if (!token) return;
    lockTokenRef.current = null;
    setState({ isLocked: false, lockToken: null, rowVersion: null, error: null });
    try {
      await apiFetchRef.current(lockPath, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ lock_token: token }),
      });
    } catch {
      // Release is best-effort; server TTL + sweep worker will clean up
    }
  }, [lockPath]);

  // Heartbeat interval — only runs while locked
  useEffect(() => {
    if (!state.isLocked) return;

    const interval = setInterval(async () => {
      const token = lockTokenRef.current;
      if (!token) return;
      try {
        const res  = await apiFetchRef.current(`${lockPath}/heartbeat`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ lock_token: token }),
        });
        if (!res.ok) {
          // Lock expired or stolen — surface to caller
          lockTokenRef.current = null;
          setState({ isLocked: false, lockToken: null, rowVersion: null, error: "LOCK_EXPIRED" });
        }
      } catch {
        // Network blip — keep state, next heartbeat will retry
      }
    }, heartbeatMs);

    return () => clearInterval(interval);
  }, [state.isLocked, lockPath, heartbeatMs]);

  // Release lock on unmount (best-effort)
  useEffect(() => {
    return () => {
      const token = lockTokenRef.current;
      if (!token) return;
      lockTokenRef.current = null;
      apiFetchRef.current(lockPath, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ lock_token: token }),
      }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockPath]);

  return { ...state, acquire, release };
}
