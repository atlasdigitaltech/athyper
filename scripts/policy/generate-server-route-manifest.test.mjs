import assert from "node:assert/strict";
import test from "node:test";
import { extractRoutesFromSource, normalizeRoutePath } from "./generate-server-route-manifest.mjs";

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
