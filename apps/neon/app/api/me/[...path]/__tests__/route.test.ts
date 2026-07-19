import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

const relay = vi.hoisted(() => vi.fn(async () => new Response(JSON.stringify({
  error: "AUTH_CONTEXT_MISMATCH",
  message: "The requested organization does not match the verified tenant.",
}), { status: 403, headers: { "content-type": "application/json" } })));
const preferences = vi.hoisted(() => vi.fn(
  async (_diagnostics?: { record: Function }): Promise<unknown | null> => null,
));

vi.mock("@/lib/server/make-module-relay", () => ({
  makeModuleRelay: vi.fn(() => ({ GET: relay, POST: relay, PUT: relay, PATCH: relay, DELETE: relay })),
}));
vi.mock("@/lib/server/runtime-user-preferences", () => ({
  getRuntimeUserPreferences: preferences,
  invalidateRuntimeUserPreferences: vi.fn(),
  RuntimeUserPreferencesUpstreamError: class RuntimeUserPreferencesUpstreamError extends Error {},
}));
vi.mock("@/lib/server/session", () => ({ getNeonServerSession: vi.fn() }));

import { GET } from "../route";

afterEach(() => {
  vi.clearAllMocks();
  preferences.mockResolvedValue(null);
});

describe("/api/me/[...path] context mismatch handling", () => {
  it("preserves the fail-closed preferences response from the runtime", async () => {
    const response = await GET(new NextRequest("http://localhost/api/me/preferences"), {
      params: Promise.resolve({ path: ["preferences"] }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "AUTH_CONTEXT_MISMATCH" });
    expect(relay).toHaveBeenCalledOnce();
  });

  it("returns a session-cached preferences payload without invoking the relay", async () => {
    preferences.mockImplementationOnce(async (diagnostics?: { record: Function }) => {
      diagnostics?.record("session_config", 0.25, "hit");
      return { theme: "system" };
    });
    const response = await GET(new NextRequest("http://localhost/api/me/preferences"), {
      params: Promise.resolve({ path: ["preferences"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Athyper-Cache")).toBe("hit");
    expect(response.headers.get("Server-Timing")).toContain("cache=hit");
    expect(await response.json()).toEqual({ theme: "system" });
    expect(relay).not.toHaveBeenCalled();
  });
});

