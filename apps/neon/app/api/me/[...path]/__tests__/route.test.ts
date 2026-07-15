import { afterEach, describe, expect, it, vi } from "vitest";

const relay = vi.hoisted(() => vi.fn(async () => new Response(JSON.stringify({
  error: "AUTH_CONTEXT_MISMATCH",
  message: "The requested organization does not match the verified tenant.",
}), { status: 403, headers: { "content-type": "application/json" } })));

vi.mock("@/lib/server/make-module-relay", () => ({
  makeModuleRelay: vi.fn(() => ({ GET: relay, POST: relay, PUT: relay, PATCH: relay, DELETE: relay })),
}));

import { GET } from "../route";

afterEach(() => vi.clearAllMocks());

describe("/api/me/[...path] context mismatch handling", () => {
  it("preserves the fail-closed preferences response from the runtime", async () => {
    const response = await GET(new Request("http://localhost/api/me/preferences"), {
      params: Promise.resolve({ path: ["preferences"] }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "AUTH_CONTEXT_MISMATCH" });
    expect(relay).toHaveBeenCalledOnce();
  });
});

