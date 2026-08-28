import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { verifyRolloutReport } = await import("./verify-runtime-list-cache-rollout.mjs");

function report(overrides = {}) {
  const diagnostic = (cache, rowsVisibleMs, extra = {}) => ({
    rowsVisibleMs,
    navigationKind: "client",
    documentRequests: [],
    page2RequestedBeforeIntent: false,
    skeletonSeen: false,
    browserCache: [{ cache }],
    apiProbe: { recordCache: "hit" },
    rscDiagnostics: {
      operations: [
        { operation: "descriptor", cacheState: "hit", count: 1, durationMs: 40 },
        { operation: "records", cacheState: "hit", count: 1, durationMs: 80 },
        { operation: "session_config", cacheState: "hit", count: 1 },
        { operation: "saved_views", cacheState: "hit", count: 1 },
      ],
    },
    ...extra,
  });
  return {
    schemaVersion: 2,
    kind: "athyper.runtime-list-cache-rollout",
    runs: [{
      scenarios: [
        { name: "first_visit", ...diagnostic("miss", 1200) },
        { name: "immediate_revisit", ...diagnostic("hit", 300) },
        { name: "different_query", ...diagnostic("miss", 700) },
        { name: "context_switch", ...diagnostic("miss", 800) },
        { name: "mutation_revisit", ...diagnostic("miss", 750) },
      ],
    }],
    ...overrides,
  };
}

test("accepts a rollout report that satisfies the performance and isolation gates", () => {
  assert.deepEqual(verifyRolloutReport(report(), {
    coldMaxMs: 3000,
    warmMaxMs: 500,
    descriptorMaxMs: 100,
  }), []);
});

test("rejects slow warm visits, skeleton replacement, and incompatible cache reuse", () => {
  const value = report();
  value.runs[0].scenarios.find((item) => item.name === "immediate_revisit").rowsVisibleMs = 650;
  value.runs[0].scenarios.find((item) => item.name === "immediate_revisit").skeletonSeen = true;
  value.runs[0].scenarios.find((item) => item.name === "immediate_revisit")
    .rscDiagnostics.operations.find((item) => item.operation === "descriptor").durationMs = 125;
  value.runs[0].scenarios.find((item) => item.name === "context_switch").browserCache = [{ cache: "hit" }];
  const failures = verifyRolloutReport(value, {
    coldMaxMs: 3000,
    warmMaxMs: 500,
    descriptorMaxMs: 100,
  });
  assert.equal(failures.length, 4);
});

test("provides one bounded shared-runtime route adapter for every plane", () => {
  const routes = [
    ["../../apps/neon/app/(shell)/app/[entityCode]/page.tsx", /NeonEntityList/],
    ["../../apps/mesh/app/(shell)/workspace/[entityCode]/page.tsx", /MeshEntityList/],
    ["../../apps/studio/app/(shell)/admin/catalogs/[catalogCode]/page.tsx", /StudioCatalogList/],
  ];
  for (const [path, adapter] of routes) {
    const route = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(route, adapter);
    assert.match(route, /notFound\(\)/);
    assert.doesNotMatch(route, /pilot_entities|canary_entities|legacy/i);
  }
});

test("keeps authenticated record and descriptor upstream requests no-store", () => {
  const relay = readFileSync(new URL("../../packages/platform/gateway/bff-relay/src/index.ts", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../../server/packages/services/records/src/entity-list-routes.ts", import.meta.url), "utf8");
  assert.match(relay, /cache:\s*["']no-store["']/);
  assert.match(relay, /private, no-store/);
  assert.match(routes, /Cache-Control["'],\s*["']private, no-store/);
});

test("keeps list query changes on history state without document navigation", () => {
  const runtime = readFileSync(new URL(
    "../../packages/platform/entity/runtime/list-view/src/index.tsx",
    import.meta.url,
  ), "utf8");
  assert.match(runtime, /window\.history\.pushState/);
  assert.match(runtime, /window\.history\.replaceState/);
  assert.match(runtime, /popstate/);
});
