import assert from "node:assert/strict";

export interface AtlasRelayHandlers {
  GET: (request: never, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;
  POST: (request: never, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;
}

export interface RelayContractRegistrar {
  describe: (name: string, run: () => void) => void;
  it: (name: string, run: () => void | Promise<void>) => void;
  afterEach: (run: () => void) => void;
}

export interface AtlasRelayContractSuiteOptions {
  name: string;
  expectedPlane: string;
  expectedRealm: string;
  loadHandlers: () => Promise<AtlasRelayHandlers>;
  registrar: RelayContractRegistrar;
}

function eventStreamResponse(): Response {
  return new Response(": connected\n\n", {
    headers: { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" },
  });
}

export function defineAtlasRelayContractSuite(options: AtlasRelayContractSuiteOptions): void {
  const { afterEach, describe, it } = options.registrar;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe(`${options.name} Atlas relay configuration`, () => {
    it("preserves the allowlisted POST event stream and stamps its plane", async () => {
      let forwardedHeaders: Headers | undefined;
      globalThis.fetch = async (_input, init) => {
        forwardedHeaders = new Headers(init?.headers);
        return eventStreamResponse();
      };
      const { POST } = await options.loadHandlers();
      const request = {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          "X-Plane": "untrusted-plane",
          "X-Plane-Key": "untrusted-plane",
        }),
        nextUrl: { search: "" },
        signal: new AbortController().signal,
        text: async () => "{}",
      } as never;

      const response = await POST(request, {
        params: Promise.resolve({ path: ["ai", "agent", "runs"] }),
      });

      assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/);
      assert.equal(response.headers.get("X-Accel-Buffering"), "no");
      assert.equal(forwardedHeaders?.get("X-Plane"), options.expectedPlane);
      assert.equal(forwardedHeaders?.get("X-Plane-Key"), null);
      assert.equal(forwardedHeaders?.get("X-Realm"), options.expectedRealm);
      await response.body?.cancel();
    });

    it("preserves the notification GET event stream and stamps its plane", async () => {
      let forwardedHeaders: Headers | undefined;
      globalThis.fetch = async (_input, init) => {
        forwardedHeaders = new Headers(init?.headers);
        return eventStreamResponse();
      };
      const { GET } = await options.loadHandlers();
      const request = {
        method: "GET",
        headers: new Headers(),
        nextUrl: { search: "" },
        signal: new AbortController().signal,
      } as never;

      const response = await GET(request, {
        params: Promise.resolve({ path: ["platform", "notifications", "stream"] }),
      });

      assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/);
      assert.equal(forwardedHeaders?.get("X-Plane"), options.expectedPlane);
      assert.equal(forwardedHeaders?.get("X-Realm"), options.expectedRealm);
      await response.body?.cancel();
    });

    it("relays a non-streaming GET response with private no-store cache control", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      const { GET } = await options.loadHandlers();
      const request = {
        method: "GET",
        headers: new Headers(),
        nextUrl: { search: "" },
        signal: new AbortController().signal,
      } as never;

      const response = await GET(request, {
        params: Promise.resolve({ path: ["finance", "journals"] }),
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get("Cache-Control") ?? "", /private/);
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
      await response.body?.cancel();
    });

    it("relays a 204 No Content response with no-store cache control", async () => {
      globalThis.fetch = async () => new Response(null, { status: 204 });
      const { POST } = await options.loadHandlers();
      const request = {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        nextUrl: { search: "" },
        signal: new AbortController().signal,
        text: async () => "{}",
      } as never;

      const response = await POST(request, {
        params: Promise.resolve({ path: ["records", "invoice", "bulk-delete"] }),
      });

      assert.equal(response.status, 204);
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    });

    it("propagates a valid X-Trace-ID from upstream to the client", async () => {
      const traceId = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
      globalThis.fetch = async () =>
        new Response(null, {
          status: 204,
          headers: { "X-Trace-ID": traceId },
        });
      const { GET } = await options.loadHandlers();
      const request = {
        method: "GET",
        headers: new Headers(),
        nextUrl: { search: "" },
        signal: new AbortController().signal,
      } as never;

      const response = await GET(request, {
        params: Promise.resolve({ path: ["records", "invoice", "123"] }),
      });

      assert.equal(response.headers.get("X-Trace-ID"), traceId);
    });

    it("rejects a spoofed session-owned header from the caller", async () => {
      let forwardedHeaders: Headers | undefined;
      globalThis.fetch = async (_input, init) => {
        forwardedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      const { GET } = await options.loadHandlers();
      const request = {
        method: "GET",
        // Caller attempts to spoof the tenant header
        headers: new Headers({ "X-Tenant-ID": "spoofed-tenant-id" }),
        nextUrl: { search: "" },
        signal: new AbortController().signal,
      } as never;

      await GET(request, {
        params: Promise.resolve({ path: ["finance", "journals"] }),
      });

      // The forwarded X-Tenant-ID must come from the session, not from the caller.
      assert.notEqual(forwardedHeaders?.get("X-Tenant-ID"), "spoofed-tenant-id");
    });
  });
}
