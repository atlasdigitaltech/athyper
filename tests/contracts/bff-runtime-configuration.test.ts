import assert from "node:assert/strict";
import test from "node:test";
import {
  readRuntimeEnvironment,
  validateRuntimeEnvironment,
} from "../../packages/platform/iam/auth-bff/src/runtime-environment";
import {
  callInternalRoute,
  createProtectedAppBootstrap,
} from "../../packages/platform/shell/app-foundation/src/server";
import {
  applyNeonEntityRoutes,
  neonCatalogRoutes,
} from "../../apps/neon/lib/catalog-routes";
import { PLATFORM_CATALOG_ROUTES } from "../../packages/contracts/platform/navigation/src/generated-catalog";
const environment = {
  APP_ORIGIN: "https://app.test/",
  RUNTIME_API_URL: "http://runtime.test/api",
  REDIS_URL: "redis://:password@redis:6379",
  KEYCLOAK_BASE_URL: "https://identity.test",
  SESSION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};
test("runtime configuration canonicalizes origins and fails closed on invalid deployment values", () => {
  assert.equal(
    readRuntimeEnvironment(environment).appOrigin,
    "https://app.test",
  );
  for (const [key, value] of [
    ["APP_ORIGIN", "https://app.test/path"],
    ["APP_ORIGIN", "https://user:pass@app.test"],
    ["RUNTIME_API_URL", "file:///etc/passwd"],
    ["REDIS_URL", "http://redis"],
    [
      "SESSION_TOKEN_ENCRYPTION_KEY",
      environment.SESSION_TOKEN_ENCRYPTION_KEY + "!",
    ],
  ]) {
    assert.equal(
      validateRuntimeEnvironment({ ...environment, [key]: value }).ready,
      false,
    );
    assert.throws(() =>
      readRuntimeEnvironment({ ...environment, [key]: value }),
    );
  }
  assert.throws(() =>
    readRuntimeEnvironment(
      { ...environment, APP_ORIGIN: undefined, NODE_ENV: "production" },
      "http://localhost:3000",
    ),
  );
  assert.equal(
    readRuntimeEnvironment(
      { ...environment, APP_ORIGIN: undefined, NODE_ENV: "development" },
      "http://localhost:3000",
    ).appOrigin,
    "http://localhost:3000",
  );
});
test("internal routes preserve cookies and cancellation while rejecting external destinations", async () => {
  const controller = new AbortController();
  const request = new Request("https://app.test/home", {
    headers: { cookie: "session=opaque" },
    signal: controller.signal,
  });
  await callInternalRoute("/api/auth/contexts", request, async (forwarded) => {
    assert.equal(forwarded.headers.get("cookie"), "session=opaque");
    controller.abort();
    assert.equal(forwarded.signal.aborted, true);
    return Response.json({});
  });
  for (const path of [
    "//evil.test/api",
    "https://evil.test/api",
    "/\\evil.test/api",
  ])
    assert.throws(() =>
      callInternalRoute(path, request, async () => Response.json({})),
    );
});
test("bootstrap authenticates before calling the experience relay", async () => {
  let experienceCalls = 0;
  const load = createProtectedAppBootstrap({
    readHeaders: async () => new Headers(),
    readOrigin: () => "https://app.test",
    readSession: async () => new Response(null, { status: 401 }),
    readExperience: async () => {
      experienceCalls++;
      return Response.json({});
    },
  });
  assert.equal((await load()).state, "redirect");
  assert.equal(experienceCalls, 0);
});
test("Neon overlays preserve generated slugs and reject orphaned runtime module entries", () => {
  assert.deepEqual(
    neonCatalogRoutes.map((w) => [
      w.routeSlug,
      w.modules.map((m) => [m.code, m.routeSlug]),
    ]),
    PLATFORM_CATALOG_ROUTES.neon.map((w) => [
      w.routeSlug,
      w.modules.map((m) => [m.code, m.routeSlug]),
    ]),
  );
  for (const workspace of neonCatalogRoutes)
    for (const module of workspace.modules)
      if (module.defaultEntityCode)
        assert.ok(
          module.entities.some((e) => e.code === module.defaultEntityCode),
        );
  assert.throws(
    () =>
      applyNeonEntityRoutes(
        PLATFORM_CATALOG_ROUTES.neon.map((w) => ({
          ...w,
          modules: w.modules.filter((m) => m.code !== "bp"),
        })),
      ),
    /absent catalog module/,
  );
});
