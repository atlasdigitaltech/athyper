import { acquireQualificationLock } from "./qualification-lock.mjs";
acquireQualificationLock();
// Current NEON browser shell with all relay reads routed through the authenticated
// isolated client. This proves the child selector journey, not a deployed UI image.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import cp from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const exec = promisify(cp.execFile);
const account = process.argv[2];
assert.ok(["catl.admin", "catl.owner"].includes(account));
const candidate = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-release-20-context-candidate.dev.json",
  ),
);
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-v2-runtime-verification.dev.json",
  ),
);
const output = `governance/policy/reports/business-partner-release-20-context-browser.${account}.dev.json`;
assert.ok(!fs.existsSync(output), "Preserve previous browser evidence");
const state = () => {
  const c = JSON.parse(
    cp.execFileSync("docker", ["inspect", "athyper-bp-r20-context-api"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(c.Id, candidate.containerId);
  assert.equal(c.Image, candidate.imageId);
  return { id: c.Id, image: c.Image, start: c.State.StartedAt };
};
const before = state(),
  authority = assertAuthorityUnchanged();
const browser = await chromium.launch();
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState:
    os.homedir() +
    `/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911/auth/dev/neon/${account}.json`,
});
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  account,
  imageId: candidate.imageId,
  artifactHash: proof.artifactHash,
  releaseId: proof.releaseId,
  relayReceipts: [],
  checks: [],
  qualified: false,
  fullUiQualified: false,
  grantsChanged: false,
  limitations: [
    "Current shared NEON UI shell; relay reads execute the isolated candidate. Not a full deployed UI/API bundle qualification.",
  ],
};
let page;
try {
  const session = await (
    await context.request.get("https://neon.dev.athyper.test/api/auth/session")
  ).json();
  assert.equal(session.state, "authenticated");
  const expected =
    account === "catl.admin"
      ? "cca94907-7519-5871-8e3c-6b11aa545c93"
      : "645b6a55-3355-526a-9643-3900425bde47";
  assert.equal(session.principalId, expected);
  await context.route("**/api/relay/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET")
      return route.fulfill({
        status: 405,
        json: { code: "READ_QUALIFICATION_ONLY" },
      });
    const u = new URL(request.url()),
      path = u.pathname.replace("/api/relay/", "/api/") + u.search;
    try {
      const { stdout } = await exec(
        "docker",
        [
          "exec",
          "athyper-bp-r20-auth-client",
          "node",
          "/app/server/qualification-client/context-session-client.mjs",
          account,
          path,
          "GET",
        ],
        { maxBuffer: 12000000, timeout: 45000 },
      );
      const r = JSON.parse(stdout);
      assert.equal(r.artifact, proof.artifactHash);
      assert.equal(r.releaseId, proof.releaseId);
      report.relayReceipts.push({
        path,
        status: r.status,
        requestId: r.requestId,
      });
      await route.fulfill({ status: r.status, json: r.body });
    } catch {
      await route.fulfill({
        status: 503,
        json: { code: "ISOLATED_BROWSER_RELAY_FAILED" },
      });
    }
  });
  page = await context.newPage();
  let lists = 0;
  const child = "/api/relay/entity-runtime/business_partner_request/list";
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === child) lists++;
  });
  await page.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/requests",
  );
  const selector = page.getByRole("combobox", {
    name: "Work context organization",
    exact: true,
  });
  await selector.waitFor({ timeout: 60000 });
  assert.equal(await selector.count(), 1);
  assert.equal(lists, 0);
  report.checks.push(
    "single_required_organization_selector",
    "no_rows_before_selection",
  );
  const org = "a478f9c0-8226-5d22-9599-b8fb27a45180";
  const responsePromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === child,
    { timeout: 60000 },
  );
  await selector.selectOption(org);
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  assert.equal(
    new URL(response.url()).searchParams.get("operatingOrganizationId"),
    org,
  );
  assert.ok(Array.isArray((await response.json()).rows));
  report.checks.push(
    "selected_organization_applied",
    "authenticated_rows_returned",
  );
  assert.deepEqual(state(), before);
  assert.equal(assertAuthorityUnchanged().sha256, authority.sha256);
  report.authoritySha256 = authority.sha256;
  report.qualified = true;
} catch (e) {
  if (page) {
    const path =
      os.homedir() +
      `/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911/context-browser-${account}.png`;
    await page.screenshot({ path, fullPage: true }).catch(() => {});
    report.screenshotPath = path;
    report.browserUrl = page.url();
  }
  report.failure = String(e.message).slice(0, 400);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      account,
      qualified: report.qualified,
      checks: report.checks,
      failure: report.failure,
    }),
  );
}
