import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer test" })),
  buildRuntimeUrl: vi.fn((path: string) => `http://runtime.test${path}`),
}));

import { getRuntimeSavedViews, getRuntimeSavedViewState } from "../runtime-saved-views";
import { getNeonServerSession } from "@/lib/server/session";

describe("runtime saved-view visibility contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue({
      userId: "user-1",
      planeKey: "neon",
      realmKey: "athyper",
      activeOrg: "org-1",
      activeWorkbench: "finance",
      organizations: {
        "org-1": {
          tenantId: "tenant-1",
          organizationId: "company-1",
          contextType: "company_code",
          roles: ["finance"],
        },
      },
    } as never);
  });

  it("returns private and shared views while preserving server ownership permissions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: "mine", name: "My view", scope: "private", can_delete: true, config: { density: "compact" } },
        { id: "team", name: "Team view", is_shared: true, can_delete: false, config: { density: "spacious" } },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const views = await getRuntimeSavedViews("invoice-visibility-test");

    expect(views).toEqual([
      expect.objectContaining({ id: "mine", scope: "private", can_delete: true }),
      expect.objectContaining({ id: "team", scope: "shared", is_shared: true, can_delete: false }),
    ]);
  });

  it("does not request saved views without an authenticated session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRuntimeSavedViews("invoice-no-session-test")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the default view state from the same cached definition load", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          id: "default-view",
          name: "My default",
          is_default: true,
          config: { density: "compact", pageSize: 50 },
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const views = await getRuntimeSavedViews("invoice-default-cache-test");
    const defaultView = views.find((view) => view.is_default);
    await expect(
      getRuntimeSavedViewState("invoice-default-cache-test", defaultView?.id ?? ""),
    ).resolves.toEqual({ density: "compact", pageSize: 50 });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
