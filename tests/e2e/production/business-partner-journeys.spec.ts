import { expect, test } from "@playwright/test";
import { assertSurfaceContract, productionContext } from "./fixtures";

test.beforeEach(async ({}, testInfo) => {
  test.skip(productionContext(testInfo).plane !== "neon", "Business Partner journeys belong to NEON");
  test.skip(!productionContext(testInfo).enabled, "Production credentials or a stored NEON session are required");
});

test("supplier onboarding is accessible and definition-driven", async ({ page }) => {
  await page.goto("/app/business_partner/new");
  await expect(page.getByRole("heading", { name: "New supplier onboarding request" })).toBeVisible();
  await expect(page.getByLabel("Registered name")).toBeVisible();
  await expect(page.getByLabel("Supplier type")).toBeVisible();
  await assertSurfaceContract(page, "supplier-onboarding");
});

test("customer onboarding is accessible for organization and person", async ({ page }) => {
  await page.goto("/app/business_partner/customer/new");
  await expect(page.getByRole("heading", { name: "New customer onboarding request" })).toBeVisible();
  await assertSurfaceContract(page, "customer-onboarding-organization");
  await page.getByLabel("Customer category").selectOption("person");
  await expect(page.getByLabel("Consent evidence ID")).toBeVisible();
  await assertSurfaceContract(page, "customer-onboarding-person");
});

test("workforce onboarding is accessible and does not expose commercial fields", async ({ page }) => {
  await page.goto("/app/business_partner/person/new");
  await expect(page.getByRole("heading", { name: "New workforce person onboarding" })).toBeVisible();
  await expect(page.getByLabel("Employee number")).toBeVisible();
  await expect(page.getByLabel("Supplier type")).toHaveCount(0);
  await expect(page.getByLabel(/bank account|iban|routing/i)).toHaveCount(0);
  await assertSurfaceContract(page, "workforce-onboarding");
});

test("restricted applicant session returns only the approved external projection", async ({ page }) => {
  const journey = process.env.PLAYWRIGHT_INVITATION_JOURNEY;
  const requestId = process.env.PLAYWRIGHT_INVITATION_REQUEST_ID;
  test.skip(!journey || !requestId, "requires a governed accepted invitation request fixture");
  expect(["supplier", "customer", "candidate"]).toContain(journey);
  await page.goto("/dashboard");
  const result = await page.evaluate(async ({ journeyKind, id }) => {
    const response = await fetch(`/api/neon/external/business-partner-invitations/${encodeURIComponent(journeyKind)}/requests/${encodeURIComponent(id)}/status`);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }, { journeyKind: journey!, id: requestId! });
  expect(result.status).toBe(200);
  const serialized = JSON.stringify(result.body).toLowerCase();
  for (const forbidden of ["token_hash", "email_hash", "bank_account", "iban", "routing_number", "tax_identifier", "principal_secret"]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(Object.keys(result.body).sort()).toEqual(expect.arrayContaining(["requestId", "requestNo", "rowVersion", "status", "validationSummary"]));
});
