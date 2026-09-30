import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
const account = process.argv[2];
assert.ok(
  ["catl.admin", "catl.owner"].includes(account) &&
    process.env.QUALIFICATION_PASSWORD,
);
const expected =
  account === "catl.admin"
    ? "cca94907-7519-5871-8e3c-6b11aa545c93"
    : "645b6a55-3355-526a-9643-3900425bde47";
const origin = "https://neon.dev.athyper.test",
  path =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/neon/" +
    account +
    ".json";
const browser = await chromium.launch(),
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13320" },
    storageState: path,
  });
try {
  const page = await context.newPage();
  await page.goto(origin + "/home");
  const identity = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  assert.equal(identity.state, "authenticated");
  assert.equal(identity.principalId, expected);
  if (identity.assurance !== "elevated") {
    await page.evaluate(() => {
      const cookie = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("__Host-athyper-csrf="));
      if (!cookie) throw Error("CSRF_REQUIRED");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/step-up/start?returnTo=%2Fhome";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "csrfToken";
      input.value = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
      form.append(input);
      document.body.append(form);
      form.submit();
    });
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
      purpose: "isolated Atlas admission qualification",
    });
    const lines = createInterface({ input: process.stdin });
    const code = await new Promise((resolve) => lines.once("line", resolve));
    lines.close();
    assert.match(code.trim(), /^\d{6}$/);
    await otp.fill(code.trim());
    await page
      .getByRole("button", { name: /sign in|log in|submit|continue/i })
      .click();
    await page.waitForURL(origin + "/home", { timeout: 30000 });
  }
  const verified = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  assert.equal(verified.principalId, expected);
  assert.equal(verified.assurance, "elevated");
  await context.storageState({ path });
  fs.chmodSync(path, 0o600);
  console.log({ account, elevated: true, grantsChanged: false });
} finally {
  await browser.close();
}
