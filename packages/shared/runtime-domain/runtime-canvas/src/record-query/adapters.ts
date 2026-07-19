import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { RecordWorkspaceCollectionParams } from "@athyper/api-contracts/query-keys";
import type {
  RecordWorkspaceAdapterRequest,
  RecordWorkspaceChildCollectionRequest,
  RecordWorkspaceQueryAdapters,
} from "./types";

export type RecordWorkspaceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createDefaultRecordWorkspaceAdapters(
  fetcher: RecordWorkspaceFetch = globalThis.fetch.bind(globalThis),
): RecordWorkspaceQueryAdapters {
  return {
    recordCore: (request) => fetchJson(fetcher, runtimePath.detail(request.entityCode, request.recordId), request),
    processState: (request) => fetchJson(fetcher, runtimePath.processState(request.entityCode, request.recordId), request),
    approvals: (request) => fetchJson(fetcher, runtimePath.approvals(request.entityCode, request.recordId), request),
    lifecycleTimeline: (request) => fetchJson(fetcher, runtimePath.versions(request.entityCode, request.recordId), request),
    snapshots: (request) => fetchJson(
      fetcher,
      withParams(runtimePath.entitySnapshots(request.entityCode, request.recordId), request.params),
      request,
    ),
    snapshotDetail: (request) => fetchJson(
      fetcher,
      runtimePath.entitySnapshot(request.entityCode, request.recordId, request.snapshotId),
      request,
    ),
    snapshotCompare: (request) => fetchJson(
      fetcher,
      runtimePath.entitySnapshotCompare(request.entityCode, request.recordId),
      request,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leftSnapshotId: request.leftSnapshotId,
          rightSnapshotId: request.rightSnapshotId,
        }),
      },
    ),
    snapshotRestore: (request) => fetchJson(
      fetcher,
      runtimePath.entitySnapshotRestore(request.entityCode, request.recordId, request.snapshotId),
      request,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    ),
    snapshotChildContracts: (request) => fetchJson(
      fetcher,
      runtimePath.snapshotChildContracts(request.entityCode, request.recordId),
      request,
    ),
    auditLog: (request) => fetchJson(
      fetcher,
      withParams(runtimePath.entityAuditLog(request.entityCode, request.recordId), request.params),
      request,
    ),
    childCollection: (request) => fetchJson(
      fetcher,
      withParams(childCollectionPath(request), request.params),
      request,
    ),
    comments: (request) => fetchJson(
      fetcher,
      withParams("/api/collab/comments", {
        entityType: request.entityCode,
        entityId: request.recordId,
        limit: 50,
        ...request.params,
      }),
      request,
    ),
    commentSummary: (request) => fetchJson(
      fetcher,
      withParams("/api/collab/comments/batch-count", {
        entity_type: request.entityCode,
        ids: request.recordId,
      }),
      request,
    ),
    attachments: (request) => fetchJson(
      fetcher,
      withParams(documentResourcePath(request, "attachments"), request.params),
      request,
    ),
    attachmentWorkspace: (request) => fetchJson(
      fetcher,
      `/api/relay/api/documents/${encodeURIComponent(request.entityCode)}/${encodeURIComponent(request.recordId)}/attachment-workspace`,
      request,
    ),
    attachmentFolders: (request) => fetchJson(fetcher, documentResourcePath(request, "folders"), request),
    activity: (request) => fetchJson(
      fetcher,
      withParams(
        `/api/relay/api/activity/${encodeURIComponent(request.entityCode)}/${encodeURIComponent(request.recordId)}`,
        request.params,
      ),
      request,
    ),
  };
}

function childCollectionPath(
  request: RecordWorkspaceChildCollectionRequest,
): string {
  switch (request.source.kind) {
    case "relation":
      return runtimePath.relationRecords(
        request.entityCode,
        request.source.relationCode,
        request.recordId,
      );
    case "binding":
      return runtimePath.bindingRecords(request.source.bindingCode, request.recordId);
    case "entity_filter":
      return withParams(runtimePath.list(request.source.entityCode), {
        [request.source.parentField]: request.recordId,
      });
    case "lines":
      return withParams(runtimePath.lines(request.entityCode, request.recordId),
        request.source.lineEntityCode ? { entity: request.source.lineEntityCode } : undefined);
    case "distributions":
      return runtimePath.distributions(request.entityCode, request.recordId);
  }
}

async function fetchJson(
  fetcher: RecordWorkspaceFetch,
  url: string,
  request: RecordWorkspaceAdapterRequest,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    signal: request.signal,
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Record workspace request failed with ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function documentResourcePath(
  request: RecordWorkspaceAdapterRequest,
  resource: "attachments" | "folders",
): string {
  return `/api/relay/api/documents/${encodeURIComponent(request.entityCode)}/${encodeURIComponent(request.recordId)}/${resource}`;
}

function withParams(
  path: string,
  params: RecordWorkspaceCollectionParams | undefined,
): string {
  if (!params || Object.keys(params).length === 0) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}
