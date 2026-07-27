import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AtlasConversationState,
  AtlasPlaneProfile,
  AtlasThread,
} from "@athyper/atlas-agent-runtime";
import {
  AtlasContext,
  type AtlasContextValue,
  type AtlasThreadHistoryContextValue,
} from "../provider/atlas-context";
import { HistoryRail } from "./history-rail";

const profile: AtlasPlaneProfile = {
  plane: "neon",
  title: "Atlas",
  description: "Workspace assistant",
  emptyState: "Ask Atlas.",
  suggestions: [],
  capabilityIds: ["atlas.conversation.persistence"],
};

const state: AtlasConversationState = {
  phase: "idle",
  messages: [],
  activeRunId: null,
  threadId: null,
  lastSequence: -1,
  error: null,
};

describe("HistoryRail", () => {
  it("is absent when persistence is unavailable", () => {
    render(
      <AtlasContext.Provider value={context(null)}>
        <HistoryRail />
      </AtlasContext.Provider>,
    );

    expect(
      screen.queryByRole("complementary", { name: "Conversation history" }),
    ).not.toBeInTheDocument();
  });

  it("renders accurate retention copy and loading, error, and empty states", () => {
    const { rerender } = renderHistory(history({ loading: true }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading saved conversations",
    );
    expect(screen.getByTestId("atlas-retention-notice")).toHaveTextContent(
      "Saved for 30 days after the last message.",
    );

    const refresh = vi.fn(async () => {});
    rerender(wrapped(history({
      loading: false,
      error: "Conversation history could not be loaded.",
      refresh,
    })));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Conversation history could not be loaded.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledOnce();

    rerender(wrapped(history({ loading: false, error: null, threads: [] })));
    expect(screen.getByText("No saved conversations")).toBeInTheDocument();
  });

  it("supports resume, archive, and confirmed delete", () => {
    const resume = vi.fn(async () => {});
    const archive = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const active = thread();
    const archived = thread({
      thread_id: "20000000-0000-4000-8000-000000000001",
      title: "Archived review",
      status: "archived",
    });

    renderHistory(history({
      threads: [active, archived],
      resume,
      archive,
      delete: remove,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Resume Invoice review" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive Invoice review" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Invoice review" }));

    expect(resume).toHaveBeenCalledWith(active.thread_id);
    expect(archive).toHaveBeenCalledWith(active.thread_id);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Saved for 30 days after the last message."),
    );
    expect(remove).toHaveBeenCalledWith(active.thread_id);
  });
});

function renderHistory(value: AtlasThreadHistoryContextValue) {
  return render(wrapped(value));
}

function wrapped(value: AtlasThreadHistoryContextValue) {
  return (
    <AtlasContext.Provider value={context(value)}>
      <HistoryRail />
    </AtlasContext.Provider>
  );
}

function context(
  threadHistory: AtlasThreadHistoryContextValue | null,
): AtlasContextValue {
  return {
    isOpen: true,
    state,
    profile,
    availability: "unavailable",
    rateLimitNotice: null,
    catalog: null,
    catalogLoading: false,
    catalogError: null,
    currentModelId: null,
    setModelId: vi.fn(),
    refetchCatalog: vi.fn(async () => {}),
    feedbackEnabled: false,
    submitFeedback: vi.fn(async () => {}),
    surfaceMode: "panel",
    setSurfaceMode: vi.fn(),
    open: vi.fn(),
    openWithQuery: vi.fn(),
    close: vi.fn(),
    send: vi.fn(async () => {}),
    cancel: vi.fn(),
    newConversation: vi.fn(),
    threadHistory,
  };
}

function history(
  overrides: Partial<AtlasThreadHistoryContextValue> = {},
): AtlasThreadHistoryContextValue {
  return {
    threads: [],
    loading: false,
    error: null,
    retentionNotice: "Saved for 30 days after the last message.",
    mutatingThreadId: null,
    activeThreadId: null,
    archiveEnabled: true,
    deleteEnabled: true,
    refresh: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    ...overrides,
  };
}

function thread(overrides: Partial<AtlasThread> = {}): AtlasThread {
  return {
    thread_id: "10000000-0000-4000-8000-000000000001",
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
      display_text: "Saved for 30 days after the last message.",
    },
    ...overrides,
  };
}
