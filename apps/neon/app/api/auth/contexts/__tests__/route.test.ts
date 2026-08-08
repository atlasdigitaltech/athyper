import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getHandler: vi.fn(async () => new Response(JSON.stringify({ contexts: [] }), { status: 200 })),
  createGet: vi.fn(),
}));

vi.mock("@athyper/platform-iam-auth-bff", () => ({
  createSessionContextsGetHandler: mocks.createGet.mockReturnValue(mocks.getHandler),
}));
vi.mock("@/lib/plane", () => ({ PLANE_KEY: "neon" }));

import { GET } from "../route";

describe("GET /api/auth/contexts", () => {
  it("binds the Neon route to the canonical typed-context handler", async () => {
    expect(mocks.createGet).toHaveBeenCalledWith("neon");
    const response = await GET(new NextRequest("http://localhost/api/auth/contexts"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contexts: [] });
    expect(mocks.getHandler).toHaveBeenCalledOnce();
  });
});

