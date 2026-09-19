// Read-only authenticated DEV qualification. No grants, cases, tasks or AI conversations are mutated.
import { chromium, request } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const account = process.argv[2] ?? "catl.admin";
const principals = {
  "catl.admin": "cca94907-7519-5871-8e3c-6b11aa545c93",
  "catl.owner": "645b6a55-3355-526a-9643-3900425bde47",
};
if (process.argv.length > 3 || !Object.hasOwn(principals, account))
  throw Error("Expected catl.admin or catl.owner");
const origin = "https://neon.dev.athyper.test",
  storageState = `tests/e2e/.auth/dev/neon/${account}.json`;
const browser = await chromium.launch(),
  context = await browser.newContext({ ignoreHTTPSErrors: true, storageState });
const receipt = {
  schemaVersion: 1,
  kind: "business_partner_queue_context_qualification",
  capturedAt: new Date().toISOString(),
  grantsChanged: false,
  enforcementActivated: false,
  checks: {},
};
try {
  const session = await (
    await context.request.get(origin + "/api/auth/session")
  ).json();
  assert.equal(session.state, "authenticated");
  assert.equal(session.principalId, principals[account]);
  assert.equal(session.tenantId, "44444444-4444-4444-8444-444444444444");
  receipt.principalId = session.principalId;
  receipt.tenantId = session.tenantId;
  const path = "/api/relay/entity-runtime/business_partner_request",
    page = await context.newPage();
  const initial = await context.request.get(origin + path + "/list-descriptor");
  assert.equal(initial.status(), 200);
  const descriptor = await initial.json();
  assert.equal(descriptor.scope.status, "context_required");
  assert.deepEqual(descriptor.scope.workContext, {
    schemaVersion: 1,
    resolver: "platform.document_relationship.v1",
    requiredCoordinates: ["operatingOrganizationId"],
  });
  receipt.checks.exactRequiredCoordinates = true;
  let queueLists = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === path + "/list") queueLists++;
  });
  await page.goto(origin + "/mdg/business-partner/requests");
  const selector = page.getByRole("combobox", {
    name: "Work context organization",
    exact: true,
  });
  await selector.waitFor({ timeout: 30000 });
  assert.equal(await selector.count(), 1);
  assert.equal(queueLists, 0);
  receipt.checks.singleSelector = true;
  receipt.checks.noListBeforeSelection = true;
  const option = await selector
    .locator("option")
    .evaluateAll((items) => items.find((item) => item.value)?.value);
  assert.ok(option, "No existing permitted organization available");
  const responsePromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === path + "/list",
    { timeout: 30000 },
  );
  await selector.selectOption(option);
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const result = await response.json();
  const query = new URL(response.url()).searchParams;
  assert.equal(query.get("operatingOrganizationId"), option);
  assert.equal(query.has("companyCodeIds"), false);
  receipt.checks.authenticatedScopedList = true;
  receipt.checks.parentCompanyFilterNotInherited = true;
  receipt.rowCount = result.rows?.length ?? 0;
  const deniedId = "00000000-0000-4000-8000-000000000001";
  for (const endpoint of ["list-descriptor", "list"]) {
    const denied = await context.request.get(
      origin + path + "/" + endpoint + "?operatingOrganizationId=" + deniedId,
    );
    assert.equal(denied.status(), 403);
  }
  receipt.checks.unauthorizedOrganizationRejected = true;
  const anonymous = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const response = await anonymous.get(origin + path + "/list-descriptor");
    assert.equal(response.status(), 401);
    receipt.checks.anonymousRejected = true;
  } finally {
    await anonymous.dispose();
  }
  receipt.authenticatedQueueQualified = true;
  writeFileSync(
    `governance/policy/reports/business-partner-queue-context.qualified${account === "catl.admin" ? "" : "." + account}.dev.json`,
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt));
} finally {
  await context.close();
  await browser.close();
}
