import assert from "node:assert/strict";
import test from "node:test";
import { extractStaticUrlRoutes } from "./extract-static-url-routes.mjs";

test("conditional path arrays include both deployment variants and default alias suffixes", () => {
  const result = extractStaticUrlRoutes(`function register(app, options) {
    const paths = (suffix = "", alias = suffix) => options.companyPilot
      ? [\`/company\${suffix}\`]
      : [\`/cases\${suffix}\`, \`/requests\${alias}\`];
    app.get(paths(), handler);
    app.post(paths("/:id/materialize", "/:id/apply"), handler);
  }`);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.routes.map((r) => `${r.method} ${r.declaredPath}`).sort(),
    [
      "GET /cases",
      "GET /company",
      "GET /requests",
      "POST /cases/:id/materialize",
      "POST /company/:id/materialize",
      "POST /requests/:id/apply",
    ],
  );
});

test("unknown conditional arms, arguments and mixed arrays remain unresolved", () => {
  for (const source of [
    'function register(app, options) { app.get(options.flag ? ["/known"] : options.paths, handler); }',
    'function register(app, options) { const paths = (suffix = "") => [`/known${suffix}`]; app.get(paths(options.suffix), handler); }',
    'function register(app, options) { app.get(["/known", options.path], handler); }',
  ]) {
    const result = extractStaticUrlRoutes(source);
    assert.equal(result.routes.length, 0);
    assert.equal(result.unresolved.length, 1);
  }
});
