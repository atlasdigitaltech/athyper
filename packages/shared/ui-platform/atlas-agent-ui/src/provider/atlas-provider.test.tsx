import { act, render, screen, waitFor } from "@testing-library/react";
import {
  ATLAS_AGENT_SCHEMA_VERSION,
  type AgentStreamEnvelope,
  type AtlasPlane,
  type AtlasPlaneProfile,
  type AtlasSessionScope,
  type ModelCatalog,
} from "@athyper/atlas-agent-runtime";
import {
  fetchAgentEvents,
  submitAtlasFeedback,
} from "@athyper/atlas-agent-runtime/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAtlas, type AtlasContextValue } from "./atlas-context";
import { AtlasProvider } from "./atlas-provider";
import { useAtlasCatalog } from "./use-atlas-catalog";

vi.mock("@athyper/atlas-agent-runtime/browser", () => ({
  deleteAtlasThread: vi.fn(),
  fetchAgentEvents: vi.fn(),
  getAtlasThread: vi.fn(),
  listAtlasThreadMessages: vi.fn(),
  listAtlasThreads: vi.fn(),
  submitAtlasFeedback: vi.fn(),
  updateAtlasThread: vi.fn(),
}));

vi.mock("./use-atlas-catalog", () => ({
  useAtlasCatalog: vi.fn(),
}));

const OLD_RUN_ID = "10000000-0000-4000-8000-000000000001";
const OLD_THREAD_ID = "10000000-0000-4000-8000-000000000002";
const OLD_MESSAGE_ID = "10000000-0000-4000-8000-000000000003";
const NEW_RUN_ID = "20000000-0000-4000-8000-000000000001";
const NEW_THREAD_ID = "20000000-0000-4000-8000-000000000002";
const NEW_MESSAGE_ID = "20000000-0000-4000-8000-000000000003";

const initialScope: AtlasSessionScope = {
  userId: "user-a",
  tenantId: "tenant-a",
  workContextId: "workspace-a",
  plane: "neon",
  authEpoch: "session-1:membership-1",
  permissionStamp: "permission-1",
};

const scopeChanges: ReadonlyArray<{
  dimension: string;
  nextScope: AtlasSessionScope;
}> = [
  {
    dimension: "tenant",
    nextScope: {
      ...initialScope,
      tenantId: "tenant-b",
      workContextId: "workspace-b",
    },
  },
  {
    dimension: "principal",
    nextScope: {
      ...initialScope,
      userId: "user-b",
    },
  },
  {
    dimension: "plane",
    nextScope: {
      ...initialScope,
      plane: "mesh",
    },
  },
  {
    dimension: "auth epoch",
    nextScope: {
      ...initialScope,
      authEpoch: "session-2:membership-9",
    },
  },
];

const fetchAgentEventsMock = vi.mocked(fetchAgentEvents);
const submitAtlasFeedbackMock = vi.mocked(submitAtlasFeedback);
const useAtlasCatalogMock = vi.mocked(useAtlasCatalog);

describe("AtlasProvider session-scope isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitAtlasFeedbackMock.mockResolvedValue(undefined);

    const catalogs = new Map<string, ReturnType<typeof useAtlasCatalog>>();
    useAtlasCatalogMock.mockImplementation((scopeKey) => {
      const existing = catalogs.get(scopeKey);
      if (existing) return existing;

      const result: ReturnType<typeof useAtlasCatalog> = {
        catalog: catalog(`policy-${catalogs.size + 1}`),
        loading: false,
        error: null,
        refetch: vi.fn(async () => {}),
      };
      catalogs.set(scopeKey, result);
      return result;
    });
  });

  it("snapshots only the current route's identifier binding at send time", async () => {
    window.history.replaceState({}, "", "/app/company_code/CC-100");
    fetchAgentEventsMock.mockImplementation(() => completedStream());
    const captured: { current: AtlasContextValue | null } = {
      current: null,
    };

    function Probe() {
      captured.current = useAtlas();
      return null;
    }

    render(
      <AtlasProvider
        scope={initialScope}
        profile={profile(initialScope.plane)}
        mutationFetch={fetch}
        feedbackEndpoint={null}
      >
        <Probe />
      </AtlasProvider>,
    );

    await waitFor(() => {
      expect(captured.current?.currentModelId).toBe("atlas-fast");
    });
    const unregister = captured.current?.registerContextBinding?.({
      entityType: "company_code",
      entityId: "CC-100",
    });

    await act(async () => {
      await captured.current?.send("Summarize this record");
    });

    expect(fetchAgentEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          context: {
            route: "/app/company_code/CC-100",
            entity_type: "company_code",
            entity_id: "CC-100",
          },
        }),
      }),
    );

    unregister?.();
  });

  it.each(scopeChanges)(
    "aborts an active stream and drops old deltas/history when the $dimension changes",
    async ({ dimension, nextScope }) => {
      const releaseOldStream = deferred<void>();
      const oldDeltaApplied = deferred<void>();
      const observedRequests: Parameters<typeof fetchAgentEvents>[0][] = [];

      fetchAgentEventsMock
        .mockImplementationOnce((options) => {
          observedRequests.push(options);
          return oldStream(options, dimension, oldDeltaApplied, releaseOldStream);
        })
        .mockImplementationOnce((options) => {
          observedRequests.push(options);
          return completedStream();
        });

      let atlas: AtlasContextValue | null = null;
      function Probe() {
        atlas = useAtlas();
        return (
          <div data-testid="messages">
            {atlas.state.messages.map((message) => message.content).join("|")}
          </div>
        );
      }

      const rendered = render(
        <AtlasProvider
          scope={initialScope}
          profile={profile(initialScope.plane)}
          mutationFetch={fetch}
          feedbackEndpoint={null}
        >
          <Probe />
        </AtlasProvider>,
      );

      await waitFor(() => {
        expect(atlas?.currentModelId).toBe("atlas-fast");
      });

      let oldSend: Promise<void> | undefined;
      act(() => {
        atlas?.open();
        oldSend = atlas?.send(`old ${dimension} question`);
      });
      expect((atlas as AtlasContextValue | null)?.isOpen).toBe(true);

      await oldDeltaApplied.promise;
      await waitFor(() => {
        expect(screen.getByTestId("messages")).toHaveTextContent(
          `old-${dimension}-delta`,
        );
      });
      expect(observedRequests[0]?.signal?.aborted).toBe(false);

      rendered.rerender(
        <AtlasProvider
          scope={nextScope}
          profile={profile(nextScope.plane)}
          mutationFetch={fetch}
          feedbackEndpoint={null}
        >
          <Probe />
        </AtlasProvider>,
      );

      // The render itself must not expose the previous scope while React is
      // waiting to run the reset/abort effect.
      expect(screen.getByTestId("messages")).toBeEmptyDOMElement();
      await waitFor(() => {
        expect(observedRequests[0]?.signal?.aborted).toBe(true);
        expect(atlas?.isOpen).toBe(false);
      });

      // Simulate a transport that ignores AbortSignal and emits once more.
      // AtlasProvider must still reject that event by its captured scope key.
      releaseOldStream.resolve();
      await act(async () => {
        await oldSend;
      });
      expect(screen.getByTestId("messages")).not.toHaveTextContent(
        `old-${dimension}-delta`,
      );
      expect(screen.getByTestId("messages")).not.toHaveTextContent(
        `late-old-${dimension}-delta`,
      );

      await waitFor(() => {
        expect(atlas?.currentModelId).toBe("atlas-fast");
      });
      await act(async () => {
        await atlas?.send(`new ${dimension} question`);
      });

      expect(observedRequests).toHaveLength(2);
      expect(observedRequests[1]?.request).toMatchObject({
        plane: nextScope.plane,
        message: `new ${dimension} question`,
        history: [],
      });
      expect(observedRequests[1]?.request).not.toHaveProperty("thread_id");
      expect(screen.getByTestId("messages")).toHaveTextContent(
        `new ${dimension} question`,
      );
      expect(screen.getByTestId("messages")).toHaveTextContent("fresh response");
      expect(screen.getByTestId("messages")).not.toHaveTextContent("old ");
      expect(screen.getByTestId("messages")).not.toHaveTextContent("late-old");
    },
  );

  it("does not let a cancelled run's late rejection cancel its same-scope replacement", async () => {
    const releaseCancelledRun = deferred<void>();
    const cancelledRunDeltaApplied = deferred<void>();
    const releaseReplacementRun = deferred<void>();
    const replacementRunDeltaApplied = deferred<void>();

    fetchAgentEventsMock
      .mockImplementationOnce(() => cancelledStream(
        cancelledRunDeltaApplied,
        releaseCancelledRun,
      ))
      .mockImplementationOnce(() => pendingCompletedStream(
        replacementRunDeltaApplied,
        releaseReplacementRun,
      ));

    const captured: { current: AtlasContextValue | null } = { current: null };
    function Probe() {
      captured.current = useAtlas();
      return (
        <>
          <div data-testid="messages">
            {captured.current.state.messages
              .map((message) => message.content)
              .join("|")}
          </div>
          <div data-testid="phase">{captured.current.state.phase}</div>
        </>
      );
    }

    render(
      <AtlasProvider
        scope={initialScope}
        profile={profile(initialScope.plane)}
        mutationFetch={fetch}
        feedbackEndpoint={null}
      >
        <Probe />
      </AtlasProvider>,
    );

    await waitFor(() => {
      expect(captured.current?.currentModelId).toBe("atlas-fast");
    });

    let cancelledSend: Promise<void> | undefined;
    act(() => {
      cancelledSend = captured.current?.send("cancelled question");
    });
    await cancelledRunDeltaApplied.promise;
    await waitFor(() => {
      expect(screen.getByTestId("messages")).toHaveTextContent(
        "cancelled response",
      );
    });

    act(() => {
      captured.current?.cancel();
    });

    let replacementSend: Promise<void> | undefined;
    act(() => {
      replacementSend = captured.current?.send("replacement question");
    });
    await replacementRunDeltaApplied.promise;
    await waitFor(() => {
      expect(captured.current?.state.activeRunId).toBe(NEW_RUN_ID);
      expect(screen.getByTestId("phase")).toHaveTextContent("running");
      expect(screen.getByTestId("messages")).toHaveTextContent(
        "replacement response",
      );
    });

    // The cancelled transport rejects only after the replacement is active.
    // Its aborted catch path must not mark the replacement as cancelled.
    releaseCancelledRun.resolve();
    await act(async () => {
      await cancelledSend;
    });
    expect(captured.current?.state.activeRunId).toBe(NEW_RUN_ID);
    expect(captured.current?.state.phase).toBe("running");
    expect(
      captured.current?.state.messages.find(
        (message) => message.id === NEW_MESSAGE_ID,
      ),
    ).toMatchObject({ status: "streaming", content: "replacement response" });

    releaseReplacementRun.resolve();
    await act(async () => {
      await replacementSend;
    });
    expect(captured.current?.state.phase).toBe("idle");
    expect(
      captured.current?.state.messages.find(
        (message) => message.id === NEW_MESSAGE_ID,
      ),
    ).toMatchObject({ status: "complete", content: "replacement response" });
  });
});

function profile(plane: AtlasPlane): AtlasPlaneProfile {
  return {
    plane,
    title: "Atlas",
    description: "Workspace assistant",
    emptyState: "Ask Atlas about this workspace.",
    suggestions: [],
    capabilityIds: [],
  };
}

function catalog(policyRevision: string): ModelCatalog {
  return {
    policy_revision: policyRevision,
    default_model_id: "atlas-fast",
    models: [
      {
        provider_id: "atlas",
        model_id: "atlas-fast",
        display_name: "Fast",
        icon_key: "atlas",
        tier: "fast",
        status: "available",
        selection_policy: "normal",
        capabilities: {
          streaming: true,
          tools: false,
          vision: false,
          max_context_tokens: 200_000,
          max_output_tokens: 8_192,
        },
        cost: null,
      },
    ],
  };
}

async function* oldStream(
  _options: Parameters<typeof fetchAgentEvents>[0],
  dimension: string,
  oldDeltaApplied: Deferred<void>,
  releaseOldStream: Deferred<void>,
): AsyncIterable<AgentStreamEnvelope> {
  yield envelope(
    OLD_RUN_ID,
    OLD_THREAD_ID,
    OLD_MESSAGE_ID,
    0,
    { type: "run.started", provider: "atlas", model: "atlas-fast" },
  );
  yield envelope(
    OLD_RUN_ID,
    OLD_THREAD_ID,
    OLD_MESSAGE_ID,
    1,
    { type: "message.delta", delta: `old-${dimension}-delta` },
  );
  oldDeltaApplied.resolve();
  await releaseOldStream.promise;
  yield envelope(
    OLD_RUN_ID,
    OLD_THREAD_ID,
    OLD_MESSAGE_ID,
    2,
    { type: "message.delta", delta: `late-old-${dimension}-delta` },
  );
}

async function* completedStream(): AsyncIterable<AgentStreamEnvelope> {
  yield envelope(
    NEW_RUN_ID,
    NEW_THREAD_ID,
    NEW_MESSAGE_ID,
    0,
    { type: "run.started", provider: "atlas", model: "atlas-fast" },
  );
  yield envelope(
    NEW_RUN_ID,
    NEW_THREAD_ID,
    NEW_MESSAGE_ID,
    1,
    { type: "message.delta", delta: "fresh response" },
  );
  yield envelope(
    NEW_RUN_ID,
    NEW_THREAD_ID,
    NEW_MESSAGE_ID,
    2,
    {
      type: "run.completed",
      finish_reason: "end_turn",
      model_used: "atlas-fast",
      usage: { input_tokens: 4, output_tokens: 2 },
    },
  );
}

async function* cancelledStream(
  deltaApplied: Deferred<void>,
  release: Deferred<void>,
): AsyncIterable<AgentStreamEnvelope> {
  yield envelope(
    OLD_RUN_ID,
    OLD_THREAD_ID,
    OLD_MESSAGE_ID,
    0,
    { type: "run.started", provider: "atlas", model: "atlas-fast" },
  );
  yield envelope(
    OLD_RUN_ID,
    OLD_THREAD_ID,
    OLD_MESSAGE_ID,
    1,
    { type: "message.delta", delta: "cancelled response" },
  );
  deltaApplied.resolve();
  await release.promise;
  throw new DOMException("cancelled stream rejected late", "AbortError");
}

async function* pendingCompletedStream(
  deltaApplied: Deferred<void>,
  release: Deferred<void>,
): AsyncIterable<AgentStreamEnvelope> {
  yield envelope(
    NEW_RUN_ID,
    NEW_THREAD_ID,
    NEW_MESSAGE_ID,
    0,
    { type: "run.started", provider: "atlas", model: "atlas-fast" },
  );
  yield envelope(
    NEW_RUN_ID,
    NEW_THREAD_ID,
    NEW_MESSAGE_ID,
    1,
    { type: "message.delta", delta: "replacement response" },
  );
  deltaApplied.resolve();
  await release.promise;
  yield envelope(
    NEW_RUN_ID,
    NEW_THREAD_ID,
    NEW_MESSAGE_ID,
    2,
    {
      type: "run.completed",
      finish_reason: "end_turn",
      model_used: "atlas-fast",
      usage: { input_tokens: 4, output_tokens: 2 },
    },
  );
}

function envelope(
  runId: string,
  threadId: string,
  messageId: string,
  sequence: number,
  event: AgentStreamEnvelope["event"],
): AgentStreamEnvelope {
  return {
    schema_version: ATLAS_AGENT_SCHEMA_VERSION,
    run_id: runId,
    thread_id: threadId,
    message_id: messageId,
    sequence,
    event,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value?: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return {
    promise,
    resolve: (value?: T) => resolve(value as T),
  };
}
