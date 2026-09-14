import assert from "node:assert/strict";
import test from "node:test";
import { createAppRelay as neon } from "../../apps/neon/lib/relay";
import { createAppRelay as mesh } from "../../apps/mesh/lib/relay";
import { createAppRelay as studio } from "../../apps/studio/lib/relay";
import type { RelaySessionContext } from "../../packages/platform/gateway/bff-relay/src/index";
for (const [plane, factory] of Object.entries({ neon, mesh, studio })) {
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
