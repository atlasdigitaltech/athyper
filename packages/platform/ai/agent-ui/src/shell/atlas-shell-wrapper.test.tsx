import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AtlasPlaneProfile,
  AtlasSessionScope,
  ModelCatalog,
} from "@athyper/platform-ai-agent-runtime";
import { useAtlas } from "../provider/atlas-context";
import { useAtlasContextBinding } from "../provider/use-atlas-context-binding";
import { AtlasHeaderTrigger } from "../triggers/atlas-header-trigger";
import { AtlasShellWrapper } from "./atlas-shell-wrapper";

vi.mock("../surfaces/atlas-panel", () => ({ AtlasPanel: () => null }));
vi.mock("../surfaces/atlas-fullscreen", () => ({
  AtlasFullscreen: () => null,
}));

const scope: AtlasSessionScope = {
  userId: "user-1",
  tenantId: "tenant-1",
  plane: "neon",
  authEpoch: "1:1",
  permissionStamp: "permission-1",
};

const profile: AtlasPlaneProfile = {
  plane: "neon",
  title: "Atlas",
  description: "Neon assistant",
  emptyState: "Ask a question",
  suggestions: [],
  capabilityIds: [],
};

const catalog: ModelCatalog = {
  policy_revision: "phase1-policy",
  default_model_id: "atlas-fast",
  models: [{
    provider_id: "anthropic",
    model_id: "atlas-fast",
    display_name: "Atlas Fast",
    icon_key: "atlas",
    tier: "fast",
    status: "available",
    selection_policy: "normal",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      max_context_tokens: 100_000,
      max_output_tokens: 4_096,
    },
    cost: {
      input_per_mtok_usd: 1,
      output_per_mtok_usd: 2,
    },
  }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AtlasShellWrapper", () => {
  it.each([
    { enabled: false, profilePlane: "neon" as const },
    { enabled: true, profilePlane: "mesh" as const },
  ])(
    "keeps Atlas absent with zero network activity for $enabled/$profilePlane",
    ({ enabled, profilePlane }) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      render(
        <AtlasShellWrapper
          enabled={enabled}
          scope={scope}
          profile={{ ...profile, plane: profilePlane }}
          mutationFetch={vi.fn()}
        >
          <AtlasHeaderTrigger />
          <ContextBinding />
          <span>Application content</span>
        </AtlasShellWrapper>,
      );

      expect(screen.getByText("Application content")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Open Atlas" }))
        .not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("shows only an effective trigger and restores its focus on close", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(catalog),
      { headers: { "Content-Type": "application/json" } },
    ));

    render(
      <AtlasShellWrapper
        enabled
        scope={scope}
        profile={profile}
        mutationFetch={vi.fn()}
      >
        <AtlasHeaderTrigger />
        <OpenState />
      </AtlasShellWrapper>,
    );

    const trigger = await screen.findByRole("button", { name: "Open Atlas" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByText("Atlas open")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Atlas test" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each([
    { label: "tenant flag off", response: new Response("", { status: 404 }) },
    { label: "permission denied", response: new Response("", { status: 403 }) },
    {
      label: "no eligible model",
      response: new Response(JSON.stringify({
        ...catalog,
        default_model_id: "",
        models: [],
      }), { headers: { "Content-Type": "application/json" } }),
    },
  ])("hides authorization detail when $label", async ({ response }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    render(
      <AtlasShellWrapper
        enabled
        scope={scope}
        profile={profile}
        mutationFetch={vi.fn()}
      >
        <AtlasHeaderTrigger />
        <span>Customer content</span>
      </AtlasShellWrapper>,
    );

    expect(screen.getByText("Customer content")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Open Atlas" }))
        .not.toBeInTheDocument()
    );
    expect(screen.queryByText(/permission|tenant flag|eligible/i))
      .not.toBeInTheDocument();
  });

  it("uses an optional collision-reviewed shortcut without intercepting input", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(catalog),
      { headers: { "Content-Type": "application/json" } },
    ));
    render(
      <AtlasShellWrapper
        enabled
        scope={scope}
        profile={profile}
        mutationFetch={vi.fn()}
        shortcut={{ key: "a", ctrlOrMeta: true, shiftKey: true }}
      >
        <input aria-label="Editor" />
        <AtlasHeaderTrigger />
        <OpenState />
      </AtlasShellWrapper>,
    );
    await screen.findByRole("button", { name: "Open Atlas" });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Editor" }), {
      key: "a",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(screen.getByText("Atlas closed")).toBeInTheDocument();

    fireEvent.keyDown(window, {
      key: "a",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(screen.getByText("Atlas open")).toBeInTheDocument();
  });
});

function OpenState() {
  const atlas = useAtlas();
  return (
    <>
      <span>{atlas.isOpen ? "Atlas open" : "Atlas closed"}</span>
      {atlas.isOpen ? (
        <button type="button" onClick={atlas.close}>
          Close Atlas test
        </button>
      ) : null}
    </>
  );
}

function ContextBinding() {
  useAtlasContextBinding({
    entityType: "purchase_invoice",
    entityId: "invoice-1",
  });
  return null;
}
