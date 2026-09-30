import assert from "node:assert/strict";
import test from "node:test";
import { createAppRelay as neon } from "../../apps/neon/lib/relay";
import { createAppRelay as mesh } from "../../apps/mesh/lib/relay";
import { createAppRelay as studio } from "../../apps/studio/lib/relay";
import type { RelaySessionContext } from "../../packages/platform/gateway/bff-relay/src/index";
for (const [plane, factory] of Object.entries({ neon, mesh, studio })) {
  test(`${plane}: generic collaboration reads reach runtime with verified context only`, async () => {
    let session: RelaySessionContext | undefined = {
      accessToken: "test", plane, realmKey: "athyper", tenantId: "tenant",
      principalId: "principal", authEpoch: 1, csrfToken: "csrf",
    };
    const forwarded: { url: string; headers: Headers }[] = [];
    const handler = factory({
      appOrigin: "https://app.test", runtimeApiUrl: "http://runtime.test",
      session: { resolve: async () => session, refresh: async () => undefined, invalidate: async () => [] },
      fetch: async (url, init) => {
        forwarded.push({ url: String(url), headers: new Headers(init?.headers) });
        return Response.json({ items: [] });
      },
    });
    const call = (path: string, method = "GET", query = "") => handler(
      new Request(`https://app.test/api/relay/${path}${query}`, {
        method, headers: { "x-tenant-id": "attacker", "x-plane": "attacker" },
      }), { params: Promise.resolve({ path: path.split("/") }) },
    );
    for (const entity of ["country", "currency"]) for (const kind of ["comments", "attachments"]) {
      const path = `entity-runtime/${entity}/records/01a0d433-806b-7874-862d-49a9b955f6a1/collaboration/${kind}`;
      const query = "?limit=25&cursor=01a0d433-806b-7874-862d-49a9b955f6a1";
      assert.equal((await call(path, "GET", query)).status, 200);
      const last = forwarded.at(-1)!;
      assert.equal(last.url, `http://runtime.test/api/${path}${query}`);
      assert.equal(last.headers.get("x-tenant-id"), "tenant");
      assert.equal(last.headers.get("x-plane"), plane);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        assert.equal((await call(path, method)).status, 404);
      }
      assert.equal((await call(`${path}/extra`)).status, 404);
    }
    const base = "entity-runtime/currency/records/record/collaboration";
    assert.equal((await call(`${base}/unknown`)).status, 404);
    assert.equal(forwarded.length, 4);
    session = { ...session!, tenantId: "" };
    assert.equal((await call(`${base}/comments`)).status, 409);
    session = { ...session, tenantId: "tenant", plane: "wrong-plane" };
    assert.equal((await call(`${base}/attachments`)).status, 403);
    session = undefined;
    assert.equal((await call(`${base}/comments`)).status, 401);
    assert.equal(forwarded.length, 4, "denied calls must not reach runtime");
  });
  test(`${plane}: actual app composition permits IAM but denies unknown routes, wrong planes and disabled pilots`, async () => {
    let calls = 0;
    let session: RelaySessionContext = {
      accessToken: "test",
      plane,
      realmKey: "athyper",
      tenantId: "tenant",
      principalId: "principal",
      authEpoch: 1,
      csrfToken: "csrf",
    };
    const handler = factory({
      appOrigin: "https://app.test",
      runtimeApiUrl: "http://runtime.test",
      session: {
        resolve: async () => session,
        refresh: async () => undefined,
        invalidate: async () => [],
      },
      fetch: async () => {
        calls++;
        return Response.json({ ok: true });
      },
    });
    const call = (path: string, method = "GET") =>
      handler(
        new Request(`https://app.test/api/relay/${path}`, {
          method,
          headers: {
            origin: "https://app.test",
            "x-csrf-token": "csrf",
            "content-type": "application/json",
          },
          ...(method === "POST" ? { body: "{}" } : {}),
        }),
        { params: Promise.resolve({ path: path.split("/") }) },
      );
    assert.equal((await call("iam/me")).status, 200);
    assert.equal(calls, 1);
    const planeRoutes = {
      neon: "neon/work-contexts",
      mesh: "mesh/network-accounts",
      studio: "meta-entity-authoring/change-sets",
    };
    for (const [owner, path] of Object.entries(planeRoutes)) {
      assert.equal((await call(path)).status, owner === plane ? 200 : 404);
    }
    assert.equal(calls, 2);

    assert.equal((await call("unregistered/operation")).status, 404);
    assert.equal(
      (await call("master/contacts/contact/verification-challenges", "POST"))
        .status,
      404,
    );
    session = { ...session, plane: plane === "neon" ? "mesh" : "neon" };
    assert.equal((await call("iam/me")).status, 403);
    assert.equal(calls, 2);
  });
}

for (const [plane, factory] of Object.entries({neon,mesh,studio})) {
  test(`${plane}: Activity routes retain tenant, CSRF and capture idempotency gates`, async () => {
    const forwarded: Headers[] = [];
    const handler = factory({appOrigin:"https://app.test",runtimeApiUrl:"http://runtime.test",session:{
      resolve:async()=>({accessToken:"test",plane,realmKey:"athyper",tenantId:"tenant",principalId:"principal",authEpoch:1,csrfToken:"csrf"}),
      refresh:async()=>undefined,invalidate:async()=>[],
    },fetch:async(_url,init)=>{forwarded.push(new Headers(init?.headers));return Response.json({});}});
    const base="entity-runtime/country/records/record/activity";
    const call=(suffix:string,method="GET",headers:Record<string,string>={})=>handler(new Request(`https://app.test/api/relay/${base}${suffix}`,{
      method,headers:{origin:"https://app.test","content-type":"application/json","x-csrf-token":"csrf","x-tenant-id":"forged",...headers},...(method==="POST"?{body:"{}"}:{}),
    }),{params:Promise.resolve({path:(base+suffix).split("/")})});
    for(const suffix of ["","/audit","/versions","/snapshots","/snapshots/snapshot"]) assert.equal((await call(suffix)).status,200);
    assert.equal((await call("/snapshots","POST")).status,428);
    assert.equal((await call("/snapshots","POST",{"idempotency-key":"capture-test","x-csrf-token":"wrong"})).status,403);
    assert.equal((await call("/snapshots","POST",{"idempotency-key":"capture-test"})).status,200);
    assert.equal((await call("/compare","POST")).status,200);
    assert.equal((await call("/unregistered")).status,404);
    assert.equal((await call("/snapshots","DELETE")).status,404);
    assert.equal(forwarded.length,7);
    for(const headers of forwarded){assert.equal(headers.get("x-tenant-id"),"tenant");assert.equal(headers.get("x-plane"),plane);}
  });
}
