import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer test" })),
  buildRuntimeUrl: vi.fn((path: string) => `http://runtime.test${path}`),
}));

import { getRuntimeSavedViews } from "../runtime-saved-views";
import { getNeonServerSession } from "@/lib/server/session";

describe("runtime saved-view visibility contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue({ userId: "user-1" } as never);
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
});
