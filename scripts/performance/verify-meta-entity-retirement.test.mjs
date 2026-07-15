import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRetirement } from "./verify-meta-entity-retirement.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const inventory = json("config/governance/meta-entity-routes.json");
const policy = json("config/governance/release-gate.json");
const baseline = json("perf/baselines/meta-entity-qualification.v1.json");
const budgets = json("config/governance/meta-entity-performance-budgets.json");
const exceptions = json("config/governance/meta-entity-performance-exceptions.json");
const current = { ...json("perf/qualification/current-report.example.json"), schemaVersion: 1 };

test("no current route is retireable without an observed release record", () => {
  for (const route of inventory.routes) {
    const failures = evaluateRetirement({
      route,
      inventory,
      policy,
      current,
      baseline,
      budgets,
      exceptions,
      evidence: { schemaVersion: 1, routes: {} },
      root,
    });
    assert.ok(failures.some((failure) => failure.includes("complete retirement evidence is missing")), route.id);
  }
});

test("retirement evidence requires explicit shadow, rollback, and runbook proof", () => {
  const route = inventory.routes[0];
  const failures = evaluateRetirement({
    route,
    inventory,
    policy,
    current,
    baseline,
    budgets,
    exceptions,
    evidence: {
      schemaVersion: 1,
      routes: {
        [route.id]: {
          owner: route.owner,
          releaseId: "rel-2026-07-15",
          observationReleaseId: "rel-2026-07-15",
          approvedBy: "platform-owner",
          qualificationArtifact: "perf/qualification/current-report.example.json",
          releaseCompleted: true,
          releasesObserved: 1,
          compatibilityTraffic: 0,
          shadowValidationPassed: false,
          shadowDifferences: 1,
          zeroTrafficSince: "2026-07-01T00:00:00.000Z",
          observedThrough: "2026-07-16T00:00:00.000Z",
          rollback: { flag: "MUTATION_KERNEL_STAGE", retained: false, availableThrough: "2026-07-15T00:00:00.000Z" },
          runbookCoverage: "partial",
          runbooks: [],
        },
      },
    },
    root,
  });
  assert.ok(failures.some((failure) => failure.includes("shadow validation")));
  assert.ok(failures.some((failure) => failure.includes("rollback flag")));
  assert.ok(failures.some((failure) => failure.includes("runbook coverage")));
});
