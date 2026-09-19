import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  endpoint = "/api/relay/neon/business-partner-cases";
const client = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
async function call(
  actor: any,
  path: string,
  data?: any,
  method = "POST",
  expected = 200,
) {
  const csrf = (await actor.storageState()).cookies.find((c: any) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  assert.ok(csrf);
  const r = await actor.fetch(path, {
    method,
    headers: {
      origin,
      "x-csrf-token": decodeURIComponent(csrf.value),
      ...(method !== "GET"
        ? { "Idempotency-Key": data?.idempotencyKey ?? randomUUID() }
        : {}),
    },
    ...(data ? { data } : {}),
  });
  const body = await r.json();
  assert.ok(
    r.status() === expected ||
      (expected === 201 &&
        path.endsWith("/submit") &&
        r.status() === 200 &&
        body.replayed === true),
    JSON.stringify({ path, status: r.status(), expected, body }),
  );
  return body;
}
const post = (path: string, data: any) =>
  call(
    client,
    path,
    data,
    "POST",
    path === endpoint || path.endsWith("/submit") ? 201 : 200,
  );
const get = (id: string) => call(client, `${endpoint}/${id}`, undefined, "GET");
async function create(level: string, overrides: any = {}) {
  const key = randomUUID(),
    contactKey = randomUUID();
  const created = await post(endpoint, {
    idempotencyKey: key,
    draftCapture: true,
    kind: "new_partner",
    source: { kind: "manual" },
    requestedRole: "supplier",
    operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
    companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
    proposedPayload: {
      partnerCategory: "organization",
      registrationCountryCode: "MY",
      name: `DEV P9 ${level} ${key}`,
      ownershipClass: "external",
      supplierType: "general",
      qualificationTypeCode: "compliance",
      requestedComplianceLevel: level === "rollback" ? "standard" : level,
      complianceRequirementReason: "Local Increment A qualification",
      tenantFields: { profileMode: "standard" },
      ...overrides,
    },
    extensions: {
      addresses: [
        {
          clientItemKey: randomUUID(),
          definitionFieldCode: "address.primary",
          purpose: "default",
          addressKind: "street",
          regionEntryMode: "directory",
          line1: "10 Qualification Street",
          city: "Kuala Lumpur",
          postalCode: "50000",
          countryCode: "MY",
          normalizedHash: createHash("sha256")
            .update("10 qualification street||kuala lumpur||50000|my")
            .digest("hex"),
          isPrimary: true,
        },
      ],
      contactPersons: [
        {
          clientItemKey: contactKey,
          definitionFieldCode: "contact.primary",
          contactName: "Qualification contact",
          isPrimary: true,
        },
      ],
      contactChannels: [
        {
          clientItemKey: randomUUID(),
          definitionFieldCode: "contact.channel.email",
          contactClientItemKey: contactKey,
          channelType: "email",
          value: `p2-${key}@example.invalid`,
          purpose: "default",
          isPrimary: true,
        },
      ],
    },
  });
  return created.request.id;
}

const report: any = process.argv.includes("--resume")
  ? JSON.parse(
      readFileSync(
        "governance/policy/reports/supplier-onboarding-p9-fixtures.dev.json",
        "utf8",
      ),
    )
  : { at: new Date().toISOString(), cases: [], checks: [], passed: false };
report.resumedAt = new Date().toISOString();
report.passed = false;
delete report.error;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
try {
  for (const level of ["basic", "standard", "enhanced"]) {
    if (report.cases.some((c: any) => c.level === level)) continue;
    const id = await create(level);
    const draft = await get(id);
    const preview = await call(
      client,
      `/api/relay/governance/process-selection/cases/${id}/preview`,
      undefined,
      "GET",
    );
    assert.equal(preview.status, "ready", JSON.stringify(preview));
    assert.equal(
      preview.selection.effectiveProfile.code,
      level === "basic" ? "simple" : level,
    );
    const validated = await post(`${endpoint}/${id}/validate`, {
      expectedVersion: draft.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      validated.validation.valid,
      true,
      JSON.stringify(validated.validation),
    );
    report.cases.push({
      id,
      level,
      validatedVersion: validated.request.rowVersion,
      preview,
    });
  }
  const incomplete = report.checks.some((c: any) => c.draftChange)
    ? await create("standard", { requestedComplianceLevel: undefined })
    : (report.incomplete ??
      (await create("standard", { requestedComplianceLevel: undefined })));
  report.incomplete = incomplete;
  const page = await context.newPage();
  await page.goto(`${origin}/mdg/business-partner/requests/${incomplete}/edit`);
  const requirement = page.getByLabel("Compliance requirement", {
    exact: false,
  });
  await requirement.waitFor();
  assert.equal(await requirement.inputValue(), "");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/business-partner-cases/${incomplete}`) &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const saveResult = await saved;
  assert.equal(
    saveResult.status(),
    200,
    JSON.stringify(await saveResult.json()),
  );
  await page.reload();
  await requirement.waitFor();
  assert.equal(await requirement.inputValue(), "");
  report.checks.push({
    incompleteDraft: incomplete,
    savedAndReopenedInBrowser: true,
  });
  await requirement.selectOption("enhanced");
  await page
    .getByLabel("Requirement reason", { exact: false })
    .fill("P9 draft preview may change before submission");
  let response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/business-partner-cases/${incomplete}`) &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  assert.equal((await response).status(), 200);
  let preview = await call(
    client,
    `/api/relay/governance/process-selection/cases/${incomplete}/preview`,
    undefined,
    "GET",
  );
  assert.equal(preview.selection.effectiveProfile.code, "enhanced");
  await requirement.selectOption("basic");
  await page
    .getByLabel("Requirement reason", { exact: false })
    .fill("P9 reduced draft assertion before first submission");
  response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/business-partner-cases/${incomplete}`) &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  assert.equal((await response).status(), 200);
  preview = await call(
    client,
    `/api/relay/governance/process-selection/cases/${incomplete}/preview`,
    undefined,
    "GET",
  );
  assert.equal(preview.selection.effectiveProfile.code, "simple");
  report.checks.push({ draftChange: incomplete, enhancedToBasic: true });
  const intercompany = await create("enhanced", {
    ownershipClass: "internal",
    supplierType: "intercompany",
  });
  const p = await call(
    client,
    `/api/relay/governance/process-selection/cases/${intercompany}/preview`,
    undefined,
    "GET",
  );
  assert.equal(p.selection.effectiveProfile.code, "enhanced");
  const d = await get(intercompany);
  const validated = await post(`${endpoint}/${intercompany}/validate`, {
    expectedVersion: d.request.rowVersion,
    idempotencyKey: randomUUID(),
  });
  assert.equal(
    validated.validation.valid,
    true,
    JSON.stringify(validated.validation),
  );
  report.checks.push({ intercompany, enhancedIndependentOfSupplierType: true });
  for (const [ownershipClass, supplierType] of [
    ["internal", "general"],
    ["external", "intercompany"],
  ]) {
    const id = await create("enhanced", { ownershipClass, supplierType });
    const d = await get(id);
    const v = await post(`${endpoint}/${id}/validate`, {
      expectedVersion: d.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
    assert.equal(v.validation.valid, false);
    assert.ok(
      v.validation.findings.some(
        (f: any) =>
          f.ruleCode === "role.ownership_subtype.compatible" &&
          f.outcome === "failed",
      ),
    );
    report.checks.push({
      id,
      ownershipClass,
      supplierType,
      invalidCombinationRejected: true,
    });
  }
  await assert.rejects(
    () => create("standard", { requestedComplianceLevel: "none" }),
    /SUPPLIER_COMPLIANCE_REQUIREMENT_INVALID/,
  );
  await assert.rejects(
    () => create("standard", { effectiveProfile: "simple" }),
    /422|400/,
  );
  report.checks.push({
    invalidRequirementRejected: true,
    trustedProfileInjectionRejected: true,
  });
  mkdirSync("governance/policy/reports/p9-browser", { recursive: true });
  await page.screenshot({
    path: "governance/policy/reports/p9-browser/draft-before-first-submission.png",
    fullPage: true,
  });
  report.passed = true;
  report.finishedAt = new Date().toISOString();
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  await context.close();
  await browser.close();
  await client.dispose();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-p9-fixtures.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      cases: report.cases.length,
      checks: report.checks.length,
      error: report.error,
    }),
  );
}
