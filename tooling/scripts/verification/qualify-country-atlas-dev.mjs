/** Live shared Country page and Atlas relay. Uses existing user sign-in only. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";
const recordId = process.argv[2];
assert.match(
  recordId ?? "",
  /^[0-9a-f-]{36}$/i,
  "Supply the existing Country record UUID",
);
const plane = process.env.ATHYPER_ATLAS_PLANE ?? "neon";
assert.ok(["neon", "studio", "mesh"].includes(plane), "Unknown plane");
const origin = `https://${plane}.dev.athyper.test`;
const recordLabel = process.env.ATHYPER_ATLAS_RECORD_LABEL ?? "Malaysia";
const capability = process.env.ATHYPER_ATLAS_CAPABILITY;
const state =
  process.env.ATHYPER_BROWSER_STATE ??
  `tests/e2e/.auth/dev/${plane}/catl.admin.json`;
const out = process.argv[3]
  ? resolve(process.argv[3])
  : artifactDirectory("country-atlas");
mkdirSync(out, { recursive: true, mode: 0o700 });
const browser = await chromium.launch();
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  storageState: state,
  viewport: { width: 1440, height: 1000 },
});
const report = {
  entityCode: "country",
  plane,
  recordId,
  recordLabel,
  atlasStepUpRequested: false,
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
};
context.on("request", (request) => {
  if (request.url().startsWith(origin + "/api/auth/step-up/"))
    report.atlasStepUpRequested = true;
});
try {
  const session = await context.request.get(`${origin}/api/auth/session`);
  assert.equal(
    (await session.json()).state,
    "authenticated",
    "DEV_SESSION_NOT_AUTHENTICATED",
  );
  const admissionResponse = await context.request.get(
    `${origin}/api/relay/atlas/admission`,
  );
  const admission = await admissionResponse.json();
  report.admission = {
    httpStatus: admissionResponse.status(),
    chatAllowed: admission.chatAllowed,
    readToolsAllowed: admission.readToolsAllowed,
    reasonCode: admission.reasonCode,
  };
  assert.equal(admissionResponse.status(), 200, "ATLAS_ADMISSION_UNAVAILABLE");
  assert.equal(
    admission.chatAllowed,
    true,
    "ATLAS_ADMISSION_DENIED: check the current Atlas permission; ordinary authenticated sessions are supported",
  );
  assert.equal(admission.readToolsAllowed, true, "ATLAS_READ_TOOLS_DENIED");
  const page = await context.newPage();
  await page.goto(`${origin}/app/entity/country/${recordId}`);
  // Wait for the record-scoped composer context before creating a conversation.
  await page
    .getByRole("heading", { name: recordLabel, exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const workspace = page.getByRole("dialog", {
    name: "Atlas AI workspace",
    exact: true,
  });
  await workspace.waitFor();
  const questions = [
    ["Explain the saved information in overview.", "entity_read_record"],
    [
      "Use the published field reader to tell me the field types and required flags for this record.",
      "entity_explain_fields",
    ],
    [
      "Read the saved comments on this record. Do not infer that an author has no comments from a partial page.",
      "entity_read_comments",
    ],
    [
      "List the saved snapshots for this record and explain the coverage limits.",
      "entity_read_snapshots",
    ],
  ];
  let snapshots = { items: [] };
  if (!capability || capability === "entity_compare_snapshots") {
    const snapshotsResponse = await context.request.get(
      `${origin}/api/relay/entity-runtime/country/records/${recordId}/activity/snapshots`,
    );
    assert.equal(snapshotsResponse.status(), 200);
    snapshots = await snapshotsResponse.json();
    assert.ok(
      snapshots.items?.length >= 2,
      "Two authorized snapshots are required to qualify comparison",
    );
    questions.push([
      `Compare snapshot ${snapshots.items[1].id} with snapshot ${snapshots.items[0].id} of this record. Report missing capture coverage honestly.`,
      "entity_compare_snapshots",
    ]);
  }
  report.comparison = {
    availableSnapshots: snapshots.items?.length ?? 0,
    qualified: false,
  };
  const selected = capability
    ? questions.filter(([, expected]) => expected === capability)
    : questions;
  assert.ok(selected.length, "Unknown requested Country Atlas capability");
  report.requestedCapabilities = selected.map(([, expected]) => expected);
  for (const [question, expected] of selected) {
    await workspace.locator('[contenteditable="true"]').fill(question);
    const pending = page.waitForResponse(
      (r) => r.url().endsWith("/runs") && r.request().method() === "POST",
      { timeout: 120000 },
    );
    await workspace
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const response = await pending;
    const raw = await response.text();
    if (!response.ok())
      writeFileSync(join(out, `${expected}-http-error.txt`), raw, {
        mode: 0o600,
      });
    const events = raw.split(/\r?\n\r?\n/).flatMap((frame) => {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      return data ? [JSON.parse(data)] : [];
    });
    const check = {
      expected,
      httpStatus: response.status(),
      completed: events.some((e) => e.event?.type === "run.completed"),
      failed: events.some((e) => e.event?.type === "run.failed"),
      expectedToolObserved: events.some(
        (e) =>
          e.event?.type === "tool.completed" &&
          e.event.toolCode === expected &&
          e.event.outcome === "completed",
      ),
      scopedCitationObserved: events.some(
        (e) =>
          e.event?.type === "source.cited" &&
          e.event.callId !== "history" &&
          e.event.toolCode === expected &&
          e.event.coordinate?.entityCode === "country" &&
          e.event.coordinate?.recordId === recordId,
      ),
      citations: events.filter((e) => e.event?.type === "source.cited").length,
    };
    report.checks.push(check);
    if (expected === "entity_compare_snapshots")
      report.comparison.qualified =
        check.completed && check.expectedToolObserved && !check.failed;
    writeFileSync(
      join(out, `${expected}.json`),
      JSON.stringify(events, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(check));
    assert.equal(check.httpStatus, 200);
    assert.ok(check.completed);
    assert.ok(!check.failed);
    assert.ok(
      check.expectedToolObserved,
      `Expected successful ${expected} tool evidence`,
    );
    assert.ok(
      check.scopedCitationObserved,
      `Expected record-scoped ${expected} citation`,
    );
    const answer = events
      .filter((e) => e.event?.type === "message.delta")
      .map((e) => e.event.text ?? "")
      .join("");
    assert.ok(answer.trim(), "Expected a non-empty answer");
    if (expected === "entity_read_record")
      assert.ok(
        answer.includes(recordLabel),
        "Expected actual authorized Country details",
      );
    await workspace
      .locator('[data-role="assistant"][data-status="completed"]')
      .last()
      .waitFor();
    const rendered = await workspace
      .locator('[data-role="assistant"][data-status="completed"]')
      .last()
      .innerText();
    writeFileSync(join(out, `${expected}-rendered.txt`), rendered, {
      mode: 0o600,
    });
    if (expected === "entity_read_record")
      assert.ok(rendered.includes(recordLabel));
    if (expected === "entity_explain_fields") {
      assert.match(rendered, /read-only/);
      assert.match(rendered, /required/);
      assert.match(rendered, /not input validation/);
    }
    if (expected === "entity_read_comments") {
      assert.match(rendered, /root comments/);
      assert.match(rendered, /reply threads separately/);
    }
    if (expected === "entity_read_snapshots") {
      assert.match(rendered, /default date range/);
      assert.match(rendered, /not all record history/);
    }
    if (expected === "entity_compare_snapshots") {
      assert.match(rendered, /0 changed/);
      assert.match(rendered, /not the live record/);
      for (const snapshot of snapshots.items.slice(0, 2))
        assert.ok(rendered.includes(snapshot.id));
    }
  }
  await page.screenshot({
    path: join(out, "country-atlas.png"),
    fullPage: true,
  });
  assert.equal(
    report.atlasStepUpRequested,
    false,
    "Atlas must use the existing authenticated session",
  );
  report.passed = true;
} finally {
  writeFileSync(join(out, "browser.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  await context.close();
  await browser.close();
}
