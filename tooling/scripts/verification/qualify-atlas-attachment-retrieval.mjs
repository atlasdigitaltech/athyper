import { request, chromium } from "@playwright/test";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import assert from "node:assert/strict";
const origin = "https://neon.dev.athyper.test",
  report = { observedAt: new Date().toISOString(), checks: [] };
const base = {
  attachmentId: "fc668e33-9d67-4015-83ba-8be70dfbb2c6",
  entityCode: "business_partner",
  recordId: "f7688c3d-8c92-5651-a469-da3f4f786375",
  scopeCoordinate: {
    operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
  },
};
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
});
async function post(client, route, data) {
  const csrf = (await client.storageState()).cookies.find(
    (x) =>
      x.domain === "neon.dev.athyper.test" && x.name === "__Host-athyper-csrf",
  );
  const r = await client.post(origin + "/api/relay/atlas/knowledge/" + route, {
    headers: { origin, "x-csrf-token": decodeURIComponent(csrf.value) },
    data,
  });
  return { status: r.status(), body: await r.json() };
}
try {
  const replay = await post(c, "attachments/reindex", base);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  report.checks.push({ check: "idempotent_reindex", ...replay });
  const found = await post(c, "search", { ...base, query: "Indigo Lantern" });
  assert.equal(found.status, 200);
  assert.equal(found.body.citations.length, 1);
  assert.ok(!JSON.stringify(found.body).includes("fictional review"));
  report.checks.push({ check: "unseen_wording_locator_only", ...found });
  for (const [check, data] of [
    [
      "missing_scope",
      { ...base, scopeCoordinate: undefined, query: "Indigo Lantern" },
    ],
    [
      "unavailable_record",
      {
        ...base,
        recordId: "00000000-0000-4000-8000-000000000001",
        query: "Indigo Lantern",
      },
    ],
  ]) {
    const r = await post(c, "search", data);
    console.log(JSON.stringify({ check, ...r }));
    if (check === "missing_scope") {
      assert.equal(r.status, 200);
      assert.equal(r.body.citations.length, 1);
      report.checks.push({
        check: "published_tenant_scope_allows_no_organization_selector",
        ...r,
      });
    } else {
      assert.ok([400, 403, 404, 409].includes(r.status));
      report.checks.push({ check, ...r });
    }
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const owner = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: "tests/e2e/.auth/dev/studio/catl.owner.json",
    });
    const page = await owner.newPage();
    await page.goto(origin + "/api/auth/login?returnTo=%2Fhome", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(800);
    const s = await (
      await owner.request.get(origin + "/api/auth/session")
    ).json();
    assert.equal(s.state, "authenticated");
    assert.equal(s.principalId, "645b6a55-3355-526a-9643-3900425bde47");
    assert.equal(s.tenantId, "44444444-4444-4444-8444-444444444444");
    const denied = await post(owner.request, "search", {
      ...base,
      query: "Indigo Lantern",
    });
    assert.ok(
      denied.status === 403 ||
        (denied.status === 200 && denied.body.citations?.length === 0),
    );
    report.checks.push({
      check: "catl.owner_denied_at_atlas_admission",
      ...denied,
    });
    const path = "tests/e2e/.auth/dev/neon/catl.owner.json";
    await owner.storageState({ path });
    chmodSync(path, 0o600);
  } finally {
    await browser.close();
  }
  report.passed = true;
} finally {
  await c.dispose();
  writeFileSync(
    "docs/examples/atlas-f5/cirrus-retrieval-qualification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
