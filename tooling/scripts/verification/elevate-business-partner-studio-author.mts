/** Normal OIDC step-up only: no authoring, review or publication mutation. */
import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
import { chmodSync } from "node:fs";
const origin = "https://studio.dev.athyper.test",
  path = "tests/e2e/.auth/catl.admin-bp-combined-publisher.json";
if (!process.env.QUALIFICATION_PASSWORD)
  throw Error("Password environment required");
const browser = await chromium.launch(),
  context = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    storageState: path,
  });
try {
  const session = await (await context.request.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444"
  )
    throw Error("Studio author identity required");
  if (session.assurance !== "elevated") {
    const csrf = (await context.storageState()).cookies.find(
      (c) => c.name === "__Host-athyper-csrf",
    );
    if (!csrf) throw Error("CSRF required");
    const page = await context.newPage();
    await page.goto("/home");
    await page.evaluate((token) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/step-up/start?returnTo=%2Fhome";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "csrfToken";
      input.value = token;
      form.append(input);
      document.body.append(form);
      form.submit();
    }, decodeURIComponent(csrf.value));
    const password = page.getByLabel(/^password$/i),
      otp = page.locator('input[name="otp"]');
    await Promise.race([
      password.waitFor({ state: "visible", timeout: 30000 }),
      otp.waitFor({ state: "visible", timeout: 30000 }),
    ]);
    if (await password.isVisible()) {
      const username = page.getByLabel(/email|username/i);
      if (await username.isVisible()) await username.fill("catl.admin");
      await password.fill(process.env.QUALIFICATION_PASSWORD!);
      await page
        .getByRole("button", { name: /sign in|log in|continue/i })
        .click();
    }
    const phase = await Promise.race([
      otp.waitFor({ state: "visible", timeout: 30000 }).then(() => "otp"),
      page
        .waitForURL(
          (u) => u.origin === origin && !u.pathname.startsWith("/api/auth/"),
          { timeout: 30000 },
        )
        .then(() => "returned"),
    ]);
    if (phase === "otp") {
      const issuerAccount = (
        await page
          .locator("#kc-username")
          .textContent()
          .catch(() => null)
      )?.trim();
      if (issuerAccount && issuerAccount !== "catl.admin")
        throw Error("Unexpected issuer account");
      console.log({
        account: "catl.admin",
        plane: "studio",
        purpose: "authoring_step_up",
        status: "MFA_REQUIRED",
        issuerAccountVerified: issuerAccount === "catl.admin",
        authenticatorChoices: await page
          .locator('input[name="selectedCredentialId"]')
          .count(),
      });
      const lines = createInterface({ input: process.stdin });
      const code = await new Promise<string>((r) => lines.once("line", r));
      lines.close();
      if (!/^\d{6}$/.test(code.trim())) throw Error("Six-digit code required");
      await otp.fill(code.trim());
      await page
        .getByRole("button", { name: /sign in|log in|submit|continue/i })
        .click();
      const result = await Promise.race([
        page
          .waitForURL(
            (u) => u.origin === origin && !u.pathname.startsWith("/api/auth/"),
            { timeout: 30000 },
          )
          .then(() => "returned"),
        page
          .locator("#input-error-otp-code, #input-error")
          .filter({ hasText: /invalid|incorrect|expired/i })
          .first()
          .waitFor({ state: "visible", timeout: 30000 })
          .then(() => "rejected"),
      ]);
      if (result === "rejected") {
        console.log({
          account: "catl.admin",
          status: "ISSUER_REJECTED_CREDENTIAL",
        });
        throw Error("Issuer rejected credential");
      }
    }
  }
  const verified = await (
    await context.request.get("/api/auth/session")
  ).json();
  if (
    verified.assurance !== "elevated" ||
    verified.principalId !== session.principalId ||
    verified.tenantId !== session.tenantId
  )
    throw Error("Elevated author identity not established");
  await context.storageState({ path });
  chmodSync(path, 0o600);
  console.log({ account: "catl.admin", elevated: true, grantChanges: [] });
} catch {
  console.log({
    account: "catl.admin",
    status: "STEP_UP_NOT_COMPLETED",
    elevated: false,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
