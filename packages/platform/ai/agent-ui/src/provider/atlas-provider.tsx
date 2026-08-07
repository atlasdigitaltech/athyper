"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  appendUserMessage,
  ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID,
  applyStreamEnvelope,
  atlasSessionScopeKey,
  createInitialConversationState,
  hydrateConversationFromThread,
  markConversationCancelled,
  resolveAvailableDefaultModelId,
  type AgentHistoryMessage,
  type AtlasConversationState,
  type AtlasFeedbackPayload,
  type AtlasPlaneProfile,
  type AtlasSessionScope,
  type AtlasThread,
} from "@athyper/platform-ai-agent-runtime";
import {
  AtlasThreadRequestError,
  AtlasTransportError,
  deleteAtlasThread,
  fetchAgentEvents,
  getAtlasThread,
  listAtlasThreadMessages,
  listAtlasThreads,
  submitAtlasFeedback,
  updateAtlasThread,
} from "@athyper/platform-ai-agent-runtime/browser";
import {
  AtlasContext,
  type AtlasAvailability,
  type AtlasContextValue,
  type AtlasRateLimitNotice,
  type AtlasSurfaceMode,
  type AtlasThreadHistoryContextValue,
} from "./atlas-context";
import { useAtlasCatalog } from "./use-atlas-catalog";
import {
  AtlasContextBindingRegistry,
  currentAtlasRoute,
  type AtlasContextBinding,
} from "./atlas-context-binding";

const DEFAULT_FEEDBACK_ENDPOINT = "/api/relay/ai/feedback";
const DEFAULT_HISTORY_PAGE_SIZE = 50;
const DEFAULT_HISTORY_MAX_THREADS = 500;
const DEFAULT_HISTORY_MAX_RESUME_MESSAGES = 1_000;
const ATLAS_SCOPE_INVALIDATION_EVENTS = [
  "athyper:session-context-change",
  "athyper:tenant-change",
  "athyper:active-organization-change",
  "athyper:permission-stamp-change",
  "athyper:session-logout",
  "athyper:session-expired",
  "athyper:auth-failure",
] as const;

export interface AtlasProviderProps {
  scope: AtlasSessionScope;
  profile: AtlasPlaneProfile;
  /** Plane-aware mutation fetch (for example csrfFetch from runtime-shared). */
  mutationFetch: typeof fetch;
  endpoint?: string;
  /**
   * Set to null when a plane has no feedback permission/route. Otherwise the
   * existing Atlas feedback route is used.
   */
  feedbackEndpoint?: string | null;
  /**
   * Explicit persistence feature configuration. The history surface still
   * remains disabled unless the plane profile also carries
   * `atlas.conversation.persistence`.
   */
  threadHistory?: AtlasThreadHistoryOptions;
  children: ReactNode;
}

export interface AtlasThreadHistoryOptions {
  enabled: boolean;
  /**
   * Approved tenant-effective copy shown until the first server list response
   * supplies its authoritative retention notice.
   */
  retentionNotice: string;
  endpoint?: string;
  pageSize?: number;
  maxThreads?: number;
  maxResumeMessages?: number;
  /** Must be explicitly true and backed by the server manage permission. */
  archiveEnabled?: boolean;
  /** Must be explicitly true and backed by the server delete permission. */
  deleteEnabled?: boolean;
}

interface ThreadHistorySnapshot {
  scopeHash: string;
  threads: AtlasThread[];
  loading: boolean;
  error: string | null;
  retentionNotice: string;
  mutatingThreadId: string | null;
  authorized: boolean | null;
}

export function AtlasProvider({
  scope,
  profile,
  mutationFetch,
  endpoint,
  feedbackEndpoint = DEFAULT_FEEDBACK_ENDPOINT,
  threadHistory,
  children,
}: AtlasProviderProps) {
  const baseScopeHash = useMemo(() => atlasSessionScopeKey(scope), [scope]);
  const [scopeInvalidationRevision, setScopeInvalidationRevision] = useState(0);
  const scopeHash = `${baseScopeHash}:${scopeInvalidationRevision}`;
  const scopeHashRef = useRef(scopeHash);
  scopeHashRef.current = scopeHash;

  const [isOpen, setOpen] = useState(false);
  const [surfaceMode, setSurfaceMode] = useState<AtlasSurfaceMode>("panel");
  const [state, setState] = useState<AtlasConversationState>(
    createInitialConversationState,
  );
  const stateScopeHashRef = useRef(scopeHash);
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const contextBindingsRef = useRef(new AtlasContextBindingRegistry());
  const historyRequestRef = useRef<AbortController | null>(null);
  const historyMutationRef = useRef<AbortController | null>(null);

  const configuredRetentionNotice = threadHistory?.retentionNotice.trim() ?? "";
  const threadHistoryEnabled = Boolean(
    threadHistory?.enabled
    && configuredRetentionNotice
    && profile.capabilityIds.includes(
      ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID,
    ),
  );
  const historyPageSize = boundedInteger(
    threadHistory?.pageSize,
    DEFAULT_HISTORY_PAGE_SIZE,
    1,
    100,
  );
  const historyMaxThreads = boundedInteger(
    threadHistory?.maxThreads,
    DEFAULT_HISTORY_MAX_THREADS,
    historyPageSize,
    2_000,
  );
  const historyMaxResumeMessages = boundedInteger(
    threadHistory?.maxResumeMessages,
    DEFAULT_HISTORY_MAX_RESUME_MESSAGES,
    100,
    5_000,
  );
  const [historySnapshot, setHistorySnapshot] = useState<ThreadHistorySnapshot>(
    () => createHistorySnapshot(scopeHash, configuredRetentionNotice),
  );
  const historySnapshotRef = useRef(historySnapshot);

  // Never render an old scope's messages during the render/effect gap.
  const visibleState = stateScopeHashRef.current === scopeHash
    ? state
    : createInitialConversationState();
  const visibleHistory = historySnapshot.scopeHash === scopeHash
    ? historySnapshot
    : createHistorySnapshot(scopeHash, configuredRetentionNotice);
  stateRef.current = visibleState;
  historySnapshotRef.current = visibleHistory;

  const {
    catalog,
    loading: catalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useAtlasCatalog(scopeHash);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [rateLimitNotice, setRateLimitNotice] =
    useState<AtlasRateLimitNotice | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const restoreRememberedFocus = useCallback(() => {
    const focusTarget = focusReturnRef.current;
    focusReturnRef.current = null;
    queueMicrotask(() => {
      if (focusTarget?.isConnected) focusTarget.focus();
    });
  }, []);
  const availability = useMemo<AtlasAvailability>(() => {
    if (catalogLoading) return "loading";
    if (
      catalogError
      || !currentModelId
      || !catalog?.models.some(
        (model) =>
          model.model_id === currentModelId
          && model.status === "available",
      )
    ) {
      return "unavailable";
    }
    return "ready";
  }, [catalog, catalogError, catalogLoading, currentModelId]);

  useEffect(() => {
    const invalidateScope = () => {
      abortRef.current?.abort(
        new DOMException("Atlas session scope invalidated", "AbortError"),
      );
      abortRef.current = null;
      historyRequestRef.current?.abort(
        new DOMException("Atlas session scope invalidated", "AbortError"),
      );
      historyRequestRef.current = null;
      historyMutationRef.current?.abort(
        new DOMException("Atlas session scope invalidated", "AbortError"),
      );
      historyMutationRef.current = null;
      pendingQueryRef.current = null;
      contextBindingsRef.current.clear();
      const fresh = createInitialConversationState();
      stateRef.current = fresh;
      setState(fresh);
      setHistorySnapshot(
        createHistorySnapshot(scopeHashRef.current, configuredRetentionNotice),
      );
      setCurrentModelId(null);
      setRateLimitNotice(null);
      setOpen(false);
      setSurfaceMode("panel");
      restoreRememberedFocus();
      setScopeInvalidationRevision((current) => current + 1);
    };

    for (const eventName of ATLAS_SCOPE_INVALIDATION_EVENTS) {
      window.addEventListener(eventName, invalidateScope);
    }
    return () => {
      for (const eventName of ATLAS_SCOPE_INVALIDATION_EVENTS) {
        window.removeEventListener(eventName, invalidateScope);
      }
    };
  }, [configuredRetentionNotice, restoreRememberedFocus]);

  useEffect(() => {
    if (stateScopeHashRef.current === scopeHash) return;

    abortRef.current?.abort(
      new DOMException("Atlas session scope changed", "AbortError"),
    );
    abortRef.current = null;
    historyRequestRef.current?.abort(
      new DOMException("Atlas session scope changed", "AbortError"),
    );
    historyRequestRef.current = null;
    historyMutationRef.current?.abort(
      new DOMException("Atlas session scope changed", "AbortError"),
    );
    historyMutationRef.current = null;
    pendingQueryRef.current = null;
    contextBindingsRef.current.clear();
    const fresh = createInitialConversationState();
    stateScopeHashRef.current = scopeHash;
    stateRef.current = fresh;
    setState(fresh);
    setHistorySnapshot(
      createHistorySnapshot(scopeHash, configuredRetentionNotice),
    );
    setCurrentModelId(null);
    setRateLimitNotice(null);
    setOpen(false);
    setSurfaceMode("panel");
    restoreRememberedFocus();
  }, [configuredRetentionNotice, restoreRememberedFocus, scopeHash]);

  useEffect(() => () => {
    abortRef.current?.abort(
      new DOMException("Atlas provider unmounted", "AbortError"),
    );
    historyRequestRef.current?.abort(
      new DOMException("Atlas provider unmounted", "AbortError"),
    );
    historyMutationRef.current?.abort(
      new DOMException("Atlas provider unmounted", "AbortError"),
    );
    contextBindingsRef.current.clear();
  }, []);

  useEffect(() => {
    const clearBindings = () => contextBindingsRef.current.clear();
    window.addEventListener("popstate", clearBindings);
    window.addEventListener("hashchange", clearBindings);
    window.addEventListener("athyper:navigation", clearBindings);
    return () => {
      window.removeEventListener("popstate", clearBindings);
      window.removeEventListener("hashchange", clearBindings);
      window.removeEventListener("athyper:navigation", clearBindings);
    };
  }, []);

  const registerContextBinding = useCallback(
    (binding: AtlasContextBinding) => {
      const token = contextBindingsRef.current.register(
        binding,
        currentAtlasRoute(),
      );
      return () => contextBindingsRef.current.unregister(token);
    },
    [],
  );

  // Re-seed only from an available model in the current scope's catalog.
  useEffect(() => {
    if (!catalog) {
      setCurrentModelId(null);
      return;
    }
    setCurrentModelId((existing) => {
      if (
        existing
        && catalog.models.some(
          (model) =>
            model.model_id === existing
            && model.status === "available",
        )
      ) {
        return existing;
      }
      return resolveAvailableDefaultModelId(catalog);
    });
  }, [catalog]);

  const setModelId = useCallback((id: string) => {
    if (
      catalog?.models.some(
        (model) => model.model_id === id && model.status === "available",
      )
    ) {
      setCurrentModelId(id);
    }
  }, [catalog]);

  const refreshHistory = useCallback(async () => {
    if (!threadHistoryEnabled) return;
    const runScopeHash = scopeHash;
    historyRequestRef.current?.abort();
    const controller = new AbortController();
    historyRequestRef.current = controller;
    setHistorySnapshot((current) => {
      const scoped = current.scopeHash === runScopeHash
        ? current
        : createHistorySnapshot(runScopeHash, configuredRetentionNotice);
      const next = {
        ...scoped,
        loading: true,
        error: null,
      };
      historySnapshotRef.current = next;
      return next;
    });

    try {
      const loaded = await loadAllThreads({
        endpoint: threadHistory?.endpoint,
        fetchImpl: mutationFetch,
        signal: controller.signal,
        pageSize: historyPageSize,
        maxThreads: historyMaxThreads,
      });
      if (
        controller.signal.aborted
        || scopeHashRef.current !== runScopeHash
      ) {
        return;
      }
      if (loaded.threads.some((thread) => thread.plane !== scope.plane)) {
        throw new Error("Atlas thread list crossed the active plane boundary");
      }
      setHistorySnapshot((current) => {
        if (current.scopeHash !== runScopeHash) return current;
        const next = {
          ...current,
          threads: loaded.threads,
          loading: false,
          error: null,
          retentionNotice: loaded.retentionNotice,
          authorized: true,
        };
        historySnapshotRef.current = next;
        return next;
      });
    } catch (error) {
      if (
        controller.signal.aborted
        || scopeHashRef.current !== runScopeHash
      ) {
        return;
      }
      setHistorySnapshot((current) => {
        if (current.scopeHash !== runScopeHash) return current;
        const next = {
          ...current,
          loading: false,
          error: historyErrorMessage(error),
          authorized:
            error instanceof AtlasThreadRequestError
              && (error.status === 403 || error.status === 404)
              ? false
              : current.authorized,
        };
        historySnapshotRef.current = next;
        return next;
      });
    } finally {
      if (historyRequestRef.current === controller) {
        historyRequestRef.current = null;
      }
    }
  }, [
    configuredRetentionNotice,
    historyMaxThreads,
    historyPageSize,
    mutationFetch,
    scope.plane,
    scopeHash,
    threadHistory?.endpoint,
    threadHistoryEnabled,
  ]);

  useEffect(() => {
    if (!threadHistoryEnabled) {
      historyRequestRef.current?.abort();
      historyRequestRef.current = null;
      historyMutationRef.current?.abort();
      historyMutationRef.current = null;
      const disabled = createHistorySnapshot(
        scopeHash,
        configuredRetentionNotice,
      );
      historySnapshotRef.current = disabled;
      setHistorySnapshot(disabled);
      return;
    }
    if (isOpen) void refreshHistory();
  }, [
    configuredRetentionNotice,
    isOpen,
    refreshHistory,
    scopeHash,
    threadHistoryEnabled,
  ]);

  const resumeThread = useCallback(async (threadId: string) => {
    if (
      !threadHistoryEnabled
      || stateRef.current.phase === "running"
      || stateRef.current.phase === "awaiting-tool"
    ) {
      return;
    }
    const runScopeHash = scopeHash;
    const controller = beginHistoryMutation(
      historyMutationRef,
      threadId,
      runScopeHash,
      setHistorySnapshot,
      historySnapshotRef,
      configuredRetentionNotice,
    );
    try {
      const [threadResponse, loadedMessages] = await Promise.all([
        getAtlasThread({
          threadId,
          ...(threadHistory?.endpoint
            ? { endpoint: threadHistory.endpoint }
            : {}),
          fetchImpl: mutationFetch,
          signal: controller.signal,
        }),
        loadAllThreadMessages({
          threadId,
          endpoint: threadHistory?.endpoint,
          fetchImpl: mutationFetch,
          signal: controller.signal,
          maxMessages: historyMaxResumeMessages,
        }),
      ]);
      if (
        controller.signal.aborted
        || scopeHashRef.current !== runScopeHash
      ) {
        return;
      }
      const thread = threadResponse.thread;
      if (thread.thread_id !== threadId || thread.plane !== scope.plane) {
        throw new Error("Atlas thread response crossed the active scope");
      }
      if (thread.status !== "active") {
        throw new Error("Archived Atlas conversations cannot be resumed");
      }
      const hydrated = hydrateConversationFromThread(
        threadId,
        loadedMessages.messages,
      );
      stateScopeHashRef.current = runScopeHash;
      stateRef.current = hydrated;
      setState(hydrated);
      setOpen(true);
      setHistorySnapshot((current) => {
        if (current.scopeHash !== runScopeHash) return current;
        const next = {
          ...current,
          threads: replaceThread(current.threads, thread),
          error: null,
          retentionNotice: thread.retention.display_text,
        };
        historySnapshotRef.current = next;
        return next;
      });
    } catch (error) {
      finishHistoryMutationWithError({
        controller,
        runScopeHash,
        error,
        setHistorySnapshot,
        historySnapshotRef,
      });
    } finally {
      finishHistoryMutation(
        controller,
        runScopeHash,
        historyMutationRef,
        setHistorySnapshot,
        historySnapshotRef,
      );
    }
  }, [
    configuredRetentionNotice,
    historyMaxResumeMessages,
    mutationFetch,
    scope.plane,
    scopeHash,
    threadHistory?.endpoint,
    threadHistoryEnabled,
  ]);

  const archivePersistedThread = useCallback(async (
    threadId: string,
  ) => {
    if (!threadHistoryEnabled) return;
    const existing = historySnapshotRef.current.threads.find(
      (thread) => thread.thread_id === threadId,
    );
    if (!existing) return;

    const runScopeHash = scopeHash;
    const controller = beginHistoryMutation(
      historyMutationRef,
      threadId,
      runScopeHash,
      setHistorySnapshot,
      historySnapshotRef,
      configuredRetentionNotice,
    );
    try {
      const response = await updateAtlasThread({
        threadId,
        request: {
          row_version: existing.row_version,
          status: "archived",
        },
        ...(threadHistory?.endpoint
          ? { endpoint: threadHistory.endpoint }
          : {}),
        fetchImpl: mutationFetch,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted
        || scopeHashRef.current !== runScopeHash
      ) {
        return;
      }
      if (
        response.thread.thread_id !== threadId
        || response.thread.plane !== scope.plane
        || response.thread.status !== "archived"
      ) {
        throw new Error("Atlas thread update crossed the active scope");
      }
      setHistorySnapshot((current) => {
        if (current.scopeHash !== runScopeHash) return current;
        const next = {
          ...current,
          threads: replaceThread(current.threads, response.thread),
          error: null,
          retentionNotice: response.thread.retention.display_text,
        };
        historySnapshotRef.current = next;
        return next;
      });
      if (
        stateRef.current.threadId === threadId
      ) {
        const fresh = createInitialConversationState();
        stateScopeHashRef.current = runScopeHash;
        stateRef.current = fresh;
        setState(fresh);
      }
    } catch (error) {
      finishHistoryMutationWithError({
        controller,
        runScopeHash,
        error,
        setHistorySnapshot,
        historySnapshotRef,
      });
    } finally {
      finishHistoryMutation(
        controller,
        runScopeHash,
        historyMutationRef,
        setHistorySnapshot,
        historySnapshotRef,
      );
    }
  }, [
    configuredRetentionNotice,
    mutationFetch,
    scope.plane,
    scopeHash,
    threadHistory?.endpoint,
    threadHistoryEnabled,
  ]);

  const archiveThread = useCallback(
    async (threadId: string) => {
      if (threadHistory?.archiveEnabled !== true) return;
      await archivePersistedThread(threadId);
    },
    [archivePersistedThread, threadHistory?.archiveEnabled],
  );

  const removeThread = useCallback(async (threadId: string) => {
    if (!threadHistoryEnabled || threadHistory?.deleteEnabled !== true) return;
    const existing = historySnapshotRef.current.threads.find(
      (thread) => thread.thread_id === threadId,
    );
    if (!existing) return;
    const runScopeHash = scopeHash;
    const controller = beginHistoryMutation(
      historyMutationRef,
      threadId,
      runScopeHash,
      setHistorySnapshot,
      historySnapshotRef,
      configuredRetentionNotice,
    );
    try {
      await deleteAtlasThread({
        threadId,
        rowVersion: existing.row_version,
        ...(threadHistory?.endpoint
          ? { endpoint: threadHistory.endpoint }
          : {}),
        fetchImpl: mutationFetch,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted
        || scopeHashRef.current !== runScopeHash
      ) {
        return;
      }
      setHistorySnapshot((current) => {
        if (current.scopeHash !== runScopeHash) return current;
        const next = {
          ...current,
          threads: current.threads.filter(
            (thread) => thread.thread_id !== threadId,
          ),
          error: null,
        };
        historySnapshotRef.current = next;
        return next;
      });
      if (stateRef.current.threadId === threadId) {
        const fresh = createInitialConversationState();
        stateScopeHashRef.current = runScopeHash;
        stateRef.current = fresh;
        setState(fresh);
      }
    } catch (error) {
      finishHistoryMutationWithError({
        controller,
        runScopeHash,
        error,
        setHistorySnapshot,
        historySnapshotRef,
      });
    } finally {
      finishHistoryMutation(
        controller,
        runScopeHash,
        historyMutationRef,
        setHistorySnapshot,
        historySnapshotRef,
      );
    }
  }, [
    configuredRetentionNotice,
    mutationFetch,
    scopeHash,
    threadHistory?.deleteEnabled,
    threadHistory?.endpoint,
    threadHistoryEnabled,
  ]);

  const cancel = useCallback(() => {
    abortRef.current?.abort(
      new DOMException("Atlas run cancelled", "AbortError"),
    );
    abortRef.current = null;
    setState((current) => {
      if (stateScopeHashRef.current !== scopeHashRef.current) return current;
      const cancelled = markConversationCancelled(current);
      stateRef.current = cancelled;
      return cancelled;
    });
  }, []);

  const send = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (
      !query
      || stateRef.current.phase === "running"
      || stateRef.current.phase === "awaiting-tool"
    ) {
      return;
    }

    setRateLimitNotice(null);
    const selectedModelAvailable = Boolean(
      currentModelId
      && catalog?.models.some(
        (model) =>
          model.model_id === currentModelId
          && model.status === "available",
      ),
    );
    if (
      catalogLoading
      || !catalog
      || !selectedModelAvailable
      || !currentModelId
    ) {
      setState((current) => {
        if (scopeHashRef.current !== scopeHash) return current;
        const next: AtlasConversationState = {
          ...(stateScopeHashRef.current === scopeHash
            ? current
            : createInitialConversationState()),
          phase: "error",
          error: catalogError
            ? "Atlas is not available for this workspace right now."
            : "Atlas is still resolving the modes available to you. Please try again in a moment.",
        };
        stateScopeHashRef.current = scopeHash;
        stateRef.current = next;
        return next;
      });
      return;
    }

    const runScopeHash = scopeHash;
    const route = currentAtlasRoute();
    const contextBinding = contextBindingsRef.current.snapshot(route);
    const priorState = stateRef.current;
    const history: AgentHistoryMessage[] =
      threadHistoryEnabled && priorState.threadId
        ? []
        : priorState.messages
          .filter(
            (message) =>
              message.content.trim() && message.status !== "failed",
          )
          .slice(-20)
          .map((message) => ({
            role: message.role,
            content: message.content,
          }));
    const userMessage = {
      id: newClientId(),
      role: "user" as const,
      content: query,
      status: "complete" as const,
      createdAt: new Date().toISOString(),
    };
    const nextState = appendUserMessage(priorState, userMessage);
    stateScopeHashRef.current = runScopeHash;
    stateRef.current = nextState;
    setState(nextState);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      let terminalEventSeen = false;
      for await (const envelope of fetchAgentEvents({
        endpoint,
        fetchImpl: mutationFetch,
        signal: controller.signal,
        request: {
          client_request_id: newClientId(),
          ...(priorState.threadId ? { thread_id: priorState.threadId } : {}),
          plane: scope.plane,
          model_id: currentModelId,
          policy_revision: catalog.policy_revision,
          message: query,
          history,
          context: {
            route,
            ...(contextBinding
              ? {
                  entity_type: contextBinding.entityType,
                  entity_id: contextBinding.entityId,
                }
              : {}),
          },
        },
      })) {
        if (
          controller.signal.aborted
          || scopeHashRef.current !== runScopeHash
        ) {
          return;
        }
        if (
          envelope.event.type === "run.completed"
          || envelope.event.type === "run.failed"
        ) {
          terminalEventSeen = true;
          if (
            envelope.event.type === "run.failed"
            && envelope.event.code === "model_unavailable"
          ) {
            void refetchCatalog();
          }
          if (
            envelope.event.type === "run.failed"
            && envelope.event.code === "stale_model_catalog"
          ) {
            void refetchCatalog();
          }
        }
        setState((current) => {
          if (
            scopeHashRef.current !== runScopeHash
            || stateScopeHashRef.current !== runScopeHash
          ) {
            return current;
          }
          const reduced = applyStreamEnvelope(current, envelope);
          stateRef.current = reduced;
          return reduced;
        });
      }
      if (!terminalEventSeen) {
        throw new Error("Atlas stream ended before a terminal event");
      }
      if (threadHistoryEnabled) void refreshHistory();
    } catch (error) {
      if (scopeHashRef.current !== runScopeHash) return;
      // A cancelled request may reject after a replacement request has
      // already installed its controller. Never let that stale completion
      // mutate the replacement run's conversation state.
      if (abortRef.current !== controller) return;
      if (controller.signal.aborted) {
        setState((current) => {
          if (stateScopeHashRef.current !== runScopeHash) return current;
          const cancelled = markConversationCancelled(current);
          stateRef.current = cancelled;
          return cancelled;
        });
        return;
      }
      const rateLimited =
        error instanceof AtlasTransportError
        && error.code === "rate_limited";
      if (rateLimited) {
        setRateLimitNotice({
          message: rateLimitMessage(error.retryAfterSeconds),
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }
      const message = userFacingError(error);
      if (message.includes("permission")) {
        setCurrentModelId(resolveAvailableDefaultModelId(catalog));
      }
      setState((current) => {
        if (stateScopeHashRef.current !== runScopeHash) return current;
        const failed: AtlasConversationState = {
          ...current,
          phase: "error",
          activeRunId: null,
          error: rateLimited ? null : message,
          messages: current.messages.map((item) =>
            item.status === "streaming"
              ? { ...item, status: "failed" }
              : item,
          ),
        };
        stateRef.current = failed;
        return failed;
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [
    catalog,
    catalogError,
    catalogLoading,
    currentModelId,
    endpoint,
    mutationFetch,
    refetchCatalog,
    refreshHistory,
    scope.plane,
    scopeHash,
    threadHistoryEnabled,
  ]);

  const submitFeedback = useCallback(async (
    messageId: string,
    runId: string,
    verdict: AtlasFeedbackPayload["verdict"],
  ) => {
    if (!feedbackEndpoint) {
      throw new Error("Atlas feedback is not enabled");
    }
    await submitAtlasFeedback({
      endpoint: feedbackEndpoint,
      fetchImpl: mutationFetch,
      payload: {
        agent_run_id: runId,
        message_id: messageId,
        verdict,
      },
    });
  }, [feedbackEndpoint, mutationFetch]);

  const rememberFocus = useCallback(() => {
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    focusReturnRef.current = active instanceof HTMLElement ? active : null;
  }, []);
  const open = useCallback(() => {
    rememberFocus();
    setOpen(true);
  }, [rememberFocus]);
  const openWithQuery = useCallback((query: string) => {
    const trimmed = query.trim();
    rememberFocus();
    setOpen(true);
    if (!trimmed) return;
    const modeResolved = Boolean(
      currentModelId
      && catalog?.models.some(
        (model) =>
          model.model_id === currentModelId
          && model.status === "available",
      ),
    );
    if (modeResolved) {
      void send(trimmed);
    } else {
      pendingQueryRef.current = trimmed;
    }
  }, [catalog, currentModelId, rememberFocus, send]);

  useEffect(() => {
    const pendingQuery = pendingQueryRef.current;
    if (!pendingQuery) return;
    if (catalogError) {
      pendingQueryRef.current = null;
      return;
    }
    const modeResolved = Boolean(
      currentModelId
      && catalog?.models.some(
        (model) =>
          model.model_id === currentModelId
          && model.status === "available",
      ),
    );
    if (!modeResolved || catalogLoading) return;
    pendingQueryRef.current = null;
    void send(pendingQuery);
  }, [catalog, catalogError, catalogLoading, currentModelId, send]);

  const close = useCallback(() => {
    pendingQueryRef.current = null;
    cancel();
    setOpen(false);
    setSurfaceMode("panel");
    restoreRememberedFocus();
  }, [cancel, restoreRememberedFocus]);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRateLimitNotice(null);
    const fresh = createInitialConversationState();
    stateScopeHashRef.current = scopeHashRef.current;
    stateRef.current = fresh;
    setState(fresh);
  }, []);

  const threadHistoryValue = useMemo<
    AtlasThreadHistoryContextValue | null
  >(() => {
    if (!threadHistoryEnabled || visibleHistory.authorized !== true) return null;
    return {
      threads: visibleHistory.threads,
      loading: visibleHistory.loading,
      error: visibleHistory.error,
      retentionNotice: visibleHistory.retentionNotice,
      mutatingThreadId: visibleHistory.mutatingThreadId,
      activeThreadId: visibleState.threadId,
      archiveEnabled: threadHistory?.archiveEnabled === true,
      deleteEnabled: threadHistory?.deleteEnabled === true,
      refresh: refreshHistory,
      resume: resumeThread,
      archive: archiveThread,
      delete: removeThread,
    };
  }, [
    archiveThread,
    refreshHistory,
    removeThread,
    resumeThread,
    threadHistory?.archiveEnabled,
    threadHistory?.deleteEnabled,
    threadHistoryEnabled,
    visibleHistory.error,
    visibleHistory.authorized,
    visibleHistory.loading,
    visibleHistory.mutatingThreadId,
    visibleHistory.retentionNotice,
    visibleHistory.threads,
    visibleState.threadId,
  ]);

  const value = useMemo<AtlasContextValue>(() => ({
    isOpen,
    state: visibleState,
    profile,
    availability,
    rateLimitNotice,
    catalog,
    catalogLoading,
    catalogError,
    currentModelId,
    setModelId,
    refetchCatalog,
    feedbackEnabled: feedbackEndpoint !== null,
    submitFeedback,
    surfaceMode,
    setSurfaceMode,
    open,
    openWithQuery,
    close,
    send,
    cancel,
    newConversation,
    registerContextBinding,
    threadHistory: threadHistoryValue,
  }), [
    availability,
    cancel,
    catalog,
    catalogError,
    catalogLoading,
    close,
    currentModelId,
    feedbackEndpoint,
    isOpen,
    newConversation,
    open,
    openWithQuery,
    profile,
    rateLimitNotice,
    registerContextBinding,
    refetchCatalog,
    send,
    setModelId,
    submitFeedback,
    surfaceMode,
    threadHistoryValue,
    visibleState,
  ]);

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

function newClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
}

function fallbackUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function userFacingError(error: unknown): string {
  if (error instanceof AtlasTransportError) {
    if (error.code === "authentication") {
      return "Your Atlas session has expired. Refresh and sign in again.";
    }
    if (error.code === "authorization") {
      return "Atlas is not available for this account.";
    }
    if (error.code === "rate_limited") return rateLimitMessage(error.retryAfterSeconds);
    if (error.code === "unavailable") return "Atlas is temporarily unavailable.";
    return "Atlas could not safely read the server response. Please try again.";
  }
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.includes("(403)")) return "You do not have permission to use Atlas.";
  if (detail.includes("(404)")) return "Atlas is not enabled for this workspace.";
  if (detail.includes("(429)")) return "Atlas is receiving too many requests. Please try again shortly.";
  if (detail.includes("(503)")) return "Atlas is temporarily unavailable.";
  return "Atlas could not complete this response. Please try again.";
}

function rateLimitMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return "Atlas is busy. Please try again shortly.";
  }
  if (retryAfterSeconds <= 1) {
    return "Atlas is busy. Try again in a moment.";
  }
  return `Atlas is busy. Try again in about ${retryAfterSeconds} seconds.`;
}

function createHistorySnapshot(
  scopeHash: string,
  retentionNotice: string,
): ThreadHistorySnapshot {
  return {
    scopeHash,
    threads: [],
    loading: false,
    error: null,
    retentionNotice,
    mutatingThreadId: null,
    authorized: null,
  };
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value === undefined) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

async function loadAllThreads({
  endpoint,
  fetchImpl,
  signal,
  pageSize,
  maxThreads,
}: {
  endpoint: string | undefined;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  pageSize: number;
  maxThreads: number;
}): Promise<{ threads: AtlasThread[]; retentionNotice: string }> {
  const threads: AtlasThread[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let retentionNotice: string | null = null;

  do {
    const page = await listAtlasThreads({
      ...(endpoint ? { endpoint } : {}),
      fetchImpl,
      signal,
      query: {
        limit: Math.min(pageSize, maxThreads - threads.length),
        status: "all",
        ...(cursor ? { cursor } : {}),
      },
    });
    if (
      retentionNotice !== null
      && retentionNotice !== page.retention_notice
    ) {
      throw new Error("Atlas retention notice changed during pagination");
    }
    retentionNotice = page.retention_notice;
    threads.push(...page.items);
    if (threads.length > maxThreads || (page.next_cursor && threads.length === maxThreads)) {
      throw new Error("Atlas thread history exceeds the configured client limit");
    }
    cursor = page.next_cursor ?? undefined;
    if (cursor) {
      if (cursors.has(cursor)) {
        throw new Error("Atlas thread pagination cursor repeated");
      }
      cursors.add(cursor);
    }
  } while (cursor);

  const ids = new Set<string>();
  for (const thread of threads) {
    if (ids.has(thread.thread_id)) {
      throw new Error("Atlas thread list contains duplicate IDs");
    }
    ids.add(thread.thread_id);
  }

  return {
    threads,
    retentionNotice: retentionNotice ?? "",
  };
}

async function loadAllThreadMessages({
  threadId,
  endpoint,
  fetchImpl,
  signal,
  maxMessages,
}: {
  threadId: string;
  endpoint: string | undefined;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  maxMessages: number;
}) {
  const messages: Awaited<
    ReturnType<typeof listAtlasThreadMessages>
  >["items"] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await listAtlasThreadMessages({
      threadId,
      ...(endpoint ? { endpoint } : {}),
      fetchImpl,
      signal,
      query: {
        limit: Math.min(100, maxMessages - messages.length),
        ...(cursor ? { cursor } : {}),
      },
    });
    messages.push(...page.items);
    if (
      messages.length > maxMessages
      || (page.next_cursor && messages.length === maxMessages)
    ) {
      throw new Error(
        "Atlas conversation is larger than the configured resume limit",
      );
    }
    cursor = page.next_cursor ?? undefined;
    if (cursor) {
      if (cursors.has(cursor)) {
        throw new Error("Atlas message pagination cursor repeated");
      }
      cursors.add(cursor);
    }
  } while (cursor);

  return {
    messages,
  };
}

function beginHistoryMutation(
  mutationRef: MutableRefObject<AbortController | null>,
  threadId: string,
  scopeHash: string,
  setSnapshot: Dispatch<SetStateAction<ThreadHistorySnapshot>>,
  snapshotRef: MutableRefObject<ThreadHistorySnapshot>,
  retentionNotice: string,
): AbortController {
  mutationRef.current?.abort(
    new DOMException("Atlas history action replaced", "AbortError"),
  );
  const controller = new AbortController();
  mutationRef.current = controller;
  setSnapshot((current) => {
    const scoped = current.scopeHash === scopeHash
      ? current
      : createHistorySnapshot(scopeHash, retentionNotice);
    const next = {
      ...scoped,
      error: null,
      mutatingThreadId: threadId,
    };
    snapshotRef.current = next;
    return next;
  });
  return controller;
}

function finishHistoryMutationWithError({
  controller,
  runScopeHash,
  error,
  setHistorySnapshot,
  historySnapshotRef,
}: {
  controller: AbortController;
  runScopeHash: string;
  error: unknown;
  setHistorySnapshot: Dispatch<SetStateAction<ThreadHistorySnapshot>>;
  historySnapshotRef: MutableRefObject<ThreadHistorySnapshot>;
}): void {
  if (controller.signal.aborted) return;
  setHistorySnapshot((current) => {
    if (current.scopeHash !== runScopeHash) return current;
    const next = {
      ...current,
      error: historyErrorMessage(error),
    };
    historySnapshotRef.current = next;
    return next;
  });
}

function finishHistoryMutation(
  controller: AbortController,
  runScopeHash: string,
  mutationRef: MutableRefObject<AbortController | null>,
  setHistorySnapshot: Dispatch<SetStateAction<ThreadHistorySnapshot>>,
  historySnapshotRef: MutableRefObject<ThreadHistorySnapshot>,
): void {
  if (mutationRef.current !== controller) return;
  mutationRef.current = null;
  setHistorySnapshot((current) => {
    if (current.scopeHash !== runScopeHash) return current;
    const next = {
      ...current,
      mutatingThreadId: null,
    };
    historySnapshotRef.current = next;
    return next;
  });
}

function replaceThread(
  threads: readonly AtlasThread[],
  replacement: AtlasThread,
): AtlasThread[] {
  const replaced = threads.map((thread) =>
    thread.thread_id === replacement.thread_id ? replacement : thread
  );
  return replaced.some(
    (thread) => thread.thread_id === replacement.thread_id,
  )
    ? replaced
    : [replacement, ...replaced];
}

function historyErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.includes("(403)")) {
    return "You do not have permission to access this conversation history.";
  }
  if (detail.includes("(404)")) {
    return "This saved conversation is no longer available.";
  }
  if (detail.includes("(409)")) {
    return "This conversation changed. Refresh history and try again.";
  }
  if (detail.includes("larger than")) {
    return "This conversation is too large to resume safely in this client.";
  }
  return "Conversation history could not be loaded. Please try again.";
}
