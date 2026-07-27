import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AtlasConversationState,
  AtlasPlaneProfile,
  ModelCatalog,
} from "@athyper/atlas-agent-runtime";
import { AtlasContext, type AtlasContextValue } from "../provider/atlas-context";
import { ModelPicker } from "./model-picker";

vi.mock("@athyper/ui", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const profile: AtlasPlaneProfile = {
  plane: "neon",
  title: "Atlas",
  description: "Workspace assistant",
  emptyState: "Ask a question",
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

const catalog: ModelCatalog = {
  policy_revision: "policy-42",
  default_model_id: "atlas-balanced",
  models: [
    {
      provider_id: "anthropic",
      model_id: "atlas-fast",
      display_name: "Claude Haiku internal binding",
      icon_key: "anthropic",
      tier: "fast",
      status: "available",
      selection_policy: "normal",
      capabilities: {
        streaming: true,
        tools: false,
        vision: false,
        max_context_tokens: 200_000,
        max_output_tokens: 4_096,
      },
      cost: {
        input_per_mtok_usd: 0.8,
        output_per_mtok_usd: 4,
      },
    },
    {
      provider_id: "openai",
      model_id: "atlas-balanced",
      display_name: "GPT private upstream",
      icon_key: "openai",
      tier: "balanced",
      status: "available",
      selection_policy: "normal",
      capabilities: {
        streaming: true,
        tools: false,
        vision: false,
        max_context_tokens: 128_000,
        max_output_tokens: 8_192,
      },
      cost: {
        input_per_mtok_usd: 3,
        output_per_mtok_usd: 15,
      },
    },
    {
      provider_id: "internal-secret-provider",
      model_id: "atlas-best",
      display_name: "Restricted production model 2026-07",
      icon_key: "internal",
      tier: "best",
      status: "available",
      selection_policy: "normal",
      capabilities: {
        streaming: true,
        tools: false,
        vision: false,
        max_context_tokens: 1_000_000,
        max_output_tokens: 32_000,
      },
      cost: {
        input_per_mtok_usd: 999,
        output_per_mtok_usd: 1_999,
      },
    },
  ],
};

function value(setModelId = vi.fn()): AtlasContextValue {
  return {
    isOpen: true,
    state: idleState,
    profile,
    availability: "ready",
    rateLimitNotice: null,
    catalog,
    catalogLoading: false,
    catalogError: null,
    currentModelId: "atlas-balanced",
    setModelId,
    refetchCatalog: vi.fn(async () => {}),
    feedbackEnabled: true,
    submitFeedback: vi.fn(async () => {}),
    surfaceMode: "panel",
    setSurfaceMode: vi.fn(),
    open: vi.fn(),
    openWithQuery: vi.fn(),
    close: vi.fn(),
    send: vi.fn(async () => {}),
    cancel: vi.fn(),
    newConversation: vi.fn(),
    threadHistory: null,
  };
}

describe("ModelPicker customer contract", () => {
  it("shows only Atlas public modes and never provider, upstream, token, or price diagnostics", () => {
    const { container } = render(
      <AtlasContext.Provider value={value()}>
        <ModelPicker />
      </AtlasContext.Provider>,
    );

    expect(screen.getAllByText("Atlas Fast").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Atlas Balanced").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Atlas Best").length).toBeGreaterThan(0);
    expect(screen.getByText("Quick answers for straightforward questions")).toBeInTheDocument();
    expect(screen.getByText("A balanced choice for everyday work")).toBeInTheDocument();
    expect(screen.getByText("Deeper reasoning for more complex questions")).toBeInTheDocument();

    const customerText = container.textContent ?? "";
    for (const internalDetail of [
      "Anthropic",
      "OpenAI",
      "Claude",
      "GPT",
      "internal-secret-provider",
      "Restricted production model",
      "200,000",
      "128,000",
      "1,000,000",
      "$",
      "USD",
      "token",
    ]) {
      expect(customerText).not.toContain(internalDetail);
    }
  });

  it("selects the opaque public Atlas model ID", () => {
    const setModelId = vi.fn();
    render(
      <AtlasContext.Provider value={value(setModelId)}>
        <ModelPicker />
      </AtlasContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Atlas Best/ }));

    expect(setModelId).toHaveBeenCalledOnce();
    expect(setModelId).toHaveBeenCalledWith("atlas-best");
  });
});
