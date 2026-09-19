import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
// Executes one explicitly confirmed synthetic draft submission in local DEV.
// Requires ATLAS_TEST_CASE_ID and ATLAS_TEST_CASE_VERSION, and fresh Neon browser state.
const caseId = process.env.ATLAS_TEST_CASE_ID,
  caseVersion = Number(process.env.ATLAS_TEST_CASE_VERSION);
assert.match(caseId ?? "", /^[0-9a-f-]{36}$/i);
assert.ok(Number.isSafeInteger(caseVersion) && caseVersion > 0);
const out = process.env.ATLAS_TOOL_RECEIPT_DIR;
if (!out) throw Error("Set a private ATLAS_TOOL_RECEIPT_DIR outside Git");
const { chromium } = createRequire(process.cwd() + "/package.json")(
    "@playwright/test",
  ),
  browser = await chromium.launch();
const c = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/neon.json",
  }),
  page = await c.newPage();
await page.goto("https://neon.dev.athyper.test/atlas");
const api = (path, body) =>
  page.evaluate(
    async ({ path, body }) => {
      const csrf = document.cookie
        .split(";")
        .map((s) => s.trim())
        .find((s) => /^(?:__Host-)?athyper-csrf=/.test(s))
        ?.split("=")
        .slice(1)
        .join("=");
      const r = await fetch("/api/relay/atlas" + path, {
        method: body ? "POST" : "GET",
        ...(body
          ? {
              headers: {
                "content-type": "application/json",
                "x-csrf-token": csrf,
                "idempotency-key": crypto.randomUUID(),
              },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const text = await r.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: r.status, json, text };
    },
    { path, body },
  );
try {
  const admission = await api("/admission");
  assert.equal(admission.status, 200);
  assert.equal(admission.json.mutationToolsAllowed, true);
  const created = await api("/threads", {
    title: "Atlas staged mutation qualification",
  });
  assert.equal(created.status, 201, created.text);
  const threadId = created.json.threadId;
  const run = await api(`/threads/${threadId}/runs`, {
    clientRequestId: crypto.randomUUID(),
    publicModelId: "atlas-re-1.0-local",
    dataClass: "internal",
    userText: `Propose bp_submit_case with ${JSON.stringify({ governance: { affectedEntityType: "entity_case", affectedEntityId: caseId, expectedRowVersion: caseVersion } })}`,
    catalogPolicyRevision: admission.json.policyRevision,
  });
  const events = run.text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)).event);
  console.log(
    "STREAM",
    run.status,
    events.map((e) => e.type),
  );
  const preview = events.find(
    (e) => e.type === "tool.previewed" && e.toolCode === "bp_submit_case",
  );
  assert.ok(preview, "No mutation preview");
  assert.ok(preview.confirmationRequired);
  assert.ok(preview.confirmationToken);
  const path = `/tools/${preview.proposalId}/run`,
    argumentsValue = preview.arguments;
  const missing = await api(path, { arguments: argumentsValue });
  assert.equal(missing.status, 400, missing.text);
  const invalid = await api(path, {
    arguments: argumentsValue,
    confirmationToken: "invalid-confirmation",
  });
  assert.ok(invalid.status >= 400, invalid.text);
  const changed = await api(path, {
    arguments: {
      governance: {
        ...argumentsValue.governance,
        expectedRowVersion: caseVersion + 1,
      },
    },
    confirmationToken: preview.confirmationToken,
  });
  assert.ok(changed.status >= 400, changed.text);
  const input = {
    arguments: argumentsValue,
    confirmationToken: preview.confirmationToken,
  };
  const results = await Promise.all([api(path, input), api(path, input)]);
  assert.ok(
    results.some((r) => r.status === 200 && r.json.outcome === "completed"),
    JSON.stringify(results),
  );
  assert.ok(
    results.every((r) => r.status === 200 || r.status === 409),
    JSON.stringify(results),
  );
  const replay = await api(path, input);
  assert.equal(replay.status, 200, replay.text);
  assert.equal(replay.json.replayed, true, replay.text);
  const receipt = {
    threadId,
    proposalId: preview.proposalId,
    missing,
    invalid,
    changed,
    results,
    replay,
  };
  writeFileSync(
    out + "/mutation-receipt.json",
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  console.log(
    "PASS: confirmation, argument binding, concurrent execution, and replay; proposal " +
      preview.proposalId,
  );
} finally {
  await browser.close();
}
