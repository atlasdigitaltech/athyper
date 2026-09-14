/** Normal OIDC step-up only: no authoring, review or publication mutation. */
import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
import { chmodSync } from "node:fs";
const origin = "https://studio.dev.athyper.test",
  path = "tests/e2e/.auth/catl.owner-bp-combined-review.json";
if (!process.env.QUALIFICATION_PASSWORD)
  throw Error("Password environment required");
const browser = await chromium.launch(),
  context = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    storageState: path,
  });
let stage = "session_check";
try {
  const session = await (await context.request.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d" ||
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
    stage = "start_challenge";
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
      if (await username.isVisible()) await username.fill("catl.owner");
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
          .textContent({ timeout: 1000 })
          .catch(() => null)
      )?.trim();
      if (issuerAccount && issuerAccount !== "catl.owner")
        throw Error("Unexpected issuer account");
      console.log({
        account: "catl.owner",
        plane: "studio",
        purpose: "independent_review_step_up",
        status: "MFA_REQUIRED",
        issuerAccountVerified: issuerAccount === "catl.owner",
        authenticatorChoices: await page
          .locator('input[name="selectedCredentialId"]')
          .count(),
      });
      const lines = createInterface({ input: process.stdin });
      const code = await new Promise<string>((r) => lines.once("line", r));
      lines.close();
      if (!/^\d{6}$/.test(code.trim())) throw Error("Six-digit code required");
      stage = "submit_mfa";
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
          account: "catl.owner",
          status: "ISSUER_REJECTED_CREDENTIAL",
        });
        throw Error("Issuer rejected credential");
      }
    }
  }
  stage = "verify_elevation";
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
  console.log({ account: "catl.owner", elevated: true, grantChanges: [] });
} catch {
  console.log({
    account: "catl.owner",
    status: "STEP_UP_NOT_COMPLETED",
    stage,
    elevated: false,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
