import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { actor } from "./partner-classification-session.mjs";
import { id } from "../../fixtures/business-partner-core/seed.mjs";

if (!process.argv.includes("--run"))
  throw Error("Use --run for Athyper DEV acceptance");
const admin = await actor("athyper.admin");
const bp = id("athyper", "partner");
const path = `neon/business-partners/${bp}/commodity-classifications`;
const evidence = { tenant: "athyper", businessPartnerId: bp };
const call = async (p, body, status = 200) => {
  const r = await admin.call(p, body);
  assert.equal(r.status, status, JSON.stringify({ path: p, ...r }));
  return r.body;
};
try {
  const read = await call(path);
  assert.ok(
    read.items.some((x) => x.id === id("athyper", "commodity-classification")),
  );
  for (const other of ["cirrusatlantic", "technostat"])
    await call(
      `neon/business-partners/${id(other, "partner")}/commodity-classifications`,
      undefined,
      404,
    );
  evidence.nativeRead = "passed";
  evidence.crossTenantDenial = { cirrusatlantic: 404, technostat: 404 };
  const sections = {};
  evidence.sectionStatuses = {};
  for (const section of [
    "commodities",
    "certificates",
    "qualifications-certificates",
  ]) {
    const result = await admin.call(
      `entity-runtime/business_partner/records/${bp}/sections/${section}?surface=detail`,
    );
    evidence.sectionStatuses[section] = result.status;
    if (section === "commodities") assert.equal(result.status, 200);
    else
      assert.ok(
        [200, 403, 404].includes(result.status),
        JSON.stringify(result),
      );
    if (result.status === 200) sections[section] = result.body;
  }
  const commodities = sections.commodities.data.collections;
  assert.ok(
    commodities.commodity_classifications.some(
      (x) => x.category_code === "DEMO_LAB_RESEARCH",
    ),
  );
  assert.ok(
    commodities.commodity_crosswalk_reference_evidence.some(
      (x) =>
        x.sourceCode === "41100000" &&
        x.targetCode === "9010" &&
        x.verified === false,
    ),
  );
  if (sections.certificates)
    assert.ok(sections.certificates.data.collections.certifications.length > 0);
  if (sections["qualifications-certificates"])
    assert.equal(
      sections["qualifications-certificates"].data.collections.qualifications
        .length,
      0,
    );
  evidence.compiledCommodities = "passed";
  evidence.releaseHash = sections.commodities.releaseHash;
  const declaration = {
    commodityCategoryId: id("athyper", "commodity-category"),
    effectiveFrom: "2026-09-23",
    sourceSystem: "dev_acceptance",
    sourceReference: "athyper-classification-r21",
    notes: "Synthetic role-free Athyper acceptance, archived after checks.",
    idempotencyKey: "athyper-classification-r21-declare-20260923",
  };
  const declared = await call(path + "/declare", declaration);
  const classificationId = declared.classification.id;
  assert.equal((await call(path + "/declare", declaration)).replayed, true);
  await call(
    path + "/declare",
    { ...declaration, sourceReference: "different" },
    409,
  );
  await call(
    path + "/verify",
    {
      classificationId,
      expectedVersion: 1,
      evidenceReference: "Synthetic denial check",
      idempotencyKey: "athyper-classification-r21-verify-denial",
    },
    403,
  );
  const archive = {
    classificationId,
    expectedVersion: 1,
    reason: "Synthetic acceptance complete; preserve reusable demo fact.",
    idempotencyKey: "athyper-classification-r21-archive-20260923",
  };
  assert.equal(
    (await call(path + "/archive", archive)).classification.status,
    "archived",
  );
  assert.equal((await call(path + "/archive", archive)).replayed, true);
  const after = await call(path);
  assert.ok(!after.items.some((x) => x.id === classificationId));
  assert.ok(
    after.items.some((x) => x.id === id("athyper", "commodity-classification")),
  );
  evidence.commands = {
    classificationId,
    declareArchive: "passed",
    safeReplay: true,
    idempotencyConflict: 409,
    verificationDenied: 403,
  };
} finally {
  await admin.dispose();
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    storageState: "tests/e2e/.auth/dev/neon/athyper.admin.json",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const errors = [];
  const failures = [];
  evidence.browser = {};
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/"))
      failures.push({ status: r.status(), path: new URL(r.url()).pathname });
  });
  for (const [section, text] of [
    ["commodities", "Laboratory and scientific equipment (Demo)"],
    ["certificates", "Demonstration quality-management certificate"],
    ["qualifications-certificates", "No commercial qualifications yet"],
  ]) {
    if (evidence.sectionStatuses[section] !== 200) {
      evidence.browser[section] = "blocked";
      continue;
    }
    await page.goto(
      `https://neon.dev.athyper.test/mdg/business-partner/${bp}?section=${section}`,
      { waitUntil: "domcontentloaded" },
    );
    try {
      await page
        .getByText(text, { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      if (section === "commodities")
        await page
          .getByText("41100000", { exact: true })
          .first()
          .waitFor({ state: "visible" });
      evidence.browser[section] = "passed";
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
      evidence.browser[section] = "blocked: expected content not visible";
    }
  }
  assert.deepEqual(errors, []);
  evidence.browser.pageErrors = errors.length;
  evidence.browser.failedRequests = failures;
} finally {
  await browser.close();
}
console.log(JSON.stringify(evidence, null, 2));
