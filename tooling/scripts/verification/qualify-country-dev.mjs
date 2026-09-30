/** Read-only DEV Country journey. No login bypass, publication, record writes or environment creation. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values } = parseArgs({
  options: {
    entity: { type: "string", default: "country" },
    state: {
      type: "string",
      default: "tests/e2e/.auth/dev/neon/catl.admin.json",
    },
    output: {
      type: "string",
      default: "/tmp/athyper-country-dev-qualification.json",
    },
  },
});
const entity = values.entity;
assert.ok(["country", "currency", "language"].includes(entity));
const origin = "https://neon.dev.athyper.test";
const report = {
  environment: "dev",
  origin,
  entityCode: entity,
  checkedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  scope: `Authenticated published ${entity} list/detail, search/filter/sort APIs, pagination and anonymous denial; no mutation, embedded-scope or isolated deployment qualification`,
};
const browser = await chromium.launch({ headless: true });
let stage = "session";
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: resolve(values.state),
  });
  const read = async (path) => {
    const response = await context.request.get(origin + path, {
      maxRedirects: 0,
    });
    assert.equal(response.status(), 200, `${stage}: HTTP ${response.status()}`);
    assert.match(
      response.headers()["content-type"] ?? "",
      /application\/(?:problem\+)?json/,
      `${stage}: expected JSON response`,
    );
    return response.json();
  };
  const session = await read("/api/auth/session");
  assert.equal(session.state, "authenticated", "DEV_SESSION_NOT_AUTHENTICATED");
  assert.equal(session.plane, "neon");
  assert.ok(session.tenantId && session.principalId);
  report.checks.push("authenticated DEV Neon session");
  stage = "published-descriptor";
  const descriptor = await read(
    `/api/relay/entity-runtime/${entity}/list-descriptor`,
  );
  assert.equal(descriptor.entity.code, entity);
  assert.equal(descriptor.plane, "neon");
  assert.ok(descriptor.revision.descriptorHash);
  report.descriptorHash = descriptor.revision.descriptorHash;
  report.checks.push(`published ${entity} list descriptor`);
  stage = "list";
  const first = await read(`/api/relay/entity-runtime/${entity}/list?limit=2`);
  assert.equal(first.descriptorHash, descriptor.revision.descriptorHash);
  assert.ok(
    first.rows.length > 0 && first.rows.length <= 2,
    "Country requires existing visible rows",
  );
  assert.ok(first.scopeFingerprint);
  report.checks.push(`authorized ${entity} list`);
  if (first.pagination.hasNext) {
    stage = "pagination";
    assert.ok(first.pagination.nextCursor);
    const next = await read(
      `/api/relay/entity-runtime/${entity}/list?limit=2&cursor=${encodeURIComponent(first.pagination.nextCursor)}`,
    );
    assert.equal(next.scopeFingerprint, first.scopeFingerprint);
    assert.ok(
      next.rows.every(
        (row) => !first.rows.some((previous) => previous.id === row.id),
      ),
    );
    report.checks.push(
      "cursor pagination preserves scope without duplicate rows",
    );
  } else report.checks.push("single-page dataset: no next cursor advertised");
  stage = "list-controls";
  const sample = first.rows[0];
  assert.ok(
    descriptor.surface.search.profileKey &&
      typeof sample.values.name === "string",
  );
  const searched = await read(
    `/api/relay/entity-runtime/${entity}/list?search=${encodeURIComponent(sample.values.name)}`,
  );
  assert.ok(
    searched.rows.some((row) => row.id === sample.id),
    "Search must find the visible Country",
  );
  assert.ok(
    descriptor.fields.some(
      (field) =>
        field.key === "code" &&
        field.sortable &&
        field.filterOperators.includes("eq"),
    ),
  );
  const filter = encodeURIComponent(
    JSON.stringify({
      field: "code",
      operator: "eq",
      value: sample.values.code,
    }),
  );
  const filtered = await read(
    `/api/relay/entity-runtime/${entity}/list?filter=${filter}`,
  );
  assert.ok(
    filtered.rows.length > 0 &&
      filtered.rows.every((row) => row.values.code === sample.values.code),
  );
  for (const direction of ["asc", "desc"]) {
    const sorted = await read(
      `/api/relay/entity-runtime/${entity}/list?limit=5&sort=code:${direction}`,
    );
    const codes = sorted.rows.map((row) => row.values.code);
    const expected = [...codes].sort();
    if (direction === "desc") expected.reverse();
    assert.deepEqual(codes, expected);
  }
  report.checks.push(
    "published search, equality filter and ascending/descending sort APIs",
  );
  stage = "detail";
  const id = encodeURIComponent(first.rows[0].id);
  const record = await read(
    `/api/relay/entity-runtime/${entity}/records/${id}`,
  );
  assert.equal(record.id, first.rows[0].id);
  await read(
    `/api/relay/entity-runtime/${entity}/detail-descriptor?recordId=${id}`,
  );
  report.checks.push(`authorized ${entity} record and detail descriptor`);
  stage = "browser";
  const page = await context.newPage();
  // Ordinary auth refresh is allowed; business mutations are blocked in the browser.
  await page.route("**/*", (route) => {
    const request = route.request();
    return ["GET", "HEAD", "OPTIONS"].includes(request.method()) ||
      new URL(request.url()).pathname.startsWith("/api/auth/")
      ? route.continue()
      : route.abort();
  });
  for (const path of [`/app/entity/${entity}`, `/app/entity/${entity}/${id}`]) {
    await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", {
        name: new RegExp(
          entity === "country"
            ? "countr"
            : entity === "currency"
              ? "currenc"
              : "language",
          "i",
        ),
      })
      .first()
      .waitFor({ timeout: 30000 });
    assert.equal(new URL(page.url()).pathname, path);
  }
  report.checks.push("standard Entity list/detail browser routes");
  stage = "anonymous-denial";
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  const denied = await anonymous.request.get(
    origin + `/api/relay/entity-runtime/${entity}/list`,
    { maxRedirects: 0 },
  );
  assert.ok(
    [401, 403].includes(denied.status()),
    `Anonymous response ${denied.status()}`,
  );
  report.checks.push("anonymous list access denied");
  report.passed = true;
} catch (error) {
  // Do not persist cookies, tokens, principal data, API payloads or HTML in evidence.
  report.failure = {
    stage,
    message:
      error instanceof Error
        ? error.message.split("\n")[0]
        : "Qualification failed",
  };
  process.exitCode = 1;
} finally {
  await browser.close();
  const output = resolve(values.output);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(JSON.stringify(report));
}
