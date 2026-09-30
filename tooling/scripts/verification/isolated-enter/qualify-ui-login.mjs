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
    ? "cca94907-7519-5871-8e3c-6b11aa545c93"
    : "645b6a55-3355-526a-9643-3900425bde47";
const origin = "https://neon.dev.athyper.test",
  root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const browser = await chromium.launch();
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  proxy: { server: "http://127.0.0.1:13320" },
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
  fs.mkdirSync(root + "/ui-auth/dev/neon", { recursive: true, mode: 0o700 });
  await context.storageState({
    path: root + "/ui-auth/dev/neon/" + account + ".json",
  });
  fs.chmodSync(root + "/ui-auth/dev/neon/" + account + ".json", 0o600);
  await page.goto(origin + "/mdg/business-partner/manage");
  const api = await page.evaluate(async () => {
    const r = await fetch(
      "/api/relay/entity-runtime/business_partner/list-descriptor",
    );
    return { status: r.status, body: await r.json() };
  });
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    account,
    principalId: session.principalId,
    assurance: session.assurance,
    uiImage:
      "sha256:2f7028f473f8d1be9dc576ee4578c5817f484637c65b631e47fcbf2ac3673921",
    transport:
      "loopback CONNECT proxy routes NEON to pinned UI and IAM directly to normal issuer",
    receipts,
    descriptorStatus: api.status,
    descriptorHash: api.body?.revision?.descriptorHash,
    fullJourneyQualified: false,
  };
  fs.writeFileSync(
    "governance/policy/reports/business-partner-enter-ui-login-20260912." +
      account +
      ".dev.json",
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log({
    account,
    authenticated: true,
    assurance: session.assurance,
    descriptorStatus: api.status,
    descriptorHash: report.descriptorHash,
  });
} catch (error) {
  console.log({
    failure: error.message,
    receipts,
    cookies: (await context.cookies()).map((c) => ({
      name: c.name,
      domain: c.domain,
      secure: c.secure,
    })),
  });
  throw error;
} finally {
  await browser.close();
}
