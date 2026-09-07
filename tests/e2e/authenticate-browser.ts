import { expect, type Page } from "@playwright/test";

/** Exercise the real BFF/issuer flow and verify the resulting tenant session. */
export async function authenticateBrowser(page: Page, input: {
  origin: string; username: string; password: string; tenantName?: string;
}) {
  const origin = new URL(input.origin).origin;
  await page.goto(`${origin}/api/auth/login?returnTo=%2Fhome`);
  await page.getByLabel(/email|username/i).fill(input.username);
  const password = page.getByLabel(/^password$/i);
  if (!(await password.isVisible())) {
    await page.getByRole("button", { name: /sign in|log in|continue|next/i }).click();
  }
  await password.fill(input.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(url => url.origin === origin && !url.pathname.startsWith("/api/auth/"), { timeout: 30_000 });
  const session = async () => {
    const response = await page.request.get(`${origin}/api/auth/session`);
    if (!response.ok()) throw new Error(`Session endpoint returned ${response.status()}`);
    return response.json();
  };
  const initial = await session();
  if (initial.state === "context_required") {
    await page.goto(`${origin}/select-context?returnTo=%2Fhome`);
    const contexts = page.getByRole("list", { name: "Available authorized contexts" }).getByRole("listitem");
    await expect(contexts.first()).toBeVisible();
    if (input.tenantName) {
      const selected = contexts.filter({ has: page.getByText(input.tenantName, { exact: true }) });
      await expect(selected, "Configured tenant must identify exactly one authorized context").toHaveCount(1);
      await selected.click();
    } else {
      await expect(contexts, "Set PLAYWRIGHT_NEON_TENANT_NAME when the user has multiple contexts").toHaveCount(1);
      await contexts.click();
    }
    await page.waitForURL(url => url.origin === origin && url.pathname === "/home");
  }
  const authenticated = await session();
  expect(authenticated).toMatchObject({ state: "authenticated", tenantId: expect.any(String), principalId: expect.any(String) });
  if (input.tenantName) {
    const response = await page.request.get(`${origin}/api/auth/contexts`);
    expect(response.ok()).toBe(true);
    const { contexts } = await response.json();
    expect(contexts).toEqual(expect.arrayContaining([expect.objectContaining({ tenantName: input.tenantName, tenantId: authenticated.tenantId })]));
  }
  return authenticated as { state: "authenticated"; tenantId: string; principalId: string };
}
