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
import {
  startAtlasQualificationAttempt,
  finishAtlasQualificationAttempt,
} from "./atlas-qualification-attempt.mjs";
const { Client } = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
)("pg");
const plane =
  process.argv.find((arg) => arg.startsWith("--plane="))?.slice(8) ?? "neon";
assert.ok(["neon", "studio", "mesh"].includes(plane));
const origin = `https://${plane}.dev.athyper.test`;
const notification = process.argv.includes("--notification");
const uiProfile = process.argv.includes("--ui-profile");
const self = process.argv.includes("--self");
const atlas = process.argv.includes("--atlas");
assert.ok(
  !atlas || notification,
  "Embedded Atlas qualification requires the Notification list",
);
const actor = self ? "catl.finance" : "catl.admin";
assert.ok(
  !self || (plane === "neon" && notification),
  "Self pilot is limited to a disposable Neon notification preference",
);
assert.ok(!(notification && uiProfile));
const pilot = uiProfile
  ? "principal_ui_profile"
  : notification
    ? "principal_notification_preference"
    : "principal_profile";
const field = uiProfile
  ? "date_format"
  : notification
    ? "event_code"
    : "given_name";
const label = uiProfile
  ? "Date format"
  : notification
    ? /^Event/
    : "Given name";
const marker = randomUUID();
const initialValue = uiProfile
  ? "yyyy-MM-dd"
  : notification
    ? `foundation.initial.${marker}`
    : "Foundation First";
const updatedValue = uiProfile
  ? "dd/MM/yyyy"
  : notification
    ? `foundation.updated.${marker}`
    : "Foundation Updated";
const secondValue = `foundation.second.${marker}`;
const output = artifactDirectory(
  uiProfile
    ? "ui-profile-write-journey"
    : notification
      ? "notification-write-journey"
      : "principal-write-journey",
);
mkdirSync(output, { recursive: true });
let fixture = randomUUID();
const code = `foundation.${fixture}`;
const denialFixture = randomUUID();
let denialFixtureOwner;
let atlasAttempt;
const report = {
  environment: "dev",
  plane,
  actor,
  ownership: self ? "self" : "administrator-on-behalf",
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
    storageState: `tests/e2e/.auth/dev/${plane}/${actor}.json`,
  });
  const response = await context.request.get(`${origin}/api/auth/session`);
  const session = await response.json();
  assert.equal(session.state, "authenticated", "DEV_SESSION_NOT_AUTHENTICATED");
  assert.equal(session.plane, plane);
  tenantId = session.tenantId;
  assert.ok(tenantId && session.principalId);
  if (self) {
    assert.equal(session.principalId, "d04198ac-53cf-5e94-969f-b6f75f176fa2");
    assert.equal(tenantId, "44444444-4444-4444-8444-444444444444");
    fixture = session.principalId;
  }
  report.source = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    files: Object.fromEntries(
      [
        "server/packages/services/records/src/entity-list-service.ts",
        "server/packages/services/records/src/entity-list-routes.ts",
        "server/packages/services/records/src/records-routes.ts",
        "server/packages/services/records/src/parent-collection-scope.ts",
        "server/packages/platform/metadata/src/compiled-entity-reader.ts",
        "tooling/scripts/verification/qualify-principal-dev.mjs",
        "packages/contracts/platform/entity-runtime/src/entity-relationship.ts",
        "packages/platform/entity/runtime/form-detail/src/related-entity-section.tsx",
        "packages/platform/foundation/api-client/src/entity-list.ts",
        "packages/platform/entity/runtime/descriptor-client/src/index.ts",
        "packages/platform/entity/runtime/form-detail/src/entity-form-runtime.tsx",
      ].map((path) => [
        path,
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ]),
    ),
  };
  report.runtime = [
    "athyper-dev-source-api-1",
    "athyper-dev-source-worker-1",
  ].map((name) => {
    const container = JSON.parse(
      execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
    )[0];
    return {
      name,
      imageId: container.Image,
      startedAt: container.State.StartedAt,
      repositoryMounted: container.Mounts.some(
        (mount) =>
          mount.Source === process.cwd() && mount.Destination === process.cwd(),
      ),
    };
  });
  report.descriptors = {};
  for (const entity of [
    "principal",
    "principal_profile",
    "principal_notification_preference",
    ...(uiProfile ? ["principal_ui_profile"] : []),
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
    database: `athyper_${plane}`,
    user: env.POSTGRES_USER,
    password,
  });
  await database.connect();
  if (!self)
    await database.query(
      "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES($1,$2,$3,'Foundation Qualification','user','active',$4)",
      [fixture, tenantId, code, session.principalId],
    );
  seeded = !self;
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
      name: uiProfile
        ? "UI Profile"
        : notification
          ? "Notifications"
          : "Profile",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: /^(Add|Set up profile|Customize preferences)$/,
      exact: true,
    })
    .click();
  if (!notification) {
    const pending = await database.query(
      `SELECT count(*)::int AS count FROM master.${pilot} WHERE tenant_id=$1 AND principal_id=$2`,
      [tenantId, fixture],
    );
    assert.equal(
      pending.rows[0].count,
      0,
      "Opening setup must not insert a placeholder",
    );
    report.checks.push("opening single-record setup creates no database row");
  }
  await page.getByLabel(label, { exact: true }).fill(initialValue);
  let cancellationPrompted = false;
  page.once("dialog", async (dialog) => {
    cancellationPrompted = true;
    await dialog.dismiss();
  });
  await page
    .getByRole("button", {
      name: notification ? "Back to list" : "Cancel",
      exact: true,
    })
    .click();
  assert.ok(
    cancellationPrompted,
    "Dirty local cancellation must request confirmation",
  );
  assert.equal(
    await page.getByLabel(label, { exact: true }).inputValue(),
    initialValue,
    "Cancelled departure must preserve the draft",
  );
  report.checks.push("dirty cancellation confirmation preserves the draft");
  assert.equal(
    await page.getByLabel("Record version", { exact: true }).count(),
    0,
    "System version must not be a create input",
  );
  assert.equal(
    await page.getByLabel("Tenant", { exact: true }).count(),
    0,
    "Tenant must remain server-derived",
  );
  assert.ok(
    await page.locator("form fieldset").count(),
    "Published sections should group the create form",
  );
  if (notification) {
    await page.getByRole("combobox", { name: /^Channel/ }).click();
    await page.getByRole("option", { name: "Email", exact: true }).click();
    await page.getByRole("combobox", { name: /^Status/ }).click();
    await page.getByRole("option", { name: "Inactive", exact: true }).click();
  }
  if (uiProfile) {
    await page.getByRole("combobox", { name: "Locale", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Locale", exact: true })
      .fill("en-GB");
    await page.getByRole("option").filter({ hasText: "en-GB" }).click();
  }
  stage = "browser-create";
  const creating = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/relay/records/${pilot}`),
  );
  await page
    .getByRole("button", {
      name: uiProfile
        ? /Create.*UI Profile|Set up preferences|Customize preferences/i
        : notification
          ? /Create.*Notification|Add preference/i
          : /Create Principal Profile|Set up profile/,
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
  if (self) {
    stage = "other-user-denial";
    const other = await database.query(
      "SELECT id FROM master.principal WHERE tenant_id=$1 AND code='catl.admin'",
      [tenantId],
    );
    assert.equal(other.rowCount, 1);
    assert.notEqual(other.rows[0].id, fixture);
    denialFixtureOwner = other.rows[0].id;
    const deniedUrl = new URL(replayRequest.url());
    assert.equal(deniedUrl.searchParams.get("parentRecordId"), fixture);
    deniedUrl.searchParams.set("parentRecordId", other.rows[0].id);
    const denied = await context.request.post(deniedUrl.href, {
      headers: {
        ...(await requestHeaders(replayRequest)),
        "idempotency-key": randomUUID(),
      },
      data: replayRequest.postData(),
    });
    assert.equal(
      denied.status(),
      403,
      "Ordinary users must not create preferences under another Principal",
    );
    const unintended = await database.query(
      "SELECT count(*)::int AS count FROM master.principal_notification_preference WHERE tenant_id=$1 AND principal_id=$2 AND event_code=$3",
      [tenantId, other.rows[0].id, initialValue],
    );
    assert.equal(unintended.rows[0].count, 0);
    report.checks.push(
      "ordinary-user other-parent create denied before persistence",
    );
    await database.query(
      "INSERT INTO master.principal_notification_preference(id,tenant_id,principal_id,event_code,channel,status,created_by) VALUES($1,$2,$3,$4,'email','inactive',$3)",
      [denialFixture, tenantId, denialFixtureOwner, initialValue],
    );
    const deniedRead = await context.request.get(
      `${origin}/api/relay/entity-runtime/${pilot}/records/${denialFixture}/detail`,
    );
    assert.equal(
      deniedRead.status(),
      403,
      "Ordinary users must not read another Principal's preference",
    );
    const deniedEdit = await context.request.patch(
      `${origin}/api/relay/records/${pilot}/${denialFixture}`,
      {
        headers: {
          ...(await requestHeaders(replayRequest)),
          "idempotency-key": randomUUID(),
          "if-match": "1",
        },
        data: { event_code: updatedValue },
      },
    );
    assert.equal(
      deniedEdit.status(),
      403,
      "Ordinary users must not edit another Principal's preference",
    );
    const deniedStored = await database.query(
      "SELECT event_code,record_version FROM master.principal_notification_preference WHERE id=$1 AND tenant_id=$2",
      [denialFixture, tenantId],
    );
    assert.equal(deniedStored.rows[0].event_code, initialValue);
    assert.equal(Number(deniedStored.rows[0].record_version), 1);
    report.checks.push(
      "ordinary-user other-record read and edit denied; stored row unchanged",
    );
  }
  if (!notification) {
    const empty = await context.request.fetch(replayRequest.url(), {
      method: "POST",
      headers: {
        ...(await requestHeaders(replayRequest)),
        "idempotency-key": randomUUID(),
      },
      data: {},
    });
    assert.equal(
      empty.status(),
      422,
      "Empty setup must be rejected before persistence",
    );
    assert.equal(
      (await empty.json()).errors?.result?.code,
      "ENTITY_EMPTY_SETUP",
    );
    const duplicate = await context.request.fetch(replayRequest.url(), {
      method: "POST",
      headers: {
        ...(await requestHeaders(replayRequest)),
        "idempotency-key": randomUUID(),
      },
      data: replayRequest.postData(),
    });
    assert.equal(
      duplicate.status(),
      409,
      "Another first-time setup must conflict",
    );
    assert.equal((await duplicate.json()).code, "RECORD_ALREADY_EXISTS");
    report.checks.push(
      "empty setup rejected and duplicate setup returns reviewable conflict",
    );
  }

  if (notification) {
    stage = "nonempty-parent-list";
    const second = await context.request.post(replayRequest.url(), {
      headers: {
        ...(await requestHeaders(replayRequest)),
        "idempotency-key": randomUUID(),
      },
      data: {
        ...JSON.parse(replayRequest.postData()),
        event_code: secondValue,
      },
    });
    assert.equal(second.status(), 201);
    const secondId = (await second.json()).recordId;
    if (!self) {
      denialFixtureOwner = session.principalId;
      await database.query(
        "INSERT INTO master.principal_notification_preference(id,tenant_id,principal_id,event_code,channel,status,created_by) VALUES($1,$2,$3,$4,'email','inactive',$3)",
        [denialFixture, tenantId, denialFixtureOwner, initialValue],
      );
    }
    const scope = Object.fromEntries(new URL(replayRequest.url()).searchParams);
    assert.equal(
      scope.parentDescriptorHash,
      report.descriptors.principal.descriptorHash,
    );
    const list = async (extra = {}, override = {}) => {
      const url = new URL(`${origin}/api/relay/entity-runtime/${pilot}/list`);
      for (const [key, value] of Object.entries({
        ...scope,
        search: marker,
        countMode: "exact",
        ...extra,
        ...override,
      })) {
        for (const item of Array.isArray(value) ? value : [value])
          url.searchParams.append(key, item);
      }
      return context.request.get(url.href);
    };
    const read = async (extra = {}) => {
      const response = await list(extra);
      assert.equal(response.status(), 200, await response.text());
      return response.json();
    };
    const nonempty = await read();
    assert.equal(nonempty.pagination.total, 2);
    assert.deepEqual(
      new Set(nonempty.rows.map((row) => row.id)),
      new Set([recordId, secondId]),
    );
    assert.equal((await read({ search: initialValue })).pagination.total, 1);
    assert.deepEqual(
      (await read({ recordIds: [recordId, denialFixture] })).rows.map(
        (row) => row.id,
      ),
      [recordId],
    );
    const grouped = await list({ group: "channel" });
    assert.equal(grouped.status(), 400);
    assert.equal((await grouped.json()).code, "GROUP_FIELD_NOT_ALLOWED");
    const first = await read({ limit: "1" });
    assert.ok(first.pagination.nextCursor);
    const next = await read({
      limit: "1",
      cursor: first.pagination.nextCursor,
    });
    assert.equal(next.rows.length, 1);
    assert.notEqual(next.rows[0].id, first.rows[0].id);
    assert.equal(
      (
        await list(
          { limit: "1", cursor: first.pagination.nextCursor },
          { parentRecordId: denialFixtureOwner },
        )
      ).status(),
      self ? 403 : 400,
    );
    const staleHash =
      scope.parentDescriptorHash === "0".repeat(64)
        ? "1".repeat(64)
        : "0".repeat(64);
    assert.equal(
      (await list({}, { parentDescriptorHash: staleHash })).status(),
      403,
    );
    report.nonemptyList = {
      parentRecordId: fixture,
      scope,
      ownRecordIds: [recordId, secondId],
      deniedRecordId: denialFixture,
      total: nonempty.pagination.total,
      grouping: "not-published: rejected",
    };
    report.checks.push(
      "nonempty parent-scoped rows, exact counts, search and requested IDs exclude the other-parent sentinel; unsupported grouping rejected",
    );
    report.checks.push(
      "pagination retains parent scope; cursor substitution and stale publication pin rejected",
    );
    const exportResponse = await context.request.post(
      `${origin}/api/relay/records/${pilot}/exports`,
      {
        headers: {
          ...(await requestHeaders(replayRequest)),
          "idempotency-key": randomUUID(),
        },
        data: {
          filter: {
            scopeCoordinate: scope,
            search: marker,
            _transfer: {
              scope: "filtered",
              format: "csv",
              fields: ["event_code"],
            },
          },
        },
      },
    );
    assert.equal(
      exportResponse.status(),
      409,
      "Unpublished export must remain unavailable",
    );
    const exportCode = (await exportResponse.json()).code;
    assert.equal(exportCode, "ENTITY_OPERATION_UNAVAILABLE");
    report.export = {
      httpStatus: exportResponse.status(),
      code: exportCode,
      published: false,
    };
    report.checks.push(
      "unpublished export denied through the standard Records transfer route",
    );
    if (atlas) {
      stage = "nonempty-parent-atlas";
      atlasAttempt = startAtlasQualificationAttempt(join(output, "atlas"), {
        entityCode: "principal",
        plane,
        recordId: fixture,
      });
      await page.reload();
      await page
        .getByRole("tab", { name: "Notifications", exact: true })
        .click();
      await page.getByText(initialValue, { exact: true }).waitFor();
      await page.getByText(secondValue, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Atlas", exact: true }).click();
      const workspace = page.getByRole("dialog", {
        name: "Atlas AI workspace",
        exact: true,
      });
      await workspace.waitFor();
      await workspace
        .getByRole("button", { name: "New Atlas conversation", exact: true })
        .click();
      await workspace
        .locator('[contenteditable="true"]')
        .fill(
          `Use the published reader to find the saved notification preferences containing ${marker} in this list. Retain this Principal relationship and report only their saved event codes.`,
        );
      const pending = page.waitForResponse(
        (response) =>
          response.url().endsWith("/runs") &&
          response.request().method() === "POST",
        { timeout: 120000 },
      );
      await workspace
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      const response = await pending;
      const raw = await response.text();
      writeFileSync(join(output, "atlas", "response.txt"), raw, {
        mode: 0o600,
      });
      const input = response.request().postDataJSON();
      writeFileSync(
        join(output, "atlas", "request.json"),
        JSON.stringify(input, null, 2),
        { mode: 0o600 },
      );
      assert.equal(input.businessContext?.kind, "manage");
      assert.equal(input.businessContext?.entityCode, pilot);
      assert.deepEqual(input.businessContext?.parentScope, scope);
      const events = response.ok()
        ? raw.split(/\r?\n\r?\n/).flatMap((frame) => {
            const data = frame
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            return data ? [JSON.parse(data)] : [];
          })
        : [];
      report.atlas = {
        httpStatus: response.status(),
        completed: events.some(
          (event) => event.event?.type === "run.completed",
        ),
        failure: events.find((event) => event.event?.type === "run.failed")
          ?.event,
        toolObserved: events.some(
          (event) =>
            event.event?.type === "tool.completed" &&
            event.event.toolCode === "entity_lookup" &&
            event.event.outcome === "completed",
        ),
        ownRowCitations: events.filter(
          (event) =>
            event.event?.type === "source.cited" &&
            event.event.toolCode === "entity_lookup" &&
            event.event.coordinate?.entityCode === pilot &&
            [recordId, secondId].includes(event.event.coordinate?.recordId),
        ).length,
        passed: false,
      };
      assert.equal(response.status(), 200);
      assert.ok(
        report.atlas.completed &&
          !report.atlas.failure &&
          report.atlas.toolObserved &&
          report.atlas.ownRowCitations > 0,
        "Embedded Atlas requires a completed published reader and saved child-row citation",
      );
      report.atlas.passed = true;
      await workspace.getByRole("button", { name: /close/i }).first().click();
    }
  }

  stage = "browser-update";
  if (notification) await page.getByText(initialValue, { exact: true }).click();
  await page
    .getByRole("button", {
      name: /^(Edit|Edit profile|Edit preferences)$/,
      exact: true,
    })
    .click();
  for (const technical of [
    "Record version",
    "Record ID",
    "Principal",
    "Tenant",
    "Created",
    "Updated",
    "created_by",
    "updated_by",
  ])
    assert.equal(
      await page.getByLabel(technical, { exact: true }).count(),
      0,
      `System field must not appear in edit: ${technical}`,
    );
  report.checks.push("edit contains business fields only");
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
      if (notification && denialFixtureOwner)
        await database.query(
          "DELETE FROM master.principal_notification_preference WHERE tenant_id=$1 AND principal_id=$2 AND event_code IN ($3,$4,$5)",
          [
            tenantId,
            denialFixtureOwner,
            initialValue,
            updatedValue,
            secondValue,
          ],
        );
      if (self) {
        if (denialFixtureOwner)
          await database.query(
            "DELETE FROM master.principal_notification_preference WHERE tenant_id=$1 AND principal_id=$2 AND event_code IN ($3,$4)",
            [tenantId, denialFixtureOwner, initialValue, updatedValue],
          );
        await database.query(
          "DELETE FROM master.principal_notification_preference WHERE tenant_id=$1 AND principal_id=$2 AND event_code IN ($3,$4,$5)",
          [tenantId, fixture, initialValue, updatedValue, secondValue],
        );
        const remaining = await database.query(
          "SELECT count(*)::int AS count FROM master.principal_notification_preference WHERE tenant_id=$1 AND principal_id=$2 AND event_code IN ($3,$4,$5)",
          [tenantId, fixture, initialValue, updatedValue, secondValue],
        );
        assert.equal(remaining.rows[0].count, 0);
      }
      if (seeded) {
        await database.query("BEGIN");
        if (uiProfile)
          await database.query(
            "DELETE FROM master.principal_ui_profile WHERE tenant_id=$1 AND principal_id=$2",
            [tenantId, fixture],
          );
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
  if (atlasAttempt)
    finishAtlasQualificationAttempt(
      join(output, "atlas"),
      "report.json",
      atlasAttempt,
      { ...report, passed: report.atlas?.passed === true },
    );
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  console.log(`Evidence: ${join(output, "summary.json")}`);
}
