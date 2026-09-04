import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("G1 usage observations remain evidence-driven and fail closed", async () => {
  const [source, ledger, registry] = await Promise.all([
    read(
      "scripts/operations/record-governed-internal-business-partner-usage.ts",
    ),
    read(
      "../../config/governance/governed-internal-business-partner-usage-observations.v1.json",
    ),
    read("ddl/planes/neon/governed-lifecycle-compatibility.v1.json"),
  ]);
  const observations = JSON.parse(ledger) as {
    observationPolicy: string;
    observations: unknown[];
  };
  assert.equal(
    observations.observationPolicy,
    "evidence_checkpoint_no_fixed_duration",
  );
  assert.deepEqual(observations.observations, []);
  for (const token of [
    "BEGIN READ ONLY",
    "rows_touched_since_start",
    "governed_internal\\\\..*",
    "legacyMutationCalls",
    "consumerMigrationComplete",
    "supportedUpgradeHttpCertified",
    "removalEligible",
    "RECORD-G1-INTERNAL-BP-USAGE-OBSERVATION",
  ])
    assert.match(source, new RegExp(token));
  assert.match(source, /Object\.entries\(gate\)[\s\S]*every/);
  assert.doesNotMatch(source, /removalEligible\s*:\s*true/);
  assert.match(
    registry,
    /"observationPolicy": "evidence_checkpoint_no_fixed_duration"/,
  );
  assert.doesNotMatch(registry, /interval '30 days'|30 consecutive days/);
});
