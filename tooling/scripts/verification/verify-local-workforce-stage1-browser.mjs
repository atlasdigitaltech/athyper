#!/usr/bin/env node
// DEV-only browser proof for the Employee 360 Stage 1 permission boundary.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const iamOrigin = "https://iam.dev.athyper.test";
const neonOrigin = "https://neon.dev.athyper.test";
const companyName = "Athyper Canada Food & Beverage Mfg";
const companyCodeId = "7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const adminPassword = execFileSync(
  "docker",
  ["exec", "athyper-dev-iam-1", "cat", "/run/secrets/iam-admin-password"],
  { encoding: "utf8" },
).trim();
const tokenResponse = await fetch(
  `${iamOrigin}/realms/master/protocol/openid-connect/token`,
  {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: "athyper-admin",
      password: adminPassword,
    }),
  },
);
assert.equal(tokenResponse.status, 200, "local Keycloak admin token");
const { access_token: adminToken } = await tokenResponse.json();

async function openAs(browser, username) {
  const usersResponse = await fetch(
    `${iamOrigin}/admin/realms/athyper/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { authorization: `Bearer ${adminToken}` } },
  );
  assert.equal(usersResponse.status, 200, `${username} lookup`);
  const users = await usersResponse.json();
  assert.equal(users.length, 1, `${username} must identify one local user`);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1500, height: 1000 },
  });
  const impersonation = await context.request.post(
    `${iamOrigin}/admin/realms/athyper/users/${users[0].id}/impersonation`,
    { headers: { authorization: `Bearer ${adminToken}` } },
  );
  assert.equal(impersonation.status(), 200, `${username} local impersonation`);
  const { redirect } = await impersonation.json();
  const page = await context.newPage();
  await page.goto(redirect, { waitUntil: "domcontentloaded" });
  await page.goto(
    `${neonOrigin}/api/auth/login?returnTo=${encodeURIComponent("/people/workforce")}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForURL(
    (url) => url.origin === neonOrigin && !url.pathname.startsWith("/api/auth/"),
    { timeout: 30_000 },
  );
  return { context, page };
}

const browser = await chromium.launch({ headless: true });
try {
  const allowed = await openAs(browser, "athyper.admin");
  const allowedCalls = [];
  const protectedRequests = [];
  allowed.page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/restricted-evidence/read")) protectedRequests.push(request.url());
  });
  allowed.page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/relay/neon/workforce"))
      allowedCalls.push({ path: url.pathname, status: response.status() });
  });
  await allowed.page.getByRole("button", { name: "Choose legal entity" }).first().click();
  await allowed.page.getByRole("radio", { name: new RegExp(companyName) }).click();
  for (const name of ["Asha Rahman", "Ben Tan", "Carla Nasser"])
    await allowed.page.getByRole("link", { name }).waitFor();
  await allowed.page.getByRole("link", { name: "Asha Rahman" }).click();
  await allowed.page.getByRole("heading", { name: "Asha Rahman" }).first().waitFor();
  await allowed.page.getByRole("tab", { name: "Profile" }).click();
  await allowed.page.getByRole("heading", { name: "Bachelor of Engineering" }).waitFor();
  await allowed.page.getByRole("heading", { name: "Northwind Components" }).waitFor();
  await allowed.page.getByRole("tab", { name: "Personal & contact" }).click();
  await allowed.page.getByRole("heading", { name: "Health profile" }).waitFor();
  assert.equal(protectedRequests.length, 0, "protected fields must stay unloaded without explicit reveal");
  for (const tab of ["Team", "Requests & tasks", "Related"]) {
    await allowed.page.getByRole("tab", { name: tab }).click();
    await allowed.page.waitForTimeout(250);
  }
  assert(allowedCalls.some((call) => call.path === "/api/relay/neon/workforce" && call.status === 200));
  assert(allowedCalls.some((call) => call.path.endsWith("/sections/team") && call.status === 200));
  assert(allowedCalls.some((call) => call.path.endsWith("/sections/requests") && call.status === 200));
  assert(allowedCalls.some((call) => call.path.endsWith("/sections/education") && call.status === 200));
  assert(allowedCalls.some((call) => call.path.endsWith("/sections/priorEmployment") && call.status === 200));
  assert(!allowedCalls.some((call) => /\/sections\/(documents|comments|audit)$/.test(call.path)), "restricted sections must not be requested");
  await allowed.context.close();

  const denied = await openAs(browser, "athyper.owner");
  const deniedCalls = [];
  denied.page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/relay/neon/workforce"))
      deniedCalls.push(request.url());
  });
  await denied.page.getByRole("heading", { name: "Employee access is not permitted" }).waitFor();
  assert.deepEqual(deniedCalls, [], "denied browser must not request workforce data");
  const directDenial = await denied.page.request.get(
    `${neonOrigin}/api/relay/neon/workforce?companyCodeId=${companyCodeId}&limit=20`,
  );
  assert.equal(directDenial.status(), 403, "denied relay request");
  await denied.context.close();

  console.log(JSON.stringify({
    passed: true,
    allowed: { actor: "athyper.admin", employees: 3, sectionCalls: ["team", "requests", "education", "priorEmployment"] },
    denied: { actor: "athyper.owner", browserWorkforceCalls: 0, directRelayStatus: 403 },
  }));
} finally {
  await browser.close();
}
