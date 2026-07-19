import type { QueryClient } from "@tanstack/react-query";
import { queryKeys, type RecordWorkspaceKeyInput } from "@athyper/api-contracts/query-keys";

/**
 * A workflow decision or lifecycle transition can change all four process
 * projections together. Invalidate their canonical keys as one unit so an
 * active Approvals or Lifecycle surface refreshes once through TanStack Query
 * instead of each component maintaining an independent refresh path.
 */
export async function invalidateRecordWorkspaceProcessResources(
  queryClient: QueryClient,
  keyInput: RecordWorkspaceKeyInput,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.recordWorkspace.recordCore(keyInput),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.recordWorkspace.processState(keyInput),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.recordWorkspace.approvals(keyInput),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.recordWorkspace.lifecycleTimeline(keyInput),
      exact: true,
    }),
  ]);
}

/** Invalidates every cached page/filter of one semantic child collection. */
export async function invalidateRecordWorkspaceChildCollection(
  queryClient: QueryClient,
  keyInput: RecordWorkspaceKeyInput,
  collectionKey: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.recordWorkspace.childCollectionRoot(keyInput, collectionKey),
  });
}

/**
 * Snapshot capture/restore invalidation stays independent from lifecycle
 * transition history. A capture only changes the append-only snapshot index;
 * a restore additionally changes the live record graph and its projections.
 */
export async function invalidateRecordWorkspaceSnapshotResources(
  queryClient: QueryClient,
  keyInput: RecordWorkspaceKeyInput,
  options: { recordChanged?: boolean } = {},
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: queryKeys.recordWorkspace.snapshotsRoot(keyInput),
    }),
  ];

  if (options.recordChanged) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.recordWorkspace.recordCore(keyInput),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.recordWorkspace.childCollectionsRoot(keyInput),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.recordWorkspace.auditLog(keyInput),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.recordWorkspace.activity(keyInput),
      }),
    );
  }

  await Promise.all(invalidations);
}
