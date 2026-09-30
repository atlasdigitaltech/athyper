#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlan, readJson } from "./model.mjs";
import { inventory, writeJson } from "./runtime.mjs";
import { supervisorState } from "./supervisor.mjs";
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const identity = createPlan(checkout);
const plan = readJson(join(identity.root, "manifest.json"));
assert.equal(plan.id, identity.id);
assert.equal(plan.checkout, checkout);
await inventory(plan);
assert.equal(
  supervisorState(plan)?.alive,
  true,
  "Source supervisor must be running",
);
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const app of plan.apps) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const started = Date.now();
      const response = await page.goto(plan.origins[app], {
        waitUntil: "domcontentloaded",
      });
      assert.equal(response.status(), 200);
      await page.goto(`${plan.origins[app]}/api/auth/login`, {
        waitUntil: "domcontentloaded",
      });
      const issuer = new URL(page.url());
      assert.equal(issuer.origin, plan.origins.iam);
      assert.equal(issuer.searchParams.get("client_id"), `${app}-web`);
      assert.equal(
        issuer.searchParams.get("redirect_uri"),
        `${plan.origins[app]}/api/auth/callback`,
      );
      assert.equal(issuer.searchParams.get("code_challenge_method"), "S256");
      await page.locator('input[name="username"]').waitFor();
      checks.push({
        app,
        pageAndLoginRedirectPassed: true,
        elapsedMs: Date.now() - started,
        origin: plan.origins[app],
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const receipt = {
  schemaVersion: 1,
  evidenceType: "development-browser-smoke",
  environment: plan.id,
  at: new Date().toISOString(),
  checks,
  authenticatedJourneyPassed: false,
  releaseQualified: false,
};
writeJson(join(plan.root, `browser-${Date.now()}.json`), receipt);
console.log(JSON.stringify(receipt, null, 2));
