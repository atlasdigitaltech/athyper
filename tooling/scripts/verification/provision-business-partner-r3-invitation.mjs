#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.argv.includes("--confirm=LOCAL-NEON-BP-R3-INVITATION"))
  throw new Error("Explicit local R3 invitation confirmation required");
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://neon.dev.athyper.test";
if (new URL(baseURL).hostname !== "neon.dev.athyper.test")
  throw new Error("This provisioner is restricted to the local dev tenant");
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configure ${name}`);
  return value;
};
const directory = resolve("node_modules/.cache/bp-qualification");
const applicant = JSON.parse(
  await readFile(resolve(directory, "r3-applicant.json"), "utf8"),
);
const output = resolve(directory, "r3-native.json");
let fixture;
try {
  fixture = JSON.parse(await readFile(output, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  fixture = {};
}
const browser = await chromium.launch();
try {
  const issuer = await login(
    required("PLAYWRIGHT_BP_V1_REQUESTER_USER"),
    required("PLAYWRIGHT_BP_V1_REQUESTER_PASSWORD"),
  );
  if (!fixture.invitationToken) {
    const key = `r3-fixture-${crypto.randomUUID()}`;
    const result = await post(
      issuer,
      "/neon/business-partner-invitations",
      {
        idempotencyKey: key,
        journeyKind: "supplier",
        scope: {
          kind: "commercial",
          operatingOrganizationId: required(
            "PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID",
          ),
        },
        intendedPartyName: "R3 local acceptance supplier",
        inviteeEmail: applicant.email,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      key,
    );
    if (!result.token || !result.invitation?.id)
      throw new Error("Fresh invitation did not return its protected token");
    fixture = {
      ...fixture,
      invitationId: result.invitation.id,
      invitationToken: result.token,
      expiresAt: result.invitation.expiresAt,
    };
    await writeFile(output, JSON.stringify(fixture, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(output, 0o600);
  }
  const page = await login(applicant.username, applicant.password);
  const response = await page.request.get(
    "/api/relay/platform/experience/bootstrap",
  );
  const bootstrap = await response.json();
  if (
    !response.ok() ||
    JSON.stringify(bootstrap.permissions) !==
      JSON.stringify(["neon.supplier_registration.external.respond"])
  )
    throw new Error(
      "Applicant must have exactly the supplier application response permission",
    );
  const denied = await page.request.get(
    `/api/relay/neon/business-partner-cases?operatingOrganizationId=${encodeURIComponent(required("PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID"))}`,
  );
  if (denied.status() !== 403)
    throw new Error(
      `Applicant internal case access must be denied, received ${denied.status()}`,
    );
  console.log(
    JSON.stringify(
      {
        invitationId: fixture.invitationId,
        credentialReference: resolve(directory, "r3-applicant.json"),
        invitationReference: output,
        applicantPrincipalId: bootstrap.principalId,
        internalCaseReadStatus: denied.status(),
        remainingCoordinates: [
          "PLAYWRIGHT_BP_R3_OTHER_REQUEST_ID",
          "PLAYWRIGHT_BP_R3_MESH_SNAPSHOT_ID",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
async function login(username, password) {
  const context = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      storageState: { cookies: [], origins: [] },
    }),
    page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel(/email|username/i).fill(username);
  const field = page.getByLabel(/^password$/i);
  if (!(await field.isVisible()))
    await page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .click();
  await field.fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  const session = await (await page.request.get("/api/auth/session")).json();
  if (!session.principalId || !session.tenantId)
    throw new Error(
      "Authenticated tenant session is required; complete any IAM enrollment first",
    );
  return page;
}
async function post(page, path, body, key) {
  const cookie = (await page.context().cookies()).find(
    (item) =>
      item.name === "__Host-athyper-csrf" || item.name === "athyper-csrf",
  );
  if (!cookie) throw new Error("Authenticated CSRF cookie is required");
  const response = await page.request.post("/api/relay" + path, {
    data: body,
    headers: {
      origin: baseURL,
      "x-csrf-token": decodeURIComponent(cookie.value),
      "idempotency-key": key,
    },
  });
  const result = await response.json();
  if (!response.ok())
    throw new Error(
      `Invitation prerequisite failed: HTTP ${response.status()} ${result.code ?? "unknown"}`,
    );
  return result;
}
