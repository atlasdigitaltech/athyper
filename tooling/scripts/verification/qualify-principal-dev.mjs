/** Authenticated DEV pilot. Creates only a uniquely named disposable principal;
 * all profile writes use the normal UI/BFF. Cleanup never touches other rows. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { artifactDirectory } from "../artifact-paths.mjs";
const { Client } = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
)("pg");
const origin = "https://neon.dev.athyper.test";
const notification = process.argv.includes("--notification");
const pilot = notification
  ? "principal_notification_preference"
  : "principal_profile";
const field = notification ? "event_code" : "given_name";
const label = notification ? /^Event/ : "Given name";
const initialValue = notification ? "foundation.initial" : "Foundation First";
const updatedValue = notification ? "foundation.updated" : "Foundation Updated";
const output = artifactDirectory(
  notification ? "notification-write-journey" : "principal-write-journey",
);
mkdirSync(output, { recursive: true });
const fixture = randomUUID(),
  code = `foundation.${fixture}`;
const report = {
  environment: "dev",
  plane: "neon",
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  cleanup: false,
};
const browser = await chromium.launch({ headless: true });
let database,
  page,
  tenantId,
  seeded = false,
  stage = "session";
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  });
  const response = await context.request.get(`${origin}/api/auth/session`);
  const session = await response.json();
  assert.equal(session.state, "authenticated", "DEV_SESSION_NOT_AUTHENTICATED");
  assert.equal(session.plane, "neon");
  tenantId = session.tenantId;
  assert.ok(tenantId && session.principalId);
  report.source = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    files: Object.fromEntries(
      [
        "server/packages/services/records/src/entity-list-service.ts",
        "server/packages/services/records/src/entity-list-routes.ts",
        "packages/platform/entity/runtime/descriptor-client/src/index.ts",
        "packages/platform/entity/runtime/form-detail/src/entity-form-runtime.tsx",
      ].map((path) => [
        path,
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ]),
    ),
  };
  report.descriptors = {};
  for (const entity of [
    "principal",
    "principal_profile",
    "principal_notification_preference",
  ]) {
    const response = await context.request.get(
      `${origin}/api/relay/entity-runtime/${entity}/list-descriptor`,
    );
    assert.equal(response.status(), 200);
    report.descriptors[entity] = (await response.json()).revision;
  }
  stage = "fixture";
  const info = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(info.Config.Labels["com.docker.compose.project"], "athyper-dev");
  const env = Object.fromEntries(
    info.Config.Env.map((value) => [
      value.slice(0, value.indexOf("=")),
      value.slice(value.indexOf("=") + 1),
    ]),
  );
  const password = readFileSync(
    info.Mounts.find(
      (mount) => mount.Destination === env.POSTGRES_PASSWORD_FILE,
    ).Source,
    "utf8",
  ).trim();
  database = new Client({
    host: Object.values(info.NetworkSettings.Networks)[0].IPAddress,
    database: "athyper_neon",
    user: env.POSTGRES_USER,
    password,
  });
  await database.connect();
  await database.query(
    "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES($1,$2,$3,'Foundation Qualification','user','active',$4)",
    [fixture, tenantId, code, session.principalId],
  );
  seeded = true;
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  report.failedRequests = [];
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.failedRequests.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
  stage = "parent-and-create-form";
  await page.goto(`${origin}/app/entity/principal/${fixture}`);
  await page
    .getByRole("tab", {
      name: notification ? "Notifications" : "Profile",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel(label, { exact: true }).fill(initialValue);
  if (notification) {
    await page.getByLabel(/^Channel/).selectOption("email");
    await page.getByLabel(/^Status/).selectOption("active");
  }
  stage = "browser-create";
  const creating = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/relay/records/${pilot}`),
  );
  await page
    .getByRole("button", {
      name: notification ? /Create.*Notification/i : "Create Principal Profile",
      exact: true,
    })
    .click();
  const createdResponse = await creating;
  const created = await createdResponse.json();
  assert.equal(
    createdResponse.status(),
    201,
    `CREATE_FAILED:${created.kind ?? created.code}`,
  );
  assert.equal(created.kind, "Committed");
  assert.equal(created.version, 1);
  report.checks.push(`browser parent-scoped ${pilot} create`);
  const recordId = created.recordId;
  const stored = await database.query(
    `SELECT principal_id,tenant_id,${field} AS value FROM master.${pilot} WHERE id=$1`,
    [recordId],
  );
  assert.equal(stored.rows[0].principal_id, fixture);
  assert.equal(stored.rows[0].tenant_id, tenantId);
  assert.equal(stored.rows[0].value, initialValue);
  report.checks.push("server-derived immutable parent and tenant");
  // Browser request retains the real CSRF/session flow. Never log its headers.
  const replayRequest = createdResponse.request();
  const requestHeaders = async (request) =>
    Object.fromEntries(
      Object.entries(await request.allHeaders()).filter(
        ([name]) => !name.startsWith(":") && name !== "content-length",
      ),
    );
  stage = "idempotency-replay";
  const replay = await context.request.fetch(replayRequest.url(), {
    method: "POST",
    headers: await requestHeaders(replayRequest),
    data: replayRequest.postData(),
  });
  assert.equal(replay.status(), 200);
  assert.equal((await replay.json()).replayed, true);
  report.checks.push("create idempotency replay");
  stage = "browser-update";
  if (notification) await page.getByText(initialValue, { exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(label, { exact: true }).fill(updatedValue);
  const patching = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(`/api/relay/records/${pilot}/${recordId}`),
  );
  await page.getByRole("button", { name: /save/i }).last().click();
  const updatedResponse = await patching;
  const updated = await updatedResponse.json();
  assert.equal(
    updatedResponse.status(),
    200,
    `UPDATE_FAILED:${updated.kind ?? updated.code}`,
  );
  assert.equal(updated.kind, "Committed");
  assert.equal(updated.version, 2);
  report.checks.push(`browser ${pilot} update and optimistic version`);
  const headers = {
    ...(await requestHeaders(updatedResponse.request())),
    "idempotency-key": randomUUID(),
    "if-match": "1",
  };
  delete headers["content-length"];
  stage = "stale-and-protected-writes";
  const stale = await context.request.patch(updatedResponse.url(), {
    headers,
    data: { [field]: "must.not.persist" },
  });
  assert.equal(stale.status(), 409);
  assert.equal((await stale.json()).code, "RECORD_VERSION_CONFLICT");
  const immutable = await context.request.patch(updatedResponse.url(), {
    headers: { ...headers, "idempotency-key": randomUUID(), "if-match": "2" },
    data: { principal_id: session.principalId },
  });
  assert.ok(
    [403, 422].includes(immutable.status()),
    `IMMUTABLE_WRITE:${immutable.status()}`,
  );
  const invalid = await context.request.patch(updatedResponse.url(), {
    headers: { ...headers, "idempotency-key": randomUUID(), "if-match": "2" },
    data: { [field]: "x".repeat(129) },
  });
  assert.ok(
    [400, 422].includes(invalid.status()),
    `INVALID_WRITE:${invalid.status()}`,
  );
  const final = await database.query(
    `SELECT ${field} AS value,principal_id,record_version FROM master.${pilot} WHERE id=$1`,
    [recordId],
  );
  assert.equal(final.rows[0].value, updatedValue);
  assert.equal(final.rows[0].principal_id, fixture);
  assert.equal(Number(final.rows[0].record_version), 2);
  report.checks.push(
    "stale version, immutable owner and invalid field writes rejected",
  );
  await page.screenshot({ path: join(output, `${pilot}.png`), fullPage: true });
  report.passed = true;
} catch (error) {
  report.failure = { stage, message: error.message };
  if (page) {
    report.visibleButtons = await page.getByRole("button").allTextContents();
    await page.screenshot({
      path: join(output, "failure.png"),
      fullPage: true,
    });
  }

  process.exitCode = 1;
} finally {
  if (database) {
    try {
      if (seeded) {
        await database.query("BEGIN");
        await database.query(
          "DELETE FROM master.principal_profile WHERE tenant_id=$1 AND principal_id=$2",
          [tenantId, fixture],
        );
        await database.query(
          "DELETE FROM master.principal_notification_preference WHERE tenant_id=$1 AND principal_id=$2",
          [tenantId, fixture],
        );
        const removed = await database.query(
          "DELETE FROM master.principal WHERE tenant_id=$1 AND id=$2 AND code=$3",
          [tenantId, fixture, code],
        );
        assert.equal(removed.rowCount, 1);
        await database.query("COMMIT");
      }
      report.cleanup = true;
    } catch (error) {
      await database.query("ROLLBACK");
      report.passed = false;
      report.cleanupFailure = error.message;
      report.fixtureId = fixture;
      process.exitCode = 1;
    } finally {
      await database.end();
    }
  }
  await browser.close();
  report.completedAt = new Date().toISOString();
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  console.log(`Evidence: ${join(output, "summary.json")}`);
}
