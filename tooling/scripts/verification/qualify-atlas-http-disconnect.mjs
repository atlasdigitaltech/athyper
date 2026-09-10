import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, chmodSync } from "node:fs";
import { chromium } from "@playwright/test";
import { authenticated, images, save, parent } from "./atlas-f6-common.mjs";
import { inferenceDiagnosticEvidence } from "./atlas-inference-diagnostic-evidence.mjs";
const config = ["local-inference", "semantic-retrieval"].map((n) =>
    JSON.parse(readFileSync("deploy/config/atlas/" + n + ".json", "utf8")),
  ),
  script = readFileSync(
    "tooling/scripts/verification/atlas-live-inference-client.mjs",
  );
function helper(mode) {
  let notify;
  const admitted = new Promise((r) => (notify = r));
  const result = new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-worker-1",
        "node",
        "--input-type=module",
        "-",
        JSON.stringify(config),
        mode,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdin.end(script);
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes('"admitted":true')) notify();
    });
    child.on("close", (code) => {
      try {
        const r = JSON.parse(out.trim().split("\n").at(-1));
        if (code === 0) resolve(r);
        else reject(Error("Helper failed"));
      } catch {
        reject(Error("Invalid helper receipt"));
      }
    });
  });
  return { admitted, result };
}
const report = {
  observedAt: new Date().toISOString(),
  imagesBefore: images(),
  checks: [],
};
let auth, browser, context;
try {
  auth = await authenticated("neon", "catl.admin");
  assert.equal(
    auth.session.assurance,
    "elevated",
    "Elevated Neon session required",
  );
  await auth.close();
  auth = undefined;
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    baseURL: "https://neon.dev.athyper.test",
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  });
  const page = await context.newPage();
  await page.goto("https://neon.dev.athyper.test/home", {
    waitUntil: "domcontentloaded",
  });
  const headers = async () => ({
    "x-csrf-token": decodeURIComponent(
      (await context.cookies()).find(
        (c) =>
          c.name === "__Host-athyper-csrf" &&
          c.domain === "neon.dev.athyper.test",
      ).value,
    ),
  });
  async function start() {
    await page.evaluate(
      ({ headers, recordId }) => {
        const w = globalThis;
        w.__atlasAbort = new AbortController();
        w.__atlasResult = fetch("/api/relay/atlas/knowledge/search", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            entityCode: "business_partner",
            recordId,
            query: "Indigo Lantern",
          }),
          signal: w.__atlasAbort.signal,
        }).then(
          (r) => ({ status: r.status }),
          (e) => ({ errorName: e.name }),
        );
      },
      { headers: await headers(), recordId: parent },
    );
  }
  async function abort() {
    return page.evaluate(async () => {
      globalThis.__atlasAbort.abort();
      return await globalThis.__atlasResult;
    });
  }
  async function cancellationEvidence(since) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const evidence = inferenceDiagnosticEvidence(since);
      if (
        evidence.events.some(
          (e) =>
            e.workload === "embedding" &&
            e.phase === "failed" &&
            e.code === "embedding_cancelled",
        )
      )
        return evidence;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Embedding cancellation diagnostic missing");
  }
  const held = helper("hold");
  await held.admitted;
  let since = new Date().toISOString();
  await start();
  const waiter = await helper("waiter").result;
  assert.equal(waiter.waiterObserved, true);
  assert.equal((await abort()).errorName, "AbortError");
  const queued = await cancellationEvidence(since);
  await held.result;
  assert.ok(
    !queued.events.some(
      (e) => e.workload === "embedding" && e.phase === "admitted",
    ),
  );
  report.queued = queued;
  report.checks.push(
    "browser disconnect cancels globally queued embedding before inference dispatch",
  );
  await helper("unload").result;
  since = new Date().toISOString();
  await start();
  let admitted = false;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    admitted = inferenceDiagnosticEvidence(since).events.some(
      (e) => e.workload === "embedding" && e.phase === "admitted",
    );
    if (admitted) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(admitted, true);
  assert.equal((await abort()).errorName, "AbortError");
  report.active = await cancellationEvidence(since);
  report.checks.push(
    "browser disconnect aborts an admitted cold embedding request",
  );
  const state = await helper("state").result;
  assert.deepEqual(state.state, {
    initialized: true,
    occupied: false,
    waiters: 0,
  });
  report.checks.push("both cancellations leave no shared owner or waiter");
  const recovery = await page.evaluate(
    async ({ headers, recordId }) => {
      const r = await fetch("/api/relay/atlas/knowledge/search", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          entityCode: "business_partner",
          recordId,
          query: "Indigo Lantern",
        }),
      });
      const b = await r.json();
      return { status: r.status, citations: b.citations?.length ?? 0 };
    },
    { headers: await headers(), recordId: parent },
  );
  assert.equal(recovery.status, 200);
  assert.ok(recovery.citations > 0);
  report.recovery = recovery;
  report.checks.push("authorized retrieval succeeds after cancellation");
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.blocker = e.message.split("\n")[0];
} finally {
  if (auth) await auth.close();
  if (context) {
    await context.storageState({
      path: "tests/e2e/.auth/dev/neon/catl.admin.json",
    });
    chmodSync("tests/e2e/.auth/dev/neon/catl.admin.json", 0o600);
  }
  if (browser) await browser.close();
  report.imagesAfter = images();
  report.stableDeployment =
    JSON.stringify(report.imagesBefore) === JSON.stringify(report.imagesAfter);
  report.passed = report.passed && report.stableDeployment;
  save("retrieval-http-disconnect-qualification.json", report);
  console.log(
    JSON.stringify({
      passed: report.passed,
      checks: report.checks,
      blocker: report.blocker,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
