"use client";
import {
  entityRuntimeClient,
  type EntityRuntimeBootstrapResource,
  type EntityRuntimeSectionResource,
  type EntityRuntimeResourceContext,
} from "@athyper/platform-entity-descriptor-client";
import type { HttpClient } from "@athyper/platform-api-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SectionStatus = "idle" | "loading" | "ready" | "error" | "context_required" | "forbidden";
export interface EntityRuntimeSectionState {
  readonly status: SectionStatus;
  readonly resource?: EntityRuntimeSectionResource;
  readonly error?: string;
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

interface CacheEntry { readonly resource: EntityRuntimeSectionResource; readonly expiresAt: number; }
const sectionCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<EntityRuntimeSectionResource>>();
const CACHE_TTL_MS = 60_000;
const INVALIDATION_EVENT = "athyper:entity-runtime-resource-invalidated";

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
  const [bootstrap, setBootstrap] = useState<EntityRuntimeBootstrapResource>();
  const [bootstrapStatus, setBootstrapStatus] = useState<SectionStatus>("loading");
  const [bootstrapError, setBootstrapError] = useState<string>();
  const [sections, setSections] = useState<Record<string, EntityRuntimeSectionState>>({});
  const [activeSectionKey, setActiveSectionKey] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);

  const cacheKey = useCallback((sectionKey: string, releaseHash?: string) =>
    `${identity}:${releaseHash ?? "unresolved"}:${sectionKey}`, [identity]);
  const loadSection = useCallback(async (nextBootstrap: EntityRuntimeBootstrapResource, sectionKey: string, force = false) => {
    if (!nextBootstrap.plan.sections.some((item) => item.key === sectionKey)) return;
    const currentGeneration = generation.current;
    const key = cacheKey(sectionKey, nextBootstrap.releaseHash);
    const cached = !force ? sectionCache.get(key) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      if (currentGeneration === generation.current) setSections((current) => ({ ...current, [sectionKey]: { status: "ready", resource: cached.resource } }));
      return;
    }
    if (currentGeneration === generation.current) setSections((current) => ({ ...current, [sectionKey]: { status: "loading", resource: current[sectionKey]?.resource } }));
    let request = inFlight.get(key);
    if (!request) {
      request = entityRuntimeClient.section(input.client, { entityCode: input.entityCode, recordId: input.recordId, surfaceKey: input.surfaceKey, sectionKey, ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}), signal: controller.current?.signal });
      inFlight.set(key, request);
      // finally() mirrors a rejection into a new promise. Handle both outcomes here
      // so an expected context-required response cannot reach the runtime overlay.
      void request.then(() => inFlight.delete(key), () => inFlight.delete(key));
    }
    try {
      const resource = await request;
      if (currentGeneration !== generation.current) return;
      if (resource.releaseHash !== nextBootstrap.releaseHash || resource.releaseId !== nextBootstrap.releaseId) throw new Error("The page release changed while this section was loading.");
      sectionCache.set(key, { resource, expiresAt: Date.now() + CACHE_TTL_MS });
      setSections((current) => ({ ...current, [sectionKey]: { status: "ready", resource } }));
    } catch (cause) {
      if (controller.current?.signal.aborted || currentGeneration !== generation.current) return;
      const status = sectionAvailability(cause);
      setSections((current) => ({
        ...current,
        [sectionKey]: status
          ? { status, resource: current[sectionKey]?.resource, error: message(cause) }
          : { status: "error", resource: current[sectionKey]?.resource, error: message(cause) },
      }));
    }
  }, [cacheKey, input.client, input.entityCode, input.recordId, input.surfaceKey]);

  useEffect(() => {
    generation.current += 1;
    const requestGeneration = generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setBootstrap(undefined); setBootstrapStatus("loading"); setBootstrapError(undefined); setSections({}); setActiveSectionKey(undefined);
    entityRuntimeClient.bootstrap(input.client, { entityCode: input.entityCode, recordId: input.recordId, surfaceKey: input.surfaceKey, ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}), signal: controller.current.signal })
      .then((value) => {
        if (requestGeneration !== generation.current) return;
        setBootstrap(value); setBootstrapStatus("ready");
        const active = value.plan.sections.some((item) => item.key === input.deepLinkedSectionKey)
          ? input.deepLinkedSectionKey
          : value.plan.initialSectionKeys[0] ?? value.plan.sections[0]?.key;
        setActiveSectionKey(active);
        for (const sectionKey of new Set([...value.plan.initialSectionKeys, ...(active ? [active] : [])])) void loadSection(value, sectionKey);
      })
      .catch((cause) => {
        if (controller.current?.signal.aborted || requestGeneration !== generation.current) return;
        setBootstrapStatus("error"); setBootstrapError(message(cause));
      });
    return () => controller.current?.abort();
  }, [identity, input.client, input.entityCode, input.recordId, input.surfaceKey, input.resourceContext, loadSection]);

  const selectSection = useCallback((sectionKey: string) => {
    if (!bootstrap?.plan.sections.some((item) => item.key === sectionKey)) return;
    setActiveSectionKey(sectionKey);
    void loadSection(bootstrap, sectionKey);
  }, [bootstrap, loadSection]);
  const preloadSection = useCallback((sectionKey: string) => {
    if (bootstrap?.plan.sections.some((item) => item.key === sectionKey)) void loadSection(bootstrap, sectionKey);
  }, [bootstrap, loadSection]);
  const observeSection = useCallback((sectionKey: string) => {
    if (!bootstrap?.plan.sections.some((item) => item.key === sectionKey) || sectionKey === activeSectionKey) return;
    setActiveSectionKey(sectionKey);
    void loadSection(bootstrap, sectionKey);
  }, [activeSectionKey, bootstrap, loadSection]);
  const retrySection = useCallback((sectionKey: string) => { if (bootstrap) void loadSection(bootstrap, sectionKey, true); }, [bootstrap, loadSection]);
  const loadMore = useCallback((sectionKey: string) => {
    const current = sections[sectionKey]?.resource;
    const data = current?.data && typeof current.data === "object" && !Array.isArray(current.data) ? current.data as Record<string, unknown> : undefined;
    const cursor = typeof data?.nextCursor === "string" ? data.nextCursor : undefined;
    if (!bootstrap || !current || !cursor) return;
    const key = `${cacheKey(sectionKey, bootstrap.releaseHash)}:${cursor}`;
    // Do not append the same cursor page twice when a user clicks Load more while it
    // is already in flight.
    if (inFlight.has(key)) return;
    const request = entityRuntimeClient.section(input.client, { entityCode: input.entityCode, recordId: input.recordId, surfaceKey: input.surfaceKey, sectionKey, cursor, limit: 25, ...(input.resourceContext ? { resourceContext: input.resourceContext } : {}), signal: controller.current?.signal });
    inFlight.set(key, request); void request.then(() => inFlight.delete(key), () => inFlight.delete(key));
    void request.then((next) => {
      if (next.releaseId !== bootstrap.releaseId || next.releaseHash !== bootstrap.releaseHash) throw new Error("The page release changed while this section was loading.");
      const nextData = next.data && typeof next.data === "object" && !Array.isArray(next.data) ? next.data as Record<string, unknown> : {};
      const priorItems = Array.isArray(data?.items) ? data.items : [], nextItems = Array.isArray(nextData.items) ? nextData.items : [];
      setSections((items) => ({ ...items, [sectionKey]: { status: "ready", resource: { ...next, data: { ...nextData, items: [...priorItems, ...nextItems] } } } }));
    }).catch((cause) => setSections((items) => ({ ...items, [sectionKey]: { status: "error", resource: current, error: message(cause) } })));
  }, [bootstrap, cacheKey, input.client, input.entityCode, input.recordId, input.surfaceKey, sections]);
  useEffect(() => {
    const sectionKey = input.deepLinkedSectionKey;
    if (!bootstrap || !sectionKey || !bootstrap.plan.sections.some((item) => item.key === sectionKey) || sectionKey === activeSectionKey) return;
    setActiveSectionKey(sectionKey);
    void loadSection(bootstrap, sectionKey);
  }, [activeSectionKey, bootstrap, input.deepLinkedSectionKey, loadSection]);
  const invalidate = useCallback((sectionKey?: string) => {
    evict(identity, sectionKey);
    if (sectionKey && bootstrap) void loadSection(bootstrap, sectionKey, true);
  }, [bootstrap, identity, loadSection]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { identity?: string; sectionKey?: string } : undefined;
      if (detail?.identity !== identity) return;
      if (detail.sectionKey) {
        setSections((current) => ({ ...current, [detail.sectionKey!]: { status: "idle" } }));
        if (detail.sectionKey === activeSectionKey && bootstrap) void loadSection(bootstrap, detail.sectionKey, true);
      } else {
        setSections({});
        if (bootstrap) for (const sectionKey of bootstrap.plan.initialSectionKeys) void loadSection(bootstrap, sectionKey, true);
      }
    };
    window.addEventListener(INVALIDATION_EVENT, receive);
    return () => window.removeEventListener(INVALIDATION_EVENT, receive);
  }, [activeSectionKey, bootstrap, identity, loadSection]);

  return useMemo(() => Object.freeze({ bootstrap, bootstrapStatus, ...(bootstrapError ? { bootstrapError } : {}), sections: Object.freeze(sections), ...(activeSectionKey ? { activeSectionKey } : {}), selectSection, preloadSection, observeSection, retrySection, loadMore, invalidate }), [activeSectionKey, bootstrap, bootstrapError, bootstrapStatus, invalidate, loadMore, observeSection, preloadSection, retrySection, sections, selectSection]);
}

/** Call after a command, attachment, comment, or role mutation to evict scoped resources. */
export function invalidateEntityRuntimeSectionCache(input: { readonly cacheScope: string; readonly entityCode: string; readonly recordId: string; readonly surfaceKey: string; readonly sectionKey?: string }): void {
  const identity = `${input.cacheScope}:${input.entityCode}:${input.recordId}:${input.surfaceKey}`;
  evict(identity, input.sectionKey);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(INVALIDATION_EVENT, { detail: { identity, ...(input.sectionKey ? { sectionKey: input.sectionKey } : {}) } }));
}
function evict(identity: string, sectionKey?: string): void {
  const prefix = `${identity}:`;
  for (const key of sectionCache.keys()) if (key.startsWith(prefix) && (!sectionKey || key.endsWith(`:${sectionKey}`))) sectionCache.delete(key);
}
function message(cause: unknown): string { return cause instanceof Error && cause.message ? cause.message : "This section is unavailable."; }

function sectionAvailability(cause: unknown): "context_required" | "forbidden" | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const failure = cause as { readonly status?: unknown; readonly problem?: { readonly code?: unknown } };
  if (failure.status === 403) return "forbidden";
  if (failure.status !== 409) return undefined;
  return failure.problem?.code === "ENTITY_RUNTIME_CONTEXT_REQUIRED" || failure.problem?.code === "BP_360_SCOPE_REQUIRED"
    ? "context_required"
    : undefined;
}
