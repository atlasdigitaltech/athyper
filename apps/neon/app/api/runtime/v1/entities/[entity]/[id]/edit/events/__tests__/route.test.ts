import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));

vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer test" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET } from "../route";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = {
  userId: "user-1",
  activeOrg: "org-1",
  organizations: { "org-1": { tenantId: "tenant-1" } },
};

describe("GET document edit events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  });

  it("proxies the authenticated SSE body without redirecting or forwarding URL credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("event: ready\ndata: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://neon.test/api/runtime/v1/entities/purchase_order/po-1/edit/events?permission_stamp=must-not-forward", {
        headers: { "Last-Event-ID": "41" },
      }),
      { params: Promise.resolve({ entity: "purchase-order", id: "po-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("event: connected");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/records/purchase_order/po-1/stream");
    expect(String(url)).not.toContain("permission_stamp");
    expect(new Headers((init as RequestInit).headers).get("Last-Event-ID")).toBe("41");
  });

  it("rejects unauthenticated streams before contacting runtime", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://neon.test/events"),
      { params: Promise.resolve({ entity: "purchase_order", id: "po-1" }) },
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
