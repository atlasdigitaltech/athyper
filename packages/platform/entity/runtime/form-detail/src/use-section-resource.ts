"use client";
import { sectionAvailability } from "./section-availability";
import {
  entityRuntimeClient,
  type EntityRuntimeBootstrapResource,
  type EntityRuntimeSectionResource,
  type EntityRuntimeResourceContext,
} from "@athyper/platform-entity-descriptor-client";
import type { HttpClient } from "@athyper/platform-api-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSharedRequestCoordinator } from "./shared-section-request";
const sharedSectionRequest = createSharedRequestCoordinator<EntityRuntimeSectionResource>();

type SectionStatus =
  "idle" | "loading" | "ready" | "error" | "context_required" | "forbidden";
export interface EntityRuntimeSectionState {
  readonly status: SectionStatus;
  readonly resource?: EntityRuntimeSectionResource;
  readonly error?: string;
  readonly loadingMore?: boolean;
  readonly loadMoreError?: string;
}
export interface EntityRuntimeWorkspaceState {
  readonly bootstrap?: EntityRuntimeBootstrapResource;
  readonly bootstrapStatus: SectionStatus;
  readonly bootstrapError?: string;
  readonly sections: Readonly<Record<string, EntityRuntimeSectionState>>;
  readonly activeSectionKey?: string;
  readonly selectSection: (sectionKey: string) => void;
  /** Fetch without changing record navigation; used by progressive 360 sections. */
  readonly preloadSection: (sectionKey: string) => void;
  /** Marks a viewport-observed section active without creating history. */
  readonly observeSection: (sectionKey: string) => void;
  readonly retrySection: (sectionKey: string) => void;
  readonly loadMore: (sectionKey: string) => void;
  readonly invalidate: (sectionKey?: string) => void;
}

interface CacheEntry {
  readonly resource: EntityRuntimeSectionResource;
  readonly expiresAt: number;
  readonly pages: number;
}
const sectionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 120;
const INVALIDATION_EVENT = "athyper:entity-runtime-resource-invalidated";
const RECORD_INVALIDATION_EVENT = "athyper:entity-runtime-record-invalidated";
export interface EntityRuntimeRecordScope {
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: string | number;
  readonly entityCode: string;
  readonly recordId: string;
}
const recordPrefix = (scope: EntityRuntimeRecordScope) =>
  `${scope.tenantId}:${scope.principalId}:${scope.authEpoch}:`;
const recordCoordinate = (scope: EntityRuntimeRecordScope) =>
  `:${scope.entityCode}:${scope.recordId}:`;
function cacheSection(key: string, value: CacheEntry): void {
  const now = Date.now();
  for (const [cacheKey, entry] of sectionCache)
    if (entry.expiresAt <= now) sectionCache.delete(cacheKey);
  // Map insertion order gives this page-local cache a small, predictable LRU
  // approximation without retaining every record a user visits.
  sectionCache.delete(key);
  sectionCache.set(key, value);
  while (sectionCache.size > CACHE_MAX_ENTRIES)
    sectionCache.delete(sectionCache.keys().next().value!);
}
/** Invalidates every context/locale variant, but never another principal or authorization epoch. */
export function invalidateEntityRuntimeRecord(
  scope: EntityRuntimeRecordScope,
): void {
  for (const key of sectionCache.keys())
    if (
      key.startsWith(recordPrefix(scope)) &&
      key.includes(recordCoordinate(scope))
    )
      sectionCache.delete(key);
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(RECORD_INVALIDATION_EVENT, { detail: scope }),
    );
}
export function subscribeEntityRuntimeRecord(
  scope: EntityRuntimeRecordScope,
  refresh: () => void,
): () => void {
  const receive = (event: Event) => {
    const target = (event as CustomEvent<EntityRuntimeRecordScope>).detail;
    if (
      target &&
      recordPrefix(target) === recordPrefix(scope) &&
      recordCoordinate(target) === recordCoordinate(scope)
    )
      refresh();
  };
  window.addEventListener(RECORD_INVALIDATION_EVENT, receive);
  return () => window.removeEventListener(RECORD_INVALIDATION_EVENT, receive);
}

/**
 * One page-local resource workspace. Bootstrap and individual sections are separate
 * resources: only initial, active, or explicitly selected sections are requested.
 */
export function useEntityRuntimeSectionWorkspace(input: {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly recordId: string;
  readonly surfaceKey: string;
  /** Includes principal, authorization epoch, workspace context and locale. */
  readonly cacheScope: string;
  readonly deepLinkedSectionKey?: string;
  readonly resourceContext?: EntityRuntimeResourceContext;
}): EntityRuntimeWorkspaceState {
  const identity = `${input.cacheScope}:${input.entityCode}:${input.recordId}:${input.surfaceKey}`;
  const contextKey = JSON.stringify(Object.entries(input.resourceContext ?? {}).filter(([,value]) => value !== undefined).sort());
  const stableContext = useMemo<EntityRuntimeResourceContext>(() => Object.fromEntries(JSON.parse(contextKey)), [contextKey]);
  const [bootstrap, setBootstrap] = useState<EntityRuntimeBootstrapResource>();
  const [bootstrapStatus, setBootstrapStatus] =
    useState<SectionStatus>("loading");
  const [bootstrapError, setBootstrapError] = useState<string>();
  const [sections, setSections] = useState<
    Record<string, EntityRuntimeSectionState>
  >({});
  const [activeSectionKey, setActiveSectionKey] = useState<string>();
  const [refreshRevision, setRefreshRevision] = useState(0);
  const refreshSection = useRef<string | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const epochs = useRef(new Map<string, number>());
  const loadedPages = useRef(new Map<string, number>());
  const requests = useRef(new Set<string>());

  const cacheKey = useCallback(
    (sectionKey: string, releaseHash?: string) =>
      `${identity}:${contextKey}:${releaseHash ?? "unresolved"}:${sectionKey}`,
    [identity, contextKey],
  );
  const loadSection = useCallback(
    async (
      nextBootstrap: EntityRuntimeBootstrapResource,
      sectionKey: string,
      force = false,
    ) => {
      if (!nextBootstrap.plan.sections.some((item) => item.key === sectionKey))
        return;
      const currentGeneration = generation.current;
      const signal = controller.current?.signal;
      const epoch = (epochs.current.get(sectionKey) ?? 0) + 1;
      epochs.current.set(sectionKey, epoch);
      const current = () =>
        !signal?.aborted &&
        currentGeneration === generation.current &&
        epochs.current.get(sectionKey) === epoch;
      const key = cacheKey(sectionKey, `${nextBootstrap.releaseHash}:${nextBootstrap.releaseId}`);
      const cached = !force ? sectionCache.get(key) : undefined;
      if (cached && cached.expiresAt > Date.now()) {
        loadedPages.current.set(sectionKey, cached.pages);
        if (currentGeneration === generation.current)
          setSections((current) => ({
            ...current,
            [sectionKey]: { status: "ready", resource: cached.resource },
          }));
        return;
      }
      if (currentGeneration === generation.current)
        setSections((current) => ({
          ...current,
          [sectionKey]: {
            status: "loading",
            resource: current[sectionKey]?.resource,
          },
        }));
      const request = sharedSectionRequest(`${key}:25:first`, transportSignal => entityRuntimeClient.section(input.client, {
          entityCode: input.entityCode,
          recordId: input.recordId,
          surfaceKey: input.surfaceKey,
          sectionKey,
          resourceContext: stableContext,
          signal: transportSignal,
        }), signal, force);
      try {
        let resource = await request;
        if (!current()) return;
        if (
          resource.releaseHash !== nextBootstrap.releaseHash ||
          resource.releaseId !== nextBootstrap.releaseId
        )
          throw new Error(
            "The page release changed while this section was loading.",
          );
        const target = loadedPages.current.get(sectionKey) ?? 1;
        let pages = 1;
        const seen = new Set<string>();
        while (pages < target) {
          const data = resource.data as { nextCursor?: string } | undefined;
          if (!data?.nextCursor || seen.has(data.nextCursor)) break;
          seen.add(data.nextCursor);
          const next = await sharedSectionRequest(`${key}:${data.nextCursor}:25`, transportSignal => entityRuntimeClient.section(input.client, {
            entityCode: input.entityCode,
            recordId: input.recordId,
            surfaceKey: input.surfaceKey,
            sectionKey,
            cursor: data.nextCursor,
            limit: 25,
            resourceContext: stableContext,
            signal: transportSignal,
          }), signal, force);
          if (!current()) return;
          if (
            next.releaseHash !== nextBootstrap.releaseHash ||
            next.releaseId !== nextBootstrap.releaseId
          )
            throw new Error(
              "The page release changed while this section was loading.",
            );
          resource = mergeSectionPages(resource, next);
          pages++;
        }
        loadedPages.current.set(sectionKey, pages);
        cacheSection(key, {
          resource,
          expiresAt: Date.now() + CACHE_TTL_MS,
          pages,
        });
        setSections((current) => ({
          ...current,
          [sectionKey]: { status: "ready", resource },
        }));
      } catch (cause) {
        if (!current()) return;
        const status = sectionAvailability(cause);
        setSections((current) => ({
          ...current,
          [sectionKey]: status
            ? {
                status,
                resource: current[sectionKey]?.resource,
                error: message(cause),
              }
            : {
                status: "error",
                resource: current[sectionKey]?.resource,
                error: message(cause),
              },
        }));
      }
    },
    [
      cacheKey,
      input.client,
      input.entityCode,
      input.recordId,
      input.surfaceKey,
      stableContext,
    ],
  );

  useEffect(() => {
    generation.current += 1;
    const requestGeneration = generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    epochs.current.clear();
    loadedPages.current.clear();
    requests.current.clear();
    setBootstrap(undefined);
    setBootstrapStatus("loading");
    setBootstrapError(undefined);
    setSections({});
    setActiveSectionKey(undefined);
    entityRuntimeClient
      .bootstrap(input.client, {
        entityCode: input.entityCode,
        recordId: input.recordId,
        surfaceKey: input.surfaceKey,
        resourceContext: stableContext,
        signal: controller.current.signal,
      })
      .then((value) => {
        if (requestGeneration !== generation.current) return;
        setBootstrap(value);
        setBootstrapStatus("ready");
        const requestedSection =
          refreshSection.current ?? input.deepLinkedSectionKey;
        refreshSection.current = undefined;
        const active = value.plan.sections.some(
          (item) => item.key === requestedSection,
        )
          ? requestedSection
          : (value.plan.initialSectionKeys[0] ?? value.plan.sections[0]?.key);
        setActiveSectionKey(active);
        for (const sectionKey of new Set([
          ...value.plan.initialSectionKeys,
          ...(active ? [active] : []),
        ]))
          void loadSection(value, sectionKey);
      })
      .catch((cause) => {
        if (
          controller.current?.signal.aborted ||
          requestGeneration !== generation.current
        )
          return;
        setBootstrapStatus("error");
        setBootstrapError(message(cause));
      });
    return () => controller.current?.abort();
  }, [
    identity,
    refreshRevision,
    input.client,
    input.entityCode,
    input.recordId,
    input.surfaceKey,
    stableContext,
    loadSection,
  ]);

  const selectSection = useCallback(
    (sectionKey: string) => {
      if (!bootstrap?.plan.sections.some((item) => item.key === sectionKey))
        return;
      setActiveSectionKey(sectionKey);
      void loadSection(bootstrap, sectionKey);
    },
    [bootstrap, loadSection],
  );
  const preloadSection = useCallback(
    (sectionKey: string) => {
      if (bootstrap?.plan.sections.some((item) => item.key === sectionKey))
        void loadSection(bootstrap, sectionKey);
    },
    [bootstrap, loadSection],
  );
  const observeSection = useCallback(
    (sectionKey: string) => {
      if (
        !bootstrap?.plan.sections.some((item) => item.key === sectionKey) ||
        sectionKey === activeSectionKey
      )
        return;
      setActiveSectionKey(sectionKey);
      void loadSection(bootstrap, sectionKey);
    },
    [activeSectionKey, bootstrap, loadSection],
  );
  const retrySection = useCallback(
    (sectionKey: string) => {
      if (bootstrap) void loadSection(bootstrap, sectionKey, true);
    },
    [bootstrap, loadSection],
  );
  const loadMore = useCallback(
    (sectionKey: string) => {
      const current = sections[sectionKey]?.resource;
      const data =
        current?.data &&
        typeof current.data === "object" &&
        !Array.isArray(current.data)
          ? (current.data as Record<string, unknown>)
          : undefined;
      const cursor =
        typeof data?.nextCursor === "string" ? data.nextCursor : undefined;
      if (
        !bootstrap ||
        !current ||
        !cursor ||
        sections[sectionKey]?.status === "loading"
      )
        return;
      const key = `${cacheKey(sectionKey, `${bootstrap.releaseHash}:${bootstrap.releaseId}`)}:${cursor}`;
      const signal = controller.current?.signal,
        requestGeneration = generation.current,
        epoch = epochs.current.get(sectionKey);
      const isCurrent = () =>
        !signal?.aborted &&
        requestGeneration === generation.current &&
        epoch === epochs.current.get(sectionKey);
      // Do not append the same cursor page twice when a user clicks Load more while it
      // is already in flight.
      if (requests.current.has(key)) return;
      requests.current.add(key);
      setSections(items => ({ ...items, [sectionKey]: { ...items[sectionKey]!, loadingMore: true, loadMoreError: undefined } }));
      const request = sharedSectionRequest(`${key}:25`, transportSignal => entityRuntimeClient.section(input.client, {
        entityCode: input.entityCode,
        recordId: input.recordId,
        surfaceKey: input.surfaceKey,
        sectionKey,
        cursor,
        limit: 25,
        resourceContext: stableContext,
        signal: transportSignal,
      }), signal);
      void request
        .then((next) => {
          if (!isCurrent()) return;
          if (
            next.releaseId !== bootstrap.releaseId ||
            next.releaseHash !== bootstrap.releaseHash
          )
            throw new Error(
              "The page release changed while this section was loading.",
            );
          const resource = mergeSectionPages(current, next);
          cacheSection(cacheKey(sectionKey, `${bootstrap.releaseHash}:${bootstrap.releaseId}`), {
            resource,
            expiresAt: Date.now() + CACHE_TTL_MS,
            pages: (loadedPages.current.get(sectionKey) ?? 1) + 1,
          });
          loadedPages.current.set(
            sectionKey,
            (loadedPages.current.get(sectionKey) ?? 1) + 1,
          );
          setSections((items) => ({
            ...items,
            [sectionKey]: { status: "ready", resource },
          }));
        })
        .catch((cause) => {
          if (!isCurrent()) return;
          const status = sectionAvailability(cause);
          if (status) sectionCache.delete(cacheKey(sectionKey, `${bootstrap.releaseHash}:${bootstrap.releaseId}`));
          setSections((items) => ({
            ...items,
            [sectionKey]: status ? { status, error: message(cause) } : {
              status: "ready",
              resource: current,
              loadingMore: false,
              loadMoreError: message(cause),
            },
          }));
        })
        .finally(() => {
          if (requestGeneration === generation.current)
            requests.current.delete(key);
        });
    },
    [
      bootstrap,
      cacheKey,
      input.client,
      input.entityCode,
      input.recordId,
      input.surfaceKey,
      stableContext,
      sections,
    ],
  );
  useEffect(() => {
    const sectionKey = input.deepLinkedSectionKey;
    if (
      !bootstrap ||
      !sectionKey ||
      !bootstrap.plan.sections.some((item) => item.key === sectionKey) ||
      sectionKey === activeSectionKey
    )
      return;
    setActiveSectionKey(sectionKey);
    void loadSection(bootstrap, sectionKey);
  }, [activeSectionKey, bootstrap, input.deepLinkedSectionKey, loadSection]);
  const invalidate = useCallback(
    (sectionKey?: string) => {
      evict(identity, sectionKey);
      if (sectionKey && bootstrap)
        void loadSection(bootstrap, sectionKey, true);
    },
    [bootstrap, identity, loadSection],
  );

  useEffect(() => {
    const receiveRecord = (event: Event) => {
      const target = (event as CustomEvent<EntityRuntimeRecordScope>).detail;
      if (
        !target ||
        !identity.startsWith(recordPrefix(target)) ||
        !identity.includes(recordCoordinate(target))
      )
        return;
      // Abort immediately: a pre-command response must not repopulate the cache.
      controller.current?.abort();
      generation.current += 1;
      refreshSection.current = activeSectionKey;
      setRefreshRevision((value) => value + 1);
    };
    window.addEventListener(RECORD_INVALIDATION_EVENT, receiveRecord);
    return () =>
      window.removeEventListener(RECORD_INVALIDATION_EVENT, receiveRecord);
  }, [identity, activeSectionKey]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { identity?: string; sectionKey?: string })
          : undefined;
      if (detail?.identity !== identity) return;
      if (detail.sectionKey) {
        setSections((current) => ({
          ...current,
          [detail.sectionKey!]: {
            ...current[detail.sectionKey!],
            status: "idle",
          },
        }));
        if (detail.sectionKey === activeSectionKey && bootstrap)
          void loadSection(bootstrap, detail.sectionKey, true);
      } else {
        setSections({});
        if (bootstrap)
          for (const sectionKey of bootstrap.plan.initialSectionKeys)
            void loadSection(bootstrap, sectionKey, true);
      }
    };
    window.addEventListener(INVALIDATION_EVENT, receive);
    return () => window.removeEventListener(INVALIDATION_EVENT, receive);
  }, [activeSectionKey, bootstrap, identity, loadSection]);

  return useMemo(
    () =>
      Object.freeze({
        bootstrap,
        bootstrapStatus,
        ...(bootstrapError ? { bootstrapError } : {}),
        sections: Object.freeze(sections),
        ...(activeSectionKey ? { activeSectionKey } : {}),
        selectSection,
        preloadSection,
        observeSection,
        retrySection,
        loadMore,
        invalidate,
      }),
    [
      activeSectionKey,
      bootstrap,
      bootstrapError,
      bootstrapStatus,
      invalidate,
      loadMore,
      observeSection,
      preloadSection,
      retrySection,
      sections,
      selectSection,
    ],
  );
}

/** Call after a command, attachment, comment, or role mutation to evict scoped resources. */
export function invalidateEntityRuntimeSectionCache(input: {
  readonly cacheScope: string;
  readonly entityCode: string;
  readonly recordId: string;
  readonly surfaceKey: string;
  readonly sectionKey?: string;
}): void {
  const identity = `${input.cacheScope}:${input.entityCode}:${input.recordId}:${input.surfaceKey}`;
  evict(identity, input.sectionKey);
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(INVALIDATION_EVENT, {
        detail: {
          identity,
          ...(input.sectionKey ? { sectionKey: input.sectionKey } : {}),
        },
      }),
    );
}
function evict(identity: string, sectionKey?: string): void {
  const prefix = `${identity}:`;
  for (const key of sectionCache.keys())
    if (
      key.startsWith(prefix) &&
      (!sectionKey || key.endsWith(`:${sectionKey}`))
    )
      sectionCache.delete(key);
}
function message(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "This section is unavailable.";
}

export function mergeSectionPages(
  previous: EntityRuntimeSectionResource,
  next: EntityRuntimeSectionResource,
): EntityRuntimeSectionResource {
  function merge(before: unknown, after: unknown): unknown {
    if (Array.isArray(before) && Array.isArray(after)) {
      const key = (item: unknown) => item && typeof item === "object" && "id" in item
        ? String(item.id) : JSON.stringify(item);
      const rows = new Map(before.map(item => [key(item), item]));
      for (const item of after) rows.set(key(item), item);
      return [...rows.values()];
    }
    if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
      const result: Record<string, unknown> = { ...after };
      // Only collection containers accumulate. State, cursors and field values come from the newest page.
      for (const key of ["items", "collections", "data"]) {
        if (key in before || key in after) result[key] = merge(
          (before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key],
        );
      }
      if ("collections" in before || "collections" in after) {
        const oldCollections = (before as { collections?: Record<string, unknown> }).collections ?? {};
        const newCollections = (after as { collections?: Record<string, unknown> }).collections ?? {};
        result.collections = Object.fromEntries([...new Set([...Object.keys(oldCollections), ...Object.keys(newCollections)])]
          .map(key => [key, merge(oldCollections[key], newCollections[key] ?? [])]));
      }
      return result;
    }
    return after;
  }
  return { ...next, data: merge(previous.data, next.data) };
}
