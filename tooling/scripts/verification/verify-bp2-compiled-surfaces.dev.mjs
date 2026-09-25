/** Read-only local DEV acceptance. Uses normal saved logins; never forges scope or grants. */
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const origin = "https://neon.dev.athyper.test";
const bp = "01a0cc2b-a958-7703-bade-306f61834dea";
const scope = new URLSearchParams({
  operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
  companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
});
const browser = await chromium.launch();
try {
  for (const actor of ["catl.admin", "catl.owner"]) {
    const context = await browser.newContext({
      baseURL: origin, ignoreHTTPSErrors: true,
      storageState: `tests/e2e/.auth/dev/neon/${actor}.json`,
    });
    try {
      const session = await (await context.request.get("/api/auth/session")).json();
      assert.equal(session.state, "authenticated", `Refresh normal ${actor} login`);
      const get = async section => {
        const response = await context.request.get(`/api/relay/entity-runtime/business_partner/records/${bp}/sections/${section}?surface=detail&${scope}`);
        return { status: response.status(), body: await response.json() };
      };
      const network = await get("network");
      assert.equal(network.status, actor === "catl.admin" ? 200 : 404);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`/mdg/business-partner/${bp}?${scope}`, { waitUntil: "domcontentloaded" });
      await page.getByText("360 View", { exact: true }).waitFor({ timeout: 20000 });
      await page.getByText("360 View", { exact: true }).click();
      if (actor === "catl.admin") {
        await page.getByText("Governance & ownership", { exact: true }).click();
        await expect(page.getByText("affiliate", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Commercial Relationships", exact: true })).toBeVisible();
        const identity = await get("identity");
        assert.equal(identity.status, 200);
        assert.equal(identity.body.releaseHash, network.body.releaseHash);
        const rows = identity.body.data.data.collections.industry_crosswalk_reference_evidence;
        assert.ok(rows.length > 0);
        assert.ok(rows.every(row => row.targetDomainCode === "isic" && row.targetCode === "01"));
        assert.ok(rows.some(row => row.provenance === "AI_GENERATED" && row.verified === false));
        await page.getByText("360 View", { exact: true }).click();
        await page.getByText("Identity", { exact: true }).first().click();
        await expect(page.getByRole("heading", { name: "Industry Crosswalk Reference Evidence", exact: true })).toBeVisible();
        await expect(page.getByText("AI_GENERATED", { exact: true }).first()).toBeVisible();
        const commodity = await get("qualifications-certificates");
        assert.equal(commodity.status, 200);
        assert.ok(commodity.body.presentation.childCollections.some(group => group.key === "commodity_crosswalk_reference_evidence"));
        assert.ok(Array.isArray(commodity.body.data.data.collections.commodity_crosswalk_reference_evidence));
        console.log(JSON.stringify({ actor, releaseHash: identity.body.releaseHash, network: "populated browser pass", industryCrosswalkRows: rows.length, commodityCompiledBinding: "pass (fixture empty)" }));
      } else {
        await expect(page.getByText("Governance & ownership", { exact: true })).toHaveCount(0);
        console.log(JSON.stringify({ actor, networkSectionStatus: network.status, navigationOmitted: true }));
      }
      assert.deepEqual(errors, [], "Unexpected browser errors");
      await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
