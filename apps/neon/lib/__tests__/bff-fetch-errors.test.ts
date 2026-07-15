import { afterEach, describe, expect, it, vi } from "vitest";

import { bffFetch } from "@/lib/bff-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("bffFetch error diagnostics", () => {
  it("retains the upstream error code and diagnostic detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "AUTH_CONTEXT_MISMATCH",
      message: "auth_context_mismatch:tenant",
    }), { status: 403, statusText: "Forbidden" })));

    await expect(bffFetch("/api/me/profile")).rejects.toMatchObject({
      name: "BffError",
      status: 403,
      message: "AUTH_CONTEXT_MISMATCH: auth_context_mismatch:tenant",
    });

  });
});
