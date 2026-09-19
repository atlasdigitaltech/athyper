import { expect, test } from "@playwright/test";

test("authenticated session, context and bootstrap agree", async ({ request }) => {
  const response = await request.get("/api/auth/session");
  expect(response.ok()).toBe(true);
  const session = await response.json();
  expect(session).toMatchObject({ state: "authenticated", plane: "mesh", tenantId: expect.any(String), principalId: expect.any(String) });
  const contexts = await request.get("/api/auth/contexts");
  expect(contexts.ok()).toBe(true);
  expect((await contexts.json()).contexts).toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: session.tenantId })]));
  const bootstrap = await request.get("/api/relay/platform/experience/bootstrap");
  expect(bootstrap.ok()).toBe(true);
  expect(await bootstrap.json()).toMatchObject({ planeKey: "mesh", tenantId: session.tenantId, principalId: session.principalId });
});

for (const path of ["/home", "/atlas", "/inbox", "/notifications", "/mdg", "/mdg/business-partner", "/mdg/business-partner/profile", "/mdg/business-partner/relationships", "/mdg/business-partner/requests", "/operations/data-transfers"]) {
  test(`authenticated page ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /something went wrong|page not found|access unavailable/i })).toHaveCount(0);
  });
}

test("authorized acting accounts reach the network workspace", async ({ request }) => {
  const response = await request.get("/api/relay/mesh/network-accounts");
  expect(response.ok()).toBe(true);
  const { accounts } = await response.json();
  expect(accounts.length, "The test principal needs an authorized Mesh network account").toBeGreaterThan(0);
  for (const account of accounts) {
    const workspace = await request.get(`/api/relay/mesh/business-partner-network-workspace?networkAccountId=${encodeURIComponent(account.networkAccountId)}`);
    expect(workspace.status(), "Deploy the account-context fix to the test environment before running this check").toBe(200);
    expect((await workspace.json()).actingAccount.id).toBe(account.networkAccountId);
  }
});
