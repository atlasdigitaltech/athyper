import assert from "node:assert/strict";
import test from "node:test";
import { extractRoutesFromSource, normalizeRoutePath } from "./generate-server-route-manifest.mjs";

test("retains native and compatibility paths declared in Express arrays", () => {
  const routes = extractRoutesFromSource('app.post(["/api/neon/business-partner-cases/:requestId/materialize", "/api/neon/business-partner-requests/:requestId/apply"], handler);');
  assert.deepEqual(routes.map(({ method, declaredPath }) => [method, declaredPath]), [
    ["POST", "/api/neon/business-partner-cases/:requestId/materialize"],
    ["POST", "/api/neon/business-partner-requests/:requestId/apply"],
  ]);
});

test("normalizes parameter names and the legacy API mount", () => {
  assert.equal(normalizeRoutePath("/records/:entityCode/:recordId/", { defaultMount: "/api" }), "/api/records/:param/:param");
  assert.equal(normalizeRoutePath("/health/live", { defaultMount: "/api" }), "/health/live");
});

test("resolves router and nested-router mounts", () => {
  const source = `
    app.use("/api", router);
    router.use("/iam", scoped);
    scoped.get("/sessions/:sessionId", handler);
  `;
  assert.deepEqual(extractRoutesFromSource(source).map(({ method, path }) => [method, path]), [["GET", "/api/iam/sessions/:param"]]);
});

test("extracts defineRouteContract routes", () => {
  const source = `const route = defineRouteContract({ method: "patch", path: "/api/preferences/:viewId", operationId: "preferences.patch", summary: "Patch", responses: { 200: { description: "OK" } } });`;
  assert.deepEqual(extractRoutesFromSource(source).map(({ method, path, kind }) => [method, path, kind]), [["PATCH", "/api/preferences/:param", "contract"]]);
});

test("extracts local contract-factory routes and expands their loops", () => {
  const source = `
    for (const action of ["activate", "suspend"] as const) registerContractRoute(app, contract("post", \`/api/connectors/:id/\${action}\`, \`connectors.\${action}\`), handler);
    registerContractRoute(app, contract("get", "/api/connectors", "connectors.list"), handler);
    function contract(method, path, operationId) { return defineRouteContract({ method, path, operationId, summary: operationId, responses: { 200: { description: "OK" } } }); }
  `;
  assert.deepEqual(extractRoutesFromSource(source).map(({ method, path }) => [method, path]).sort(), [
    ["GET", "/api/connectors"],
    ["POST", "/api/connectors/:param/activate"],
    ["POST", "/api/connectors/:param/suspend"],
  ]);
});

test("extracts a contract factory that computes response metadata before defining the contract", () => {
  const source = `
    registerContractRoute(app, contract("post", "/api/atlas/runs", "atlas.run"), handler);
    function contract(method, path, operationId) {
      const success = { description: "Stream", contentType: "text/event-stream" };
      return defineRouteContract({ method, path, operationId, responses: { 200: success } });
    }
  `;
  assert.deepEqual(extractRoutesFromSource(source).map(({ method, path }) => [method, path]), [["POST", "/api/atlas/runs"]]);
});

test("expands inline and named finite route loops", () => {
  const source = `
    const lifecycle = [["publish", "/publish"], ["archive", "/archive"]] as const;
    for (const action of ["cancel", "retry"] as const) router.post(\`/jobs/:id/\${action}\`, handler);
    for (const [name, path] of lifecycle) router.post(\`/content/:id\${path}\`, handler);
  `;
  assert.deepEqual(extractRoutesFromSource(source, { defaultMount: "/api" }).map(({ path }) => path).sort(), [
    "/api/content/:param/archive",
    "/api/content/:param/publish",
    "/api/jobs/:param/cancel",
    "/api/jobs/:param/retry",
  ]);
});
