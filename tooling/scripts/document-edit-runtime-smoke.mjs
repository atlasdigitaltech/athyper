#!/usr/bin/env node

/**
 * Live smoke for document edit runtime endpoints.
 *
 * Required env:
 *   DOCUMENT_EDIT_BASE_URL=https://neon.athyper.local
 *   DOCUMENT_EDIT_ENTITY=purchase_invoice
 *   DOCUMENT_EDIT_RECORD_ID=...
 *   DOCUMENT_EDIT_PERMISSION_STAMP=...
 *
 * Optional env:
 *   DOCUMENT_EDIT_COOKIE="..."
 *   DOCUMENT_EDIT_SECTIONS=items,accounting,tax,budget
 *   DOCUMENT_EDIT_SMOKE_SUBMIT=1
 *   DOCUMENT_EDIT_SMOKE_ALLOW_PROD_SUBMIT=1
 */

const baseUrl = mustEnv("DOCUMENT_EDIT_BASE_URL").replace(/\/+$/, "");
const entity = mustEnv("DOCUMENT_EDIT_ENTITY");
const recordId = mustEnv("DOCUMENT_EDIT_RECORD_ID");
const permissionStamp = mustEnv("DOCUMENT_EDIT_PERMISSION_STAMP");
const cookie = process.env.DOCUMENT_EDIT_COOKIE ?? "";
const sections = (process.env.DOCUMENT_EDIT_SECTIONS ?? "items,accounting,tax,budget")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const shouldSubmit = process.env.DOCUMENT_EDIT_SMOKE_SUBMIT === "1";
if (shouldSubmit) assertSmokeSubmitTargetAllowed(baseUrl);

const editBase = `${baseUrl}/api/runtime/v1/entities/${encodeURIComponent(entity)}/${encodeURIComponent(recordId)}/edit`;
const headers = {
  accept: "application/json",
  "content-type": "application/json",
  "x-document-edit-permission-stamp": permissionStamp,
  ...(cookie ? { cookie } : {}),
};

const results = [];
results.push(await check("core", `${editBase}/core`, { method: "GET", headers }));
results.push(await check("sections", `${editBase}/sections`, {
  method: "POST",
  headers,
  body: JSON.stringify({ keys: sections, context: { id: recordId } }),
}));
results.push(await check("preflight", `${editBase}/preflight`, {
  method: "POST",
  headers,
  body: JSON.stringify({ sections }),
}));

if (shouldSubmit) {
  results.push(await check("submit", `${editBase}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ actionCode: entity === "purchase_invoice" ? "submit_for_approval" : "submit" }),
  }));
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
if (failed.length > 0) process.exit(1);

async function check(name, url, init) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    return {
      name,
      ok: response.ok,
      status: response.status,
      serverMs: response.headers.get("x-document-edit-server-ms"),
      elapsedMs: Date.now() - startedAt,
      error: response.ok ? undefined : body?.error ?? body?.message ?? "request_failed",
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(2);
  }
  return value;
}

function assertSmokeSubmitTargetAllowed(url) {
  if (process.env.DOCUMENT_EDIT_SMOKE_ALLOW_PROD_SUBMIT === "1") return;

  const tenantId = process.env.DOCUMENT_EDIT_TENANT_ID ?? process.env.TENANT_ID ?? "";
  if (!isProductionLikeTarget(url, tenantId)) return;

  console.error(
    "Refusing to run DOCUMENT_EDIT_SMOKE_SUBMIT against a production-like target. "
    + "Set DOCUMENT_EDIT_SMOKE_ALLOW_PROD_SUBMIT=1 only for an intentional controlled submit.",
  );
  process.exit(2);
}

function isProductionLikeTarget(url, tenantId) {
  const normalizedTenant = tenantId.trim().toLowerCase();
  if (normalizedTenant === "prod" || normalizedTenant === "production" || normalizedTenant === "live") {
    return true;
  }

  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(^|[.\-_])(prod|production|live)([.\-_]|$)/.test(host);
  } catch {
    return /(^|[.\-_])(prod|production|live)([.\-_]|$)/i.test(url);
  }
}
