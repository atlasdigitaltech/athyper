import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  relayGet: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock("@/lib/server/make-module-relay", () => ({
  makeModuleRelay: vi.fn(() => ({
    GET: mocks.relayGet,
    POST: vi.fn(),
    PUT: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  })),
}));
vi.mock("@/lib/server/runtime-configuration-snapshots", () => ({
  getRuntimeConfigurationSnapshot: mocks.getSnapshot,
}));

import { GET } from "../route";

describe("IAM effective-parameter session cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.relayGet.mockResolvedValue(new Response("relayed", { status: 200 }));
  });

  it("serves effective parameter snapshots through the scoped cache", async () => {
    mocks.getSnapshot.mockImplementation(async (_namespace, diagnostics) => {
      diagnostics.record("session_config", 3.25, "hit");
      return { generation: 7, values: { "feature.enabled": true } };
    });

    const response = await GET(
      new Request("http://localhost/api/iam/parameters/effective?namespace=feature.flags") as never,
      { params: Promise.resolve({ path: ["parameters", "effective"] }) },
    );

    await expect(response.json()).resolves.toEqual({
      generation: 7,
      values: { "feature.enabled": true },
    });
    expect(mocks.getSnapshot).toHaveBeenCalledWith("feature.flags", expect.any(Object));
    expect(mocks.relayGet).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Athyper-Cache")).toBe("hit");
    expect(response.headers.get("Server-Timing")).toBe("session_config;dur=3.25");
  });

  it("preserves generic relay behavior for other IAM paths", async () => {
    const response = await GET(
      new Request("http://localhost/api/iam/roles") as never,
      { params: Promise.resolve({ path: ["roles"] }) },
    );

    await expect(response.text()).resolves.toBe("relayed");
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.relayGet).toHaveBeenCalledOnce();
  });

  it("falls back to the relay when the scoped loader cannot resolve a snapshot", async () => {
    mocks.getSnapshot.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/iam/parameters/effective?namespace=api.search") as never,
      { params: Promise.resolve({ path: ["parameters", "effective"] }) },
    );

    await expect(response.text()).resolves.toBe("relayed");
    expect(mocks.relayGet).toHaveBeenCalledOnce();
  });
});
