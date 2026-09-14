import { run } from "./affordance-count-run.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  proposal as p,
  bp,
  base,
  coordinates,
  docker,
  fingerprint,
} from "./affordance-count-client.mjs";
const output = `governance/policy/reports/business-partner-closure-owner-tax-ui-${run}.dev.json`;
assert(!fs.existsSync(output));
const before = fingerprint(),
  report = {
    createdAt: new Date().toISOString(),
    runtimeImage: p.runtimeImage,
    uiImage: p.uiImage,
    releaseSetHash: p.releaseSetHash,
    proposalRevision: p.proposalRevision,
    actor: "catl.owner",
    checks: [],
    complete: false,
  };
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
save();
const ui = JSON.parse(docker(["inspect", "athyper-bp-enter-neon-ui"]))[0],
  api = JSON.parse(docker(["inspect", "athyper-bp-enter-api"]))[0];
assert.equal(ui.Image, p.uiImage);
assert.equal(api.Image, p.runtimeImage);
assert.equal(
  ui.Config.Env.find((e) => e.startsWith("RUNTIME_API_URL=")),
  "RUNTIME_API_URL=http://athyper-bp-enter-api:4000",
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      proxy: { server: "http://127.0.0.1:13320" },
      storageState:
        os.homedir() +
        "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/neon/catl.owner.json",
    }),
    page = await context.newPage();
  const responses = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (
      u.pathname.replace("/api/relay/", "/api/") === base + "identifiers" &&
      u.searchParams.get("operatingOrganizationId") ===
        p.fixtures.operatingOrganizationId &&
      u.searchParams.get("companyCodeId") === p.fixtures.companyCodeId
    )
      responses.push(r);
  });
  const response = await page.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/" +
      bp +
      coordinates +
      "&tab=360&section=identifiers-tax",
  );
  assert.equal(response.headers()["x-qualification-ui-image"], p.uiImage);
  const section = page.locator('[data-record-section="identifiers-tax"]');
  await expect(section).toBeAttached({ timeout: 60000 });
  await section.scrollIntoViewIfNeeded();
  await expect
    .poll(() => responses.length, { timeout: 60000 })
    .toBeGreaterThan(0);
  const provider = responses.find((r) => r.status() === 200) ?? responses[0];
  assert.equal(provider.status(), 200);
  const body = await provider.json();
  const fixture = body.data.items.find(
    (t) => t.id === p.fixtures.taxRegistrationId,
  );
  assert(fixture);
  assert.equal(fixture.revealable, false);
  assert(!JSON.stringify(body).includes("SYNTHETICGB123456789"));
  report.provider = {
    status: provider.status(),
    path: new URL(provider.url()).pathname,
    responseSha256: createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex"),
    populatedFixtureFound: true,
    revealable: false,
  };
  save();
  await expect(section.locator(".bp360-section-card").first()).toBeVisible({
    timeout: 60000,
  });
  await expect(
    section.getByRole("button", {
      name: "Reveal for approved purpose",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(section.locator(".bp360-restricted-value")).toHaveCount(0);
  assert(!(await section.innerText()).includes("SYNTHETICGB123456789"));
  assert.deepEqual(fingerprint(), before);
  report.checks = [
    "populated_tax_fixture_masked",
    "owner_has_no_reveal_affordance",
    "no_protected_value_rendered",
    "authority_unchanged",
  ];
  report.complete = true;
  save();
  console.log({ complete: true, checks: report.checks });
} catch (e) {
  report.failure = e.message.slice(0, 1000);
  save();
  console.log({ complete: false, failure: report.failure });
  process.exitCode = 1;
} finally {
  await browser.close();
}
