"use client";

/**
 * DocumentEditCoordinator
 *
 * Contract-aware lifecycle coordinator scaffold for document edit runtime v5.
 * This module owns query identity, core/section fetch orchestration, and
 * invalidation helpers. Existing document surfaces can migrate onto these
 * hooks incrementally; no legacy runtime behavior is replaced by this slice.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from "@tanstack/react-query";
import { csrfFetch } from "@athyper/runtime-shared/client";
import { buildCompiledEntityQueryKey } from "@athyper/runtime-line-item";
import { buildDocumentRulesQueryKey, type DocumentRuleSet } from "./use-document-rules";
import {
  DocumentEditSubmitResponseV1Schema,
  type DocumentEditSubmitIntent,
  type DocumentEditSubmitRequestV1,
  type DocumentEditSubmitResponseV1,
} from "@athyper/api-contracts/document-edit-submit";
import {
  AnyDocumentEditRuntimeContractSchema,
  ResolveChangeRequestSchema,
  ResolveChangeResponseSchema,
  SectionBatchResponseSchema,
  hashContext,
  type DocumentEditRuntimeContract,
  type DocumentEditSection,
  type ReactionPolicy,
  type ResolveChangeInvalidation,
  type ResolveChangeRequest,
  type ResolveChangeResponse,
  type SectionBatchResponse,
} from "@athyper/runtime-contracts";
import { markDocumentEditPerformance } from "./document-edit-performance-marks";
import type {
  AddressCandidate,
  AddressDefaultPick,
  AddressPickerDataProvider,
  AddressPickerDataRequest,
} from "@athyper/content-ui";

const DOCUMENT_EDIT_TELEMETRY_DEBUG_STORAGE_KEY = "athyper:document-edit-debug";
const documentEditTelemetryCounters = new Map<string, number>();
const documentEditTelemetryStartedAt = Date.now();
let documentEditTelemetryUpdatedAt = documentEditTelemetryStartedAt;

export interface DocumentEditTelemetrySnapshot {
  startedAt: number;
  updatedAt: number;
  counters: Record<string, number>;
}

declare global {
  interface Window {
    __athyperDocumentEditTelemetry?: () => DocumentEditTelemetrySnapshot;
    __athyperDocumentEditTelemetryCounters?: () => Record<string, number>;
    __athyperDocumentEditTelemetryEnabled?: boolean;
  }
}

exposeDocumentEditTelemetry();

export function incrementDocumentEditTelemetryCounter(name: string, delta = 1): void {
  documentEditTelemetryCounters.set(name, (documentEditTelemetryCounters.get(name) ?? 0) + delta);
  documentEditTelemetryUpdatedAt = Date.now();
  exposeDocumentEditTelemetry();
}

export function readDocumentEditTelemetryCounters(): Record<string, number> {
  return Object.fromEntries(documentEditTelemetryCounters.entries());
}

export function readDocumentEditTelemetrySnapshot(): DocumentEditTelemetrySnapshot {
  return {
    startedAt: documentEditTelemetryStartedAt,
    updatedAt: documentEditTelemetryUpdatedAt,
    counters: readDocumentEditTelemetryCounters(),
  };
}

export function resetDocumentEditTelemetryCounters(): void {
  documentEditTelemetryCounters.clear();
  documentEditTelemetryUpdatedAt = Date.now();
  exposeDocumentEditTelemetry();
}

function exposeDocumentEditTelemetry(): void {
  if (typeof window === "undefined") return;
  if (!isDocumentEditTelemetryEnabled()) {
    delete window.__athyperDocumentEditTelemetry;
    delete window.__athyperDocumentEditTelemetryCounters;
    return;
  }
  window.__athyperDocumentEditTelemetry = readDocumentEditTelemetrySnapshot;
  window.__athyperDocumentEditTelemetryCounters = readDocumentEditTelemetryCounters;
}

function isDocumentEditTelemetryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__athyperDocumentEditTelemetryEnabled === true) return true;
  try {
    const storageFlag = window.localStorage.getItem(DOCUMENT_EDIT_TELEMETRY_DEBUG_STORAGE_KEY);
    const queryFlag = new URLSearchParams(window.location.search).get("documentEditDebug");
    return isTruthyDebugFlag(storageFlag) || isTruthyDebugFlag(queryFlag);
  } catch {
    return false;
  }
}

function isTruthyDebugFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "on";
}

export interface DocumentEditCoordinatorIdentity {
  tenantId: string;
  planeKey?: string;
  realmKey?: string;
  effectivePrincipal: string;
  permissionStamp: string;
}

export interface DocumentEditCoordinatorEndpoints {
  open: string;
  hydrate: string;
  core: string;
  sections: string;
  address: string;
  resolveChange: string;
  fieldOptionsBatch: string;
  preflight: string;
  submit: string;
  discard: string;
  events: string;
}

export interface DocumentEditSectionQueryOptions {
  enabled?: boolean;
  context?: Record<string, unknown>;
}

export interface DocumentEditSectionEntry {
  key: string;
  status: "ok" | "forbidden" | "timeout" | "error" | "degraded";
  version?: string;
  data?: unknown;
  fallback?: unknown;
  error?: {
    code: string;
    category: string;
    retryable: boolean;
  };
  timing: {
    serverMs: number;
    cacheHit: "browser" | "redis" | "db" | "none";
  };
}

export type DocumentEditFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface DocumentEditCoordinatorProps {
  contract: DocumentEditRuntimeContract;
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
  fetcher?: DocumentEditFetch;
  initialCore?: unknown;
  initialOpen?: DocumentEditOpenResult;
  children: ReactNode;
}

export interface DocumentEditCoordinatorValue {
  contract: DocumentEditRuntimeContract;
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
  endpoints: DocumentEditCoordinatorEndpoints;
  fetcher: DocumentEditFetch;
  initialCore?: unknown;
  workspaceId: string | null;
  transport: DocumentEditTransport;
  openWorkspace: (reason?: "initial" | "refresh") => Promise<DocumentEditOpenResult>;
  clearWorkspace: () => void;
  runWithWorkspace: <T>(operation: (workspaceId: string) => Promise<T>) => Promise<T>;
  submitWorkspaceChanges: (input: DocumentWorkspaceSubmitInput) => Promise<DocumentEditSubmitResponseV1>;
  discardDraft: () => Promise<{ cleared: boolean }>;
  sourceTabId: string;
  getSection: (sectionKey: string) => DocumentEditSection | null;
  prefetchSection: (sectionKey: string, context?: Record<string, unknown>) => Promise<void>;
  invalidateSection: (sectionKey: string, context?: Record<string, unknown>) => Promise<void>;
  invalidateCore: () => Promise<void>;
  applyInvalidations: (invalidations: ResolveChangeInvalidation[], context?: Record<string, unknown>) => Promise<void>;
  resolveFieldChange: (request: ResolveChangeRequest) => Promise<ResolveChangeResponse>;
  applyReaction: (eventType: string, sectionKey?: string) => Promise<void>;
}

export interface DocumentWorkspaceSubmitInput {
  etag: string;
  changes: DocumentEditSubmitRequestV1["changes"];
  intent?: DocumentEditSubmitIntent;
  action?: DocumentEditSubmitRequestV1["action"];
}

export interface PendingDocumentSubmitAttempt {
  idempotencyKey: string;
  clientSeq: number;
}

const DocumentEditCoordinatorContext = createContext<DocumentEditCoordinatorValue | null>(null);

export interface DocumentEditOpenResult {
  workspaceId: string;
  planHash: string;
  core: unknown;
  sections: SectionBatchResponse;
  transport: DocumentEditTransport;
}

export interface DocumentEditTransport {
  save: "workspace_submit";
  saveAndTransition: boolean;
  events: "workspace_events";
}

const DEFAULT_DOCUMENT_EDIT_TRANSPORT: DocumentEditTransport = {
  save: "workspace_submit",
  saveAndTransition: true,
  events: "workspace_events",
};

export function DocumentEditCoordinatorProvider({
  contract,
  entityCode,
  recordId,
  identity,
  fetcher = defaultDocumentEditFetch,
  initialCore,
  initialOpen,
  children,
}: DocumentEditCoordinatorProps) {
  const queryClient = useQueryClient();
  const seededOpenRef = useRef<DocumentEditOpenResult | null>(null);
  if (initialOpen && seededOpenRef.current !== initialOpen) {
    seedDocumentOpenProjections(queryClient, initialOpen, identity);
    seededOpenRef.current = initialOpen;
  }
  const parsedContract = useMemo(
    () => AnyDocumentEditRuntimeContractSchema.parse(contract),
    [contract],
  );
  const endpoints = useMemo(
    () => buildDocumentEditEndpoints(entityCode, recordId),
    [entityCode, recordId],
  );
  const sourceTabId = useMemo(createDocumentEditSourceTabId, []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialOpen?.workspaceId ?? null);
  const [planHash, setPlanHash] = useState(initialOpen?.planHash ?? parsedContract.schemaVersion);
  const [transport, setTransport] = useState<DocumentEditTransport>(initialOpen?.transport ?? DEFAULT_DOCUMENT_EDIT_TRANSPORT);
  const transportRef = useRef<DocumentEditTransport>(initialOpen?.transport ?? DEFAULT_DOCUMENT_EDIT_TRANSPORT);
  const initialOpenRef = useRef<DocumentEditOpenResult | null>(initialOpen ?? null);
  const workspaceIdRef = useRef<string | null>(initialOpen?.workspaceId ?? null);
  const workspaceOpenRef = useRef<Promise<DocumentEditOpenResult> | null>(null);
  const submitClientSeqRef = useRef(0);
  const pendingSubmitAttemptsRef = useRef(new Map<string, PendingDocumentSubmitAttempt>());
  const recoveryKey = useMemo(
    () => documentEditWorkspaceRecoveryKey({
      entityCode,
      recordId,
      identity,
      planHash,
    }),
    [entityCode, identity, planHash, recordId],
  );
  const recoveryScope = useMemo(
    () => [
      identity.tenantId,
      identity.effectivePrincipal,
      identity.permissionStamp,
      entityCode,
      recordId,
    ].join("\u0000"),
    [entityCode, identity.effectivePrincipal, identity.permissionStamp, identity.tenantId, recordId],
  );
  const previousRecoveryScopeRef = useRef(recoveryScope);
  const activeRecoveryKeyRef = useRef<string | null>(initialOpen ? recoveryKey : null);

  const rememberWorkspace = useCallback((value: string | null, storageKey = recoveryKey) => {
    workspaceIdRef.current = value;
    setWorkspaceId(value);
    if (typeof window === "undefined") return;
    try {
      const previousStorageKey = activeRecoveryKeyRef.current;
      if (value) {
        if (previousStorageKey && previousStorageKey !== storageKey) {
          window.sessionStorage.removeItem(previousStorageKey);
        }
        window.sessionStorage.setItem(storageKey, value);
        activeRecoveryKeyRef.current = storageKey;
      } else {
        if (previousStorageKey) window.sessionStorage.removeItem(previousStorageKey);
        if (storageKey !== previousStorageKey) window.sessionStorage.removeItem(storageKey);
        activeRecoveryKeyRef.current = null;
      }
    } catch {
      // Reload recovery is best-effort; coordinator memory remains authoritative.
    }
  }, [recoveryKey]);

  const clearWorkspace = useCallback(() => {
    workspaceOpenRef.current = null;
    initialOpenRef.current = null;
    rememberWorkspace(null);
  }, [rememberWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (previousRecoveryScopeRef.current !== recoveryScope) {
      const activeKey = activeRecoveryKeyRef.current;
      try { if (activeKey) window.sessionStorage.removeItem(activeKey); } catch { /* best-effort */ }
      workspaceIdRef.current = null;
      workspaceOpenRef.current = null;
      activeRecoveryKeyRef.current = null;
    }
    previousRecoveryScopeRef.current = recoveryScope;
    let recovered = workspaceIdRef.current;
    try {
      if (!recovered) {
        const stored = findDocumentEditWorkspaceRecovery(window.sessionStorage, {
          entityCode,
          recordId,
          identity,
        });
        recovered = stored?.workspaceId ?? null;
        activeRecoveryKeyRef.current = stored?.key ?? null;
      }
      // Remove the pre-Phase-2 unscoped key so it cannot cross tenant,
      // principal, permission-stamp, or plan boundaries.
      window.sessionStorage.removeItem(`document-edit-workspace:${entityCode}:${recordId}`);
    } catch {
      recovered = null;
    }
    workspaceIdRef.current = recovered;
    setWorkspaceId(recovered);
  }, [entityCode, identity, recordId, recoveryKey, recoveryScope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const clearAll = () => {
      clearDocumentEditWorkspaceRecovery(window.sessionStorage);
      workspaceIdRef.current = null;
      workspaceOpenRef.current = null;
      setWorkspaceId(null);
    };
    window.addEventListener("athyper:session-logout", clearAll);
    return () => window.removeEventListener("athyper:session-logout", clearAll);
  }, []);

  useEffect(() => {
    resetDocumentEditTelemetryCounters();
  }, [
    entityCode,
    identity.effectivePrincipal,
    identity.permissionStamp,
    identity.planeKey,
    identity.realmKey,
    identity.tenantId,
    recordId,
  ]);

  const getSection = useCallback(
    (sectionKey: string): DocumentEditSection | null =>
      parsedContract.sections.find((section) => section.key === sectionKey) ?? null,
    [parsedContract.sections],
  );

  const openWorkspace = useCallback(async (reason: "initial" | "refresh" = "initial"): Promise<DocumentEditOpenResult> => {
    markDocumentEditPerformance("document-open-started");
    if (reason === "initial" && initialOpenRef.current) {
      const opened = initialOpenRef.current;
      seedDocumentOpenProjections(queryClient, opened, identity);
      setPlanHash(opened.planHash);
      rememberWorkspace(opened.workspaceId, documentEditWorkspaceRecoveryKey({
        entityCode,
        recordId,
        identity,
        planHash: opened.planHash,
      }));
      for (const section of opened.sections.sections) {
        const descriptor = getSection(section.key);
        queryClient.setQueryData(buildDocumentEditSectionQueryKey({
          contract: parsedContract,
          entityCode,
          recordId,
          identity,
          sectionKey: section.key,
          sectionVersion: descriptor?.versionRef ?? section.version ?? "",
          context: {},
        }), section);
      }
      markDocumentEditPerformance("document-open-completed");
      return opened;
    }
    if (workspaceOpenRef.current) return workspaceOpenRef.current;
    const opening = fetchDocumentEditOpen(fetcher, endpoints.open, identity, reason)
      .then((opened) => {
        seedDocumentOpenProjections(queryClient, opened, identity);
        setPlanHash(opened.planHash);
        rememberWorkspace(opened.workspaceId, documentEditWorkspaceRecoveryKey({
          entityCode,
          recordId,
          identity,
          planHash: opened.planHash,
        }));
        transportRef.current = opened.transport;
        setTransport(opened.transport);
        for (const section of opened.sections.sections) {
          const descriptor = getSection(section.key);
          queryClient.setQueryData(buildDocumentEditSectionQueryKey({
            contract: parsedContract,
            entityCode,
            recordId,
            identity,
            sectionKey: section.key,
            sectionVersion: descriptor?.versionRef ?? section.version ?? "",
          context: {},
        }), section);
        }
        markDocumentEditPerformance("document-open-completed");
        return opened;
      })
      .finally(() => {
        workspaceOpenRef.current = null;
      });
    workspaceOpenRef.current = opening;
    return opening;
  }, [endpoints.open, entityCode, fetcher, getSection, identity, parsedContract, queryClient, recordId, rememberWorkspace]);

  const runWithWorkspace = useCallback(async <T,>(
    operation: (activeWorkspaceId: string) => Promise<T>,
  ): Promise<T> => withStaleWorkspaceRetry({
    operation: async () => {
      const activeWorkspaceId = workspaceIdRef.current ?? (await openWorkspace()).workspaceId;
      return operation(activeWorkspaceId);
    },
    refreshWorkspace: async () => {
      incrementDocumentEditTelemetryCounter("workspace.refresh_retry");
      clearWorkspace();
      await openWorkspace("refresh");
    },
  }), [clearWorkspace, openWorkspace]);

  const discardDraft = useCallback(async (): Promise<{ cleared: boolean }> => {
    incrementDocumentEditTelemetryCounter("draft.discard.requested");
    const result = await runWithWorkspace(async (activeWorkspaceId) => {
      return discardDocumentEditDraft({
        fetcher,
        endpoint: endpoints.discard,
        identity,
        workspaceId: activeWorkspaceId,
        sourceTabId,
      });
    });
    incrementDocumentEditTelemetryCounter(result.cleared ? "draft.discard.cleared" : "draft.discard.empty");
    clearWorkspace();
    return result;
  }, [clearWorkspace, endpoints.discard, fetcher, identity, runWithWorkspace, sourceTabId]);

  const submitWorkspaceChanges = useCallback(async (
    input: DocumentWorkspaceSubmitInput,
  ): Promise<DocumentEditSubmitResponseV1> => {
    const intent = input.intent ?? "save";
    const transportMode = transportRef.current.save;
    const startedAt = Date.now();
    incrementDocumentEditTelemetryCounter(`save.${transportMode}.requested`);
    if (intent === "save_and_transition" && (
      transportRef.current.saveAndTransition === false
      ||
      parsedContract.submitPolicy.saveAndTransitionEnabled === false
    )) {
      incrementDocumentEditTelemetryCounter("save.save_and_transition.disabled");
      throw new DocumentEditRequestError(
        "SAVE_AND_TRANSITION_DISABLED",
        "Save and transition is temporarily disabled for this document entity.",
        409,
      );
    }
    const signature = JSON.stringify({
      etag: input.etag,
      intent,
      changes: input.changes,
      action: input.action ?? null,
    });
    let attempt = pendingSubmitAttemptsRef.current.get(signature);
    if (!attempt) {
      submitClientSeqRef.current += 1;
      attempt = resolveDocumentSubmitAttempt({
        attempts: pendingSubmitAttemptsRef.current,
        signature,
        sourceTabId,
        clientSeq: submitClientSeqRef.current,
      });
    }

    try {
      const response = await runWithWorkspace((activeWorkspaceId) => fetchDocumentEditSubmit({
        fetcher,
        endpoint: endpoints.submit,
        identity,
        workspaceId: activeWorkspaceId,
        sourceTabId,
        clientSeq: attempt.clientSeq,
        idempotencyKey: attempt.idempotencyKey,
        etag: input.etag,
        intent,
        changes: input.changes,
        ...(input.action ? { action: input.action } : {}),
      }));
      pendingSubmitAttemptsRef.current.delete(signature);
      recordDocumentSaveTelemetry(transportMode, startedAt, "success");
      return response;
    } catch (error) {
      // A response from the server is definitive. A transport failure is
      // ambiguous, so retain the attempt and reuse its key and clientSeq when
      // the caller retries with the same idempotency key.
      if (error instanceof DocumentEditRequestError && error.code !== "IDEMPOTENCY_IN_PROGRESS") {
        pendingSubmitAttemptsRef.current.delete(signature);
      }
      recordDocumentSaveTelemetry(transportMode, startedAt, "failure", error);
      throw error;
    }
  }, [endpoints.submit, fetcher, identity, parsedContract.submitPolicy.saveAndTransitionEnabled, runWithWorkspace, sourceTabId]);

  const prefetchSection = useCallback(
    async (sectionKey: string, context: Record<string, unknown> = {}) => {
      const section = getSection(sectionKey);
      if (!section) return;
      await queryClient.prefetchQuery({
        queryKey: buildDocumentEditSectionQueryKey({
          contract: parsedContract,
          entityCode,
          recordId,
          identity,
          sectionKey,
          context,
          sectionVersion: section.versionRef,
        }),
        queryFn: () => loadDocumentEditSectionForLifecycle({
          section,
          sectionKey,
          openWorkspace,
          hydrate: () => runWithWorkspace((activeWorkspaceId) => fetchWorkspaceSection({
            fetcher,
            endpoints,
            sectionKey,
            context,
            identity,
            workspaceId: activeWorkspaceId,
          })),
        }),
        staleTime: section.cacheTtlMs,
      });
    },
    [endpoints, entityCode, fetcher, getSection, identity, openWorkspace, parsedContract, queryClient, recordId, runWithWorkspace],
  );

  const invalidateSection = useCallback(
    async (sectionKey: string, context: Record<string, unknown> = {}) => {
      const section = getSection(sectionKey);
      await queryClient.invalidateQueries({
        queryKey: buildDocumentEditSectionQueryKey({
          contract: parsedContract,
          entityCode,
          recordId,
          identity,
          sectionKey,
          context,
          sectionVersion: section?.versionRef ?? "",
        }),
      });
    },
    [entityCode, getSection, identity, parsedContract, queryClient, recordId],
  );

  const invalidateCore = useCallback(
    async () => {
      await queryClient.invalidateQueries({
        queryKey: buildDocumentEditCoreQueryKey({
          contract: parsedContract,
          entityCode,
          recordId,
          identity,
        }),
      });
    },
    [entityCode, identity, parsedContract, queryClient, recordId],
  );

  const applyReaction = useCallback(
    async (eventType: string, sectionKey?: string) => {
      const reaction = parsedContract.sseReactions[eventType];
      await applyDocumentEditReaction({
        queryClient,
        reaction,
        contract: parsedContract,
        entityCode,
        recordId,
        identity,
        sectionKey,
      });
    },
    [entityCode, identity, parsedContract, queryClient, recordId],
  );

  const applyInvalidations = useCallback(
    async (invalidations: ResolveChangeInvalidation[], _context: Record<string, unknown> = {}) => {
      if (invalidations.length === 0) return;

      // Resolver output can name the same cache target more than once (for
      // example, multiple changed dependencies may all invalidate the items
      // section). Invalidating an active query once per entry aborts/restarts
      // the same request and creates a network storm. Coalesce by the actual
      // query target before asking React Query to refetch it.
      const uniqueInvalidations = dedupeDocumentEditInvalidations(invalidations);

      const coreKey = buildDocumentEditCoreQueryKey({
        contract: parsedContract,
        entityCode,
        recordId,
        identity,
      });

      await Promise.all(uniqueInvalidations.map(async (invalidation) => {
        if (invalidation.type === "core") {
          await queryClient.invalidateQueries({ queryKey: coreKey });
          return;
        }

        if (invalidation.type === "section") {
          await queryClient.invalidateQueries({ queryKey: [...coreKey, "section", invalidation.key] });
          return;
        }

        if (invalidation.type === "address_role") {
          await queryClient.invalidateQueries({ queryKey: [...coreKey, "address"] });
          return;
        }

        await queryClient.invalidateQueries({ queryKey: [...coreKey, "options", invalidation.key] });
      }));
    },
    [entityCode, identity, parsedContract, queryClient, recordId],
  );

  const resolveFieldChange = useCallback(
    async (request: ResolveChangeRequest) => runWithWorkspace((activeWorkspaceId) =>
      resolveDocumentEditFieldChange({
        fetcher,
        endpoint: endpoints.resolveChange,
        request,
        identity,
        workspaceId: activeWorkspaceId,
      })),
    [endpoints.resolveChange, fetcher, identity, runWithWorkspace],
  );

  const value = useMemo<DocumentEditCoordinatorValue>(
    () => ({
      contract: parsedContract,
      entityCode,
      recordId,
      identity,
      endpoints,
      fetcher,
      initialCore,
      workspaceId,
      transport,
      openWorkspace,
      clearWorkspace,
      runWithWorkspace,
      submitWorkspaceChanges,
      discardDraft,
      sourceTabId,
      getSection,
      prefetchSection,
      invalidateSection,
      invalidateCore,
      applyInvalidations,
      resolveFieldChange,
      applyReaction,
    }),
    [
      applyInvalidations,
      applyReaction,
      clearWorkspace,
      discardDraft,
      endpoints,
      entityCode,
      fetcher,
      getSection,
      identity,
      initialCore,
      invalidateCore,
      invalidateSection,
      openWorkspace,
      parsedContract,
      prefetchSection,
      recordId,
      runWithWorkspace,
      workspaceId,
      transport,
      resolveFieldChange,
      sourceTabId,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const source = new EventSource(
      endpoints.events,
      { withCredentials: true },
    );

    const onError = () => {
      incrementDocumentEditTelemetryCounter("events.error");
    };
    const onCatchupReset = () => {
      incrementDocumentEditTelemetryCounter("events.catchup_reset");
      void invalidateCore();
    };
    const onRecordInvalidated = (event: Event) => {
      incrementDocumentEditTelemetryCounter("events.record_invalidated");
      const data = readDocumentEditEventData(event);
      const eventType = readEventType(data, "document_edit_record_updated");
      if (
        eventType === "document_edit_permissions_changed"
        || eventType === "document_edit_principal_cache_invalidated"
        || eventType === "session.revoked"
        || eventType === "document_edit_client_draft_discarded"
      ) {
        clearWorkspace();
      }
      if (isOwnDocumentEditEvent(data, sourceTabId)) {
        incrementDocumentEditTelemetryCounter("events.self_echo_ignored");
        return;
      }
      void applyReaction(eventType);
      void invalidateCore();
    };
    const onSectionInvalidated = (event: Event) => {
      incrementDocumentEditTelemetryCounter("events.section_invalidated");
      const data = readDocumentEditEventData(event);
      if (isOwnDocumentEditEvent(data, sourceTabId)) {
        incrementDocumentEditTelemetryCounter("events.self_echo_ignored");
        return;
      }
      const sectionKey = readString(data["sectionKey"]) ?? readString(data["key"]);
      if (!sectionKey) {
        void invalidateCore();
        return;
      }
      void applyReaction(readEventType(data, "document_edit_section_invalidated"), sectionKey);
      void applyInvalidations([{ type: "section", key: sectionKey }]);
    };

    source.addEventListener("open", () => {
      incrementDocumentEditTelemetryCounter("events.connected");
    });
    source.addEventListener("error", onError);
    source.addEventListener("document_edit_catchup_reset", onCatchupReset);
    source.addEventListener("document_edit_record_updated", onRecordInvalidated);
    source.addEventListener("document_edit_permissions_changed", onRecordInvalidated);
    source.addEventListener("document_edit_principal_cache_invalidated", onRecordInvalidated);
    source.addEventListener("document_edit_record_removed", onRecordInvalidated);
    source.addEventListener("document_edit_client_draft_discarded", onRecordInvalidated);
    source.addEventListener("document_edit_section_invalidated", onSectionInvalidated);
    source.addEventListener("document_edit_section_draft_discarded", onSectionInvalidated);
    source.addEventListener("document_edit_row_draft_discarded", onSectionInvalidated);

    return () => {
      source.close();
    };
  }, [
    applyInvalidations,
    applyReaction,
    clearWorkspace,
    endpoints.events,
    invalidateCore,
    sourceTabId,
  ]);

  return (
    <DocumentEditCoordinatorContext.Provider value={value}>
      {children}
    </DocumentEditCoordinatorContext.Provider>
  );
}

export function useDocumentEditCoordinator(): DocumentEditCoordinatorValue {
  const value = useContext(DocumentEditCoordinatorContext);
  if (!value) {
    throw new Error("useDocumentEditCoordinator must be used inside <DocumentEditCoordinatorProvider>.");
  }
  return value;
}

export function useOptionalDocumentEditCoordinator(): DocumentEditCoordinatorValue | null {
  return useContext(DocumentEditCoordinatorContext);
}

export function useDocumentAddressDataProvider(): AddressPickerDataProvider | undefined {
  const coordinator = useOptionalDocumentEditCoordinator();
  const queryClient = useQueryClient();

  return useMemo<AddressPickerDataProvider | undefined>(() => {
    if (!coordinator) return undefined;
    return {
      loadCandidates: (request) => {
        const queryKey = buildDocumentEditAddressQueryKey({
            coordinator,
            type: "candidates",
            request,
        });
        recordDocumentEditQueryReuse(queryClient, queryKey, "address.candidates");
        return queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetchDocumentEditAddress<AddressCandidate[]>({
            fetcher: coordinator.fetcher,
            endpoint: coordinator.endpoints.address,
            type: "candidates",
            request,
            identity: coordinator.identity,
          }),
          staleTime: addressTtlMs(coordinator, request),
        });
      },
      resolveDefault: (request) => {
        const queryKey = buildDocumentEditAddressQueryKey({
            coordinator,
            type: "default",
            request,
        });
        recordDocumentEditQueryReuse(queryClient, queryKey, "address.default");
        return queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetchDocumentEditAddress<AddressDefaultPick | null>({
            fetcher: coordinator.fetcher,
            endpoint: coordinator.endpoints.address,
            type: "default",
            request,
            identity: coordinator.identity,
          }),
          staleTime: addressTtlMs(coordinator, request),
        });
      },
    };
  }, [coordinator, queryClient]);
}

export function useDocumentEditCore(): UseQueryResult<unknown, Error> {
  const coordinator = useDocumentEditCoordinator();
  return useQuery({
    queryKey: buildDocumentEditCoreQueryKey({
      contract: coordinator.contract,
      entityCode: coordinator.entityCode,
      recordId: coordinator.recordId,
      identity: coordinator.identity,
    }),
    queryFn: async () => {
      const opened = await coordinator.openWorkspace();
      return opened.core;
    },
    initialData: coordinator.initialCore,
    staleTime: coordinator.contract.core.ttlMs,
  });
}

export function useDocumentEditSection(
  sectionKey: string,
  options: DocumentEditSectionQueryOptions = {},
): UseQueryResult<DocumentEditSectionEntry, Error> {
  const coordinator = useDocumentEditCoordinator();
  const section = coordinator.getSection(sectionKey);
  const context = options.context ?? {};
  const enabled = options.enabled ?? Boolean(section && isDocumentEditSectionAutoLoad(section.loadPolicy));

  return useQuery({
    queryKey: buildDocumentEditSectionQueryKey({
      contract: coordinator.contract,
      entityCode: coordinator.entityCode,
      recordId: coordinator.recordId,
      identity: coordinator.identity,
      sectionKey,
      context,
      sectionVersion: section?.versionRef ?? "",
    }),
    queryFn: () => fetchDocumentEditSection({
      fetcher: coordinator.fetcher,
      endpoint: coordinator.endpoints.sections,
      sectionKey,
      context,
      identity: coordinator.identity,
    }),
    enabled,
    staleTime: section?.cacheTtlMs ?? 0,
  });
}

export function useOptionalDocumentEditSection(
  sectionKey: string | null | undefined,
  options: DocumentEditSectionQueryOptions = {},
): UseQueryResult<DocumentEditSectionEntry, Error> {
  const coordinator = useOptionalDocumentEditCoordinator();
  const section = sectionKey ? coordinator?.getSection(sectionKey) ?? null : null;
  const context = options.context ?? {};
  const enabled = Boolean(
    coordinator
    && sectionKey
    && section
    && (options.enabled ?? isDocumentEditSectionAutoLoad(section.loadPolicy)),
  );

  return useQuery({
    queryKey: coordinator && sectionKey
      ? buildDocumentEditSectionQueryKey({
          contract: coordinator.contract,
          entityCode: coordinator.entityCode,
          recordId: coordinator.recordId,
          identity: coordinator.identity,
          sectionKey,
          context,
          sectionVersion: section?.versionRef ?? "",
        })
      : ["document-edit", "section", "disabled", sectionKey ?? ""],
    queryFn: () => {
      if (!coordinator || !sectionKey) {
        throw new Error("Document edit coordinator is not available.");
      }
      if (!section) throw new Error(`Document edit section "${sectionKey}" is not registered.`);
      return loadDocumentEditSectionForLifecycle({
        section,
        sectionKey,
        openWorkspace: coordinator.openWorkspace,
        hydrate: () => coordinator.runWithWorkspace((activeWorkspaceId) => fetchWorkspaceSection({
          fetcher: coordinator.fetcher,
          endpoints: coordinator.endpoints,
          sectionKey,
          context,
          identity: coordinator.identity,
          workspaceId: activeWorkspaceId,
        })),
      });
    },
    enabled,
    staleTime: section?.cacheTtlMs ?? 0,
  });
}

export function buildDocumentEditEndpoints(entityCode: string, recordId: string): DocumentEditCoordinatorEndpoints {
  const entity = encodeURIComponent(entityCode);
  const id = encodeURIComponent(recordId);
  const base = `/api/runtime/v1/entities/${entity}/${id}/edit`;
  return {
    open: `${base}/open`,
    hydrate: `${base}/hydrate`,
    core: `${base}/core`,
    sections: `${base}/sections`,
    address: `${base}/address`,
    resolveChange: `${base}/resolve-change`,
    fieldOptionsBatch: `${base}/field-options/batch`,
    preflight: `${base}/preflight`,
    submit: `${base}/submit`,
    discard: `${base}/discard`,
    events: `${base}/events`,
  };
}

export function buildDocumentEditCoreQueryKey(input: {
  contract: DocumentEditRuntimeContract;
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
}): QueryKey {
  return [
    "document-edit",
    input.contract.schemaVersion,
    "core",
    input.identity.tenantId,
    input.identity.planeKey ?? "",
    input.identity.realmKey ?? "",
    input.identity.effectivePrincipal,
    input.identity.permissionStamp,
    input.entityCode,
    input.recordId,
  ];
}

export function buildDocumentEditSectionQueryKey(input: {
  contract: DocumentEditRuntimeContract;
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
  sectionKey: string;
  context?: Record<string, unknown>;
  sectionVersion?: string;
}): QueryKey {
  return [
    ...buildDocumentEditCoreQueryKey(input),
    "section",
    input.sectionKey,
    input.sectionVersion ?? "",
    hashContext(input.context ?? {}),
  ];
}

export function buildDocumentEditAddressQueryKey(input: {
  coordinator: DocumentEditCoordinatorValue;
  type: "candidates" | "default";
  request: AddressPickerDataRequest;
}): QueryKey {
  return [
    ...buildDocumentEditCoreQueryKey({
      contract: input.coordinator.contract,
      entityCode: input.coordinator.entityCode,
      recordId: input.coordinator.recordId,
      identity: input.coordinator.identity,
    }),
    "address",
    input.type,
    input.request.cacheKey,
    hashContext({
      tenantId: input.request.tenantId || input.coordinator.identity.tenantId,
      ownerWalk: input.request.ownerWalk,
      purposeChain: input.request.purposeChain,
    }),
  ];
}

export function isDocumentEditSectionAutoLoad(loadPolicy: DocumentEditSection["loadPolicy"]): boolean {
  return loadPolicy === "core"
    || loadPolicy === "core_plus_candidates"
    || loadPolicy === "eager_parallel";
}

export function isDocumentEditOpenBootstrapSection(loadPolicy: DocumentEditSection["loadPolicy"]): boolean {
  return loadPolicy === "core" || loadPolicy === "eager_parallel";
}

export async function loadDocumentEditSectionForLifecycle(input: {
  section: DocumentEditSection;
  sectionKey: string;
  openWorkspace: () => Promise<DocumentEditOpenResult>;
  hydrate: () => Promise<DocumentEditSectionEntry>;
}): Promise<DocumentEditSectionEntry> {
  if (!isDocumentEditOpenBootstrapSection(input.section.loadPolicy)) return input.hydrate();
  const opened = await input.openWorkspace();
  const entry = opened.sections.sections.find((candidate) => candidate.key === input.sectionKey);
  if (!entry) {
    throw new Error(`Section "${input.sectionKey}" missing from document OPEN response.`);
  }
  return entry;
}

export function dedupeDocumentEditInvalidations(
  invalidations: readonly ResolveChangeInvalidation[],
): ResolveChangeInvalidation[] {
  const seen = new Set<string>();
  const unique: ResolveChangeInvalidation[] = [];
  for (const invalidation of invalidations) {
    const cacheTarget = invalidation.type === "core"
      ? "core"
      : `${invalidation.type}:${invalidation.key}`;
    if (seen.has(cacheTarget)) continue;
    seen.add(cacheTarget);
    unique.push(invalidation);
  }
  return unique;
}

export async function fetchDocumentEditCore(
  fetcher: DocumentEditFetch,
  endpoint: string,
  identity?: DocumentEditCoordinatorIdentity,
): Promise<unknown> {
  const response = await fetcher(endpoint, {
    method: "GET",
    credentials: "include",
    headers: buildDocumentEditRequestHeaders(identity, { accept: "application/json" }),
  });
  return readDocumentEditJson(response);
}

export async function fetchDocumentEditOpen(
  fetcher: DocumentEditFetch,
  endpoint: string,
  identity?: DocumentEditCoordinatorIdentity,
  reason: "initial" | "refresh" = "initial",
): Promise<DocumentEditOpenResult> {
  const response = await fetcher(endpoint, {
    method: "POST",
    credentials: "include",
    headers: buildDocumentEditRequestHeaders(identity, {
      accept: "application/json",
      "x-document-edit-open-reason": reason,
    }),
  });
  const body = await readDocumentEditJson(response) as {
    workspace?: { id?: unknown; planHash?: unknown };
    core?: unknown;
    sections?: unknown;
    transport?: unknown;
  };
  if (typeof body.workspace?.id !== "string" || !body.workspace.id) throw new Error("Document OPEN response did not include a workspace token.");
  if (typeof body.workspace.planHash !== "string" || !body.workspace.planHash) throw new Error("Document OPEN response did not include its effective plan hash.");
  return {
    workspaceId: body.workspace.id,
    planHash: body.workspace.planHash,
    core: body.core,
    sections: SectionBatchResponseSchema.parse(body.sections),
    transport: parseDocumentEditTransport(body.transport),
  };
}

function parseDocumentEditTransport(value: unknown): DocumentEditTransport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_DOCUMENT_EDIT_TRANSPORT;
  }
  const candidate = value as Record<string, unknown>;
  return {
    save: candidate["save"] === "workspace_submit"
      ? "workspace_submit"
      : DEFAULT_DOCUMENT_EDIT_TRANSPORT.save,
    saveAndTransition: candidate["saveAndTransition"] !== false,
    events: candidate["events"] === "workspace_events"
      ? "workspace_events"
      : DEFAULT_DOCUMENT_EDIT_TRANSPORT.events,
  };
}

export function seedDocumentOpenProjections(
  queryClient: QueryClient,
  opened: DocumentEditOpenResult,
  identity: DocumentEditCoordinatorIdentity,
): void {
  if (!opened.core || typeof opened.core !== "object" || Array.isArray(opened.core)) return;
  const core = opened.core as Record<string, unknown>;
  const rules = core["rules"];
  if (rules && typeof rules === "object" && !Array.isArray(rules)) {
    const projection = rules as DocumentRuleSet;
    queryClient.setQueryData(
      buildDocumentRulesQueryKey(projection.entity, identity, projection.version ?? "unversioned"),
      projection,
    );
  }
  const compiledEntities = core["compiledEntities"];
  if (!compiledEntities || typeof compiledEntities !== "object" || Array.isArray(compiledEntities)) return;
  for (const [entityCode, projection] of Object.entries(compiledEntities)) {
    queryClient.setQueryData(buildCompiledEntityQueryKey(entityCode, identity), projection);
  }
}

export async function fetchWorkspaceSection(input: {
  fetcher: DocumentEditFetch;
  endpoints: DocumentEditCoordinatorEndpoints;
  sectionKey: string;
  context: Record<string, unknown>;
  identity: DocumentEditCoordinatorIdentity;
  workspaceId: string | null;
}): Promise<DocumentEditSectionEntry> {
  if (!input.workspaceId) {
    return fetchDocumentEditSection({
      fetcher: input.fetcher,
      endpoint: input.endpoints.sections,
      sectionKey: input.sectionKey,
      context: input.context,
      identity: input.identity,
    });
  }
  const response = await input.fetcher(input.endpoints.hydrate, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildDocumentEditRequestHeaders(input.identity),
      "x-document-edit-workspace": input.workspaceId,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ keys: [input.sectionKey], context: input.context }),
  });
  const body = await readDocumentEditJson(response) as { sections?: unknown };
  const batch = SectionBatchResponseSchema.parse(body.sections);
  const section = batch.sections.find((entry) => entry.key === input.sectionKey);
  if (!section) throw new Error(`Section "${input.sectionKey}" missing from HYDRATE response.`);
  return section;
}

export async function discardDocumentEditDraft(input: {
  fetcher: DocumentEditFetch;
  endpoint: string;
  identity: DocumentEditCoordinatorIdentity;
  workspaceId: string;
  sourceTabId: string;
}): Promise<{ cleared: boolean }> {
  const response = await input.fetcher(input.endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildDocumentEditRequestHeaders(input.identity),
      "x-document-edit-workspace": input.workspaceId,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ operation: "discard_draft", sourceTabId: input.sourceTabId }),
  });
  const body = await readDocumentEditJson(response) as { draft?: { cleared?: unknown } };
  return { cleared: body.draft?.cleared === true };
}

export async function fetchDocumentEditSubmit(input: {
  fetcher: DocumentEditFetch;
  endpoint: string;
  identity: DocumentEditCoordinatorIdentity;
  workspaceId: string;
  sourceTabId: string;
  clientSeq: number;
  idempotencyKey: string;
  etag: string;
  intent: DocumentEditSubmitIntent;
  changes: DocumentEditSubmitRequestV1["changes"];
  action?: DocumentEditSubmitRequestV1["action"];
}): Promise<DocumentEditSubmitResponseV1> {
  const response = await input.fetcher(input.endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildDocumentEditRequestHeaders(input.identity),
      "x-document-edit-workspace": input.workspaceId,
      "if-match": input.etag,
      "idempotency-key": input.idempotencyKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      intent: input.intent,
      changes: input.changes,
      ...(input.action ? { action: input.action } : {}),
      sourceTabId: input.sourceTabId,
      clientSeq: input.clientSeq,
    }),
  });
  const parsed = DocumentEditSubmitResponseV1Schema.parse(await readDocumentEditJson(response));
  if (response.headers.get("X-Document-Edit-Cache") === "idempotency") {
    incrementDocumentEditTelemetryCounter("save.workspace_submit.idempotency_replay");
  }
  return parsed;
}

export async function fetchDocumentEditSection(input: {
  fetcher: DocumentEditFetch;
  endpoint: string;
  sectionKey: string;
  context?: Record<string, unknown>;
  identity?: DocumentEditCoordinatorIdentity;
}): Promise<DocumentEditSectionEntry> {
  const response = await input.fetcher(input.endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildDocumentEditRequestHeaders(input.identity),
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      keys: [input.sectionKey],
      context: input.context ?? {},
    }),
  });
  const body = await readDocumentEditJson(response);
  const parsed = SectionBatchResponseSchema.parse(body) as SectionBatchResponse;
  const section = parsed.sections.find((entry) => entry.key === input.sectionKey);
  if (!section) throw new Error(`Section "${input.sectionKey}" missing from edit/sections response.`);
  if (section.status === "forbidden" || section.status === "timeout" || section.status === "error") {
    throw new Error(section.error?.code ?? `Section "${input.sectionKey}" failed with status ${section.status}.`);
  }
  return section;
}

export async function resolveDocumentEditFieldChange(input: {
  fetcher: DocumentEditFetch;
  endpoint: string;
  request: ResolveChangeRequest;
  identity?: DocumentEditCoordinatorIdentity;
  workspaceId?: string | null;
}): Promise<ResolveChangeResponse> {
  const request = ResolveChangeRequestSchema.parse(input.request);
  const response = await input.fetcher(input.endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildDocumentEditRequestHeaders(input.identity),
      ...(input.workspaceId ? { "x-document-edit-workspace": input.workspaceId } : {}),
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const body = await readDocumentEditJson(response);
  return ResolveChangeResponseSchema.parse(body);
}

export async function applyDocumentEditReaction(input: {
  queryClient: QueryClient;
  reaction?: ReactionPolicy;
  contract: DocumentEditRuntimeContract;
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
  sectionKey?: string;
}): Promise<void> {
  const reaction = input.reaction;
  if (!reaction) return;

  const coreKey = buildDocumentEditCoreQueryKey(input);
  if (reaction.action === "abort_clear_redirect" || reaction.action === "remove") {
    await input.queryClient.cancelQueries({ queryKey: coreKey });
    input.queryClient.removeQueries({ queryKey: coreKey });
    return;
  }

  if (reaction.action === "refetch_core") {
    await input.queryClient.invalidateQueries({ queryKey: coreKey });
    await input.queryClient.refetchQueries({ queryKey: coreKey });
    return;
  }

  if (reaction.target === "section" && input.sectionKey) {
    const section = input.contract.sections.find((item) => item.key === input.sectionKey);
    await input.queryClient.invalidateQueries({
      queryKey: buildDocumentEditSectionQueryKey({
        ...input,
        sectionKey: input.sectionKey,
        sectionVersion: section?.versionRef ?? "",
      }),
    });
    return;
  }

  await input.queryClient.invalidateQueries({ queryKey: coreKey });
}

async function readDocumentEditJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const code = body && typeof body === "object" && "error" in body
      ? String((body as { error?: unknown }).error)
      : "DOCUMENT_EDIT_REQUEST_FAILED";
    const message = body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message)
      : `Document edit request failed (${response.status})`;
    throw new DocumentEditRequestError(code, message, response.status, body);
  }
  return body;
}

export class DocumentEditRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "DocumentEditRequestError";
  }
}

function createDocumentSubmitIdempotencyKey(sourceTabId: string, clientSeq: number): string {
  const nonce = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `document_submit_${sourceTabId}_${clientSeq}_${nonce}`;
}

function recordDocumentSaveTelemetry(
  mode: "workspace_submit",
  startedAt: number,
  outcome: "success" | "failure",
  error?: unknown,
): void {
  incrementDocumentEditTelemetryCounter(`save.${mode}.${outcome}`);
  incrementDocumentEditTelemetryCounter(`save.${mode}.latency_ms_total`, Math.max(0, Date.now() - startedAt));
  if (!(error instanceof DocumentEditRequestError)) return;
  if (error.code === "VERSION_CONFLICT") incrementDocumentEditTelemetryCounter("save.etag_conflict");
  if (error.status === 422) incrementDocumentEditTelemetryCounter("save.validation_failure");
  if (error.code === "INVALID_WORKSPACE" || error.code === "STALE_WORKSPACE" || error.code === "WORKSPACE_PROFILE_DENIED") {
    incrementDocumentEditTelemetryCounter(`workspace.failure.${error.code.toLowerCase()}`);
  }
  if (error.code === "IDEMPOTENCY_IN_PROGRESS") incrementDocumentEditTelemetryCounter("save.idempotency_in_progress");
  if (error.code === "IDEMPOTENCY_KEY_REUSED") incrementDocumentEditTelemetryCounter("save.idempotency_reused");
}

export function resolveDocumentSubmitAttempt(input: {
  attempts: Map<string, PendingDocumentSubmitAttempt>;
  signature: string;
  sourceTabId: string;
  clientSeq: number;
}): PendingDocumentSubmitAttempt {
  const existing = input.attempts.get(input.signature);
  if (existing) return existing;
  const attempt = {
    idempotencyKey: createDocumentSubmitIdempotencyKey(input.sourceTabId, input.clientSeq),
    clientSeq: input.clientSeq,
  };
  input.attempts.set(input.signature, attempt);
  return attempt;
}

/** Retry exactly once and only when the server says the signed workspace is stale. */
export async function withStaleWorkspaceRetry<T>(input: {
  operation: () => Promise<T>;
  refreshWorkspace: () => Promise<void>;
}): Promise<T> {
  try {
    return await input.operation();
  } catch (error) {
    if (!(error instanceof DocumentEditRequestError) || error.code !== "STALE_WORKSPACE") throw error;
    await input.refreshWorkspace();
    return input.operation();
  }
}

const DOCUMENT_EDIT_WORKSPACE_RECOVERY_PREFIX = "document-edit-workspace:v2:";

export function documentEditWorkspaceRecoveryKey(input: {
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
  planHash: string;
}): string {
  return DOCUMENT_EDIT_WORKSPACE_RECOVERY_PREFIX + [
    input.identity.tenantId,
    input.identity.effectivePrincipal,
    input.identity.permissionStamp,
    input.planHash,
    input.entityCode,
    input.recordId,
  ].map((value) => encodeURIComponent(value)).join(":");
}

export function findDocumentEditWorkspaceRecovery(
  storage: Pick<Storage, "length" | "key" | "getItem">,
  input: {
    entityCode: string;
    recordId: string;
    identity: DocumentEditCoordinatorIdentity;
  },
): { key: string; workspaceId: string } | null {
  const identityPrefix = DOCUMENT_EDIT_WORKSPACE_RECOVERY_PREFIX + [
    input.identity.tenantId,
    input.identity.effectivePrincipal,
    input.identity.permissionStamp,
  ].map((value) => encodeURIComponent(value)).join(":") + ":";
  const recordSuffix = ":" + [input.entityCode, input.recordId]
    .map((value) => encodeURIComponent(value))
    .join(":");

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(identityPrefix) || !key.endsWith(recordSuffix)) continue;
    const workspaceId = storage.getItem(key);
    if (workspaceId) return { key, workspaceId };
  }
  return null;
}

export function clearDocumentEditWorkspaceRecovery(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith("document-edit-workspace:")) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

function defaultDocumentEditFetch(input: string, init?: RequestInit): Promise<Response> {
  return csrfFetch(input, init);
}

function recordDocumentEditQueryReuse(queryClient: QueryClient, queryKey: QueryKey, scope: string): void {
  if (queryClient.getQueryData(queryKey) !== undefined) {
    incrementDocumentEditTelemetryCounter(`${scope}.cache_hit`);
  }
  if (queryClient.getQueryState(queryKey)?.fetchStatus === "fetching") {
    incrementDocumentEditTelemetryCounter(`${scope}.inflight_dedupe_hit`);
  }
}

function addressTtlMs(
  coordinator: DocumentEditCoordinatorValue,
  request: AddressPickerDataRequest,
): number {
  const purposeSet = new Set(request.purposeChain);
  const role = coordinator.contract.addressRoles.find((candidate) =>
    candidate.purposes.some((purpose) => purposeSet.has(purpose)),
  );
  return role?.ttlMs ?? 300_000;
}

async function fetchDocumentEditAddress<T>(input: {
  fetcher: DocumentEditFetch;
  endpoint: string;
  type: "candidates" | "default";
  request: AddressPickerDataRequest;
  identity?: DocumentEditCoordinatorIdentity;
}): Promise<T> {
  incrementDocumentEditTelemetryCounter(`address.${input.type}.network_fetch`);
  const response = await input.fetcher(input.endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildDocumentEditRequestHeaders(input.identity),
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: input.type,
      cacheKey: input.request.cacheKey,
      ownerWalk: input.request.ownerWalk,
      purposeChain: input.request.purposeChain,
    }),
  });
  const body = await readDocumentEditJson(response) as { data?: T };
  return body.data as T;
}

function buildDocumentEditRequestHeaders(
  identity: DocumentEditCoordinatorIdentity | undefined,
  headers: Record<string, string> = {},
): Record<string, string> {
  if (!identity?.permissionStamp) return headers;
  return {
    ...headers,
    "x-document-edit-permission-stamp": identity.permissionStamp,
  };
}

function createDocumentEditSourceTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `tab_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readDocumentEditEventData(event: Event): Record<string, unknown> {
  const message = event as MessageEvent<string>;
  if (typeof message.data !== "string" || message.data.length === 0) return {};
  try {
    const parsed = JSON.parse(message.data) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function isOwnDocumentEditEvent(data: Record<string, unknown>, sourceTabId: string): boolean {
  return readString(data["sourceTabId"]) === sourceTabId;
}

function readEventType(data: Record<string, unknown>, fallback: string): string {
  return readString(data["eventType"]) ?? fallback;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
