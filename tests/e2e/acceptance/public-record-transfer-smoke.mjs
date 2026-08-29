import { chromium } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const identityOrigin = process.env.KEYCLOAK_BASE_URL || "https://iam.dev.athyper.test";
const apiOrigin = process.env.ACCEPTANCE_API_BASE_URL || "https://api.dev.athyper.test";
const tenantId = required("ACCEPTANCE_TENANT_ID");
const username = process.env.ACCEPTANCE_USERNAME?.trim() || "catl.admin";
const adminPassword = required("KEYCLOAK_ADMIN_PASSWORD");
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const evidencePath = resolve(process.env.ACCEPTANCE_EVIDENCE_PATH?.trim() || "tests/e2e/.playwright-output/public-record-transfer-smoke.json");
const clientSecrets = {
  neon: required("NEON_IAM_CLIENT_SECRET"),
  mesh: required("MESH_IAM_CLIENT_SECRET"),
  studio: required("STUDIO_IAM_CLIENT_SECRET"),
};
const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

try {
  let adminToken = await administratorToken();
  const userId = await lookupUser(adminToken);
  const evidence = {};
  for (const plane of ["neon", "mesh", "studio"]) {
    adminToken = await administratorToken();
    const restore = plane === "studio" ? await temporarilyUseSsoFlow(adminToken) : undefined;
    try {
      await impersonate(adminToken, userId);
      const accessToken = await authorizationCodeToken(plane);
      const headers = { authorization: `Bearer ${accessToken}`, "x-plane": plane, "x-tenant-id": tenantId };
      const initial=await rawApi(headers,"GET","/transfers?limit=5"),body=initial.value;
      assert(initial.ok, `${plane} public transfer API failed (${initial.status}): ${JSON.stringify(body)}`);
      assert(Array.isArray(body.items), `${plane} public transfer API did not return a transfer collection`);
      const input = planeInput(plane);
      evidence[plane] = {
        status: initial.status,
        transferCount: body.items.length,
        import: await executeImport(headers, input, input.validRow, true),
        rejectedImport: await executeImport(headers, input, input.invalidRow, false),
        export: await executeExport(headers, input),
        rejectedExport: await executeRejectedExport(headers, input),
        cancelledExport: await executeExportCancellationRace(headers, input),
        cancelledImport: await executeCancellation(headers, input),
        rejectedUpload: await executeRejectedUpload(headers, input),
        mutations: await executeMutationMatrix(headers, input, plane),
      };
    } finally {
      if (restore) await restore();
    }
  }
  const result = { authenticated: true, tenantId, completedAt: new Date().toISOString(), evidence };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}

async function administratorToken() {
  const response = await context.request.post(`${identityOrigin}/realms/master/protocol/openid-connect/token`, { form: { client_id: "admin-cli", grant_type: "password", username: "athyper-admin", password: adminPassword } });
  assert(response.ok(), `Keycloak administrator authentication failed (${response.status()})`);
  return requiredValue((await response.json()).access_token, "administrator access token");
}

async function lookupUser(adminToken) {
  const response = await context.request.get(`${identityOrigin}/admin/realms/athyper/users`, { headers: { authorization: `Bearer ${adminToken}` }, params: { username, exact: "true" } });
  assert(response.ok(), `Keycloak user lookup failed (${response.status()})`);
  const users = await response.json();
  assert(Array.isArray(users) && users.length === 1, `Expected one Keycloak user for ${username}`);
  return requiredValue(users[0]?.id, "Keycloak user id");
}

async function impersonate(adminToken, userId) {
  const response = await context.request.post(`${identityOrigin}/admin/realms/athyper/users/${encodeURIComponent(userId)}/impersonation`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert(response.ok(), `Keycloak impersonation failed (${response.status()})`);
}

async function authorizationCodeToken(plane) {
  const clientId = `${plane}-web`;
  const redirectUri = `https://${plane}.dev.athyper.test/api/auth/callback`;
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL(`${identityOrigin}/realms/athyper/protocol/openid-connect/auth`);
  authorization.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid organization:*", state: randomBytes(16).toString("base64url"), nonce: randomBytes(16).toString("base64url"), code_challenge: challenge, code_challenge_method: "S256" }).toString();
  const response = await context.request.get(authorization.toString(), { maxRedirects: 0 });
  assert(response.status() === 302, `${plane} authorization did not redirect (${response.status()})`);
  const location = requiredValue(response.headers().location, `${plane} authorization redirect`);
  const code = requiredValue(new URL(location).searchParams.get("code"), `${plane} authorization code`);
  const token = await context.request.post(`${identityOrigin}/realms/athyper/protocol/openid-connect/token`, { form: { grant_type: "authorization_code", client_id: clientId, client_secret: clientSecrets[plane], redirect_uri: redirectUri, code, code_verifier: verifier } });
  const payload = await token.json();
  assert(token.ok(), `${plane} token exchange failed (${token.status()}): ${payload.error_description ?? payload.error ?? "unknown"}`);
  return requiredValue(payload.access_token, `${plane} access token`);
}

async function temporarilyUseSsoFlow(adminToken) {
  const headers = { authorization: `Bearer ${adminToken}` };
  const clientsResponse = await context.request.get(`${identityOrigin}/admin/realms/athyper/clients`, { headers, params: { clientId: "studio-web" } });
  const clients = await clientsResponse.json();
  assert(clientsResponse.ok() && clients.length === 1, "Studio client lookup failed");
  const client = clients[0];
  const previous = client.authenticationFlowBindingOverrides ?? {};
  const neonResponse = await context.request.get(`${identityOrigin}/admin/realms/athyper/clients`, { headers, params: { clientId: "neon-web" } });
  const neon = (await neonResponse.json())[0];
  const browserFlow = neon?.authenticationFlowBindingOverrides?.browser;
  assert(neonResponse.ok() && browserFlow, "SSO browser flow lookup failed");
  await updateClient({ ...client, authenticationFlowBindingOverrides: { ...previous, browser: browserFlow } });
  return () => updateClient({ ...client, authenticationFlowBindingOverrides: previous });
  async function updateClient(value) {
    const response = await context.request.put(`${identityOrigin}/admin/realms/athyper/clients/${client.id}`, { headers, data: value });
    assert(response.ok(), `Studio browser-flow update failed (${response.status()})`);
  }
}

async function executeImport(headers, input, row, commit) {
  const sessionId = crypto.randomUUID();
  await api(headers, "POST", `/${input.entityCode}/imports`, { sessionId, operation: "create", scopeCoordinate: input.scopeCoordinate, conflictPolicy: "reject", atomicity: "all_or_nothing" }, `${sessionId}:begin`);
  const bytes = Buffer.from(JSON.stringify([row]));
  const fileName = `${input.entityCode}-${sessionId}.json`;
  const reservation = await api(headers, "POST", `/imports/${sessionId}/file-upload`, { fileName, sizeBytes: bytes.byteLength });
  const upload = await context.request.put(reservation.uploadUrl, { headers: { "content-type": "application/json" }, data: bytes, failOnStatusCode: false });
  assert(upload.ok(), `${input.entityCode} public upload failed (${upload.status()})`);
  await api(headers, "POST", `/imports/${sessionId}/file-complete`, { fileName, sizeBytes: bytes.byteLength }, `${sessionId}:file-complete`);
  const validation = await api(headers, "POST", `/imports/${sessionId}/validate`, {}, `${sessionId}:validate`);
  if (!commit) {
    assert(validation.invalidCount === 1, `${input.entityCode} rejected public import unexpectedly validated`);
    const report = await api(headers, "GET", `/imports/${sessionId}/error-report`);
    const download = await context.request.get(report.url, { failOnStatusCode: false });
    assert(download.ok() && (await download.body()).byteLength > 0, `${input.entityCode} public error report was unavailable`);
    return { sessionId, status: "validated_rejected", errorReportDownloaded: true };
  }
  assert(validation.validCount === 1 && validation.invalidCount === 0, `${input.entityCode} public import did not validate`);
  const preview = await api(headers, "POST", `/imports/${sessionId}/preview`, {}, `${sessionId}:preview`);
  assert(preview.validCount === 1, `${input.entityCode} public preview is invalid`);
  await api(headers, "POST", `/imports/${sessionId}/commit`, {}, `${sessionId}:commit`);
  const completed = await pollImport(headers, sessionId, ["committed", "failed"]);
  assert(completed.status === "committed" && completed.receipt?.rowCount === 1, `${input.entityCode} public import failed`);
  return { sessionId, status: completed.status, receipt: completed.receipt };
}

async function executeExport(headers, input) {
  const exportRequestId = crypto.randomUUID();
  await api(headers, "POST", `/${input.entityCode}/exports`, { requestId: exportRequestId, filter: { scopeCoordinate: input.scopeCoordinate, _transfer: { scope: "filtered", format: "json", fields: input.exportFields, headings: true, rawCodes: true, isoDates: true, informationSheet: true, fileName: `${input.entityCode}-public-${runId}` } } }, `${exportRequestId}:request`);
  const completed = await pollTransfer(headers, exportRequestId, ["completed", "failed"]);
  assert(completed.status === "completed", `${input.entityCode} public export failed: ${completed.errorCode ?? completed.status}`);
  const artifact = await api(headers, "GET", `/exports/${exportRequestId}/download`);
  const download = await context.request.get(artifact.url, { failOnStatusCode: false });
  const value = JSON.parse(await download.text());
  assert(download.ok() && Array.isArray(value.records) && value.exportInformation?.entityCode === input.entityCode, `${input.entityCode} public export artifact is invalid`);
  return { exportRequestId, status: completed.status, rowCount: completed.rowCount, downloaded: true };
}

async function executeCancellation(headers, input) {
  const sessionId = crypto.randomUUID();
  await api(headers, "POST", `/${input.entityCode}/imports`, { sessionId, operation: "create", scopeCoordinate: input.scopeCoordinate }, `${sessionId}:begin`);
  const cancelled = await api(headers, "POST", `/imports/${sessionId}/cancel`, {}, `${sessionId}:cancel`);
  assert(cancelled.status === "cancelled", `${input.entityCode} public cancellation failed`);
  return { sessionId, status: cancelled.status };
}

async function executeRejectedExport(headers,input){
  const exportRequestId=crypto.randomUUID();
  await api(headers,"POST",`/${input.entityCode}/exports`,{requestId:exportRequestId,filter:{scopeCoordinate:input.scopeCoordinate,_transfer:{scope:"filtered",format:"pdf",fields:input.exportFields}}},`${exportRequestId}:request`);
  const failed=await pollTransfer(headers,exportRequestId,["failed"]);
  assert(failed.errorCode==="EXPORT_FORMAT_UNSUPPORTED",`${input.entityCode} rejected export returned ${failed.errorCode??failed.status}`);
  const restarted=await api(headers,"POST",`/exports/${exportRequestId}/restart`,{},`${exportRequestId}:restart`);
  assert(restarted.status==="queued",`${input.entityCode} failed export did not restart`);
  const failedAgain=await pollTransfer(headers,exportRequestId,["failed"]);
  assert(failedAgain.errorCode==="EXPORT_FORMAT_UNSUPPORTED",`${input.entityCode} restarted rejected export returned ${failedAgain.errorCode??failedAgain.status}`);
  return{exportRequestId,status:failedAgain.status,errorCode:failedAgain.errorCode,restartJobId:restarted.jobId};
}

async function executeExportCancellationRace(headers,input){
  const exportRequestId=crypto.randomUUID();
  await api(headers,"POST",`/${input.entityCode}/exports`,{requestId:exportRequestId,filter:{scopeCoordinate:input.scopeCoordinate,_transfer:{scope:"filtered",format:"xlsx",fields:input.exportFields,informationSheet:true}}},`${exportRequestId}:request`);
  const cancellation=await api(headers,"POST",`/exports/${exportRequestId}/cancel`,{},`${exportRequestId}:cancel`);
  assert(cancellation.status==="cancelled"||cancellation.status==="already_terminal",`${input.entityCode} export cancellation returned ${cancellation.status}`);
  const terminal=await pollTransfer(headers,exportRequestId,["cancelled","completed","failed"]);
  if(cancellation.status==="cancelled")assert(terminal.status==="cancelled",`${input.entityCode} cancelled export did not remain cancelled`);
  else assert(terminal.status==="completed"||terminal.status==="failed",`${input.entityCode} completed cancellation race has an invalid terminal state`);
  return{exportRequestId,status:terminal.status,raceWinner:cancellation.status==="cancelled"?"cancellation":"completion"};
}

async function executeRejectedUpload(headers, input) {
  const sessionId = crypto.randomUUID();
  await api(headers, "POST", `/${input.entityCode}/imports`, { sessionId, operation: "create", scopeCoordinate: input.scopeCoordinate }, `${sessionId}:begin`);
  const result = await rawApi(headers, "POST", `/imports/${sessionId}/file-upload`, { fileName: "malicious.exe", sizeBytes: 32 });
  assert([400, 409, 422].includes(result.status), `${input.entityCode} unsupported public upload was not rejected (${result.status})`);
  await api(headers, "POST", `/imports/${sessionId}/cancel`, {}, `${sessionId}:cancel`);
  return { sessionId, status: result.status, code: result.value.code };
}

async function executeMutationMatrix(headers, input, plane) {
  if (plane === "studio") {
    const changeSetId = required("ACCEPTANCE_STUDIO_CHANGE_SET_ID");
    const update = await executeRows(headers, input, { operation: "update", rows: [{ change_set_id: changeSetId, graph: input.validRow.graph }], expectedOutcome: "drafted" });
    const upsert = await executeRows(headers, input, { operation: "upsert", rows: [{ ...input.validRow, branch_code: `rest_upsert_${runId}`, title: `REST upsert ${runId}` }], expectedOutcome: "drafted" });
    const replace = await executeRows(headers, input, { operation: "replace", rows: [{ ...input.validRow, branch_code: `rest_replace_${runId}`, title: `REST replace ${runId}` }], expectedOutcome: "drafted" });
    const skipped = await executeRows(headers, input, { operation: "upsert", rows: [{ change_set_id: "018f6d2a-ffff-7fff-8fff-ffffffffffff", graph: input.validRow.graph }], conflictPolicy: "skip", expectedOutcome: "skipped" });
    const unavailableDelete = await rawApi(headers, "POST", `/${input.entityCode}/imports`, { sessionId: crypto.randomUUID(), operation: "delete", scopeCoordinate: input.scopeCoordinate });
    assert(unavailableDelete.status === 403 || unavailableDelete.status === 409, `Studio delete unexpectedly became available (${unavailableDelete.status})`);
    const atomicity = await atomicityMatrix(headers, input, { ...input.validRow, branch_code: `rest_valid_rows_${runId}`, title: `REST valid rows ${runId}` });
    return { update, upsert, replace, skipped, unavailableDelete: { status: unavailableDelete.status, code: unavailableDelete.value.code }, atomicity };
  }

  const base = plane === "neon"
    ? { ...input.validRow, code: `MUT-BP-${runId}`, name: `Mutation Partner ${runId}`, display_name: `Mutation Partner ${runId}` }
    : { ...input.validRow, relationship_kind: `mutation.${runId}` };
  const upsertRow = plane === "neon"
    ? { ...input.validRow, code: `MUT-UP-${runId}`, name: `Mutation Upsert ${runId}` }
    : { ...input.validRow, relationship_kind: `mutation.upsert.${runId}` };
  const validRowsRow = plane === "neon"
    ? { ...input.validRow, code: `MUT-VR-${runId}`, name: `Mutation Valid Rows ${runId}` }
    : { ...input.validRow, relationship_kind: `mutation.valid-rows.${runId}` };
  const create = await executeRows(headers, input, { operation: "create", rows: [base], expectedOutcome: plane === "mesh" ? "requested" : "created" });
  const updateRow = plane === "neon" ? { code: base.code, display_name: `Updated ${runId}` } : { ...base, effective_from: "2026-08-28" };
  const update = await executeRows(headers, input, { operation: "update", rows: [updateRow], expectedOutcome: "updated" });
  const upsert = await executeRows(headers, input, { operation: "upsert", rows: [upsertRow], expectedOutcome: plane === "mesh" ? "requested" : "created" });
  const replace = await executeRows(headers, input, { operation: "replace", rows: [base], expectedOutcome: "updated" });
  const skipped = await executeRows(headers, input, { operation: "create", rows: [base], conflictPolicy: "skip", expectedOutcome: "skipped" });
  const rejected = await executeRows(headers, input, { operation: "create", rows: [base], conflictPolicy: "reject", expectedStatus: "failed" });
  const restarted=await api(headers,"POST",`/imports/${rejected.sessionId}/restart`,{},`${rejected.sessionId}:restart`),restartedTerminal=await pollImport(headers,rejected.sessionId,["failed"]);
  assert(restarted.status==="queued"&&restartedTerminal.status==="failed",`${input.entityCode} failed import did not safely restart`);
  const removed = await executeRows(headers, input, { operation: "delete", rows: [base], expectedOutcome: "deleted" });
  const atomicity = await atomicityMatrix(headers, input, validRowsRow);
  return { create, update, upsert, replace, skipped, rejected:{...rejected,restartJobId:restarted.jobId,restartStatus:restartedTerminal.status}, delete: removed, atomicity };
}

async function atomicityMatrix(headers, input, validRow) {
  const validRows = await executeRows(headers, input, { operation: "create", rows: [validRow, input.invalidRow], atomicity: "valid_rows", expectedOutcome: input.entityCode === "network_relationship" ? "requested" : input.entityCode === "metadata_entity" ? "drafted" : "created", expectedRowCount: 1 });
  const allOrNothingRow = input.entityCode === "business_partner" ? { ...validRow, code: `${validRow.code}-AON` } : input.entityCode === "network_relationship" ? { ...validRow, relationship_kind: `${validRow.relationship_kind}.aon` } : { ...validRow, branch_code: `${validRow.branch_code}_aon` };
  const allOrNothing = await executeRows(headers, input, { operation: "create", rows: [allOrNothingRow, input.invalidRow], atomicity: "all_or_nothing", expectedCommitRejection: true });
  return { validRows, allOrNothing };
}

async function executeRows(headers, input, options) {
  const sessionId = crypto.randomUUID(), conflictPolicy = options.conflictPolicy ?? "reject", atomicity = options.atomicity ?? "all_or_nothing";
  await api(headers, "POST", `/${input.entityCode}/imports`, { sessionId, operation: options.operation, scopeCoordinate: input.scopeCoordinate, conflictPolicy, atomicity }, `${sessionId}:begin`);
  const bytes = Buffer.from(JSON.stringify(options.rows)), fileName = `${input.entityCode}-${sessionId}.json`;
  const reservation = await api(headers, "POST", `/imports/${sessionId}/file-upload`, { fileName, sizeBytes: bytes.byteLength });
  const upload = await context.request.put(reservation.uploadUrl, { headers: { "content-type": "application/json" }, data: bytes, failOnStatusCode: false });
  assert(upload.ok(), `${input.entityCode} ${options.operation} upload failed (${upload.status()})`);
  await api(headers, "POST", `/imports/${sessionId}/file-complete`, { fileName, sizeBytes: bytes.byteLength }, `${sessionId}:file-complete`);
  const validation = await api(headers, "POST", `/imports/${sessionId}/validate`, {}, `${sessionId}:validate`);
  assert(validation.validCount >= 1, `${input.entityCode} ${options.operation} has no valid mutation rows: ${JSON.stringify(validation.rows)}`);
  await api(headers, "POST", `/imports/${sessionId}/preview`, {}, `${sessionId}:preview`);
  if (options.expectedCommitRejection) {
    const rejected = await rawApi(headers, "POST", `/imports/${sessionId}/commit`, {}, `${sessionId}:commit`);
    assert(rejected.status === 422 && rejected.value.code === "IMPORT_ATOMICITY_REJECTED", `${input.entityCode} all-or-nothing commit was not rejected: ${rejected.status} ${JSON.stringify(rejected.value)}`);
    await api(headers, "POST", `/imports/${sessionId}/cancel`, {}, `${sessionId}:cancel`);
    return { sessionId, status: "rejected", code: rejected.value.code, validCount: validation.validCount, invalidCount: validation.invalidCount };
  }
  await api(headers, "POST", `/imports/${sessionId}/commit`, {}, `${sessionId}:commit`);
  const terminal = await pollImport(headers, sessionId, ["committed", "failed"]);
  assert(terminal.status === (options.expectedStatus ?? "committed"), `${input.entityCode} ${options.operation} reached ${terminal.status}, expected ${options.expectedStatus ?? "committed"}`);
  if (terminal.status === "committed") {
    assert(terminal.receipt?.rowCount === (options.expectedRowCount ?? options.rows.length), `${input.entityCode} ${options.operation} receipt row count is incorrect`);
    if (options.expectedOutcome) assert(terminal.receipt?.outcomeCounts?.[options.expectedOutcome] === (options.expectedRowCount ?? 1), `${input.entityCode} ${options.operation} did not record ${options.expectedOutcome}`);
  }
  return { sessionId, status: terminal.status, receipt: terminal.receipt, errorCode: terminal.errorCode };
}

async function pollImport(headers, sessionId, statuses) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = await api(headers, "GET", `/imports/${sessionId}`);
    if (statuses.includes(current.status)) return current;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Public import ${sessionId} did not reach ${statuses.join("/")}`);
}

async function pollTransfer(headers, transferId, statuses) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const transfers = await api(headers, "GET", "/transfers?limit=100");
    const current = transfers.items.find((item) => item.id === transferId);
    if (current && statuses.includes(current.status)) return current;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Public transfer ${transferId} did not reach ${statuses.join("/")}`);
}

async function api(headers, method, path, data, idempotencyKey) {
  const result = await rawApi(headers, method, path, data, idempotencyKey);
  assert(result.ok, `${method} ${path} failed (${result.status}): ${JSON.stringify(result.value)}`);
  return result.value;
}

async function rawApi(headers, method, path, data, idempotencyKey) {
  for(let attempt=0;attempt<90;attempt+=1){const response = await context.request.fetch(`${apiOrigin}/api/v1/records${path}`, { method, headers: { ...headers, accept: "application/json, application/problem+json", ...(data !== undefined ? { "content-type": "application/json" } : {}), ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) }, ...(data !== undefined ? { data } : {}), failOnStatusCode: false });
    const text = await response.text();let value;try { value = text ? JSON.parse(text) : undefined; } catch { value = { raw: text }; }
    if(response.status()!==429)return { ok: response.ok(), status: response.status(), value };
    const retryAfter=Number(response.headers()["retry-after"]??1);await new Promise(resolveDelay=>setTimeout(resolveDelay,Math.min(Math.max(Number.isFinite(retryAfter)?retryAfter:1,1),10)*1000));
  }
  throw new Error(`${method} ${path} remained rate limited for 90 attempts`);
}

function planeInput(plane) {
  if (plane === "neon") return { entityCode: "business_partner", scopeCoordinate: { operatingOrganizationId: required("ACCEPTANCE_NEON_ORGANIZATION_ID") }, validRow: { code: `REST-BP-${runId}`, name: `REST Partner ${runId}`, display_name: `REST Partner ${runId}`, partner_category: "organization", registration_country_code: "GB", status: "draft" }, invalidRow: { code: `REST-BAD-${runId}`, name: "" }, exportFields: ["code", "display_name", "status"] };
  if (plane === "mesh") return { entityCode: "network_relationship", scopeCoordinate: { networkAccountId: required("ACCEPTANCE_MESH_BUYER_ACCOUNT_ID") }, validRow: { buyer_tenant_id: tenantId, buyer_account_id: required("ACCEPTANCE_MESH_BUYER_ACCOUNT_ID"), supplier_tenant_id: required("ACCEPTANCE_MESH_SUPPLIER_TENANT_ID"), supplier_account_id: required("ACCEPTANCE_MESH_SUPPLIER_ACCOUNT_ID"), relationship_kind: `rest.${runId}` }, invalidRow: { buyer_tenant_id: tenantId, buyer_account_id: required("ACCEPTANCE_MESH_BUYER_ACCOUNT_ID"), supplier_tenant_id: "not-a-uuid", supplier_account_id: required("ACCEPTANCE_MESH_BUYER_ACCOUNT_ID") }, exportFields: ["buyer_account_id", "supplier_account_id", "status"] };
  return { entityCode: "metadata_entity", scopeCoordinate: {}, validRow: { entity_id: required("ACCEPTANCE_STUDIO_ENTITY_ID"), entity_code: "business_partner", branch_code: `rest_${runId}`, title: `REST draft ${runId}`, graph: { contractSchema: "athyper.meta-entity-contract/2.1", entity: { entityCode: "business_partner" }, runtimeProfiles: [{ profileKey: "default", backingKind: "virtual", apiExposure: "catalog_only", readMode: "none", writeMode: "none" }], fields: [{ fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } }], operations: [{ operationKey: "read", operationKind: "read", label: "Read", permissionCode: "studio.metadata.contract.view", auditEventCode: "business_partner.read", fieldKeys: ["id"] }] } }, invalidRow: { entity_id: "not-a-uuid", entity_code: "business_partner", branch_code: `invalid_${runId}`, title: "Invalid REST draft", graph: {} }, exportFields: ["entity_code", "status", "updated_at"] };
}

function required(name) { return requiredValue(process.env[name]?.trim(), name); }
function requiredValue(value, name) { if (typeof value !== "string" || !value) throw new Error(`${name} is required`); return value; }
function assert(condition, message) { if (!condition) throw new Error(message); }
