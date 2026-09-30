import { run } from "./affordance-count-run.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import {
  proposal as p,
  bp,
  base,
  coordinates,
  send,
  revoke,
  docker,
} from "./affordance-count-client.mjs";
const output = `governance/policy/reports/business-partner-affordance-count-browser-${run}.dev.json`;
assert(!fs.existsSync(output));
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: p.runtimeImage,
  uiImage: p.uiImage,
  releaseSetHash: p.releaseSetHash,
  proposalRevision: p.proposalRevision,
  checks: [],
  responses: [],
  complete: false,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const pass = (label) => {
  report.checks.push({ label, passed: true });
  save();
  console.log({ passed: label });
};
save();
function verifyRuntimeBinding() {
  const api = JSON.parse(docker(["inspect", "athyper-bp-enter-api"]))[0],
    ui = JSON.parse(docker(["inspect", "athyper-bp-enter-neon-ui"]))[0];
  assert.equal(api.Image, p.runtimeImage);
  assert(api.State.Running);
  assert.equal(ui.Image, p.uiImage);
  assert.equal(
    ui.Config.Env.find((e) => e.startsWith("RUNTIME_API_URL=")),
    "RUNTIME_API_URL=http://athyper-bp-enter-api:4000",
  );
  report.browserBindingEvidence =
    "Pinned UI container routes to pinned isolated API; BFF does not forward execution headers";
}
verifyRuntimeBinding();
const browser = await chromium.launch();
async function open(actor, section) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13320" },
    storageState:
      os.homedir() +
      "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/neon/" +
      actor +
      ".json",
  });
  const page = await context.newPage();
  page.on("response", (r) => {
    if (r.url().includes("/360/"))
      report.responses.push({
        actor,
        path: new URL(r.url()).pathname,
        status: r.status(),
        releaseSet: r.headers()["x-execution-release-set"],
      });
  });
  const route = section === "identifiers-tax" ? "identifiers" : section;
  const loaded = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.replace("/api/relay/", "/api/") ===
        base + route &&
      new URL(r.url()).searchParams.get("operatingOrganizationId") ===
        p.fixtures.operatingOrganizationId,
    { timeout: 30000 },
  );
  const response = await page.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/" +
      bp +
      coordinates +
      "&tab=360&section=" +
      section,
  );
  assert.equal(response.headers()["x-qualification-ui-image"], p.uiImage);
  const scope = page.locator(`[data-record-section="${section}"]`);
  await scope.scrollIntoViewIfNeeded();
  const provider = await loaded;
  assert.equal(provider.status(), 200);
  verifyRuntimeBinding();
  await expect(scope.locator(".bp360-section-card").first()).toBeVisible({
    timeout: 30000,
  });
  return { context, page, scope };
}
try {
  const bank = await open("catl.admin", "banking");
  await expect(
    bank.scope.getByRole("button", {
      name: "Reveal for approved purpose",
      exact: true,
    }),
  ).toHaveCount(1, { timeout: 30000 });
  await expect(bank.scope.locator(".bp360-restricted-value")).toHaveCount(0);
  pass("bank_masked_until_confirmation");
  await bank.scope
    .getByRole("button", { name: "Reveal for approved purpose", exact: true })
    .click();
  await expect(bank.scope.locator(".bp360-restricted-value")).toHaveCount(0);
  const bankResponse = bank.page.waitForResponse(
    (r) =>
      r.url().includes("/banking/reveal") && r.request().method() === "POST",
  );
  await bank.scope
    .getByRole("button", { name: "Confirm audited reveal", exact: true })
    .click();
  const br = await bankResponse;
  assert.equal(br.status(), 200);
  verifyRuntimeBinding();
  const bu = new URL(br.url());
  assert.equal(
    bu.searchParams.get("operatingOrganizationId"),
    p.fixtures.operatingOrganizationId,
  );
  assert.equal(bu.searchParams.get("companyCodeId"), p.fixtures.companyCodeId);
  await expect(bank.scope.locator(".bp360-restricted-value")).toHaveText(
    "GB82WEST12345698765432",
  );
  pass("bank_confirmed_reveal_with_selected_company");
  const tax = await open("catl.admin", "identifiers-tax");
  await expect(
    tax.scope.getByRole("button", {
      name: "Reveal for approved purpose",
      exact: true,
    }),
  ).toHaveCount(1, { timeout: 30000 });
  await expect(tax.scope.locator(".bp360-restricted-value")).toHaveCount(0);
  await tax.scope
    .getByRole("button", { name: "Reveal for approved purpose", exact: true })
    .click();
  const taxResponse = tax.page.waitForResponse(
    (r) =>
      r.url().includes("/identifiers-tax/reveal") &&
      r.request().method() === "POST",
  );
  await tax.scope
    .getByRole("button", { name: "Confirm audited reveal", exact: true })
    .click();
  const tr = await taxResponse;
  assert.equal(tr.status(), 200);
  verifyRuntimeBinding();
  assert.equal(
    new URL(tr.url()).searchParams.get("companyCodeId"),
    p.fixtures.companyCodeId,
  );
  await expect(tax.scope.locator(".bp360-restricted-value")).toHaveText(
    "SYNTHETICGB123456789",
  );
  pass("tax_confirmed_reveal_with_selected_company");
  await tax.scope
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(tax.scope.locator(".bp360-restricted-value")).toHaveCount(0);
  pass("closing_tax_reveal_masks_value");
  for (const section of ["banking", "identifiers-tax"]) {
    const owner = await open("catl.owner", section);
    await expect(
      owner.scope.locator(".bp360-section-card").first(),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      owner.scope.getByRole("button", {
        name: "Reveal for approved purpose",
        exact: true,
      }),
    ).toHaveCount(0);
    assert(
      !(await owner.page
        .locator("body")
        .innerText()
        .then(
          (t) =>
            t.includes("GB82WEST12345698765432") ||
            t.includes("SYNTHETICGB123456789"),
        )),
    );
    pass("owner_" + section + "_no_reveal_affordance");
    await owner.context.close();
  }
  // Natural server expiry is exercised without modifying clocks or responses.
  await expect(bank.scope.locator(".bp360-restricted-value")).toHaveCount(0, {
    timeout: 65000,
  });
  pass("bank_value_removed_at_server_expiry");
  const again = bank.page.waitForResponse(
    (r) =>
      r.url().includes("/banking/reveal") && r.request().method() === "POST",
  );
  await bank.scope
    .getByRole("button", { name: "Confirm audited reveal", exact: true })
    .click();
  assert.equal((await again).status(), 200);
  await expect(bank.scope.locator(".bp360-restricted-value")).toHaveText(
    "GB82WEST12345698765432",
  );
  pass("bank_reveal_before_revocation");
  report.revealRevocation = revoke(
    p.batches.filter(
      (b) => b.account === "catl.admin" && b.purpose === "reveals",
    ),
    "live_ui_reveal_revocation",
  );
  save();
  const denied = bank.page.waitForResponse(
    (r) =>
      r.url().includes("/banking/reveal") && r.request().method() === "POST",
  );
  await bank.scope
    .getByRole("button", { name: "Confirm audited reveal", exact: true })
    .click();
  assert.equal((await denied).status(), 403);
  await expect(bank.scope.locator(".bp360-restricted-value")).toHaveCount(0);
  await expect(
    bank.scope.getByText("The restricted value could not be revealed.", {
      exact: true,
    }),
  ).toBeVisible();
  pass("denied_retry_removes_previous_bank_value");
  const masked = send("catl.admin", base + "banking" + coordinates);
  assert.equal(masked.status, 200);
  assert.equal(
    masked.body.data.accounts.find(
      (a) => a.linkId === p.fixtures.protectedBankLinkId,
    ).revealable,
    false,
  );
  pass("reveal_revocation_preserves_masked_read");
  report.complete = true;
  save();
} catch (error) {
  report.failure = error.message.slice(0, 1500);
  save();
  console.log({ complete: false, failure: report.failure });
  process.exitCode = 1;
} finally {
  await browser.close();
}
