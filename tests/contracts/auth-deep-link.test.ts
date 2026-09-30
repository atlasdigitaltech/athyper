import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeReturnTo, destinationRequestHeaders, readRequestDestination, REQUEST_DESTINATION_HEADER } from "../../packages/platform/shell/app-foundation/src/request-destination";
import { readProtectedBootstrap, resolveExistingSessionLanding } from "../../packages/platform/shell/app-foundation/src/server";

const destination = "/mdg/business-partner/f7688c3d-8c92-5651-a469-da3f4f786375/supplier?view=open&filter=a%20b&tag=1&tag=2";

test("only local application destinations survive authentication", () => {
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/\t/evil.test", "/%2f%2fevil.test", "/%5cevil.test", "/%0aevil", "/api/auth/login", "/a/../sign-in", "/%73ign-in", "/select-context?returnTo=/select-context", "/logout#x", "/auth/required-action", "/_next/static/test", "/%zz"]) {
    assert.equal(sanitizeReturnTo(value), "/", value);
  }
  assert.equal(sanitizeReturnTo(destination), destination);
  assert.equal(sanitizeReturnTo("/records/a%20b?x=1#details"), "/records/a%20b?x=1#details");
});

for (const plane of ["neon", "mesh", "studio"] as const) {
  test(`${plane} preserves the deep link through anonymous bootstrap and context selection`, async () => {
    const request = new Request(`https://${plane}.example${destination}`, { headers: { [REQUEST_DESTINATION_HEADER]: "/attacker", cookie: "session=example" } });
    const incoming = destinationRequestHeaders(request);
    assert.equal(readRequestDestination(incoming), destination);
    assert.equal(incoming.get("cookie"), "session=example");
    const readExperience = async () => { throw new Error("must not read experience before context selection"); };
    const anonymous = await readProtectedBootstrap({ request, readSession: async () => new Response(null, { status: 401 }), readExperience });
    assert.equal(anonymous.state, "redirect");
    if (anonymous.state === "redirect") assert.equal(new URL(anonymous.location, request.url).searchParams.get("returnTo"), destination);
    const context = { schemaVersion: 1, state: "context_required", plane, requiredActions: [], allowedNextActions: ["select_context", "logout"] };
    const gate = await readProtectedBootstrap({ request, readSession: async () => Response.json(context), readExperience });
    assert.deepEqual(gate, { state: "redirect", reason: "context_required", location: `/select-context?returnTo=${encodeURIComponent(destination)}` });
    assert.equal(await resolveExistingSessionLanding({ request, returnTo: destination, readSession: async () => Response.json(context) }), `/select-context?returnTo=${encodeURIComponent(destination)}`);
    assert.equal(await resolveExistingSessionLanding({ request, returnTo: destination, readSession: async () => Response.json({ ...context, state: "authenticated", tenantId: "tenant-a", principalId: "principal-a", authEpoch: 1, realmKey: "athyper", sessionVersion: 1, configurationRevision: "1", assurance: "baseline", expiresAt: "2099-01-01T00:00:00.000Z", idleExpiresAt: "2099-01-01T00:00:00.000Z", absoluteExpiresAt: "2099-01-01T00:00:00.000Z" }) }), destination);
  });
}

test("RSC cache keys are removed and missing destination headers fall back safely", () => {
  const headers = destinationRequestHeaders(new Request("https://neon.example/records?view=open&filter=a%20b&_rsc=transport"));
  assert.equal(readRequestDestination(headers), "/records?view=open&filter=a%20b");
  assert.equal(readRequestDestination(new Headers()), "/");
});

// Exercise the actual Next.js adapters, not just the shared header helper.
for (const plane of ["neon", "mesh", "studio"] as const) {
  test(`${plane} proxy forwards the destination as a request header`, async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(new URL(`../../apps/${plane}/package.json`, import.meta.url));
    const { NextRequest } = require("next/server");
    const { proxy } = await import(`../../apps/${plane}/proxy.ts`);
    const response = proxy(new NextRequest(`https://${plane}.example${destination}`, { headers: { [REQUEST_DESTINATION_HEADER]: "/forged", rsc: "1" } }));
    assert.equal(response.headers.get(`x-middleware-request-${REQUEST_DESTINATION_HEADER}`), destination);
    assert.equal(response.headers.get(REQUEST_DESTINATION_HEADER), null);
  });
}

test("Studio sign-in normalizes repeated query parameters", async () => {
  const { readSignInQuery } = await import("../../apps/studio/lib/auth-query");
  assert.deepEqual(readSignInQuery({ reason: ["expired", "service"], returnTo: ["/plans", "/home"], requestId: ["first", "second"] }), { reason: "expired", returnTo: "/plans", requestId: "first" });
  assert.deepEqual(readSignInQuery({}), { reason: undefined, returnTo: undefined, requestId: undefined });
});
