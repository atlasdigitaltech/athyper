/** DEV-only qualification through the published shared Entity UI and transfer runtime.
 * Grants are temporary and limited to this probe in the authenticated tenant.
 * No activation, release, queue status or artifact content is manufactured. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { artifactDirectory } from "../artifact-paths.mjs";
const { Client } = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
)("pg");
const ExcelJS = createRequire(
  new URL(
    "../../../server/packages/services/records/package.json",
    import.meta.url,
  ),
)("exceljs");
const output = artifactDirectory("masked-browser-dev");
mkdirSync(output, { recursive: true, mode: 0o700 });
const origin = "https://neon.dev.athyper.test",
  entity = "principal_disclosure_probe";
const fixture = randomUUID(),
  code = `aaa.foundation.${fixture}`,
  canary = `Confidential-${randomUUID()}`;
const report = {
  environment: "dev",
  plane: "neon",
  startedAt: new Date().toISOString(),
  passed: false,
  source: {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    files: Object.fromEntries(
      [
        "tooling/scripts/verification/qualify-masked-browser-dev.mjs",
        "server/packages/services/records/src/entity-list-service.ts",
        "server/packages/services/records/src/published-tenant-authorizer.ts",
        "server/packages/services/records/src/transfer/export-admission.ts",
        "server/packages/services/records/src/transfer/transfer-service.ts",
        "server/packages/services/records/src/transfer/transfer-jobs.ts",
        "server/apps/platform-host/src/composition/shared/entity-runtime/read-registrations.ts",
      ].map((path) => [
        path,
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ]),
    ),
  },
  checks: [],
  exports: [],
  cleanup: false,
};
const browser = await chromium.launch({ headless: true });
let db,
  tenant,
  actor,
  role,
  seeded = false,
  stage = "session";
const added = new Map();
async function grantChange(action, only) {
  await db.query("BEGIN");
  try {
    await db.query(
      "SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [tenant, actor],
    );
    await db.query(
      "UPDATE authz.role SET status='suspended',updated_by=$2 WHERE id=$1 AND tenant_id=$3",
      [role, actor, tenant],
    );
    if (action === "add") {
      const permissions = (
        await db.query(
          "SELECT id,canonical_code FROM authz.permission WHERE canonical_code IN ('neon.foundation.principal_disclosure_probe.read','neon.foundation.principal_disclosure_probe.export') AND status='published' AND metadata->>'source'='dev:masked-export-qualification:v1'",
        )
      ).rows;
      assert.equal(permissions.length, 2);
      for (const p of permissions) {
        const incompatible = await db.query(
          "SELECT 1 FROM authz.group_role WHERE role_id=$1 AND tenant_id=$2 AND status='active' AND NOT authz.fn_internal_permission_is_assignable_at_scope($3,$2,scope_target_id,propagation_mode)",
          [role, tenant, p.id],
        );
        assert.equal(incompatible.rowCount, 0);
        const result = await db.query(
          "INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES($1,$2,$3,$4) RETURNING id",
          [tenant, role, p.id, actor],
        );
        added.set(p.canonical_code.split(".").at(-1), result.rows[0].id);
      }
    } else
      for (const [key, id] of added)
        if (!only || key === only)
          await db.query(
            "DELETE FROM authz.role_permission WHERE id=$1 AND tenant_id=$2 AND role_id=$3",
            [id, tenant, role],
          );
    await db.query(
      "UPDATE authz.role SET status='active',updated_by=$2 WHERE id=$1 AND tenant_id=$3",
      [role, actor, tenant],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    if (action === "add") added.clear();
    throw error;
  }
}
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  });
  const session = await (
    await context.request.get(origin + "/api/auth/session")
  ).json();
  assert.equal(session.state, "authenticated");
  assert.equal(session.plane, "neon");
  tenant = session.tenantId;
  const info = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(info.Config.Labels["com.docker.compose.project"], "athyper-dev");
  const env = Object.fromEntries(
    info.Config.Env.map((v) => [
      v.slice(0, v.indexOf("=")),
      v.slice(v.indexOf("=") + 1),
    ]),
  );
  const password = readFileSync(
    info.Mounts.find((m) => m.Destination === env.POSTGRES_PASSWORD_FILE)
      .Source,
    "utf8",
  ).trim();
  db = new Client({
    host: Object.values(info.NetworkSettings.Networks)[0].IPAddress,
    user: env.POSTGRES_USER,
    password,
    database: "athyper_neon",
  });
  await db.connect();
  stage = "published-activation";
  const activation = (
    await db.query(
      "SELECT h.publication_key,h.source_release_no,h.artifact_hash,a.status FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE h.publication_key='metadata.entity.principal_disclosure_probe'",
    )
  ).rows;
  assert.equal(activation.length, 1);
  assert.equal(activation[0].status, "active");
  report.activation = activation[0];
  actor = (
    await db.query(
      "SELECT id FROM master.principal WHERE tenant_id=$1 AND code='seed.three-plane-provisioner' AND status='active'",
      [tenant],
    )
  ).rows[0]?.id;
  assert.ok(actor);
  const roles = (
    await db.query(
      "SELECT id FROM authz.role WHERE tenant_id=$1 AND code='test.full_admin' AND source_ref='dev:test-full-admin:v1' AND status='active'",
      [tenant],
    )
  ).rows;
  assert.equal(roles.length, 1);
  role = roles[0].id;
  stage = "temporary-probe-grants";
  await grantChange("add");
  await db.query(
    "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES($1,$2,$3,$4,'user','active',$5)",
    [fixture, tenant, code, canary, session.principalId],
  );
  seeded = true;
  const read = async (path) => {
    const response = await context.request.get(origin + path);
    assert.equal(
      response.status(),
      200,
      `GET ${path.split("?")[0]}: ${response.status()}`,
    );
    const body = await response.json();
    assert.ok(
      !JSON.stringify(body).includes(canary),
      "Masked value disclosed by API",
    );
    return body;
  };
  stage = "descriptor";
  const descriptor = await read(
    `/api/relay/entity-runtime/${entity}/list-descriptor`,
  );
  report.descriptorHash = descriptor.revision.descriptorHash;
  assert.deepEqual(descriptor.dataOperations.export.exportableFields, ["code"]);
  assert.equal(descriptor.dataOperations.export.selected.state, "enabled");
  const name = descriptor.fields.find((f) => f.key === "name");
  assert.equal(name.sortable, false);
  assert.equal(name.filterOperators.length, 0);
  stage = "masked-read";
  const filter = encodeURIComponent(
    JSON.stringify({ field: "code", operator: "eq", value: code }),
  );
  const rows = await read(
    `/api/relay/entity-runtime/${entity}/list?filter=${filter}`,
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].id, fixture);
  assert.ok(rows.rows[0].values.name && rows.rows[0].values.name !== canary);
  const record = await read(
    `/api/relay/entity-runtime/${entity}/records/${fixture}`,
  );
  assert.equal(record.id, fixture);
  const search = await read(
    `/api/relay/entity-runtime/${entity}/list?search=${encodeURIComponent(canary)}`,
  );
  assert.ok(!search.rows.some((r) => r.id === fixture));
  for (const query of [
    "sort=name:asc",
    `filter=${encodeURIComponent(JSON.stringify({ field: "name", operator: "eq", value: canary }))}`,
  ]) {
    const r = await context.request.get(
      `${origin}/api/relay/entity-runtime/${entity}/list?${query}`,
    );
    assert.ok([400, 403].includes(r.status()));
    const problem = await r.json();
    // The problem instance echoes the caller-supplied URL, not a stored value.
    delete problem.instance;
    assert.ok(!JSON.stringify(problem).includes(canary));
  }
  report.checks.push(
    "masked list/detail responses and non-queryable masked field; permitted export discovery",
  );
  stage = "browser-list";
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  let leaked = false;
  page.on("response", async (response) => {
    if (response.url().includes("/api/relay/"))
      try {
        if ((await response.text()).includes(canary)) leaked = true;
      } catch {}
  });
  await page.goto(`${origin}/app/entity/${entity}`);
  const row = page.getByRole("row").filter({ hasText: code });
  await row.waitFor();
  assert.ok(!(await page.locator("body").innerText()).includes(canary));
  await page.screenshot({ path: join(output, "masked-list.png") });
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export format", { exact: true }).selectOption("csv");
  await page.getByLabel("Export raw codes", { exact: true }).check();
  const exporting = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith(`/records/${entity}/exports`),
  );
  await page.getByRole("button", { name: "Start export", exact: true }).click();
  const csvResponse = await exporting;
  assert.equal(csvResponse.status(), 202, await csvResponse.text());
  const csv = await csvResponse.json();
  const headers = Object.fromEntries(
    Object.entries(await csvResponse.request().allHeaders()).filter(
      ([key]) =>
        !key.startsWith(":") &&
        !["content-length", "idempotency-key"].includes(key),
    ),
  );
  const post = async (body) =>
    context.request.post(`${origin}/api/relay/records/${entity}/exports`, {
      headers: { ...headers, "idempotency-key": randomUUID() },
      data: body,
    });
  stage = "browser-detail";
  await page.goto(`${origin}/app/entity/${entity}/${fixture}`);
  await page.getByText(code, { exact: true }).first().waitFor();
  assert.ok(!(await page.locator("body").innerText()).includes(canary));
  await page.screenshot({ path: join(output, "masked-detail.png") });
  assert.equal(leaked, false);
  report.checks.push(
    "standard browser list/detail masking and UI export submission",
  );
  stage = "forbidden-projections";
  for (const fields of [
    { fields: ["name"] },
    { _transfer: { scope: "selected", format: "csv", fields: ["name"] } },
  ]) {
    const response = await post({
      filter: { recordIds: [fixture], ...fields },
    });
    assert.equal(response.status(), 403, await response.text());
  }
  report.checks.push("explicit masked export projections rejected");
  const requests = [{ format: "csv", id: csv.exportRequestId }];
  assert.ok(requests[0].id);
  for (const format of ["json", "xlsx"]) {
    const response = await post({
      filter: {
        recordIds: [fixture],
        fields: ["code"],
        _transfer: {
          scope: "selected",
          format,
          fields: ["code"],
          headings: true,
          rawCodes: true,
        },
      },
    });
    assert.equal(response.status(), 202, await response.text());
    requests.push({ format, id: (await response.json()).exportRequestId });
  }
  for (const request of requests) {
    stage = `worker-${request.format}`;
    let transfer;
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await read("/api/relay/records/transfers");
      transfer = result.items.find((item) => item.id === request.id);
      if (transfer?.status === "completed") break;
      assert.ok(
        !["failed", "cancelled"].includes(transfer?.status),
        `Transfer ${transfer?.status}: ${transfer?.errorCode}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(transfer?.status, "completed");
    const download = await read(
      `/api/relay/records/exports/${request.id}/download`,
    );
    const response = await context.request.get(download.url);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    if (request.format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      const data = workbook.getWorksheet("Data") ?? workbook.worksheets[0];
      const values = [];
      data.eachRow((row) => values.push(row.values.slice(1)));
      assert.deepEqual(values, [["code"], [code]]);
      assert.ok(!JSON.stringify(workbook.model).includes(canary));
    } else {
      const text = bytes.toString("utf8");
      assert.ok(text.includes(code));
      assert.ok(!text.includes(canary));
      if (request.format === "json") {
        const parsed = JSON.parse(text);
        const records = Array.isArray(parsed)
          ? parsed
          : (parsed.records ?? parsed.rows);
        assert.deepEqual(records, [{ code }]);
      } else
        assert.deepEqual(
          text
            .trim()
            .split(/\r?\n/)
            .map((s) => s.replaceAll('"', "")),
          ["code", code],
        );
    }
    report.exports.push({
      format: request.format,
      id: request.id,
      rows: transfer.rowCount,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  report.checks.push(
    "real queued CSV/JSON/XLSX artifacts contain only the permitted fixture code",
  );
  stage = "authorization-revocation";
  await grantChange("remove", "export");
  const revoked = await context.request.get(
    `${origin}/api/relay/records/exports/${requests[0].id}/download`,
  );
  assert.equal(revoked.status(), 403);
  const denied = await post({
    filter: { recordIds: [fixture], fields: ["code"] },
  });
  assert.equal(denied.status(), 403);
  report.checks.push(
    "same-session permission revocation denies fresh exports and artifact URL issuance",
  );
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  const response = await anonymous.request.get(
    `${origin}/api/relay/entity-runtime/${entity}/list`,
    { maxRedirects: 0 },
  );
  assert.ok([401, 403].includes(response.status()));
  await anonymous.close();
  report.checks.push("anonymous read denied");
  report.passed = true;
} catch (error) {
  report.failure = { stage, message: error.message };
  process.exitCode = 1;
} finally {
  try {
    if (db) {
      if (added.size) await grantChange("remove");
      if (seeded)
        await db.query(
          "DELETE FROM master.principal WHERE id=$1 AND tenant_id=$2",
          [fixture, tenant],
        );
      report.cleanup = true;
      await db.end();
    }
  } catch (error) {
    report.cleanupFailure = error.message;
    report.passed = false;
    process.exitCode = 1;
  }
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
  console.log(`Evidence: ${join(output, "summary.json")}`);
}
