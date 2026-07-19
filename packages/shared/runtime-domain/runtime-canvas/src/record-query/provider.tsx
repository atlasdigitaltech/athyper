"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import type { EffectiveRecordWorkspaceManifest } from "@athyper/runtime-contracts";
import { createDefaultRecordWorkspaceAdapters } from "./adapters";
import type {
  RecordWorkspaceInitialQueryData,
  RecordWorkspaceQueryAdapters,
  RecordWorkspaceQueryContextValue,
} from "./types";

const RecordWorkspaceQueryContext = createContext<RecordWorkspaceQueryContextValue | null>(null);

export interface RecordWorkspaceQueryProviderProps {
  manifest: EffectiveRecordWorkspaceManifest;
  adapters?: Partial<RecordWorkspaceQueryAdapters>;
  initialData?: RecordWorkspaceInitialQueryData;
  children: ReactNode;
}

/**
 * Passive workspace cache boundary. It intentionally owns no QueryClient and
 * starts no queries during mount. Existing panels can therefore remain in the
 * tree while surfaces migrate one at a time to the typed hooks.
 */
export function RecordWorkspaceQueryProvider({
  manifest,
  adapters,
  initialData,
  children,
}: RecordWorkspaceQueryProviderProps) {
  const queryClient = useQueryClient();
  const resolvedAdapters = useMemo(
    () => ({ ...createDefaultRecordWorkspaceAdapters(), ...adapters }),
    [adapters],
  );
  const keyInput = useMemo(() => ({
    entityCode: manifest.entityCode,
    recordId: manifest.recordId,
    cacheScopeKey: manifest.cacheScope.key,
  }), [manifest.cacheScope.key, manifest.entityCode, manifest.recordId]);
  const resourceKeys = useMemo(
    () => new Set(manifest.resources.map((resource) => resource.key)),
    [manifest.resources],
  );

  useEffect(() => {
    queryClient.setQueryData(queryKeys.recordWorkspace.manifest(keyInput), manifest);
  }, [keyInput, manifest, queryClient]);

  const value = useMemo<RecordWorkspaceQueryContextValue>(() => ({
    manifest,
    keyInput,
    adapters: resolvedAdapters,
    initialData,
    queryClient,
    hasResource: (resource) => resourceKeys.has(resource),
  }), [initialData, keyInput, manifest, queryClient, resolvedAdapters, resourceKeys]);

  return (
    <RecordWorkspaceQueryContext.Provider value={value}>
      {children}
    </RecordWorkspaceQueryContext.Provider>
  );
}

export function RecordWorkspaceQueryBoundary({
  manifest,
  ...props
}: Omit<RecordWorkspaceQueryProviderProps, "manifest"> & {
  manifest?: EffectiveRecordWorkspaceManifest;
}) {
  if (!manifest) return <>{props.children}</>;
  return <RecordWorkspaceQueryProvider manifest={manifest} {...props} />;
}

export function useRecordWorkspaceQueryContext(): RecordWorkspaceQueryContextValue {
  const value = useContext(RecordWorkspaceQueryContext);
  if (!value) {
    throw new Error("Record workspace query hooks require RecordWorkspaceQueryProvider");
  }
  return value;
}

/**
 * Compatibility seam for components that can still be hosted by a legacy
 * record shell. New record routes always provide the workspace boundary, but
 * the optional reader lets a migrated surface preserve the old server-prop
 * path without creating a second QueryClient or issuing an ad-hoc request.
 */
export function useOptionalRecordWorkspaceQueryContext(): RecordWorkspaceQueryContextValue | null {
  return useContext(RecordWorkspaceQueryContext);
}
