import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createRelayHandler,
  STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS,
} from "../../packages/platform/gateway/bff-relay/src/index";
it("notification authoring allows only supported routes, preserves revisions, and requires CSRF", async () => {
  const requests: Request[] = [];
  const current = {
    accessToken: "server-token",
    plane: "studio",
    realmKey: "studio",
    tenantId: "tenant",
    principalId: "actor",
    authEpoch: 1,
    csrfToken: "csrf",
  };
  const handler = createRelayHandler({
    plane: "studio",
    runtimeApiUrl: "http://runtime",
    appOrigin: "https://studio.test",
    operations: STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS,
    session: {
      resolve: async () => current,
      refresh: async () => current,
      invalidate: async () => undefined,
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ ok: true });
    },
  });
  const path = [
    "meta-entity-authoring",
    "change-sets",
    "draft",
    "notifications",
    "comments",
    "policy",
  ];
  const call = (csrf: boolean) =>
    handler(
      new Request("https://studio.test/api/relay/" + path.join("/"), {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "https://studio.test",
          ...(csrf ? { "x-csrf-token": "csrf" } : {}),
        },
        body: JSON.stringify({
          expectedRevision: 4,
          policy: { mode: "disabled" },
        }),
      }),
      { params: Promise.resolve({ path }) },
    );
  assert.equal((await call(false)).status, 403);
  assert.equal(requests.length, 0);
  assert.equal((await call(true)).status, 200);
  assert.equal((await requests[0]!.json()).expectedRevision, 4);
  assert.ok(
    STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS.some(
      (o) => o.path.endsWith("/:id/notifications") && o.method === "GET",
    ),
  );
  assert.equal(
    STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS.some(
      (o) => o.path.includes("notifications") && o.path.endsWith("/send"),
    ),
    false,
  );
  assert.ok(
    STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS.some(
      (o) =>
        o.path === "/api/meta-entity-authoring/inspection/notifications/:entityCode" &&
        o.method === "GET",
    ),
  );
});
