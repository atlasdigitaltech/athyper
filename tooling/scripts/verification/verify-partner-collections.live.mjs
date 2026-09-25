/** Read-only CATL collection acceptance; uses normal saved authentication. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { actor } from "./partner-classification-session.mjs";
import { id } from "../../fixtures/business-partner-core/seed-identity.mjs";
const bp = id("cirrusatlantic", "partner"),
  admin = await actor("catl.admin");
const sections = {};
try {
  for (const section of ["industries", "commodities", "identity"]) {
    const result = await admin.call(
      `entity-runtime/business_partner/records/${bp}/sections/${section}?surface=detail`,
    );
    assert.equal(result.status, 200, JSON.stringify(result));
    sections[section] = result.body;
  }
  assert.ok(
    !sections.identity.presentation.childCollections.some((c) =>
      c.key.includes("crosswalk"),
    ),
  );
  const industries = sections.industries.data.collections.industries;
  assert.equal(industries.length, 2);
  assert.ok(
    industries.every(
      (i) =>
        i.industry_domain_code === "isic" && i.industry_name && i.source_system,
    ),
  );
  assert.ok(industries.some((i) => i.is_primary));
  const commodities =
    sections.commodities.data.collections.commodity_classifications;
  const mapped = commodities.find((i) => i.commodity_code === "41101502");
  const unmapped = commodities.find((i) => i.commodity_code === "41101503");
  assert.ok(mapped?.category_matches.includes("DEMO_SAMPLE_PREPARATION"));
  assert.equal(unmapped?.category_matches, "Not mapped (optional)");
  assert.equal(unmapped?.verification_status, "Not verified");
  for (const section of ["industries", "commodities"]) {
    const mapping = sections[section].presentation.childCollections.find((c) =>
      c.key.includes("crosswalk"),
    );
    assert.equal(mapping.display, "disclosure");
    assert.equal(mapping.label.defaultText, "Related classification mappings");
    assert.equal(
      mapping.fields.find((f) => f.key === "verified").label.defaultText,
      "Mapping verified",
    );
    const denied = await admin.call(
      `entity-runtime/business_partner/records/${id("athyper", "partner")}/sections/${section}?surface=detail`,
    );
    assert.ok([403, 404].includes(denied.status), JSON.stringify(denied));
  }
} finally {
  await admin.dispose();
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [section, fact] of [
    ["industries", "Scientific Research and Development"],
    ["commodities", "41101503"],
  ]) {
    await page.goto(
      `https://neon.dev.athyper.test/mdg/business-partner/${bp}?section=${section}&panel=closed`,
    );
    await page
      .getByText(fact, { exact: true })
      .first()
      .waitFor({ timeout: 45000 });
    const summary = page
      .locator("summary")
      .filter({ hasText: "Related classification mappings" });
    await summary.waitFor({ timeout: 30000 });
    assert.equal(
      await summary.evaluate((node) => node.parentElement.open),
      false,
    );
    assert.equal(
      await page
        .getByText("Mapping confidence", { exact: true })
        .first()
        .isVisible(),
      false,
    );
    await summary.click();
    const details = summary.locator("..");
    assert.equal(await details.evaluate((node) => node.open), true);
    assert.ok(
      (await details.innerText()).includes(
        "Mapped codes are not partner declarations.",
      ),
    );
    assert.equal(
      await page
        .getByText("Industry Crosswalk Reference Evidence", { exact: true })
        .count(),
      0,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      releaseHash: sections.industries.releaseHash,
      industryCount: 2,
      mappedAndUnmapped: true,
      crossTenantDenied: true,
      browserMappingsCollapsed: true,
    }),
  );
} finally {
  await browser.close();
}
