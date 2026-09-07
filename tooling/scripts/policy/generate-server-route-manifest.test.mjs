import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildRouteManifest, extractRoutesFromSource, normalizeRoutePath, refreshLegacyBaseline, writeOrCheck } from "./generate-server-route-manifest.mjs";

const baselinePath = "governance/config/governance/server-legacy-route-baseline.json";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "route-manifest-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write("server/routes.ts", 'app.get("/api/audit/status", handler);');
  return { root, write };
}

function snapshot(t) {
  const f = fixture(t);
  f.write("server-backup/routes.ts", 'router.get("/audit/status", handler);\nrouter.post("/retired", handler);');
  refreshLegacyBaseline(f);
  return f;
}

test("routine checks use the committed baseline in a clean checkout and detect source drift", (t) => {
  const { root, write } = snapshot(t);
  rmSync(join(root, "server-backup"), { recursive: true });
  const manifest = writeOrCheck({ root, write: true });
  assert.equal(manifest.legacyParity.status, "available");
  assert.deepEqual(manifest.summary, { identities: 2, matched: 1, legacyOnly: 1, currentOnly: 0, legacyOccurrences: 2, currentOccurrences: 1 });
  assert.equal(manifest.routes[0].current[0].source, "server/routes.ts");
  assert.deepEqual(writeOrCheck({ root }), manifest);
  write("server/routes.ts", 'app.get("/api/new", handler);');
  assert.throws(() => writeOrCheck({ root }), /manifest is stale/);
});

test("a local backup cannot affect routine output or refresh implicitly", (t) => {
  const { root, write } = snapshot(t);
  const before = buildRouteManifest(root);
  write("server-backup/routes.ts", 'router.get("/different", handler);');
  assert.deepEqual(buildRouteManifest(root), before);
  refreshLegacyBaseline({ root });
  assert.notDeepEqual(buildRouteManifest(root), before);
});

test("refresh requires nonempty source evidence and preserves the baseline on failure", (t) => {
  const { root, write } = snapshot(t);
  const before = readFileSync(join(root, baselinePath), "utf8");
  rmSync(join(root, "server-backup"), { recursive: true });
  assert.throws(() => refreshLegacyBaseline({ root }), /authentic server-backup/);
  write("server-backup/empty.ts", "// no routes");
  assert.throws(() => refreshLegacyBaseline({ root }), /nonempty routes/);
  assert.equal(readFileSync(join(root, baselinePath), "utf8"), before);
});

test("source snapshot checksums and paths are deterministic across checkout locations", (t) => {
  const a = snapshot(t), b = snapshot(t);
  assert.deepEqual(JSON.parse(readFileSync(join(a.root, baselinePath))), JSON.parse(readFileSync(join(b.root, baselinePath))));
  b.write("server-backup/routes.ts", 'router.get("/audit/status", handler); // changed source');
  const updated = refreshLegacyBaseline(b);
  assert.notEqual(updated.provenance.sha256, JSON.parse(readFileSync(join(a.root, baselinePath))).provenance.sha256);
});

test("missing evidence requires explicit current-only mode and never implies parity", (t) => {
  const { root } = fixture(t);
  assert.throws(() => writeOrCheck({ root, write: true }), /Legacy route baseline is missing/);
  const manifest = writeOrCheck({ root, write: true, currentOnly: true });
  assert.equal(manifest.legacyParity.status, "unavailable");
  assert.equal(manifest.summary.matched, null);
  assert.equal(manifest.summary.currentOnly, null);
  assert.equal(manifest.summary.legacyOccurrences, null);
  assert.equal(manifest.routes[0].status, "current-uncompared");
  assert.match(readFileSync(join(root, "docs/architecture/server-route-manifest.md"), "utf8"), /Legacy parity: \*\*unavailable\*\*/);
  writeOrCheck({ root, currentOnly: true });
});

test("malformed baseline evidence fails instead of silently dropping legacy routes", (t) => {
  const { root, write } = snapshot(t);
  const baseline = JSON.parse(readFileSync(join(root, baselinePath)));
  for (const invalid of [
    { ...baseline, schemaVersion: 9 }, { ...baseline, provenance: {} }, { ...baseline, routes: [] },
    { ...baseline, routes: [{ ...baseline.routes[0], source: "server-backup/../server/routes.ts" }] },
    { ...baseline, routes: [baseline.routes[0], baseline.routes[0]] },
    { ...baseline, provenance: { ...baseline.provenance, kind: "historical-manifest", commit: "unknown" } },
  ]) {
    write(baselinePath, JSON.stringify(invalid));
    assert.throws(() => buildRouteManifest(root), /legacy route baseline/);
  }
  write(baselinePath, "{");
  assert.throws(() => buildRouteManifest(root), SyntaxError);
});

test("missing current source fails rather than publishing every legacy route as retired", (t) => {
  const { root } = snapshot(t);
  rmSync(join(root, "server"), { recursive: true });
  assert.throws(() => buildRouteManifest(root), /Current server source directory is required/);
});

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


test("current manifests include finance descriptor routes alongside host contracts", (t) => {
  const f = fixture(t);
  for (const path of ["server/packages/planes/neon/src/register-finance.ts", "server/apps/platform-host/src/composition/finance-routes.ts"]) {
    f.write(path, readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"));
  }
  const routes = buildRouteManifest(f.root, {currentOnly: true}).routes.filter(route => route.path.startsWith("/api/neon/finance/"));
  assert.equal(routes.length, 29);
  assert.ok(routes.every(route => route.current.length === 1));
  assert.ok(routes.some(route => route.path === "/api/neon/finance/budget/command"));
});
