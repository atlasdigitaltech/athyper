import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createRelayHandler,
  STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS,
  STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS,
} from "../../packages/platform/gateway/bff-relay/src/index";
const current = {
  accessToken: "server-token",
  plane: "studio",
  realmKey: "studio",
  tenantId: "tenant",
  principalId: "actor",
  authEpoch: 1,
  csrfToken: "csrf",
};
function fixture() {
  const requests: Request[] = [];
  const relay = createRelayHandler({
    plane: "studio",
    runtimeApiUrl: "http://runtime",
    appOrigin: "https://studio.test",
    operations: [
      ...STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS,
      ...STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS,
    ],
    session: {
      resolve: async () => current,
      refresh: async () => current,
      invalidate: async () => undefined,
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ code: "UPSTREAM_FORBIDDEN" }, { status: 403 });
    },
  });
  const call = (path: string[], headers: Record<string, string> = {}) =>
    relay(
      new Request(`https://studio.test/api/relay/${path.join("/")}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: "{}",
      }),
      { params: Promise.resolve({ path }) },
    );
  return { requests, call };
}
it("requires CSRF and preserves upstream authoring denial and revision coordinates", async () => {
  const f = fixture(),
    path = ["meta-entity-authoring", "change-sets", "draft", "publish"];
  assert.equal((await f.call(path)).status, 403);
  assert.equal(f.requests.length, 0);
  const result = await f.call(path, {
    origin: "https://studio.test",
    "x-csrf-token": "csrf",
    "if-match": "4",
  });
  assert.equal(result.status, 403);
  assert.deepEqual(await result.json(), { code: "UPSTREAM_FORBIDDEN" });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0]!.headers.get("if-match"), "4");
  assert.equal(f.requests[0]!.headers.get("x-principal-id"), "actor");
});
it("does not expose arbitrary publication actions or break-glass", async () => {
  const f = fixture();
  for (const path of [
    ["meta-entity-authoring", "change-sets", "draft", "force-publish"],
    ["control-admin", "authorization", "break-glass"],
  ])
    assert.equal(
      (
        await f.call(path, {
          origin: "https://studio.test",
          "x-csrf-token": "csrf",
        })
      ).status,
      404,
    );
  assert.equal(f.requests.length, 0);
});

it("company case relays retain CSRF, idempotency, and upstream authority checks", async () => {
  const {
    STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS,
    BUSINESS_PARTNER_CASE_RELAY_OPERATIONS,
  } = await import("../../packages/platform/gateway/bff-relay/src/index");
  for (const [plane, operations, path] of [
    [
      "studio",
      STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS,
      ["studio", "business-partner-company-case-contracts"],
    ],
    [
      "neon",
      BUSINESS_PARTNER_CASE_RELAY_OPERATIONS,
      ["neon", "business-partner-company-setup-cases"],
    ],
  ] as const) {
    let calls = 0;
    const authority = { ...current, plane };
    const handler = createRelayHandler({
      plane,
      runtimeApiUrl: "http://runtime",
      appOrigin: `https://${plane}.test`,
      operations,
      session: {
        resolve: async () => authority,
        refresh: async () => authority,
        invalidate: async () => undefined,
      },
      fetch: async () => {
        calls++;
        return Response.json({ code: "FORBIDDEN" }, { status: 403 });
      },
    });
    const request = (headers: Record<string, string>) =>
      handler(
        new Request(`https://${plane}.test/api/relay/${path.join("/")}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: "{}",
        }),
        { params: Promise.resolve({ path: [...path] }) },
      );
    assert.equal((await request({})).status, 403);
    assert.equal(calls, 0);
    const response = await request({
      origin: `https://${plane}.test`,
      "x-csrf-token": "csrf",
      "idempotency-key": "company-capture-test",
    });
    assert.equal(response.status, 403);
    assert.equal(calls, 1);
    assert.deepEqual(await response.json(), { code: "FORBIDDEN" });
  }
});
