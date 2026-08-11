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

test("provides the Journal Entry dashboard client-navigation test target", () => {
  const route = readFileSync(new URL("../../apps/neon/app/(shell)/app/[entity]/page.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../../apps/neon/app/(shell)/dashboard/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(route, /pilot_entities|canary_entities/i);
  assert.match(dashboard, /ATHYPER_DASHBOARD_PREFETCH_ENTITIES/);
  assert.match(dashboard, /journal_entry/);
  assert.match(dashboard, /RuntimeListIntentPrefetchLinks/);
});

test("keeps authenticated record and descriptor upstream requests no-store", () => {
  const records = readFileSync(new URL("../../apps/neon/lib/server/meta-entity-records.ts", import.meta.url), "utf8");
  const descriptor = readFileSync(new URL("../../apps/neon/lib/server/meta-entity-runtime.ts", import.meta.url), "utf8");
  assert.match(records, /cache:\s*["']no-store["']/);
  assert.match(descriptor, /cache:\s*["']no-store["']/);
});

test("keeps dashboard and shell app links on the Next client router", () => {
  const dashboardLinks = readFileSync(new URL(
    "../../packages/shared/runtime-domain/runtime-list/src/islands/runtime-list-intent-prefetch.tsx",
    import.meta.url,
  ), "utf8");
  const appShell = readFileSync(new URL(
    "../../apps/neon/app/(shell)/AppShellClient.tsx",
    import.meta.url,
  ), "utf8");
  const favorites = readFileSync(new URL(
    "../../packages/planes/neon/app/src/collaboration/FavoritesPanelContainer.tsx",
    import.meta.url,
  ), "utf8");

  assert.match(dashboardLinks, /import Link from ["']next\/link["']/);
  assert.match(appShell, /router\.push\(/);
  assert.doesNotMatch(appShell, /location\.assign|location\.replace/);
  assert.doesNotMatch(favorites, /window\.location|location\.assign/);
});
