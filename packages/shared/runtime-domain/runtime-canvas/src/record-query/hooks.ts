"use client";

import {
  useMutation,
  useQuery,
  type QueryFunction,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { RecordWorkspaceResourceKey } from "@athyper/runtime-contracts";
import {
  useOptionalRecordWorkspaceQueryContext,
  useRecordWorkspaceQueryContext,
} from "./provider";
import type {
  RecordWorkspaceChildCollectionHookOptions,
  RecordWorkspaceCollectionHookOptions,
  RecordWorkspaceHookOptions,
  RecordWorkspaceQueryContextValue,
} from "./types";
import { invalidateRecordWorkspaceSnapshotResources } from "./invalidation";

const DEFAULT_STALE_TIME = 30_000;

export interface RecordWorkspaceQueryDefinition<TData> {
  queryKey: readonly unknown[];
  queryFn: QueryFunction<TData, readonly unknown[]>;
  staleTime: number;
  enabled: boolean;
  initialData?: TData;
  retry?: boolean | number | ((failureCount: number, error: Error) => boolean);
}

export function createRecordWorkspaceQueryDefinition<TData>(input: {
  queryKey: readonly unknown[];
  queryFn: QueryFunction<TData, readonly unknown[]>;
  staleTime?: number;
  enabled?: boolean;
  initialData?: TData;
  retry?: boolean | number | ((failureCount: number, error: Error) => boolean);
}): RecordWorkspaceQueryDefinition<TData> {
  return {
    queryKey: input.queryKey,
    queryFn: input.queryFn,
    staleTime: input.staleTime ?? DEFAULT_STALE_TIME,
    enabled: input.enabled ?? true,
    initialData: input.initialData,
    retry: input.retry,
  };
}

export function useRecordWorkspaceRecordCore<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useRecordWorkspaceQueryContext();
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: queryKeys.recordWorkspace.recordCore(context.keyInput),
    queryFn: ({ signal }) => context.adapters.recordCore(request(context, signal)) as Promise<TData>,
    initialData: context.initialData?.recordCore as TData | undefined,
    ...options,
  }));
}

export function useRecordWorkspaceProcessState<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useRecordWorkspaceQueryContext();
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: queryKeys.recordWorkspace.processState(context.keyInput),
    queryFn: ({ signal }) => context.adapters.processState(request(context, signal)) as Promise<TData>,
    initialData: context.initialData?.processState as TData | undefined,
    ...options,
  }));
}

export function useRecordWorkspaceApprovals<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  return useResourceQuery("approvals", options, (context, signal) => (
    context.adapters.approvals(request(context, signal)) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.approvals(context.keyInput));
}

export function useRecordWorkspaceLifecycleTimeline<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  return useResourceQuery("lifecycleTimeline", options, (context, signal) => (
    context.adapters.lifecycleTimeline(request(context, signal)) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.lifecycleTimeline(context.keyInput));
}

export function useRecordWorkspaceSnapshots<TData = unknown>(
  options: RecordWorkspaceCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const params = collectionParams(options);
  return useResourceQuery("snapshots", options, (context, signal) => (
    context.adapters.snapshots({ ...request(context, signal), params }) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.snapshots(context.keyInput, params));
}

/**
 * Fail-closed compatibility reader used by the Versions surface. Snapshot
 * transport is unavailable unless the effective manifest explicitly exposes
 * the snapshots resource; legacy shells therefore cannot accidentally probe
 * snapshot endpoints.
 */
export function useOptionalRecordWorkspaceSnapshots<TData = unknown>(
  options: RecordWorkspaceCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useOptionalRecordWorkspaceQueryContext();
  const params = collectionParams(options);
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: context
      ? queryKeys.recordWorkspace.snapshots(context.keyInput, params)
      : ["record-workspace", "unavailable", "snapshots", params],
    queryFn: ({ signal }) => {
      if (!context) return Promise.reject(new Error("Record workspace snapshots are unavailable"));
      return context.adapters.snapshots({ ...request(context, signal), params }) as Promise<TData>;
    },
    staleTime: options.staleTime,
    enabled: (options.enabled ?? true) && Boolean(context?.hasResource("snapshots")),
  }));
}

export function useOptionalRecordWorkspaceSnapshotDetail<TData = unknown>(
  snapshotId: string | null,
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useOptionalRecordWorkspaceQueryContext();
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: context && snapshotId
      ? queryKeys.recordWorkspace.snapshot(context.keyInput, snapshotId)
      : ["record-workspace", "unavailable", "snapshot", snapshotId],
    queryFn: ({ signal }) => {
      if (!context || !snapshotId) {
        return Promise.reject(new Error("Record workspace snapshot detail is unavailable"));
      }
      return context.adapters.snapshotDetail({
        ...request(context, signal),
        snapshotId,
      }) as Promise<TData>;
    },
    staleTime: options.staleTime ?? Number.POSITIVE_INFINITY,
    enabled: (options.enabled ?? true)
      && Boolean(snapshotId)
      && Boolean(context?.hasResource("snapshots")),
  }));
}

export function useOptionalRecordWorkspaceSnapshotCompare<TData = unknown>(
  leftSnapshotId: string | null,
  rightSnapshotId: string | null,
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useOptionalRecordWorkspaceQueryContext();
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    // Caller order is significant: the compare response includes whether the
    // requested sides were swapped into chronological order.
    queryKey: context && leftSnapshotId && rightSnapshotId
      ? queryKeys.recordWorkspace.snapshotCompare(
        context.keyInput,
        leftSnapshotId,
        rightSnapshotId,
      )
      : ["record-workspace", "unavailable", "snapshot-compare", leftSnapshotId, rightSnapshotId],
    queryFn: ({ signal }) => {
      if (!context || !leftSnapshotId || !rightSnapshotId) {
        return Promise.reject(new Error("Record workspace snapshot comparison is unavailable"));
      }
      return context.adapters.snapshotCompare({
        ...request(context, signal),
        leftSnapshotId,
        rightSnapshotId,
      }) as Promise<TData>;
    },
    staleTime: options.staleTime ?? Number.POSITIVE_INFINITY,
    enabled: (options.enabled ?? true)
      && Boolean(leftSnapshotId)
      && Boolean(rightSnapshotId)
      && Boolean(context?.hasResource("snapshots")),
  }));
}

export function useOptionalRecordWorkspaceSnapshotRestore<TData = unknown>(): UseMutationResult<
  TData,
  Error,
  string
> {
  const context = useOptionalRecordWorkspaceQueryContext();
  return useMutation<TData, Error, string>({
    mutationKey: context
      ? [...queryKeys.recordWorkspace.snapshotsRoot(context.keyInput), "restore"]
      : ["record-workspace", "unavailable", "snapshot-restore"],
    mutationFn: async (snapshotId) => {
      if (!context?.hasResource("snapshots")) {
        throw new Error("Snapshot restore is not supported for this record");
      }
      return context.adapters.snapshotRestore({
        ...request(context, new AbortController().signal),
        snapshotId,
      }) as Promise<TData>;
    },
    onSuccess: async () => {
      if (!context) return;
      await invalidateRecordWorkspaceSnapshotResources(
        context.queryClient,
        context.keyInput,
        { recordChanged: true },
      );
    },
  });
}

/** Starts the snapshot index only after a tab hover/focus/click expresses intent. */
export function useRecordWorkspaceSnapshotIntentPrefetch(): () => void {
  const context = useOptionalRecordWorkspaceQueryContext();
  return useCallback(() => {
    if (!context?.hasResource("snapshots")) return;
    const params = {};
    void context.queryClient.prefetchQuery({
      queryKey: queryKeys.recordWorkspace.snapshots(context.keyInput, params),
      queryFn: ({ signal }) => context.adapters.snapshots({
        ...request(context, signal),
        params,
      }),
      staleTime: DEFAULT_STALE_TIME,
    });
  }, [context]);
}

/**
 * Subscribes only after the Versions surface is mounted. Lifecycle transition
 * events can append a graph checkpoint, while restore events also invalidate
 * the live record graph. Unsupported records never open the stream.
 */
export function useRecordWorkspaceSnapshotEventInvalidation(
  options: RecordWorkspaceHookOptions = {},
): void {
  const context = useOptionalRecordWorkspaceQueryContext();
  useEffect(() => {
    if (
      !(options.enabled ?? true)
      || !context?.hasResource("snapshots")
      || typeof EventSource === "undefined"
    ) return;

    const source = new EventSource(
      runtimePath.stream(context.manifest.entityCode, context.manifest.recordId),
      { withCredentials: true },
    );
    const snapshotEvents = [
      "record.statusChanged",
      "snapshot.captured",
      "snapshot.restored",
      "document.snapshot.captured",
    ] as const;
    const handleSnapshotEvent = (event: Event) => {
      void invalidateRecordWorkspaceSnapshotResources(
        context.queryClient,
        context.keyInput,
        { recordChanged: event.type === "snapshot.restored" },
      );
    };
    for (const eventName of snapshotEvents) {
      source.addEventListener(eventName, handleSnapshotEvent);
    }
    return () => {
      for (const eventName of snapshotEvents) {
        source.removeEventListener(eventName, handleSnapshotEvent);
      }
      source.close();
    };
  }, [context, options.enabled]);
}

export function useRecordWorkspaceSnapshotChildContracts<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  return useResourceQuery("snapshots", options, (context, signal) => (
    context.adapters.snapshotChildContracts(request(context, signal)) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.support(context.keyInput, "snapshot-child-contracts"));
}

export function useRecordWorkspaceAuditLog<TData = unknown>(
  options: RecordWorkspaceCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useRecordWorkspaceQueryContext();
  const params = collectionParams(options);
  const hasAuditSurface = context.manifest.surfaces.some((surface) => surface.kind === "audit_trail");
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: queryKeys.recordWorkspace.auditLog(context.keyInput, params),
    queryFn: ({ signal }) => context.adapters.auditLog({
      ...request(context, signal),
      params,
    }) as Promise<TData>,
    staleTime: options.staleTime,
    enabled: (options.enabled ?? true) && hasAuditSurface,
  }));
}

export function useRecordWorkspaceChildCollection<TData = unknown>(
  collectionKey: string,
  options: RecordWorkspaceChildCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useRecordWorkspaceQueryContext();
  const supported = !options.surfaceKey
    || context.manifest.surfaces.some((surface) => surface.key === options.surfaceKey);
  const params = collectionParams(options);
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: queryKeys.recordWorkspace.childCollection(context.keyInput, collectionKey, params),
    queryFn: ({ signal }) => context.adapters.childCollection({
      ...request(context, signal),
      collectionKey,
      source: options.source!,
      params,
    }) as Promise<TData>,
    staleTime: options.staleTime,
    enabled: (options.enabled ?? true) && supported && Boolean(options.source),
    initialData: options.initialData as TData | undefined,
  }));
}

/**
 * Migration-safe collection reader for surfaces that can still render under a
 * legacy shell. It never fetches without both a workspace manifest and an
 * explicit metadata-derived source.
 */
export function useOptionalRecordWorkspaceChildCollection<TData = unknown>(
  collectionKey: string,
  options: RecordWorkspaceChildCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const context = useOptionalRecordWorkspaceQueryContext();
  const params = collectionParams(options);
  const supported = Boolean(
    context
    && (!options.surfaceKey
      || context.manifest.surfaces.some((surface) => surface.key === options.surfaceKey)),
  );
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: context
      ? queryKeys.recordWorkspace.childCollection(context.keyInput, collectionKey, params)
      : ["record-workspace", "unavailable", "child-collection", collectionKey, params],
    queryFn: ({ signal }) => {
      if (!context || !options.source) {
        return Promise.reject(new Error("Record workspace collection source is unavailable"));
      }
      return context.adapters.childCollection({
        ...request(context, signal),
        collectionKey,
        source: options.source,
        params,
      }) as Promise<TData>;
    },
    staleTime: options.staleTime,
    enabled: (options.enabled ?? true) && supported && Boolean(options.source),
    initialData: options.initialData as TData | undefined,
  }));
}

export function useRecordWorkspaceComments<TData = unknown>(
  options: RecordWorkspaceCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const params = collectionParams(options);
  return useResourceQuery("comments", { retry: false, ...options }, (context, signal) => (
    context.adapters.comments({ ...request(context, signal), params }) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.comments(context.keyInput, params));
}

export function useRecordWorkspaceCommentSummary<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  return useResourceQuery("comments", options, (context, signal) => (
    context.adapters.commentSummary(request(context, signal)) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.commentSummary(context.keyInput));
}

export function useRecordWorkspaceAttachments<TData = unknown>(
  options: RecordWorkspaceCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const params = collectionParams(options);
  return useResourceQuery("attachments", options, (context, signal) => (
    context.adapters.attachments({ ...request(context, signal), params }) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.attachments(context.keyInput, params));
}

export function useRecordWorkspaceAttachmentWorkspace<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  return useResourceQuery("attachments", options, (context, signal) => (
    context.adapters.attachmentWorkspace(request(context, signal)) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.attachmentWorkspace(context.keyInput));
}

export function useRecordWorkspaceAttachmentFolders<TData = unknown>(
  options: RecordWorkspaceHookOptions = {},
): UseQueryResult<TData, Error> {
  return useResourceQuery("attachments", options, (context, signal) => (
    context.adapters.attachmentFolders(request(context, signal)) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.attachmentFolders(context.keyInput));
}

export function useRecordWorkspaceActivity<TData = unknown>(
  options: RecordWorkspaceCollectionHookOptions = {},
): UseQueryResult<TData, Error> {
  const params = collectionParams(options);
  return useResourceQuery("activity", { retry: false, ...options }, (context, signal) => (
    context.adapters.activity({ ...request(context, signal), params }) as Promise<TData>
  ), (context) => queryKeys.recordWorkspace.activity(context.keyInput, params));
}

function useResourceQuery<TData>(
  resource: RecordWorkspaceResourceKey,
  options: RecordWorkspaceHookOptions,
  queryFn: (context: RecordWorkspaceQueryContextValue, signal: AbortSignal) => Promise<TData>,
  key: (context: RecordWorkspaceQueryContextValue) => readonly unknown[],
): UseQueryResult<TData, Error> {
  const context = useRecordWorkspaceQueryContext();
  return useWorkspaceQuery(createRecordWorkspaceQueryDefinition({
    queryKey: key(context),
    queryFn: ({ signal }) => queryFn(context, signal),
    staleTime: options.staleTime,
    enabled: (options.enabled ?? true) && context.hasResource(resource),
    retry: options.retry,
  }));
}

function useWorkspaceQuery<TData>(
  definition: RecordWorkspaceQueryDefinition<TData>,
): UseQueryResult<TData, Error> {
  return useQuery<TData, Error>({
    queryKey: definition.queryKey,
    queryFn: definition.queryFn,
    staleTime: definition.staleTime,
    enabled: definition.enabled,
    initialData: definition.initialData,
    retry: definition.retry,
  });
}

function request(context: RecordWorkspaceQueryContextValue, signal: AbortSignal) {
  return {
    manifest: context.manifest,
    entityCode: context.manifest.entityCode,
    recordId: context.manifest.recordId,
    signal,
  };
}

function collectionParams(
  options: RecordWorkspaceCollectionHookOptions,
) {
  return {
    ...options.params,
    ...(options.pagination
      ? { page: options.pagination.page, page_size: options.pagination.pageSize }
      : {}),
  };
}
