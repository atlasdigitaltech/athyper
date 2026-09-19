#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, statSync, utimesSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlan, readJson, hash } from "./model.mjs";
import { supervisorState } from "./supervisor.mjs";
import { writeJson } from "./runtime.mjs";
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const plan = readJson(join(createPlan(checkout).root, "manifest.json"));
assert.equal(plan.checkout, checkout);
assert.equal(supervisorState(plan)?.alive, true);
const source = join(
  checkout,
  "server/apps/platform-host/src/processes/api/index.ts",
);
const log = join(plan.root, "api-source.log");
const original = statSync(source);
const checksum = hash(readFileSync(source));
const pid = () =>
  [...readFileSync(log, "utf8").matchAll(/\[api\] started[^\n]*pid=(\d+)/g)].at(
    -1,
  )?.[1];
const previous = pid();
const started = Date.now();
let elapsedMs;
try {
  utimesSync(source, original.atime, new Date());
  for (let retry = 0; retry < 120; retry++) {
    if (pid() !== previous) {
      try {
        if (
          (
            await fetch(`${plan.origins.api}/readyz`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        ) {
          elapsedMs = Date.now() - started;
          break;
        }
      } catch {
        /* restarting */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(
    elapsedMs,
    "API watch did not restart and become ready within 30 seconds",
  );
  assert.equal(
    hash(readFileSync(source)),
    checksum,
    "Source contents changed during measurement",
  );
} finally {
  utimesSync(source, original.atime, original.mtime);
}
const receipt = {
  schemaVersion: 1,
  evidenceType: "development-api-watch-latency",
  environment: plan.id,
  at: new Date().toISOString(),
  trigger: "source-mtime-change-without-content-change",
  elapsedMs,
  previousPid: previous,
  releaseQualified: false,
};
writeJson(join(plan.root, `feedback-${Date.now()}.json`), receipt);
console.log(JSON.stringify(receipt, null, 2));
