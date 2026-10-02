/** Live shared Entity page and Atlas relay. Country is the default reference. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";
import { startAtlasQualificationAttempt, finishAtlasQualificationAttempt } from "./atlas-qualification-attempt.mjs";
const recordId = process.argv[2];
assert.match(
  recordId ?? "",
  /^[0-9a-f-]{36}$/i,
  "Supply the existing Entity record UUID",
);
const entityCode = process.env.ATHYPER_ATLAS_ENTITY ?? "country";
assert.match(entityCode, /^[a-z][a-z0-9_]{1,62}$/);
const plane = process.env.ATHYPER_ATLAS_PLANE ?? "neon";
assert.ok(["neon", "studio", "mesh"].includes(plane), "Unknown plane");
const origin = `https://${plane}.dev.athyper.test`;
const recordLabel = process.env.ATHYPER_ATLAS_RECORD_LABEL ?? "Malaysia";
const capability = process.env.ATHYPER_ATLAS_CAPABILITY;
if (entityCode !== "country") {
  assert.ok(process.env.ATHYPER_ATLAS_RECORD_LABEL, "Supply the published record label");
  assert.ok(capability, "Select an explicitly published capability for this entity");
}
const negativeOnly = process.env.ATHYPER_NEGATIVE_ONLY === "true";
const state =
  process.env.ATHYPER_BROWSER_STATE ??
  `tests/e2e/.auth/dev/${plane}/catl.admin.json`;
const out = process.argv[3]
  ? resolve(process.argv[3])
  : artifactDirectory("country-atlas");
const attempt = startAtlasQualificationAttempt(out, { entityCode, plane, recordId });
let browser;
let context;
const report = {
  entityCode,
  plane,
  recordId,
  recordLabel,
  atlasStepUpRequested: false,
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
};
try {
  browser = await chromium.launch();
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: state,
    viewport: { width: 1440, height: 1000 },
  });
  context.on("request", (request) => {
    if (request.url().startsWith(origin + "/api/auth/step-up/"))
      report.atlasStepUpRequested = true;
  });
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
  const ownerResponse = await context.request.get(`${origin}/api/relay/entity-runtime/${entityCode}/records/${recordId}`);
  assert.equal(ownerResponse.status(), 200);
  const ownerRecord = await ownerResponse.json();
  assert.equal(ownerRecord.id, recordId);
  const descriptorResponse = await context.request.get(`${origin}/api/relay/entity-runtime/${entityCode}/list-descriptor`);
  assert.equal(descriptorResponse.status(), 200);
  report.revision = (await descriptorResponse.json()).revision;
  const page = await context.newPage();
  await page.goto(`${origin}/app/entity/${entityCode}/${recordId}`);
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
  let comparison;
  if (!capability || capability === "entity_compare_snapshots") {
    const snapshotsResponse = await context.request.get(
      `${origin}/api/relay/entity-runtime/${entityCode}/records/${recordId}/activity/snapshots`,
    );
    assert.equal(snapshotsResponse.status(), 200);
    snapshots = await snapshotsResponse.json();
    assert.ok(
      snapshots.items?.length >= 2,
      "Two authorized snapshots are required to qualify comparison",
    );
    const csrf = (await context.storageState()).cookies.find(c => c.domain === new URL(origin).hostname && ["athyper-csrf", "__Host-athyper-csrf"].includes(c.name));
    const compared = await context.request.post(`${origin}/api/relay/entity-runtime/${entityCode}/records/${recordId}/activity/compare`, {
      headers: { origin, ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf.value) } : {}) },
      data: { from: snapshots.items[1].id, to: snapshots.items[0].id },
    });
    if (compared.status() !== 200) writeFileSync(join(out, "owner-comparison-error.json"), await compared.text(), { mode: 0o600 });
    assert.equal(compared.status(), 200);
    comparison = await compared.json();
    questions.push([
      `Compare snapshot ${snapshots.items[1].id} with snapshot ${snapshots.items[0].id} of this record. Report missing capture coverage honestly.`,
      "entity_compare_snapshots",
    ]);
  }
  report.comparison = {
    availableSnapshots: snapshots.items?.length ?? 0,
    qualified: false,
  };
  const selected = negativeOnly ? [] : capability
    ? questions.filter(([, expected]) => expected === capability)
    : questions;
  assert.ok(negativeOnly || selected.length, "Unknown requested Entity Atlas capability");
  report.negativeOnly = negativeOnly;
  report.requestedCapabilities = selected.map(([, expected]) => expected);
  for (const [question, expected] of selected) {
    const started = performance.now();
    if (process.env.ATHYPER_INDEPENDENT_SCENARIOS === "true")
      await workspace.getByRole("button", { name: "New Atlas conversation", exact: true }).click();
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
      runId: events[0]?.runId,
      threadId: events[0]?.threadId,
      elapsedMs: Math.round(performance.now() - started),
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
          e.event.coordinate?.entityCode === entityCode &&
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
        "Expected actual authorized Entity details",
      );
    const historyResponse = await context.request.get(response.url().replace(/runs$/, "messages") + "?limit=50");
    assert.equal(historyResponse.status(), 200);
    const history = await historyResponse.json();
    const completedMessage = history.items.find(message => message.messageId === events.find(e => e.event?.type === "run.completed")?.event.messageId);
    assert.ok(completedMessage, "Completed answer must pass current history authorization");
    assert.equal(completedMessage.content.filter(block => block.type === "text").map(block => block.text).join(""), answer, "Durable answer must reconstruct the live stream");
    check.durableAnswerMatched = true;
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
    if (expected === "entity_read_record") {
      assert.ok(rendered.includes(recordLabel));
      const ownerFields = entityCode === "country"
        ? ["code3", "numeric3", "calling_code", "postal_code_pattern", "postal_code_example", "phone_example"]
        : (process.env.ATHYPER_ATLAS_OWNER_FIELDS ?? "").split(",").filter(Boolean);
      assert.ok(ownerFields.length, "Supply the fields whose owner values must be preserved");
      for (const field of ownerFields) {
        assert.match(field, /^[a-z][a-z0-9_]{0,62}$/);
        assert.ok(Object.hasOwn(ownerRecord.values, field), `Owner field unavailable: ${field}`);
        const value = ownerRecord.values[field];
        if (value != null) assert.ok(rendered.includes(String(value)), `Answer must preserve authorized owner value for ${field}`);
      }
      check.ownerValuesMatched = true;
    }
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
      const changed = comparison.fields.filter(field => field.changed).length;
      assert.ok(rendered.includes(`${changed} changed`), "Comparison must match authorized owner evidence");
      const unknown = comparison.fields.filter(field => field.before.state === "uncaptured" || field.after.state === "uncaptured").length;
      assert.ok(rendered.includes(`${unknown} with unknown capture coverage`));
      for (const field of comparison.fields) assert.ok(rendered.includes(field.label), `Comparison missing authorized field ${field.key}`);
      check.ownerComparisonMatched = true;
      assert.match(rendered, /not the live record/);
      for (const snapshot of snapshots.items.slice(0, 2))
        assert.ok(rendered.includes(snapshot.id));
    }
  }
  report.positivePassed = !negativeOnly;
  if (negativeOnly || process.env.ATHYPER_QUALIFY_UNAVAILABLE_SNAPSHOTS === "true") {
    // Fresh thread prevents earlier successful comparisons being mistaken for new evidence.
    await workspace.getByRole("button", { name: "New Atlas conversation", exact: true }).click();
    const question = "Compare snapshot 11111111-1111-4111-8111-111111111111 with snapshot 22222222-2222-4222-8222-222222222222 of this record. If those snapshots are unavailable, say so and do not invent changed or unchanged fields.";
    await workspace.locator('[contenteditable="true"]').fill(question);
    const pending = page.waitForResponse(r => r.url().endsWith("/runs") && r.request().method() === "POST", { timeout: 120000 });
    await workspace.getByRole("button", { name: "Send message", exact: true }).click();
    const response = await pending;
    if (response.status() !== 200) writeFileSync(join(out, "unavailable-snapshot-http-error.json"), await response.text(), { mode: 0o600 });
    assert.equal(response.status(), 200);
    const events = (await response.text()).split(/\r?\n\r?\n/).flatMap(frame => {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      return data ? [JSON.parse(data)] : [];
    });
    writeFileSync(join(out, "unavailable-snapshot-events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
    const failedTool = events.some(e => e.event.type === "tool.completed" && e.event.toolCode === "entity_compare_snapshots" && ["failed", "denied"].includes(e.event.outcome));
    const runId = events[0]?.runId;
    assert.match(runId, /^[0-9a-f-]{36}$/i);
    // A thrown owner error ends the run before public tool.completed emission.
    // Confirm that specific tool's durable failure rather than accepting arbitrary provider errors.
    const failures = JSON.parse(execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "psql", "-X", "-qAt", "-U", "postgres", "-d", `athyper_${plane}`, "-v", "ON_ERROR_STOP=1"], {
      input: `SELECT coalesce(jsonb_agg(jsonb_build_object('toolCode',tool_code,'status',status,'errorClass',terminal_error_class)),'[]'::jsonb) FROM ai.ai_tool_invocation WHERE run_id='${runId}' AND tool_code='entity_compare_snapshots';`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
    assert.ok(failedTool || failures.some(row => row.status === "failed" && row.errorClass === "tool_execution_failed"), "Unavailable snapshot comparison must fail closed");
    assert.ok(!events.some(e => e.event.type === "source.cited"), "Failed comparison cannot fabricate successful source evidence");
    const answer = events.filter(e => e.event.type === "message.delta").map(e => e.event.text ?? "").join("");
    assert.ok(!/\b\d+ changed\b|currently authorized root fields|Snapshot comparison:/i.test(answer), "Failed comparison cannot render successful comparison claims");
    const terminal = events.at(-1)?.event.type;
    assert.ok(["run.failed", "run.completed"].includes(terminal));
    if (terminal === "run.completed") assert.match(answer, /unavailable|could not|cannot|unable|failed|not found|did not obtain|not available/i);
    report.unavailableSnapshots = { passed: true, runId: events[0]?.runId, terminal, failedTool, durableInvocations: failures, fabricatedCitations: false };
  }
  await page.screenshot({
    path: join(out, `${entityCode}-atlas.png`),
    fullPage: true,
  });
  assert.equal(
    report.atlasStepUpRequested,
    false,
    "Atlas must use the existing authenticated session",
  );
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, actual: error.actual, expected: error.expected };
  throw error;
} finally {
  try {
    finishAtlasQualificationAttempt(out, "browser.json", attempt, report);
  } finally {
    try { await context?.close(); }
    finally { await browser?.close(); }
  }
}
