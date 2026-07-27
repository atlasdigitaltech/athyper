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
  });
}
