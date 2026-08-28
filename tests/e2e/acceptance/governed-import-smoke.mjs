import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const adminPassword = required("KEYCLOAK_ADMIN_PASSWORD");
const runId = process.env.ACCEPTANCE_RUN_ID?.trim() || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const tenantCode = process.env.ACCEPTANCE_TENANT_CODE?.trim() || "cirrusatlantic";
const username = process.env.ACCEPTANCE_USERNAME?.trim() || "catl.admin";
const tenantId = required("ACCEPTANCE_TENANT_ID");
const studioEntityId = required("ACCEPTANCE_STUDIO_ENTITY_ID");
const meshBuyerAccountId = required("ACCEPTANCE_MESH_BUYER_ACCOUNT_ID");
const meshSupplierAccountId = required("ACCEPTANCE_MESH_SUPPLIER_ACCOUNT_ID");
const evidencePath = resolve(process.env.ACCEPTANCE_EVIDENCE_PATH?.trim() || "tests/e2e/.playwright-output/governed-import-smoke.json");
const origins = {
  neon: process.env.PLAYWRIGHT_NEON_BASE_URL || "https://neon.dev.athyper.test",
  mesh: process.env.PLAYWRIGHT_MESH_BASE_URL || "https://mesh.dev.athyper.test",
  studio: process.env.PLAYWRIGHT_STUDIO_BASE_URL || "https://studio.dev.athyper.test",
};
const identityOrigin = process.env.KEYCLOAK_BASE_URL || "https://iam.dev.athyper.test";

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
const page = await context.newPage();
const evidence = { runId, tenantCode, username, startedAt: new Date().toISOString(), planes: {} };

try {
  await impersonate(context);
  for (const plane of ["neon", "mesh", "studio"]) {
    await authenticatePlane(page, plane);
    const input = planeInput(plane);
    const successful = await executeImport(page, input.entityCode, input.scopeCoordinate, input.validRow, true);
    const rejected = await executeImport(page, input.entityCode, input.scopeCoordinate, input.invalidRow, false);
    await page.goto(`${origins[plane]}/operations/data-transfers`);
    await page.getByRole("heading", { name: "Imports and exports" }).waitFor();
    await page.locator("tbody tr").first().waitFor();
    const workspaceText = await page.locator("main").innerText();
    assert(workspaceText.toLowerCase().includes(input.entityCode.replaceAll("_", " ")), `${plane} workspace did not render ${input.entityCode}`);
    assert(workspaceText.includes("Error Report"), `${plane} workspace did not expose the rejected import error report`);
    evidence.planes[plane] = {
      entityCode: input.entityCode,
      successful,
      rejected,
      workspace: { route: "/operations/data-transfers", rendered: true },
    };
  }
  evidence.completedAt = new Date().toISOString();
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}

async function impersonate(browserContext) {
  const tokenResponse = await browserContext.request.post(`${identityOrigin}/realms/master/protocol/openid-connect/token`, {
    form: { client_id: "admin-cli", grant_type: "password", username: "athyper-admin", password: adminPassword },
  });
  assert(tokenResponse.ok(), `Keycloak admin authentication failed: ${tokenResponse.status()}`);
  const { access_token: accessToken } = await tokenResponse.json();
  assert(typeof accessToken === "string" && accessToken, "Keycloak admin token was absent");
  const usersResponse = await browserContext.request.get(`${identityOrigin}/admin/realms/athyper/users`, {
    headers: { authorization: `Bearer ${accessToken}` },
    params: { username, exact: "true" },
  });
  assert(usersResponse.ok(), `Keycloak user lookup failed: ${usersResponse.status()}`);
  const users = await usersResponse.json();
  assert(Array.isArray(users) && users.length === 1 && typeof users[0]?.id === "string", `Expected exactly one Keycloak user for ${username}`);
  const impersonation = await browserContext.request.post(`${identityOrigin}/admin/realms/athyper/users/${encodeURIComponent(users[0].id)}/impersonation`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert(impersonation.ok(), `Keycloak impersonation failed: ${impersonation.status()}`);
}

async function authenticatePlane(activePage, plane) {
  const origin = origins[plane];
  await activePage.goto(`${origin}/api/auth/login?returnTo=${encodeURIComponent("/operations/data-transfers")}`);
  await activePage.waitForURL((url) => url.origin === origin, { timeout: 30_000 });
  const session = await browserJson(activePage, "GET", "/api/auth/session");
  if (session.state === "context_required") {
    const available = await browserJson(activePage, "GET", "/api/auth/contexts");
    const selected = available.contexts?.find((candidate) => candidate.tenantCode === tenantCode || candidate.tenantId === tenantId);
    assert(selected?.tenantId === tenantId, `${plane} did not expose the ${tenantCode} context`);
    await browserJson(activePage, "POST", "/api/auth/session/context", { tenantId });
  } else {
    assert(session.tenantId === tenantId, `${plane} authenticated into an unexpected tenant`);
  }
  await activePage.goto(`${origin}/operations/data-transfers`);
  await activePage.getByRole("heading", { name: "Imports and exports" }).waitFor();
}

async function executeImport(activePage, entityCode, scopeCoordinate, row, commit) {
  const sessionId = crypto.randomUUID();
  const prefix = "/api/relay/records";
  const begin = await relayJson(activePage, "POST", `${prefix}/${entityCode}/imports`, {
    sessionId,
    operation: "create",
    scopeCoordinate,
    conflictPolicy: "reject",
    atomicity: "all_or_nothing",
  }, `${sessionId}:begin`);
  assert(begin.id === sessionId, `${entityCode} begin receipt did not preserve its idempotency coordinate`);
  await relayJson(activePage, "PUT", `${prefix}/imports/${sessionId}/chunks/0`, { rows: [row] }, `${sessionId}:chunk:0`);
  await relayJson(activePage, "POST", `${prefix}/imports/${sessionId}/complete`, { expectedChunkCount: 1 }, `${sessionId}:complete`);
  const validation = await relayJson(activePage, "POST", `${prefix}/imports/${sessionId}/validate`, {}, `${sessionId}:validate`);
  if (commit) {
    assert(validation.validCount === 1 && validation.invalidCount === 0, `${entityCode} valid row was rejected: ${JSON.stringify(validation.rows)}`);
    const queued = await relayJson(activePage, "POST", `${prefix}/imports/${sessionId}/commit`, {}, `${sessionId}:commit`);
    assert(queued.status === "queued", `${entityCode} commit was not queued`);
    const receipt = await pollTransfer(activePage, sessionId, ["committed", "failed"]);
    assert(receipt.status === "committed", `${entityCode} import worker failed with status ${receipt.status}`);
    return { sessionId, jobId: queued.jobId, validation, receipt };
  }
  assert(validation.validCount === 0 && validation.invalidCount === 1, `${entityCode} invalid row unexpectedly validated`);
  const report = await relayJson(activePage, "GET", `${prefix}/imports/${sessionId}/error-report`);
  assert(typeof report.url === "string" && report.url, `${entityCode} error report URL was absent`);
  const download = await context.request.get(report.url, { failOnStatusCode: false });
  assert(download.ok(), `${entityCode} error report download failed: ${download.status()}`);
  const reportText = await download.text();
  assert(reportText.includes("IMPORT_") || reportText.includes("MESH_"), `${entityCode} error report did not contain governed validation evidence`);
  const receipt = await pollTransfer(activePage, sessionId, ["validated"]);
  return { sessionId, validation, receipt, errorReport: { downloaded: true, bytes: Buffer.byteLength(reportText) } };
}

async function pollTransfer(activePage, sessionId, statuses) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const transfers = await relayJson(activePage, "GET", "/api/relay/records/transfers?limit=100");
    const receipt = transfers.items?.find((candidate) => candidate.id === sessionId);
    if (receipt && statuses.includes(receipt.status)) return receipt;
    await activePage.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for transfer ${sessionId} to reach ${statuses.join(" or ")}`);
}

async function relayJson(activePage, method, path, body, idempotencyKey) {
  return browserJson(activePage, method, path, body, idempotencyKey);
}

async function browserJson(activePage, method, path, body, idempotencyKey) {
  const result = await activePage.evaluate(async ({ method, path, body, idempotencyKey }) => {
    const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-athyper-csrf=") || part.startsWith("athyper-csrf="))?.split("=").slice(1).join("=");
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json, application/problem+json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let value;
    try { value = text ? JSON.parse(text) : undefined; } catch { value = { raw: text }; }
    return { ok: response.ok, status: response.status, value };
  }, { method, path, body, idempotencyKey });
  if (!result.ok) throw new Error(`${method} ${path} failed (${result.status}): ${JSON.stringify(result.value)}`);
  return result.value;
}

function planeInput(plane) {
  if (plane === "neon") return {
    entityCode: "business_partner",
    scopeCoordinate: { operatingOrganizationId: required("ACCEPTANCE_NEON_ORGANIZATION_ID") },
    validRow: { code: `ACC-BP-${runId}`, name: `Acceptance Partner ${runId}`, display_name: `Acceptance Partner ${runId}`, partner_category: "organization", partner_role: "supplier", registration_country_code: "GB", status: "draft", metadata: { acceptanceRunId: runId } },
    invalidRow: { code: `ACC-BAD-${runId}`, partner_role: "unsupported" },
  };
  if (plane === "mesh") return {
    entityCode: "network_relationship",
    scopeCoordinate: { networkAccountId: meshBuyerAccountId },
    validRow: { buyer_tenant_id: tenantId, buyer_account_id: meshBuyerAccountId, supplier_tenant_id: tenantId, supplier_account_id: meshSupplierAccountId, relationship_kind: `acceptance.${runId}`, metadata: { acceptanceRunId: runId } },
    invalidRow: { buyer_tenant_id: tenantId, buyer_account_id: meshBuyerAccountId, supplier_tenant_id: "not-a-uuid", supplier_account_id: meshBuyerAccountId },
  };
  return {
    entityCode: "metadata_entity",
    scopeCoordinate: {},
    validRow: { entity_id: studioEntityId, entity_code: "business_partner", branch_code: `acceptance_${runId}`, title: `Acceptance draft ${runId}`, graph: { contractSchema: "athyper.meta-entity-contract/2.1", entity: { entityCode: "business_partner" }, runtimeProfiles: [{ profileKey: "default", backingKind: "virtual", apiExposure: "catalog_only", readMode: "none", writeMode: "none" }], fields: [{ fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } }], operations: [{ operationKey: "read", operationKind: "read", label: "Read", auditEventCode: "business_partner.read", fieldKeys: ["id"] }] } },
    invalidRow: { entity_id: "not-a-uuid", entity_code: "business_partner", branch_code: `invalid_${runId}`, title: "Invalid acceptance draft", graph: {} },
  };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
