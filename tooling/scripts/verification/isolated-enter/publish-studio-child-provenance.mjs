import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  origin = "https://studio.dev.athyper.test";
const review = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-child-provenance-independent-review-20260912.dev.json",
    "utf8",
  ),
);
const approved = review.events.find((e) => e.path.endsWith("/approve"));
assert.equal(approved.result.body.status, "approved");
assert.equal(approved.result.body.revision, 3);
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13330" },
    storageState: root + "/ui-auth/dev/studio/catl.admin.json",
  });
try {
  const page = await context.newPage();
  await page.goto(origin + "/home");
  const session = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  console.log({
    state: session.state,
    principalId: session.principalId,
    assurance: session.assurance,
  });
  assert.equal(session.principalId, "81cd1978-2df5-5c9a-938a-2f8c291aea13");
  assert.equal(session.assurance, "elevated");
  const result = await page.evaluate(async () => {
    const c = document.cookie
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("__Host-athyper-csrf="));
    if (!c) throw Error("CSRF_REQUIRED");
    const r = await fetch(
      "/api/relay/meta-entity-authoring/change-sets/bab653ec-e2a2-4dfe-9b00-d4e00611f9d9/publish",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "if-match": "3",
          "x-csrf-token": decodeURIComponent(c.slice(c.indexOf("=") + 1)),
        },
        body: JSON.stringify({ targetPlanes: ["neon"] }),
      },
    );
    return { status: r.status, body: await r.json() };
  });
  const out =
    "governance/policy/reports/business-partner-child-provenance-publish-20260912." +
    Date.now() +
    ".dev.json";
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        actor: "catl.admin",
        assurance: session.assurance,
        reviewer: "catl.owner",
        result,
        enforcementActivation: false,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log({
    status: result.status,
    releaseId: result.body.release?.id,
    error: result.body.code ?? result.body.error,
    report: out,
  });
} catch (e) {
  console.log({ error: e.message.split("\n")[0] });
  process.exitCode = 1;
} finally {
  await browser.close();
}
