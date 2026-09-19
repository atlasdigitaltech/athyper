#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { command, inventory, writeJson } from "./runtime.mjs";
import { createPlan, MANAGER, MANAGER_VERSION } from "./model.mjs";

if (!process.argv.includes("--reset-disposable"))
  throw new Error(
    "This suite resets the owned local environment. Supply --reset-disposable.",
  );
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const plan = createPlan(checkout);
const steps = [];
const run = async (...args) => {
  const started = Date.now();
  await command(
    process.execPath,
    [join(checkout, "tooling/scripts/local-dev/cli.mjs"), ...args],
    { inherit: true },
  );
  steps.push({ command: args, elapsedMs: Date.now() - started });
};
async function unmanaged() {
  const ids = await command("docker", ["ps", "-q"]);
  if (!ids) return [];
  return JSON.parse(await command("docker", ["inspect", ...ids.split(/\s+/)]))
    .filter((item) => item.Config.Labels?.[MANAGER] !== MANAGER_VERSION)
    .map((item) => ({ id: item.Id, startedAt: item.State.StartedAt }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
async function sql(statement) {
  const resources = await inventory(plan);
  const db = resources.container.find(
    (item) => item.Config.Labels["com.docker.compose.service"] === "db",
  );
  assert.ok(db?.State.Running);
  return command("docker", [
    "exec",
    db.Id,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-Atc",
    statement,
  ]);
}
const before = await unmanaged();
let failure;
try {
  await run("up", "--preset", "devsimple", "--infrastructure-only");
  await sql(
    "CREATE TABLE IF NOT EXISTS public.local_runner_lifecycle_probe (id integer PRIMARY KEY); INSERT INTO public.local_runner_lifecycle_probe VALUES (1) ON CONFLICT DO NOTHING;",
  );
  await run("down");
  await run("up", "--preset", "devsimple", "--infrastructure-only");
  assert.equal(
    await sql("SELECT count(*) FROM public.local_runner_lifecycle_probe"),
    "1",
  );
  await run("up", "--preset", "devfull", "--infrastructure-only");
  assert.equal(
    await sql("SELECT count(*) FROM public.local_runner_lifecycle_probe"),
    "1",
  );
  await run("up", "--preset", "devsimple", "--infrastructure-only");
  assert.equal(
    await sql("SELECT count(*) FROM public.local_runner_lifecycle_probe"),
    "1",
  );
  const guardedSecret = join(plan.root, "secrets/runtime-db-password");
  const originalMode = statSync(guardedSecret).mode & 0o777;
  try {
    // Execute-only group bit makes the private-input guard fail without exposing contents.
    chmodSync(guardedSecret, originalMode | 0o010);
    await assert.rejects(
      command(process.execPath, [
        join(checkout, "tooling/scripts/local-dev/cli.mjs"),
        "reset",
      ]),
      /Invalid private secret file/,
    );
    assert.equal(
      await sql("SELECT count(*) FROM public.local_runner_lifecycle_probe"),
      "1",
    );
    steps.push({
      check: "reset-preflight-failure-preserves-data",
      passed: true,
    });
  } finally {
    chmodSync(guardedSecret, originalMode);
  }
  await run("reset");
  assert.equal(
    await sql(
      "SELECT to_regclass('public.local_runner_lifecycle_probe') IS NULL",
    ),
    "t",
  );
  assert.deepEqual(
    await unmanaged(),
    before,
    "Unmanaged running containers changed during lifecycle test",
  );
} catch (error) {
  failure = error;
}
const receipt = {
  schemaVersion: 1,
  evidenceType: "development-lifecycle-integration",
  environment: plan.id,
  at: new Date().toISOString(),
  passed: !failure,
  steps,
  unmanagedContainerCount: before.length,
  error: failure?.message,
  releaseQualified: false,
};
writeJson(join(plan.root, `lifecycle-${Date.now()}.json`), receipt);
if (failure) throw failure;
console.log(JSON.stringify(receipt, null, 2));
