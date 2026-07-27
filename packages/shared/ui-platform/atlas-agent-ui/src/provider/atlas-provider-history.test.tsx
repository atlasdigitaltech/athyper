import { act, render, screen, waitFor } from "@testing-library/react";
import {
  ATLAS_AGENT_SCHEMA_VERSION,
  ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID,
  type AgentStreamEnvelope,
  type AtlasPlaneProfile,
  type AtlasSessionScope,
  type AtlasThread,
  type ModelCatalog,
} from "@athyper/atlas-agent-runtime";
import {
  AtlasThreadRequestError,
  deleteAtlasThread,
  fetchAgentEvents,
  getAtlasThread,
  listAtlasThreadMessages,
  listAtlasThreads,
  submitAtlasFeedback,
  updateAtlasThread,
} from "@athyper/atlas-agent-runtime/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAtlas, type AtlasContextValue } from "./atlas-context";
import { AtlasProvider } from "./atlas-provider";
import { useAtlasCatalog } from "./use-atlas-catalog";

vi.mock("@athyper/atlas-agent-runtime/browser", () => ({
  AtlasThreadRequestError: class AtlasThreadRequestError extends Error {
    constructor(readonly status: number) {
      super(`Atlas thread request failed (${status})`);
    }
  },
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

const THREAD_ID = "10000000-0000-4000-8000-000000000001";
const scope: AtlasSessionScope = {
  userId: "user-a",
  tenantId: "tenant-a",
  workContextId: "workspace-a",
  plane: "neon",
  authEpoch: "session-1:membership-1",
  permissionStamp: "permission-1",
};

const listThreadsMock = vi.mocked(listAtlasThreads);
const getThreadMock = vi.mocked(getAtlasThread);
const listMessagesMock = vi.mocked(listAtlasThreadMessages);
const updateThreadMock = vi.mocked(updateAtlasThread);
const deleteThreadMock = vi.mocked(deleteAtlasThread);
const useCatalogMock = vi.mocked(useAtlasCatalog);

describe("AtlasProvider persisted history guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAgentEvents).mockImplementation(async function* () {});
    vi.mocked(submitAtlasFeedback).mockResolvedValue(undefined);
    useCatalogMock.mockReturnValue({
      catalog: catalog(),
      loading: false,
      error: null,
      refetch: vi.fn(async () => {}),
    });
    listThreadsMock.mockResolvedValue({
      items: [thread()],
      next_cursor: null,
      retention_notice: "Server policy: saved for 30 days.",
    });
    getThreadMock.mockResolvedValue({ thread: thread() });
    listMessagesMock.mockResolvedValue({
      items: [
        {
          message_id: "30000000-0000-4000-8000-000000000001",
          thread_id: THREAD_ID,
          sequence: "1",
          role: "user",
          content: "Persisted question",
          status: "complete",
          run_id: null,
          parent_message_id: null,
          created_at: "2026-07-23T12:00:00.000Z",
          terminal_at: "2026-07-23T12:00:01.000Z",
        },
        {
          message_id: "30000000-0000-4000-8000-000000000002",
          thread_id: THREAD_ID,
          sequence: "2",
          role: "assistant",
          content: "Persisted answer",
          status: "complete",
          run_id: "40000000-0000-4000-8000-000000000001",
          parent_message_id: null,
          created_at: "2026-07-23T12:00:02.000Z",
          terminal_at: "2026-07-23T12:00:03.000Z",
        },
      ],
      next_cursor: null,
    });
    updateThreadMock.mockResolvedValue({
      thread: thread({ status: "archived", row_version: "2" }),
    });
    deleteThreadMock.mockResolvedValue(undefined);
  });

  it("stays hidden when the provider option lacks the plane capability", async () => {
    const captured = renderProvider(profile([]));

    expect(captured.current?.threadHistory).toBeNull();
    act(() => {
      captured.current?.open();
    });
    await Promise.resolve();
    expect(listThreadsMock).not.toHaveBeenCalled();
  });

  it("loads server retention copy and resumes authoritative messages when both guards allow it", async () => {
    const captured = renderProvider(
      profile([ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID]),
    );

    act(() => {
      captured.current?.open();
    });
    await waitFor(() => {
      expect(listThreadsMock).toHaveBeenCalledOnce();
      expect(captured.current?.threadHistory?.retentionNotice).toBe(
        "Server policy: saved for 30 days.",
      );
    });

    await act(async () => {
      await captured.current?.threadHistory?.resume(THREAD_ID);
    });
    expect(getThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: THREAD_ID }),
    );
    expect(listMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: THREAD_ID }),
    );
    expect(screen.getByTestId("thread-id")).toHaveTextContent(THREAD_ID);
    expect(screen.getByTestId("messages")).toHaveTextContent(
      "Persisted question|Persisted answer",
    );
  });

  it("keeps history hidden when the effective server permission or entitlement denies it", async () => {
    listThreadsMock.mockRejectedValueOnce(new AtlasThreadRequestError(403));
    const captured = renderProvider(
      profile([ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID]),
    );

    act(() => {
      captured.current?.open();
    });
    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledOnce());
    expect(captured.current?.threadHistory).toBeNull();
  });

  it("archives and deletes through the typed browser transport", async () => {
    const captured = renderProvider(
      profile([ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID]),
    );
    act(() => {
      captured.current?.open();
    });
    await waitFor(() => {
      expect(captured.current?.threadHistory?.threads).toHaveLength(1);
    });

    await act(async () => {
      await captured.current?.threadHistory?.archive(THREAD_ID);
    });
    expect(updateThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        request: { row_version: "1", status: "archived" },
      }),
    );

    await act(async () => {
      await captured.current?.threadHistory?.delete(THREAD_ID);
    });
    expect(deleteThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: THREAD_ID, rowVersion: "2" }),
    );
    expect(captured.current?.threadHistory?.threads).toEqual([]);
  });

  it("sends only the thread ID after resume, leaving history authoritative to the server", async () => {
    vi.mocked(fetchAgentEvents).mockImplementation((options) => {
      return completedStream(options.request.thread_id ?? THREAD_ID);
    });
    const captured = renderProvider(
      profile([ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID]),
    );
    act(() => {
      captured.current?.open();
    });
    await waitFor(() => {
      expect(captured.current?.threadHistory?.threads).toHaveLength(1);
    });
    await act(async () => {
      await captured.current?.threadHistory?.resume(THREAD_ID);
      await captured.current?.send("Follow-up question");
    });

    expect(vi.mocked(fetchAgentEvents)).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          thread_id: THREAD_ID,
          message: "Follow-up question",
          history: [],
        }),
      }),
    );
  });
});

function renderProvider(profileValue: AtlasPlaneProfile) {
  const captured: { current: AtlasContextValue | null } = { current: null };
  function Probe() {
    captured.current = useAtlas();
    return (
      <>
        <div data-testid="thread-id">{captured.current.state.threadId}</div>
        <div data-testid="messages">
          {captured.current.state.messages.map((item) => item.content).join("|")}
        </div>
      </>
    );
  }

  render(
    <AtlasProvider
      scope={scope}
      profile={profileValue}
      mutationFetch={fetch}
      feedbackEndpoint={null}
      threadHistory={{
        enabled: true,
        retentionNotice: "Configured policy: saved according to tenant policy.",
        archiveEnabled: true,
        deleteEnabled: true,
      }}
    >
      <Probe />
    </AtlasProvider>,
  );
  return captured;
}

function profile(capabilityIds: readonly string[]): AtlasPlaneProfile {
  return {
    plane: "neon",
    title: "Atlas",
    description: "Workspace assistant",
    emptyState: "Ask Atlas.",
    suggestions: [],
    capabilityIds,
  };
}

function catalog(): ModelCatalog {
  return {
    policy_revision: "policy-1",
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

function thread(overrides: Partial<AtlasThread> = {}): AtlasThread {
  return {
    thread_id: THREAD_ID,
    plane: "neon",
    title: "Invoice review",
    status: "active",
    message_count: "2",
    created_at: "2026-07-23T12:00:00.000Z",
    updated_at: "2026-07-23T12:01:00.000Z",
    row_version: "1",
    retention: {
      policy_id: "tenant-30-days",
      expires_at: "2026-08-22T12:01:00.000Z",
      purge_after: "2026-08-29T12:01:00.000Z",
      legal_hold: false,
      display_text: "Server policy: saved for 30 days.",
    },
    ...overrides,
  };
}

async function* completedStream(
  threadId: string,
): AsyncIterable<AgentStreamEnvelope> {
  const runId = "50000000-0000-4000-8000-000000000001";
  const messageId = "60000000-0000-4000-8000-000000000001";
  yield {
    schema_version: ATLAS_AGENT_SCHEMA_VERSION,
    run_id: runId,
    thread_id: threadId,
    message_id: messageId,
    sequence: 0,
    event: {
      type: "run.started",
      provider: "atlas",
      model: "atlas-fast",
    },
  };
  yield {
    schema_version: ATLAS_AGENT_SCHEMA_VERSION,
    run_id: runId,
    thread_id: threadId,
    message_id: messageId,
    sequence: 1,
    event: {
      type: "message.delta",
      delta: "Follow-up answer",
    },
  };
  yield {
    schema_version: ATLAS_AGENT_SCHEMA_VERSION,
    run_id: runId,
    thread_id: threadId,
    message_id: messageId,
    sequence: 2,
    event: {
      type: "run.completed",
      finish_reason: "end_turn",
      model_used: "atlas-fast",
      usage: { input_tokens: 4, output_tokens: 2 },
    },
  };
}
