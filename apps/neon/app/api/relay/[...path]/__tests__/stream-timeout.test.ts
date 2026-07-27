import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));

import { GET, POST } from "../route";
import { getNeonServerSession } from "@/lib/server/session";

const SESSION = {
  userId: "user-1",
  activeOrg: "org-1",
  accessToken: "test-access-token",
  realmKey: "athyper",
  planeKey: "neon",
  organizations: {
    "org-1": {
      tenantId: "tenant-1",
      tenantCode: "ten-1",
      contextType: "tenant",
      organizationId: "org-1",
      organizationCode: "org-1",
      roles: ["user"],
    },
  },
} as const;

function buildRequest(
  signal = new AbortController().signal,
  method = "GET",
): never {
  return {
    method,
    headers: new Headers(method === "POST" ? { "Content-Type": "application/json" } : {}),
    nextUrl: { search: "" },
    signal,
    text: vi.fn().mockResolvedValue(method === "POST" ? "{}" : ""),
    clone: vi.fn(),
  } as never;
}

function sseResponse(extraHeaders: Record<string, string> = {}): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(":connected\n\n"));
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...extraHeaders,
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), milliseconds);
    return controller.signal;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Neon relay SSE timeout policy", () => {
  it.each([
    ["notification", ["platform", "notifications", "stream"]],
    ["record", ["api", "records", "purchase_order", "record-1", "stream"]],
  ])("keeps the approved %s stream alive beyond the ordinary timeout", async (_name, path) => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(sseResponse({ "X-Feed-Mode": "pubsub" }));

    const response = await GET(buildRequest(), { params: Promise.resolve({ path }) });
    const signal = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("X-Feed-Mode")).toBe("pubsub");

    await vi.advanceTimersByTimeAsync(30_001);
    expect(signal.aborted).toBe(false);
  });

  it("does not grant unlimited lifetime to an arbitrary stream-shaped path", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(sseResponse());

    await GET(buildRequest(), {
      params: Promise.resolve({ path: ["api", "unapproved", "stream"] }),
    });
    const signal = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(30_001);
    expect(signal.aborted).toBe(true);
  });

  it("streams the allowlisted Atlas POST route with SSE headers and no ordinary timeout", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(sseResponse());

    const response = await POST(buildRequest(undefined, "POST"), {
      params: Promise.resolve({ path: ["ai", "agent", "runs"] }),
    });
    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const signal = fetchCall?.[1]?.signal as AbortSignal;

    expect(fetchCall?.[1]?.method).toBe("POST");
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");

    await vi.advanceTimersByTimeAsync(30_001);
    expect(signal.aborted).toBe(false);
  });

  it("retains the timeout when the Atlas POST route returns non-SSE", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", {
      headers: { "Content-Type": "application/json" },
    }));

    await POST(buildRequest(undefined, "POST"), {
      params: Promise.resolve({ path: ["ai", "agent", "runs"] }),
    });
    const signal = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(30_001);
    expect(signal.aborted).toBe(true);
  });

  it("forces tenant-effective Atlas catalog responses to private no-store", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ models: [] }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      },
    ));

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ path: ["ai", "agent", "models"] }),
    });

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("retains the timeout when an approved path returns a non-SSE response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", {
      headers: { "Content-Type": "application/json" },
    }));

    await GET(buildRequest(), {
      params: Promise.resolve({ path: ["platform", "notifications", "stream"] }),
    });
    const signal = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(30_001);
    expect(signal.aborted).toBe(true);
  });

  it("cancels the upstream stream when the client disconnects", async () => {
    const client = new AbortController();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(sseResponse());

    const response = await GET(buildRequest(client.signal), {
      params: Promise.resolve({ path: ["platform", "notifications", "stream"] }),
    });
    const upstreamSignal = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    client.abort(new DOMException("client disconnected", "AbortError"));
    expect(upstreamSignal.aborted).toBe(true);
    await response.body?.cancel();
  });
});
