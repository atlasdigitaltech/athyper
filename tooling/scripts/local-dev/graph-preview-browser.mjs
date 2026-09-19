/** Authenticated personal DEV proof. Uses existing sessions and native Studio UI.
 * Creates a working draft; does not publish a release or change grants. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const studioOnly = process.argv.includes("--studio-only");
const root = join(homedir(), ".athyper/qualification/dev-graph-preview");
mkdirSync(root, { recursive: true, mode: 0o700 });
const receipt = {
  schema: "athyper.dev-graph-browser-proof/1",
  developmentEvidence: true,
  releaseQualified: false,
  scope: studioOnly ? "studio-only" : "studio-to-neon",
  startedAt: new Date().toISOString(),
  checks: [],
};
const output = join(root, `journey-${Date.now()}.json`);
function record(name, details = {}) {
  receipt.checks.push({ name, passed: true, ...details });
  writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
}
const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP *.dev.athyper.test 127.0.0.1"],
});
async function session(plane) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: `tests/e2e/.auth/dev/${plane}/catl.admin.json`,
  });
  const page = await context.newPage();
  await page.goto(`https://${plane}.dev.athyper.test/api/auth/session`, {
    waitUntil: "domcontentloaded",
  });
  const s = await page.evaluate(async () =>
    (await fetch("/api/auth/session")).json(),
  );
  assert.equal(s.state, "authenticated", `${plane} session expired`);
  assert.equal(s.plane, plane);
  assert.equal(s.tenantId, "44444444-4444-4444-8444-444444444444");
  assert.equal(
    s.principalId,
    plane === "studio"
      ? "81cd1978-2df5-5c9a-938a-2f8c291aea13"
      : "cca94907-7519-5871-8e3c-6b11aa545c93",
  );
  if (plane === "studio")
    assert.equal(s.assurance, "elevated", "Studio MFA required");
  record(`${plane}-identity`, {
    principalId: s.principalId,
    assurance: s.assurance,
  });
  return page;
}
async function request(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const raw = document.cookie
        .split("; ")
        .find((value) => /^(__Host-)?athyper-csrf=/.test(value));
      const response = await fetch("/api/relay/" + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(method === "GET"
            ? {}
            : {
                "x-csrf-token": raw
                  ? decodeURIComponent(raw.slice(raw.indexOf("=") + 1))
                  : "",
              }),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    },
    { method, path, body },
  );
}
let studio, neon, id, good;
async function stored() {
  const r = await request(
    studio,
    "GET",
    `meta-entity-authoring/change-sets/${id}/graph`,
  );
  assert.equal(r.status, 200);
  return r.body;
}
async function save(graph) {
  await studio.locator("#native-entity-graph").evaluate(
    (element, value) => {
      if (element.readOnly || element.disabled)
        throw Error("Graph editor is not editable");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    JSON.stringify(graph, null, 2),
  );
  const result = studio.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      r.url().endsWith(`/change-sets/${id}/graph`),
  );
  await studio.getByRole("button", { name: "Save draft", exact: true }).click();
  const response = await result;
  assert.equal(
    response.status(),
    200,
    `Studio save rejected: ${await response.text()}`,
  );
  await studio
    .getByRole("button", { name: "Save draft", exact: true })
    .waitFor();
  const data = await stored();
  receipt.savedRevision = data.changeSet.revision;
  return data;
}
async function descriptor() {
  const r = await request(
    neon,
    "GET",
    "entity-runtime/business_partner/list-descriptor",
  );
  assert.equal(
    r.status,
    200,
    `NEON descriptor rejected: ${JSON.stringify(r.body)}`,
  );
  return r.body;
}
try {
  studio = await session("studio");
  neon = await session("neon");
  const list = await request(
    studio,
    "GET",
    "meta-entity-authoring/change-sets",
  );
  assert.equal(
    list.status,
    200,
    `Studio author denied: ${JSON.stringify(list.body)}`,
  );
  const source = list.body.find(
    (row) =>
      row.entityCode === "business_partner" && row.status === "published",
  );
  assert.ok(source, "Published BP graph required");
  await studio.goto("https://studio.dev.athyper.test/entity/graphs", {
    waitUntil: "domcontentloaded",
  });
  await studio
    .locator("select option")
    .filter({ hasText: source.id.slice(0, 8) })
    .waitFor({ state: "attached" });
  await studio.locator("select").selectOption(source.id);
  if (process.env.DEV_GRAPH_CHANGE_SET) {
    id = process.env.DEV_GRAPH_CHANGE_SET;
    await studio.locator("select").selectOption(id);
  } else {
    const forked = studio.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/${source.id}/fork`),
    );
    await studio.getByRole("button", { name: "Create working draft" }).click();
    const forkResponse = await forked;
    assert.equal(forkResponse.status(), 201, await forkResponse.text());
    id = (await forkResponse.json()).id;
  }
  receipt.changeSetId = id;
  await studio
    .getByRole("button", { name: "Save draft", exact: true })
    .waitFor();
  const draft = await stored();
  good = structuredClone(draft.graph);
  // Preserve the published assertions' row targets when resuming a draft from
  // an earlier run whose list insertion preceded the storage-order fix.
  const original = await request(
    studio,
    "GET",
    `meta-entity-authoring/change-sets/${source.id}/graph`,
  );
  assert.equal(original.status, 200);
  good.tests = (good.tests ?? []).map((test) => {
    const prior = original.body.graph.tests?.find(
      (row) => row.key === test.key,
    );
    const match = prior && /^surfaces\.(\d+)(\..*)$/.exec(prior.path);
    if (!match) return test;
    const target = original.body.graph.surfaces[Number(match[1])];
    const index = good.surfaces.findIndex(
      (row) => row.surfaceKey === target.surfaceKey,
    );
    assert.ok(index >= 0);
    return { ...test, path: `surfaces.${index}${match[2]}` };
  });
  const field =
    good.fields.find(
      (row) =>
        row.valueOrigin === "stored" &&
        row.writeMode === "read_only" &&
        row.fieldKey === "display_name",
    ) ??
    good.fields.find(
      (row) => row.valueOrigin === "stored" && row.writeMode === "read_only",
    );
  assert.ok(field, "Stored read-only field required");
  const marker = `BP local preview ${Date.now()}`;
  good.surfaces = good.surfaces ?? [];
  const existing = good.surfaces.find(
    (row) => row.surfaceKey === "local_preview_list",
  );
  const surfaceId = existing?.id ?? randomUUID();
  if (existing) {
    existing.title = marker;
  } else
    good.surfaces.push({
      id: surfaceId,
      surfaceKey: "local_preview_list",
      surfaceKind: "list",
      title: marker,
      layoutKind: "grid",
      isDefault: true,
      status: "active",
      layoutConfig: { identityField: field.fieldKey },
    });
  good.surfaceFieldBindings = (good.surfaceFieldBindings ?? []).filter(
    (row) => row.entitySurfaceId !== surfaceId,
  );
  good.surfaceFieldBindings.push({
    id: randomUUID(),
    entitySurfaceId: surfaceId,
    entityFieldId: field.id,
    bindingKey: "local_preview_label",
    position: 0,
    labelOverride: marker,
    displayConfig: { defaultVisible: true },
    status: "active",
  });
  const start = Date.now();
  let active = await save(good);
  assert.equal(active.preview?.state, "active", JSON.stringify(active.preview));
  if (!studioOnly)
    assert.ok(
      JSON.stringify(await descriptor()).includes(marker),
      "NEON did not load saved presentation",
    );
  record(studioOnly ? "studio-save-activation" : "studio-save-neon-update", {
    revision: active.changeSet.revision,
    elapsedMs: Date.now() - start,
  });
  if (!studioOnly) {
    await neon.goto(
      "https://neon.dev.athyper.test/mdg/business-partner/manage",
      { waitUntil: "domcontentloaded" },
    );
    await neon.getByText(marker, { exact: true }).waitFor();
    record("neon-rendered-title", { title: marker, listDataQualified: false });
    await neon.screenshot({ path: output + ".neon.png", timeout: 5000 });
  }
  const activeRevision = active.changeSet.revision;
  const broken = structuredClone(good);
  broken.fields.find((row) => row.id === field.id).storagePath =
    "local_preview_missing_column";
  const failed = await save(broken);
  assert.equal(failed.preview?.state, "failed");
  assert.equal(failed.preview.activeRevision, activeRevision);
  if (!studioOnly)
    assert.ok(JSON.stringify(await descriptor()).includes(marker));
  record("failed-compilation-retains-active", {
    error: failed.preview.error,
    activeRevision,
  });
  active = await save(good);
  assert.equal(active.preview?.state, "active", JSON.stringify(active.preview));
  record("compilation-recovery", { revision: active.changeSet.revision });
  const current = await stored();
  const body = {
    ...current.graph,
    expectedRevision: current.changeSet.revision,
  };
  const concurrent = await Promise.all([
    request(
      studio,
      "PUT",
      `meta-entity-authoring/change-sets/${id}/graph`,
      body,
    ),
    request(
      studio,
      "PUT",
      `meta-entity-authoring/change-sets/${id}/graph`,
      body,
    ),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  record("concurrent-save-conflict", {
    statuses: concurrent.map((r) => r.status),
  });
  const denied = await request(
    studio,
    "POST",
    `meta-entity-authoring/change-sets/${id}/publish`,
    {
      expectedRevision: (await stored()).changeSet.revision,
      targetPlanes: ["neon"],
    },
  );
  assert.equal(denied.status, 403);
  record("author-cannot-publish");
  await studio.reload({ waitUntil: "domcontentloaded" });
  await studio
    .locator("select option")
    .filter({ hasText: id.slice(0, 8) })
    .waitFor({ state: "attached" });
  await studio.locator("select").selectOption(id);
  await studio.getByText("Preview: active", { exact: true }).waitFor();
  record("studio-active-revision-visible");
  receipt.finalPreview = (await stored()).preview;
  assert.equal(receipt.finalPreview.state, "active");
  assert.equal(
    receipt.finalPreview.savedRevision,
    receipt.finalPreview.activeRevision,
  );
  receipt.completedAt = new Date().toISOString();
  receipt.passed = true;
  console.log(
    JSON.stringify({
      output,
      passed: true,
      changeSetId: id,
      checks: receipt.checks,
    }),
  );
} catch (error) {
  if (studio) {
    try {
      await studio.screenshot({
        path: output + ".png",
        fullPage: false,
        timeout: 5000,
      });
    } catch {}
  }
  receipt.passed = false;
  receipt.error = (error instanceof Error ? error.message : String(error))
    .split("Call log:")[0]
    .slice(0, 2000);
  console.error(
    JSON.stringify({ output, passed: false, error: receipt.error }),
  );
  process.exitCode = 1;
} finally {
  writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
  await browser.close();
}
