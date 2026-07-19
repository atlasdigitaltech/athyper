import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer test" })),
  buildRuntimeUrl: vi.fn((path: string) => `http://runtime.test${path}`),
}));

import { getNeonServerSession } from "@/lib/server/session";
import { getRuntimeConfigurationSnapshot } from "@/lib/server/runtime-configuration-snapshots";
import { invalidateSessionConfiguration } from "@/lib/server/session-configuration-cache";

const session = {
  userId: "user-1",
  planeKey: "neon",
  realmKey: "athyper",
  activeOrg: "org-1",
  activeWorkbench: "finance",
  authEpoch: 3,
  organizations: {
    "org-1": {
      tenantId: "tenant-1",
      legalEntityId: "le-1",
      organizationId: "cc-1",
      contextType: "company_code",
      roles: ["finance"],
      scopeVersion: 2,
    },
  },
};

describe("runtime configuration snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSessionConfiguration({ reason: "test_reset" });
    vi.mocked(getNeonServerSession).mockResolvedValue(session as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches a successful feature/configuration namespace", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      generation: 12,
      values: { "feature.fast_list": true },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRuntimeConfigurationSnapshot("feature.flags.test")).resolves.toEqual({
      generation: 12,
      values: { "feature.fast_list": true },
    });
    await expect(getRuntimeConfigurationSnapshot("feature.flags.test")).resolves.toEqual({
      generation: 12,
      values: { "feature.fast_list": true },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not cache an unsuccessful snapshot response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: { "feature.recovered": true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRuntimeConfigurationSnapshot("feature.failure.test")).resolves.toBeNull();
    await expect(getRuntimeConfigurationSnapshot("feature.failure.test")).resolves.toEqual({
      values: { "feature.recovered": true },
      generation: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
