import { createInterface } from "node:readline";
import { chromium } from "@playwright/test";
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
    ? "81cd1978-2df5-5c9a-938a-2f8c291aea13"
    : "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d";
const origin = "https://studio.dev.athyper.test",
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const browser = await chromium.launch();
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  proxy: { server: "http://127.0.0.1:13330" },
});
const receipts = [];
try {
  context.on("response", (response) => {
    const u = new URL(response.url());
    if (u.origin === origin)
      receipts.push({
        path: u.pathname,
        status: response.status(),
        uiImage: response.headers()["x-qualification-ui-image"],
      });
  });
  const page = await context.newPage();
  await page.goto(origin + "/api/auth/login?returnTo=%2Fhome");
  await page.getByLabel(/email|username/i).fill(account);
  const password = page.getByLabel(/^password$/i);
  if (!(await password.isVisible()))
    await page
      .getByRole("button", { name: /sign in|log in|continue|next/i })
      .click();
  await password.fill(process.env.QUALIFICATION_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  const otp = page.locator('input[name="otp"]');
  await Promise.race([
    page.waitForURL(
      (url) => url.origin === origin && !url.pathname.startsWith("/api/auth/"),
      { timeout: 30000 },
    ),
    otp.waitFor({ state: "visible", timeout: 30000 }),
  ]);
  if (await otp.isVisible()) {
    console.log({
      account,
      status: "MFA_REQUIRED",
      purpose: "normal isolated Studio login; no publication approval",
    });
    const lines = createInterface({ input: process.stdin });
    const code = await new Promise((resolve) => lines.once("line", resolve));
    lines.close();
    assert.match(code.trim(), /^\d{6}$/);
    await otp.fill(code.trim());
    await page
      .getByRole("button", { name: /sign in|log in|submit|continue/i })
      .click();
  }
  await page.waitForURL(
    (url) => url.origin === origin && !url.pathname.startsWith("/api/auth/"),
    { timeout: 30000 },
  );
  let session = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  if (session.state === "context_required") {
    await page.goto(origin + "/select-context?returnTo=%2Fhome");
    const choices = page
      .getByRole("list", { name: "Available authorized contexts" })
      .getByRole("listitem");
    assert.equal(await choices.count(), 1);
    await choices.click();
    await page.waitForURL(origin + "/home");
    session = await page.evaluate(
      async () => await (await fetch("/api/auth/session")).json(),
    );
  }
  assert.equal(session.state, "authenticated");
  assert.equal(session.principalId, expected);
  assert.equal(session.tenantId, "44444444-4444-4444-8444-444444444444");
  fs.mkdirSync(root + "/ui-auth/dev/studio", { recursive: true, mode: 0o700 });
  await context.storageState({
    path: root + "/ui-auth/dev/studio/" + account + ".json",
  });
  fs.chmodSync(root + "/ui-auth/dev/studio/" + account + ".json", 0o600);
  console.log({
    account,
    authenticated: true,
    assurance: session.assurance,
    plane: "studio",
    principalId: session.principalId,
  });
} catch (error) {
  console.log({
    failure: error.message.split("\n")[0],
    receipts,
    cookies: (await context.cookies()).map((c) => ({
      name: c.name,
      domain: c.domain,
      secure: c.secure,
    })),
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
