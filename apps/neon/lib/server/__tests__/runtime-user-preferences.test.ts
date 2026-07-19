import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({ getNeonServerSession: vi.fn() }));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer test" })),
  buildRuntimeUrl: vi.fn((path: string) => `http://runtime.test${path}`),
}));

import { getNeonServerSession } from "@/lib/server/session";
import {
  getRuntimeUserPreferences,
  invalidateRuntimeUserPreferences,
} from "@/lib/server/runtime-user-preferences";

const session = {
  userId: "user-1",
  planeKey: "neon",
  realmKey: "athyper",
  activeOrg: "org-1",
  authEpoch: 3,
  organizations: {
    "org-1": {
      tenantId: "tenant-1",
      organizationId: "org-1",
      contextType: "legal_entity",
      roles: ["finance"],
      scopeVersion: 2,
    },
  },
};

describe("runtime user preferences session cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(session as never);
    invalidateRuntimeUserPreferences(session as never, "test_reset");
  });

  it("coalesces preferences for the authenticated session scope", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ theme: "system" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRuntimeUserPreferences()).resolves.toEqual({ theme: "system" });
    await expect(getRuntimeUserPreferences()).resolves.toEqual({ theme: "system" });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("invalidates the cached payload after a successful preference mutation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ theme: "system" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getRuntimeUserPreferences();
    invalidateRuntimeUserPreferences(session as never, "preferences_updated");
    await getRuntimeUserPreferences();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
