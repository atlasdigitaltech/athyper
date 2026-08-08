import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  patchHandler: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  createPatch: vi.fn(),
}));

vi.mock("@athyper/platform-iam-auth-bff", () => ({
  createSessionPatchHandler: mocks.createPatch.mockReturnValue(mocks.patchHandler),
}));
vi.mock("@/lib/plane", () => ({ PLANE_KEY: "neon" }));

import { PATCH } from "../route";

describe("PATCH /api/auth/session/context", () => {
  it("binds context selection to the canonical revalidating session handler", async () => {
    expect(mocks.createPatch).toHaveBeenCalledWith("neon");
    const response = await PATCH(new NextRequest("http://localhost/api/auth/session/context", {
      method: "PATCH",
      body: JSON.stringify({ type: "operating_organization", id: "oo-1" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.patchHandler).toHaveBeenCalledOnce();
  });
});

