import { expect, test } from "@playwright/test";
import { assertSurfaceContract, productionContext } from "./fixtures";

test.beforeEach(async ({}, testInfo) => {
  test.skip(productionContext(testInfo).plane !== "neon", "Business Partner journeys belong to NEON");
  test.skip(!productionContext(testInfo).enabled, "Production credentials or a stored NEON session are required");
});

test("supplier onboarding is accessible and definition-driven", async ({ page }) => {
  await page.goto("/mdg/business-partner/new");
  await expect(page.getByRole("heading", { name: "New business partner request" })).toBeVisible();
  await page.getByRole("radio", { name: /Supplier/ }).check();
  await page.getByRole("button", { name: "Onboard new supplier" }).click();
  await expect(page.getByRole("textbox", { name: "Registered name *", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Supplier type *", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Qualification type *", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Supplier addresses" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Supplier contacts" })).toBeVisible();
  await assertSurfaceContract(page, "supplier-onboarding");
});

test("customer onboarding is accessible for organization and person", async ({ page }) => {
  await page.goto("/mdg/business-partner/customer/new");
  await expect(page.getByRole("heading", { name: "New business partner request" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Customer/ })).toBeChecked();
  await page.getByRole("button", { name: "Onboard new customer" }).click();
  await expect(page.getByRole("textbox", { name: "Registration country", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Registered name", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to review" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.locator(".a-validation-summary")).toContainText("Registration country is required.");
  await page.getByRole("link", { name: "Registration country is required." }).click();
  await expect(page.getByRole("textbox", { name: "Registration country", exact: true })).toBeFocused();
  await assertSurfaceContract(page, "customer-onboarding-organization");
});

test("supplier request detail keeps progress shared and the journey in Review", async ({ page }) => {
  const requestId = process.env.PLAYWRIGHT_BP_REQUEST_ID ?? "3a452faf-d2ca-44d0-a583-8ddcfb9a3110";
  await page.goto(`/mdg/business-partner/requests/${requestId}#overview`);
  await expect(page.locator(".bp-request-lifecycle summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supplier onboarding journey" })).toBeHidden();
  await page.getByRole("tab", { name: "Review" }).click();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.getByRole("heading", { name: "Supplier onboarding journey" })).toBeVisible();
  await page.getByRole("tab", { name: "Request details" }).click();
  await expect(page).toHaveURL(/#details$/);
  await expect(page.getByText("Proposed request information · Read only")).toBeVisible();
});

test("workforce onboarding is accessible and does not expose commercial fields", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_WORKFORCE_ENABLED !== "1", "requires Workforce feature access for the authenticated test principal");
  await page.goto("/mdg/business-partner/person/new");
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
