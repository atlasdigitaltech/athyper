import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AtlasConversationState,
  AtlasPlaneProfile,
} from "@athyper/atlas-agent-runtime";
import {
  SurfaceStackProvider,
  useSurfaceStack,
  type SurfaceStackApi,
} from "@athyper/ui/surfaces/stack";
import { AtlasContext, type AtlasContextValue } from "../provider/atlas-context";
import { AtlasPanel } from "./atlas-panel";

const profile: AtlasPlaneProfile = {
  plane: "neon",
  title: "Atlas",
  description: "Workspace assistant",
  emptyState: "Ask Atlas about your workspace.",
  suggestions: [],
  capabilityIds: [],
};

const idleState: AtlasConversationState = {
  phase: "idle",
  messages: [],
  activeRunId: null,
  threadId: null,
  lastSequence: -1,
  error: null,
};

function value(
  close: () => void,
  setSurfaceMode = vi.fn(),
): AtlasContextValue {
  return {
    isOpen: true,
    state: idleState,
    profile,
    availability: "loading",
    rateLimitNotice: null,
    catalog: null,
    catalogLoading: true,
    catalogError: null,
    currentModelId: null,
    setModelId: vi.fn(),
    refetchCatalog: vi.fn(async () => {}),
    feedbackEnabled: true,
    submitFeedback: vi.fn(async () => {}),
    surfaceMode: "panel",
    setSurfaceMode,
    open: vi.fn(),
    openWithQuery: vi.fn(),
    close,
    send: vi.fn(async () => {}),
    cancel: vi.fn(),
    newConversation: vi.fn(),
    threadHistory: null,
  };
}

describe("AtlasPanel shipped surface", () => {
  it("registers with the shared surface stack, supports fullscreen, and keeps history hidden", async () => {
    const close = vi.fn();
    const setSurfaceMode = vi.fn();
    const captured: { current: SurfaceStackApi | null } = { current: null };

    function CaptureStack() {
      captured.current = useSurfaceStack();
      return null;
    }

    render(
      <SurfaceStackProvider>
        <CaptureStack />
        <AtlasContext.Provider value={value(close, setSurfaceMode)}>
          <AtlasPanel />
        </AtlasContext.Provider>
      </SurfaceStackProvider>,
    );

    await waitFor(() => {
      expect(captured.current?.frames).toHaveLength(1);
    });
    expect(captured.current?.frames[0]).toMatchObject({
      kind: "drawer-form",
      source: "drawer-form-shell",
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Atlas fullscreen" }));
    expect(setSurfaceMode).toHaveBeenCalledWith("fullscreen");
    expect(screen.queryByRole("button", { name: /history/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/conversation history/i)).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });
  });
});
