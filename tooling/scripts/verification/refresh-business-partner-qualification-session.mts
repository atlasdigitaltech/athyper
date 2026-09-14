/** Normal NEON qualification login; interactive MFA is requested only if the issuer asks. */
import { chromium, expect } from "@playwright/test";
import { createInterface } from "node:readline";
import { chmodSync } from "node:fs";
if (!process.env.QUALIFICATION_PASSWORD)
  throw Error("Password environment required");
const account = process.argv[2] ?? "catl.admin";
const principal = (
  {
    "catl.admin": "cca94907-7519-5871-8e3c-6b11aa545c93",
    "catl.owner": "645b6a55-3355-526a-9643-3900425bde47",
  } as Record<string, string>
)[account];
if (!principal) throw Error("Named qualification account required");
if (process.argv[3] && process.argv[3] !== "--current-test-session")
  throw Error("Unsupported session destination");
const browser = await chromium.launch();
const origin = "https://neon.dev.athyper.test";
const context = await browser.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
});
try {
  const page = await context.newPage();
  await page.goto("/api/auth/login?returnTo=%2Fhome");
  await page.getByLabel(/email|username/i).fill(account);
  const password = page.getByLabel(/^password$/i);
  if (!(await password.isVisible()))
    await page
      .getByRole("button", { name: /sign in|log in|continue|next/i })
      .click();
  await password.fill(process.env.QUALIFICATION_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  const otp = page.locator('input[name="otp"]');
  const phase = await Promise.race([
    page
      .waitForURL(
        (url) =>
          url.origin === origin && !url.pathname.startsWith("/api/auth/"),
        { timeout: 300000 },
      )
      .then(() => "returned"),
    otp.waitFor({ state: "visible", timeout: 300000 }).then(() => "otp"),
  ]);
  if (phase === "otp") {
    console.log(
      JSON.stringify({ account, plane: "neon", status: "MFA_REQUIRED" }),
    );
    const lines = createInterface({ input: process.stdin });
    const code = await new Promise<string>((resolve) =>
      lines.once("line", resolve),
    );
    lines.close();
    if (!/^\d{6}$/.test(code.trim()))
      throw Error("Six digit MFA code required");
    await otp.fill(code.trim());
    await page
      .getByRole("button", { name: /sign in|log in|submit|continue/i })
      .click();
    await page.waitForURL(
      (url) => url.origin === origin && !url.pathname.startsWith("/api/auth/"),
      { timeout: 30000 },
    );
  }
  let session = await (await context.request.get("/api/auth/session")).json();
  if (session.state === "context_required") {
    await page.goto("/select-context?returnTo=%2Fhome");
    const contexts = page
      .getByRole("list", { name: "Available authorized contexts" })
      .getByRole("listitem");
    await expect(contexts).toHaveCount(1);
    await contexts.click();
    await page.waitForURL(
      (url) => url.origin === origin && url.pathname === "/home",
    );
    session = await (await context.request.get("/api/auth/session")).json();
  }
  console.log({
    status: "SESSION_IDENTITY_CHECK",
    state: session.state,
    plane: session.plane,
    tenantId: session.tenantId,
    principalId: session.principalId,
    pagePath: new URL(page.url()).pathname,
  });
  if (
    session.state !== "authenticated" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444" ||
    session.principalId !== principal
  )
    throw Error("Expected NEON qualification principal");
  const path =
    process.argv[3] === "--current-test-session"
      ? "tests/e2e/.auth/dev/neon/" + account + ".json"
      : "tests/e2e/.auth/" + account + "-release-19-qualification.json";
  await context.storageState({ path });
  chmodSync(path, 0o600);
  console.log({
    account,
    state: session.state,
    assurance: session.assurance,
    identityVerified: true,
  });
} finally {
  await browser.close();
}
