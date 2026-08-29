import { chromium, firefox } from "@playwright/test";
import ExcelJS from "exceljs";
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
const meshSupplierTenantId = required("ACCEPTANCE_MESH_SUPPLIER_TENANT_ID");
const evidencePath = resolve(process.env.ACCEPTANCE_EVIDENCE_PATH?.trim() || "tests/e2e/.playwright-output/governed-import-smoke.json");
const origins = {
  neon: process.env.PLAYWRIGHT_NEON_BASE_URL || "https://neon.dev.athyper.test",
  mesh: process.env.PLAYWRIGHT_MESH_BASE_URL || "https://mesh.dev.athyper.test",
  studio: process.env.PLAYWRIGHT_STUDIO_BASE_URL || "https://studio.dev.athyper.test",
};
const identityOrigin = process.env.KEYCLOAK_BASE_URL || "https://iam.dev.athyper.test";
const allowStudioSsoBypass = process.env.ACCEPTANCE_ALLOW_STUDIO_SSO_BYPASS === "true";
const requireWebPush = process.env.ACCEPTANCE_REQUIRE_WEB_PUSH === "true";
const acceptancePlanes = (process.env.ACCEPTANCE_PLANES || "neon,mesh,studio")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value === "neon" || value === "mesh" || value === "studio");
assert(acceptancePlanes.length > 0, "ACCEPTANCE_PLANES must contain neon, mesh, or studio");

const browserName = process.env.ACCEPTANCE_BROWSER?.trim() || "chromium";
assert(browserName === "chromium" || browserName === "firefox", "ACCEPTANCE_BROWSER must be chromium or firefox");
const browser = browserName === "firefox"
  ? await firefox.launch()
  : await chromium.launch({ args: ["--ignore-certificate-errors"] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
const page = await context.newPage();
const evidence = { runId, tenantCode, username, startedAt: new Date().toISOString(), planes: {} };
let keycloakAdminAccessToken;

try {
  keycloakAdminAccessToken = await impersonate(context);
  for (const plane of acceptancePlanes) {
    process.stdout.write(`[acceptance] authenticating ${plane}\n`);
    await authenticatePlane(page, plane);
    let pushEnrollment;
    try {
      pushEnrollment = await enrollBrowserPush(page, plane);
    } catch (error) {
      if (requireWebPush) throw error;
      pushEnrollment = {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        acceptanceGate: "ACCEPTANCE_REQUIRE_WEB_PUSH",
      };
      process.stdout.write(`[acceptance] ${plane} push enrollment unavailable: ${pushEnrollment.reason}\n`);
    }
    process.stdout.write(`[acceptance] exercising ${plane}\n`);
    const input = planeInput(plane);
    const successful = [];
    for (const format of input.formats) successful.push(await executeStructuredFileImport(page,input.entityCode,input.scopeCoordinate,variantRow(input.validRow,format),format,true));
    const rejected = await executeStructuredFileImport(page,input.entityCode,input.scopeCoordinate,input.invalidRow,input.rejectedFormat,false);
    const exports=[];
    for(const format of ["xlsx","csv","json","ndjson"])exports.push(await executeExport(page,input.entityCode,input.scopeCoordinate,input.exportFields,format));
    await page.goto(`${origins[plane]}/operations/data-transfers`);
    await page.getByRole("heading", { name: "Imports and exports" }).waitFor();
    await page.locator("tbody tr").first().waitFor();
    const workspaceText = await page.locator(".a-transfer-workspace").innerText();
    assert(workspaceText.toLowerCase().includes(input.entityCode.replaceAll("_", " ")), `${plane} workspace did not render ${input.entityCode}`);
    assert(workspaceText.toLowerCase().includes("error report"), `${plane} workspace did not expose the rejected import error report`);
    evidence.planes[plane] = {
      entityCode: input.entityCode,
      publishedFormats: input.formats,
      successful,
      rejected,
      exports,
      pushEnrollment,
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
  return accessToken;
}

async function authenticatePlane(activePage, plane) {
  const origin = origins[plane];
  const restoreStudioFlow = plane === "studio" && allowStudioSsoBypass
    ? await temporarilyUseStudioSsoFlow()
    : undefined;
  try {
    await activePage.goto(`${origin}/api/auth/login?returnTo=${encodeURIComponent("/operations/data-transfers")}`);
    try {
      await activePage.waitForURL((url) => url.origin === origin, { timeout: 30_000 });
    } catch (error) {
      const bodyText = (await activePage.locator("body").innerText().catch(() => "")).replaceAll(/\s+/g, " ").trim().slice(0, 500);
      throw new Error(`${plane} authentication did not return to ${origin}; current URL is ${activePage.url()}; page says: ${bodyText}`, { cause: error });
    }
  } finally {
    if (restoreStudioFlow) await restoreStudioFlow();
  }
  let session = await browserJson(activePage, "GET", "/api/auth/session");
  if (session.state === "context_required" || session.tenantId !== tenantId) {
    const available = await browserJson(activePage, "GET", "/api/auth/contexts");
    const selected = available.contexts?.find((candidate) => candidate.tenantCode === tenantCode || candidate.tenantId === tenantId);
    assert(selected?.tenantId === tenantId, `${plane} did not expose the ${tenantCode} context`);
    await browserJson(activePage, "POST", "/api/auth/session/context", { tenantId });
    session = await browserJson(activePage, "GET", "/api/auth/session");
  }
  assert(session.tenantId === tenantId, `${plane} could not activate the ${tenantCode} context`);
  await activePage.goto(`${origin}/operations/data-transfers`);
  await activePage.getByRole("heading", { name: "Imports and exports" }).waitFor();
}

async function temporarilyUseStudioSsoFlow() {
  assert(keycloakAdminAccessToken, "Keycloak admin token is unavailable for the Studio test flow override");
  process.stdout.write("[acceptance] temporarily enabling Studio SSO for the impersonated smoke identity\n");
  const headers = { authorization: `Bearer ${keycloakAdminAccessToken}` };
  const clientsResponse = await context.request.get(`${identityOrigin}/admin/realms/athyper/clients`, {
    headers,
    params: { clientId: "studio-web" },
  });
  assert(clientsResponse.ok(), `Studio client lookup failed: ${clientsResponse.status()}`);
  const clients = await clientsResponse.json();
  assert(Array.isArray(clients) && clients.length === 1 && typeof clients[0]?.id === "string", "Expected exactly one Studio client");
  const client = clients[0];
  const flowsResponse = await context.request.get(`${identityOrigin}/admin/realms/athyper/authentication/flows`, { headers });
  assert(flowsResponse.ok(), `Keycloak flow lookup failed: ${flowsResponse.status()}`);
  const flows = await flowsResponse.json();
  const ssoFlow = flows.find((flow) => flow.alias === "athyper-user-plane-browser");
  assert(typeof ssoFlow?.id === "string", "Keycloak user-plane browser flow is unavailable");
  const originalOverrides = { ...(client.authenticationFlowBindingOverrides || {}) };
  const updateResponse = await context.request.put(`${identityOrigin}/admin/realms/athyper/clients/${encodeURIComponent(client.id)}`, {
    headers: { ...headers, "content-type": "application/json" },
    data: {
      ...client,
      authenticationFlowBindingOverrides: { ...originalOverrides, browser: ssoFlow.id },
    },
  });
  assert(updateResponse.ok(), `Studio SSO test flow update failed: ${updateResponse.status()}`);
  return async () => {
    const restoreResponse = await context.request.put(`${identityOrigin}/admin/realms/athyper/clients/${encodeURIComponent(client.id)}`, {
      headers: { ...headers, "content-type": "application/json" },
      data: { ...client, authenticationFlowBindingOverrides: originalOverrides },
    });
    assert(restoreResponse.ok(), `Studio browser flow restoration failed: ${restoreResponse.status()}`);
    const verificationResponse = await context.request.get(`${identityOrigin}/admin/realms/athyper/clients/${encodeURIComponent(client.id)}`, { headers });
    assert(verificationResponse.ok(), `Studio browser flow restoration verification failed: ${verificationResponse.status()}`);
    const restoredClient = await verificationResponse.json();
    assert(JSON.stringify(restoredClient.authenticationFlowBindingOverrides || {}) === JSON.stringify(originalOverrides), "Studio browser flow restoration did not preserve the mandatory MFA binding");
    process.stdout.write("[acceptance] restored Studio mandatory MFA browser flow\n");
  };
}

async function executeImport(activePage, entityCode, scopeCoordinate, row, commit, format) {
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
    const preview = await relayJson(activePage, "POST", `${prefix}/imports/${sessionId}/preview`, {}, `${sessionId}:preview`);
    assert(preview.validCount === 1 && preview.invalidCount === 0, `${entityCode} preview did not preserve the valid result`);
    const queued = await relayJson(activePage, "POST", `${prefix}/imports/${sessionId}/commit`, {}, `${sessionId}:commit`);
    assert(queued.status === "queued", `${entityCode} commit was not queued`);
    const receipt = await pollTransfer(activePage, sessionId, ["committed", "failed"]);
    assert(receipt.status === "committed", `${entityCode} import worker failed with status ${receipt.status}`);
    return { sessionId, format, jobId: queued.jobId, validation, preview, receipt };
  }
  assert(validation.validCount === 0 && validation.invalidCount === 1, `${entityCode} invalid row unexpectedly validated`);
  const report = await relayJson(activePage, "GET", `${prefix}/imports/${sessionId}/error-report`);
  assert(typeof report.url === "string" && report.url, `${entityCode} error report URL was absent`);
  const download = await context.request.get(report.url, { failOnStatusCode: false });
  assert(download.ok(), `${entityCode} error report download failed: ${download.status()}`);
  const reportText = await download.text();
  assert(reportText.includes("IMPORT_") || reportText.includes("MESH_"), `${entityCode} error report did not contain governed validation evidence`);
  const receipt = await pollTransfer(activePage, sessionId, ["validated"]);
  return { sessionId, format, validation, receipt, errorReport: { downloaded: true, bytes: Buffer.byteLength(reportText) } };
}

async function executeStructuredFileImport(activePage, entityCode, scopeCoordinate, row,format,commit) {
  const sessionId = crypto.randomUUID(),prefix = "/api/relay/records";
  await relayJson(activePage,"POST",`${prefix}/${entityCode}/imports`,{sessionId,operation:"create",scopeCoordinate,conflictPolicy:"reject",atomicity:"all_or_nothing"},`${sessionId}:begin`);
  const {bytes,contentType}=await structuredFile(row,format),fileName=`${entityCode}-${runId}-${sessionId}.${format}`;
  const reservation=await relayJson(activePage,"POST",`${prefix}/imports/${sessionId}/file-upload`,{fileName,sizeBytes:bytes.byteLength});
  const uploaded=await context.request.put(reservation.uploadUrl,{headers:{"content-type":contentType},data:bytes,failOnStatusCode:false});
  assert(uploaded.ok(),`${entityCode} ${format} upload failed: ${uploaded.status()}`);
  await relayJson(activePage,"POST",`${prefix}/imports/${sessionId}/file-complete`,{fileName,sizeBytes:bytes.byteLength},`${sessionId}:file-complete`);
  const validation=await relayJson(activePage,"POST",`${prefix}/imports/${sessionId}/validate`,{},`${sessionId}:validate`);
  if(!commit){assert(validation.validCount===0&&validation.invalidCount===1,`${entityCode} invalid ${format} row unexpectedly validated`);const report=await relayJson(activePage,"GET",`${prefix}/imports/${sessionId}/error-report`),download=await context.request.get(report.url,{failOnStatusCode:false});assert(download.ok(),`${entityCode} error report download failed: ${download.status()}`);const reportText=await download.text();return{sessionId,format,validation,receipt:await pollTransfer(activePage,sessionId,["validated"]),errorReport:{downloaded:true,bytes:Buffer.byteLength(reportText)}};}
  assert(validation.validCount===1&&validation.invalidCount===0,`${entityCode} ${format} row was rejected: ${JSON.stringify(validation.rows)}`);
  const preview=await relayJson(activePage,"POST",`${prefix}/imports/${sessionId}/preview`,{},`${sessionId}:preview`),queued=await relayJson(activePage,"POST",`${prefix}/imports/${sessionId}/commit`,{},`${sessionId}:commit`),receipt=await pollTransfer(activePage,sessionId,["committed","failed"]);
  assert(receipt.status==="committed",`${entityCode} ${format} worker failed with status ${receipt.status}`);
  return{sessionId,format,jobId:queued.jobId,validation,preview,receipt,upload:{bytes:bytes.byteLength,malwareScanRequired:true,serverParsed:true}};
}

async function executeExport(activePage,entityCode,scopeCoordinate,fields,format){const requestId=crypto.randomUUID(),prefix="/api/relay/records",queued=await relayJson(activePage,"POST",`${prefix}/${entityCode}/exports`,{requestId,filter:{scopeCoordinate,_transfer:{scope:"filtered",format,fields,headings:true,rawCodes:true,isoDates:true,informationSheet:format!=="csv",fileName:`${entityCode}-${runId}-${format}`,activeViewName:"Acceptance view"}}},`${requestId}:request`);assert(queued.status==="queued",`${entityCode} ${format} export was not queued`);const receipt=await pollTransfer(activePage,requestId,["completed","failed"]);assert(receipt.status==="completed",`${entityCode} ${format} export failed with ${receipt.errorCode??receipt.status}`);const download=await relayJson(activePage,"GET",`${prefix}/exports/${requestId}/download`),response=await context.request.get(download.url,{failOnStatusCode:false});assert(response.ok(),`${entityCode} ${format} export download failed: ${response.status()}`);const bytes=Buffer.from(await response.body());if(format==="xlsx")assert(bytes.readUInt32LE(0)===0x04034b50,`${entityCode} XLSX export signature is invalid`);else if(format==="csv")assert(bytes.toString("utf8").includes(fields[0]),`${entityCode} CSV export header is absent`);else if(format==="json"){const value=JSON.parse(bytes.toString("utf8"));assert(Array.isArray(value.records)&&value.exportInformation?.entityCode===entityCode,`${entityCode} JSON export information is absent`);}else{const lines=bytes.toString("utf8").trim().split("\n").map(line=>JSON.parse(line));assert(lines[0]?._exportInformation?.entityCode===entityCode,`${entityCode} NDJSON export information is absent`);}return{exportRequestId:requestId,format,rowCount:receipt.rowCount,downloaded:true,bytes:bytes.byteLength,receipt};}

function workbookCell(value){return value&&typeof value==="object"?JSON.stringify(value):value;}
async function structuredFile(row,format){if(format==="xlsx"){const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Data"),fields=Object.keys(row);sheet.addRow(fields);sheet.addRow(fields.map(field=>workbookCell(row[field])));return{bytes:Buffer.from(await workbook.xlsx.writeBuffer()),contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};}if(format==="json")return{bytes:Buffer.from(JSON.stringify([row])),contentType:"application/json"};const fields=Object.keys(row),escape=value=>{const text=typeof value==="object"&&value!==null?JSON.stringify(value):String(value??"");return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;};return{bytes:Buffer.from(`${fields.map(escape).join(",")}\r\n${fields.map(field=>escape(row[field])).join(",")}\r\n`),contentType:"text/csv"};}
function variantRow(row,format){const result=structuredClone(row),suffix=format.toUpperCase();if(typeof result.code==="string")result.code=`${result.code}-${suffix}`;if(typeof result.name==="string")result.name=`${result.name} ${suffix}`;if(typeof result.display_name==="string")result.display_name=`${result.display_name} ${suffix}`;if(typeof result.relationship_kind==="string")result.relationship_kind=`${result.relationship_kind}.${format}`;if(typeof result.branch_code==="string")result.branch_code=`${result.branch_code}_${format}`;if(typeof result.title==="string")result.title=`${result.title} ${suffix}`;return result;}

async function enrollBrowserPush(activePage,plane){await context.grantPermissions(["notifications"],{origin:origins[plane]});return activePage.evaluate(async()=>{const configurationResponse=await fetch("/api/relay/notifications/push-configuration",{credentials:"same-origin"}),configuration=await configurationResponse.json();if(!configurationResponse.ok||!configuration.webPush?.available||!configuration.webPush.publicKey)throw new Error("Web Push configuration is unavailable");const decode=value=>{const normalized=value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"="),raw=atob(normalized),bytes=new Uint8Array(raw.length);for(let index=0;index<raw.length;index+=1)bytes[index]=raw.charCodeAt(index);return bytes;};const registration=await navigator.serviceWorker.register("/notification-sw.js",{scope:"/"}),subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(configuration.webPush.publicKey)}),serialized=subscription.toJSON(),csrf=document.cookie.split(";").map(part=>part.trim()).find(part=>part.startsWith("__Host-athyper-csrf=")||part.startsWith("athyper-csrf="))?.split("=").slice(1).join("=");const response=await fetch("/api/relay/notifications/push-subscriptions",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",...(csrf?{"x-csrf-token":decodeURIComponent(csrf)}:{})},body:JSON.stringify({platform:"web",deviceId:`acceptance-${plane}`,endpoint:subscription.endpoint,p256dhKey:serialized.keys?.p256dh,authKey:serialized.keys?.auth})});if(!response.ok)throw new Error(`Push subscription failed (${response.status})`);const record=await response.json();return{available:true,subscriptionId:record.id,endpointOrigin:new URL(subscription.endpoint).origin};});}

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
    validRow: { code: `ACC-BP-${runId}`, name: `Acceptance Partner ${runId}`, display_name: `Acceptance Partner ${runId}`, partner_category: "organization", registration_country_code: "GB", status: "draft" },
    invalidRow: { code: `ACC-BAD-${runId}`, name: "" },
    formats: ["xlsx", "csv", "json"], rejectedFormat: "csv",
    exportFields:["code","display_name","status"],
  };
  if (plane === "mesh") return {
    entityCode: "network_relationship",
    scopeCoordinate: { networkAccountId: meshBuyerAccountId },
    validRow: { buyer_tenant_id: tenantId, buyer_account_id: meshBuyerAccountId, supplier_tenant_id: meshSupplierTenantId, supplier_account_id: meshSupplierAccountId, relationship_kind: `acceptance.${runId}` },
    invalidRow: { buyer_tenant_id: tenantId, buyer_account_id: meshBuyerAccountId, supplier_tenant_id: "not-a-uuid", supplier_account_id: meshBuyerAccountId },
    formats: ["xlsx", "csv", "json"], rejectedFormat: "json",
    exportFields:["buyer_account_id","supplier_account_id","status"],
  };
  return {
    entityCode: "metadata_entity",
    scopeCoordinate: {},
    validRow: { entity_id: studioEntityId, entity_code: "business_partner", branch_code: `acceptance_${runId}`, title: `Acceptance draft ${runId}`, graph: { contractSchema: "athyper.meta-entity-contract/2.1", entity: { entityCode: "business_partner" }, runtimeProfiles: [{ profileKey: "default", backingKind: "virtual", apiExposure: "catalog_only", readMode: "none", writeMode: "none" }], fields: [{ fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } }], operations: [{ operationKey: "read", operationKind: "read", label: "Read", permissionCode: "studio.metadata.contract.view", auditEventCode: "business_partner.read", fieldKeys: ["id"] }] } },
    invalidRow: { entity_id: "not-a-uuid", entity_code: "business_partner", branch_code: `invalid_${runId}`, title: "Invalid acceptance draft", graph: {} },
    formats: ["xlsx","csv","json"], rejectedFormat: "csv",
    exportFields:["entity_code","status","updated_at"],
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
