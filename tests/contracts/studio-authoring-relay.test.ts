import assert from "node:assert/strict";
import { it } from "node:test";
import { createRelayHandler, STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS, STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS } from "../../packages/platform/gateway/bff-relay/src/index";
const current = { accessToken: "server-token", plane: "studio", realmKey: "studio", tenantId: "tenant", principalId: "actor", authEpoch: 1, csrfToken: "csrf" };
function fixture() {
  const requests: Request[] = [];
  const relay = createRelayHandler({ plane: "studio", runtimeApiUrl: "http://runtime", appOrigin: "https://studio.test", operations: [...STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS, ...STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS], session: { resolve: async () => current, refresh: async () => current, invalidate: async () => undefined }, fetch: async (input, init) => { requests.push(new Request(input, init)); return Response.json({ code: "UPSTREAM_FORBIDDEN" }, { status: 403 }); } });
  const call = (path: string[], headers: Record<string,string> = {}) => relay(new Request(`https://studio.test/api/relay/${path.join("/")}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" }), { params: Promise.resolve({ path }) });
  return {requests,call};
}
it("requires CSRF and preserves upstream authoring denial and revision coordinates", async () => {
  const f=fixture(), path=["meta-entity-authoring","change-sets","draft","publish"];
  assert.equal((await f.call(path)).status,403); assert.equal(f.requests.length,0);
  const result=await f.call(path,{origin:"https://studio.test","x-csrf-token":"csrf","if-match":"4"});
  assert.equal(result.status,403); assert.deepEqual(await result.json(),{code:"UPSTREAM_FORBIDDEN"});
  assert.equal(f.requests.length,1); assert.equal(f.requests[0]!.headers.get("if-match"),"4");
  assert.equal(f.requests[0]!.headers.get("x-principal-id"),"actor");
});
it("does not expose arbitrary publication actions or break-glass", async () => {
  const f=fixture();
  for(const path of [["meta-entity-authoring","change-sets","draft","force-publish"],["control-admin","authorization","break-glass"]]) assert.equal((await f.call(path,{origin:"https://studio.test","x-csrf-token":"csrf"})).status,404);
  assert.equal(f.requests.length,0);
});
