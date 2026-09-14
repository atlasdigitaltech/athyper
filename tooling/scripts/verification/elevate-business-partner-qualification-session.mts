/** Normal issuer step-up; no review or business decision is submitted here. */
import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
import { chmodSync } from "node:fs";
const account = process.argv[2];
const principal = (
  {
    "catl.owner": "645b6a55-3355-526a-9643-3900425bde47",
    "catl.admin": "cca94907-7519-5871-8e3c-6b11aa545c93",
  } as Record<string, string>
)[account ?? ""];
if (!principal || !process.env.QUALIFICATION_PASSWORD)
  throw Error("Named account and password required");
const path =
  process.argv[3] === "--current-test-session"
    ? "tests/e2e/.auth/dev/neon/" + account + ".json"
    : "tests/e2e/.auth/" + account + "-release-19-qualification.json";
if (process.argv[3] && process.argv[3] !== "--current-test-session")
  throw Error("Unsupported session selection");
const origin = "https://neon.dev.athyper.test";
const browser = await chromium.launch(),
  context = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    storageState: path,
  });
try {
  const session = await (await context.request.get("/api/auth/session")).json();
  if (session.state !== "authenticated" || session.principalId !== principal)
    throw Error("Authenticated qualification session required");
  if (session.assurance !== "elevated") {
    const page = await context.newPage();
    await page.goto("/mdg/operation-review");
    await page
      .getByRole("button", { name: "Continue to MFA", exact: true })
      .click();
    const password = page.getByLabel(/^password$/i),
      otp = page.locator('input[name="otp"]');
    await Promise.race([
      password.waitFor({ state: "visible", timeout: 30000 }),
      otp.waitFor({ state: "visible", timeout: 30000 }),
    ]);
    if (await password.isVisible()) {
      await password.fill(process.env.QUALIFICATION_PASSWORD);
      await page
        .getByRole("button", { name: /sign in|log in|continue/i })
        .click();
    }
    await otp.waitFor({ state: "visible", timeout: 30000 });
    console.log({
      account,
      status: "MFA_REQUIRED",
      purpose: "isolated_command_qualification",
    });
    const lines = createInterface({ input: process.stdin });
    const code = await new Promise<string>((resolve) =>
      lines.once("line", resolve),
    );
    lines.close();
    if (!/^\d{6}$/.test(code.trim())) throw Error("Six-digit code required");
    await otp.fill(code.trim());
    await page
      .getByRole("button", { name: /sign in|log in|submit|continue/i })
      .click();
    await page.waitForURL(
      (url) => url.origin === origin && !url.pathname.startsWith("/api/auth/"),
      { timeout: 30000 },
    );
  }
  const verified = await (
    await context.request.get("/api/auth/session")
  ).json();
  if (
    verified.state !== "authenticated" ||
    verified.principalId !== principal ||
    verified.assurance !== "elevated"
  )
    throw Error("MFA elevation not established");
  await context.storageState({ path });
  chmodSync(path, 0o600);
  console.log({ account, elevated: true });
} finally {
  await browser.close();
}
