/** Deployed standard Entity pages and authorized key lookups; never writes reference data. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { X509Certificate, createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const out = resolve(process.argv[2]);
mkdirSync(out, { recursive: true, mode: 0o700 });
const cert = new X509Certificate(readFileSync(process.env.NODE_EXTRA_CA_CERTS));
const spki = createHash("sha256")
  .update(cert.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64");
const browser = await chromium.launch({
  args: [`--ignore-certificate-errors-spki-list=${spki}`],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1440, height: 1000 },
});
const origin = "https://neon.dev.athyper.test";
const report = {
  passed: false,
  entities: [],
  lookups: [],
  startedAt: new Date().toISOString(),
};
async function get(path, status = 200) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await context.request.get(
      origin + "/api/relay/entity-runtime/" + path,
    );
    const body = await r.json();
    if (r.status() === 429 && attempt < 2) {
      const seconds = Math.min(
        60,
        Math.max(1, Number(r.headers()["retry-after"]) || 30),
      );
      console.log(JSON.stringify({ path, rateLimitWaitSeconds: seconds }));
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    assert.equal(r.status(), status, `${path}: ${body.code ?? r.status()}`);
    return body;
  }
}
const page = await context.newPage();
try {
  assert.equal(
    (await (await context.request.get(origin + "/api/auth/session")).json())
      .state,
    "authenticated",
    "Saved normal Neon session required",
  );
  for (const entity of [
    "country",
    "currency",
    "language",
    "state_region",
    "locale",
    "timezone",
  ]) {
    const descriptor = await get(entity + "/list-descriptor");
    const status = descriptor.fields.find((field) => field.key === "status");
    assert.deepEqual(
      status.filterOptions.map((option) => [option.value, option.label]),
      [
        ["active", "Active"],
        ["deprecated", "Deprecated"],
      ],
    );
    assert.ok(!status.filterOperators.includes("contains"));
    const result = await get(
      entity +
        "/list?limit=10&sort=code:asc&filter=" +
        encodeURIComponent(
          JSON.stringify({ field: "status", operator: "eq", value: "active" }),
        ),
    );
    assert.ok(result.rows.length > 0);
    assert.ok(result.rows.every((row) => row.values.status === "active"));
    const first = result.rows[0];
    await page.goto(origin + "/app/entity/" + entity);
    await page.locator(".a-entity-list").first().waitFor({ timeout: 45000 });
    await page.getByText("Active", { exact: true }).first().waitFor();
    await page.screenshot({ path: join(out, entity + "-list.png") });
    const detail = await get(entity + "/records/" + first.id + "/detail");
    await page.goto(
      origin +
        "/app/entity/" +
        entity +
        "/" +
        first.id +
        "?section=overview&tab=overview",
    );
    await page
      .getByText("Active", { exact: true })
      .first()
      .waitFor({ timeout: 45000 });
    await page.screenshot({ path: join(out, entity + "-detail.png") });
    console.log(JSON.stringify({ entity, browserPages: "passed" }));
    await new Promise((resolve) => setTimeout(resolve, 10000));
    report.entities.push({
      entity,
      recordId: first.id,
      descriptorRevision: descriptor.revision,
      displayValues: first.displayValues ?? {},
      detailReturned: !!detail.record,
      passed: true,
    });
  }
  const countries = await get(
    "state_region/references/country_code?query=Malaysia",
  );
  assert.ok(
    countries.options.some(
      (option) => option.value === "MY" && option.label === "Malaysia",
    ),
  );
  const parents = await get(
    "state_region/references/parent_code?dependencies=" +
      encodeURIComponent(JSON.stringify({ country_code: "MY" })),
  );
  assert.ok(parents.options.length > 0);
  assert.ok(
    parents.options.every(
      (option) =>
        option.entityCode === "state_region" && option.value.startsWith("MY-"),
    ),
  );
  await get("state_region/references/parent_code", 409);
  const canonical = await get(
    "timezone/references/canonical_code?value=Etc%2FUTC",
  );
  assert.equal(canonical.options[0]?.label, "Etc/UTC");
  report.lookups.push(
    { name: "country search", passed: true },
    { name: "composite country scope", passed: true },
    { name: "missing dependency denied", passed: true },
    { name: "timezone canonical code", passed: true },
  );
  report.passed = true;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (!report.passed)
    await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  await browser.close();
}
console.log(JSON.stringify(report));
