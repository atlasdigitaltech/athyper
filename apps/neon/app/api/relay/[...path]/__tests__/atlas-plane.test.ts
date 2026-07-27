import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn().mockResolvedValue({
    userId: "user-1",
    activeOrg: "org-1",
    accessToken: "token",
    realmKey: "athyper",
    planeKey: "neon",
    organizations: {
      "org-1": {
        tenantId: "tenant-1",
        tenantCode: "tenant",
        roles: ["user"],
      },
    },
  }),
}));

import { POST } from "../route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Neon Atlas relay trusted plane propagation", () => {
  it("replaces browser plane headers with the authenticated session plane", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      ": connected\n\n",
      {
        headers: {
          "Content-Type": "text/event-stream",
          "X-Accel-Buffering": "no",
        },
      },
    )));
    const request = new NextRequest(
      "http://localhost/api/relay/ai/agent/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Plane": "admin",
          "X-Plane-Key": "admin",
        },
        body: JSON.stringify({
          plane: "admin",
          message: "attempted plane substitution",
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ path: ["ai", "agent", "runs"] }),
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Plane")).toBe("neon");
    expect(headers.get("X-Plane-Key")).toBeNull();
    expect(init.body).toContain('"plane":"admin"');
    expect(response.headers.get("Content-Type")).toContain(
      "text/event-stream",
    );
    await response.body?.cancel();
  });
});
