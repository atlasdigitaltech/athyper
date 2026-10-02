import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRelayHandler,
  ATLAS_THREAD_RUN_OPERATION,
  type RelayOperation,
} from "../../packages/platform/gateway/bff-relay/src/index";
function handler(
  operation: RelayOperation,
  fetcher: typeof fetch,
  timeouts?: { stream: number },
) {
  return createRelayHandler({
    plane: "neon",
    appOrigin: "https://neon.example",
    runtimeApiUrl: "http://api:4000/api",
    operations: [operation],
    timeouts,
    session: {
      resolve: async () => ({
        accessToken: "test",
        plane: "neon",
        realmKey: "athyper",
        tenantId: "tenant",
        principalId: "principal",
        authEpoch: 1,
        csrfToken: "csrf",
      }),
      refresh: async () => undefined,
      invalidate: async () => undefined,
    },
    fetch: fetcher,
  });
}
const operation = {
  ...ATLAS_THREAD_RUN_OPERATION,
  method: "GET" as const,
  path: "/api/test" as const,
  idempotency: "none" as const,
};
const request = () => new Request("https://neon.example/api/relay/test");
const context = () => ({ params: Promise.resolve({ path: ["test"] }) });
test("Atlas has a bounded cold-grounding startup budget", () => {
  assert.equal(ATLAS_THREAD_RUN_OPERATION.responseHeaderTimeoutMs, 75_000);
  for (const n of [0, -1, 120001, Infinity, 1.5])
    assert.throws(
      () => handler({ ...operation, responseHeaderTimeoutMs: n }, fetch),
      /Invalid relay response header timeout/,
    );
});
test("operation startup budget aborts slow upstream headers", async () => {
  let aborted = false;
  const h = handler(
    { ...operation, responseHeaderTimeoutMs: 5 },
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(init!.signal!.reason);
          },
          { once: true },
        ),
      ),
  );
  assert.equal((await h(request(), context())).status, 504);
  assert.equal(aborted, true);
});
test("explicit deployment timeout still takes precedence", async () => {
  const h = handler(
    operation,
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => reject(init!.signal!.reason),
          { once: true },
        ),
      ),
    { stream: 5 },
  );
  assert.equal((await h(request(), context())).status, 504);
});
test("disconnect still aborts during Atlas preflight", async () => {
  const client = new AbortController();
  let dispatched!: () => void;
  const ready = new Promise<void>((r) => {
    dispatched = r;
  });
  const h = handler(
    operation,
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => reject(init!.signal!.reason),
          { once: true },
        );
        dispatched();
      }),
  );
  const pending = h(
    new Request(request(), { signal: client.signal }),
    context(),
  );
  await ready;
  client.abort();
  assert.equal((await pending).status, 499);
});
