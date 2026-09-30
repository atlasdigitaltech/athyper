#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  authenticated,
  images,
  parent,
  sql,
  tenant,
} from "./atlas-f6-common.mjs";

const id = randomUUID(),
  report = {
    schema: "bp-ai-live-read-probe/1",
    observedAt: new Date().toISOString(),
    id,
    images: images(),
    checks: [],
    trials: [],
    releaseQualified: false,
  };
const privateDir = join(
  homedir(),
  ".athyper/instances/dev/receipts/bp-ai-release",
  id,
);
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const digest = (s) => createHash("sha256").update(s).digest("hex");
const parse = (raw) =>
  raw.split(/\r?\n\r?\n/).flatMap((frame) => {
    const d = frame
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    return d ? [JSON.parse(d)] : [];
  });
let auth, owner;
try {
  auth = await authenticated("neon", "catl.admin");
  assert.equal(auth.session.assurance, "elevated");
  const admission = await (
    await auth.client.get("/api/relay/atlas/admission")
  ).json();
  assert.equal(admission.chatAllowed, true);
  report.admin = {
    authenticated: true,
    assurance: auth.session.assurance,
    policyRevision: admission.policyRevision,
  };
  const record = {
    schemaVersion: 1,
    kind: "record",
    entityCode: "business_partner",
    recordId: parent,
    dirty: false,
    locale: "en",
  };
  const manage = {
    schemaVersion: 1,
    kind: "manage",
    entityCode: "business_partner",
    locale: "en",
    filters: [],
    sort: [],
    selectedIds: [parent],
    visibleIds: [parent],
    analysisTarget: "selection",
    pageSize: 20,
    pageIndex: 0,
  };
  for (const fixture of [
    {
      name: "record-summary",
      question: "Show this record summary",
      page: record,
      expectation: "cited",
    },
    {
      name: "readiness-missing-scope",
      question: "What is missing for this supplier?",
      page: record,
      expectation: "clarify",
    },
    {
      name: "eligibility-missing-scope",
      question: "Can we purchase from this supplier?",
      page: record,
      expectation: "clarify",
    },
    {
      name: "selected-manage-insights",
      question: "What is blocking my selection?",
      page: manage,
      expectation: "observe",
    },
  ]) {
    const trial = { name: fixture.name, expectation: fixture.expectation };
    try {
      const headers = {
        ...(await auth.headers()),
        "idempotency-key": randomUUID(),
      };
      const created = await auth.client.post("/api/relay/atlas/threads", {
        headers,
        data: { title: "BP release synthetic read qualification" },
      });
      assert.equal(created.status(), 201);
      const thread = await created.json();
      trial.threadId = thread.threadId;
      const data = {
        clientRequestId: randomUUID(),
        publicModelId: "atlas-re-1.0-local",
        dataClass: "internal",
        catalogPolicyRevision: admission.policyRevision,
        userText: fixture.question,
        businessContext: { ...fixture.page, generationId: randomUUID() },
      };
      const start = performance.now(),
        response = await auth.client.post(
          `/api/relay/atlas/threads/${thread.threadId}/runs`,
          { headers, data },
        );
      trial.status = response.status();
      const raw = await response.text();
      trial.elapsedMs = Math.round(performance.now() - start);
      writeFileSync(join(privateDir, fixture.name + ".txt"), raw, {
        mode: 0o600,
      });
      trial.traceSha256 = digest(raw);
      assert.equal(response.status(), 200);
      const events = parse(raw);
      trial.runId = events[0]?.runId;
      trial.terminal = events.at(-1)?.event.type;
      trial.intents = events
        .filter((e) => e.event.type === "intent.resolved")
        .map((e) => ({
          kind: e.event.intent.kind,
          capabilityId: e.event.intent.capabilityId,
        }));
      trial.tools = events
        .filter((e) => e.event.type === "tool.completed")
        .map((e) => ({ code: e.event.toolCode, outcome: e.event.outcome }));
      trial.citations = events
        .filter((e) => e.event.type === "source.cited")
        .map((e) => ({
          entityCode: e.event.coordinate.entityCode,
          recordId: e.event.coordinate.recordId,
        }));
      assert.equal(trial.terminal, "run.completed");
      assert.match(trial.runId, /^[a-f0-9-]{36}$/i);
      trial.providerCalls = Number(
        sql(
          "neon",
          `SELECT count(*) FROM ai.atlas_provider_usage WHERE tenant_id='${tenant}' AND run_id='${trial.runId}'`,
        ),
      );
      if (fixture.expectation === "cited")
        assert.ok(
          trial.citations.some(
            (c) => c.entityCode === "business_partner" && c.recordId === parent,
          ),
        );
      if (fixture.expectation === "clarify") {
        assert.ok(trial.intents.some((i) => i.kind === "clarify"));
        assert.equal(trial.providerCalls, 0);
      }
      const replay = await auth.client.post(
        `/api/relay/atlas/threads/${thread.threadId}/runs`,
        { headers, data },
      );
      assert.equal(replay.status(), 200);
      const replayEvents = parse(await replay.text());
      assert.equal(replayEvents[0].runId, trial.runId);
      assert.equal(replayEvents.at(-1)?.event.type, "run.completed");
      assert.equal(
        Number(
          sql(
            "neon",
            `SELECT count(*) FROM ai.atlas_provider_usage WHERE tenant_id='${tenant}' AND run_id='${trial.runId}'`,
          ),
        ),
        trial.providerCalls,
      );
      trial.replayPassed = true;
      trial.passed = fixture.expectation !== "observe";
      if (fixture.expectation === "observe")
        trial.limit =
          "Observation only; needs scoped owner facts and population/count parity before qualification.";
    } catch (e) {
      trial.passed = false;
      trial.errorCode = e.code ?? "probe_failed";
      trial.error =
        e.code === "ERR_ASSERTION"
          ? "Fixture assertion failed"
          : "Live read probe failed";
    }
    report.trials.push(trial);
  }
  owner = await authenticated("neon", "catl.owner");
  assert.equal(owner.session.assurance, "elevated");
  const denied = await (
    await owner.client.get("/api/relay/atlas/admission")
  ).json();
  report.owner = {
    authenticated: true,
    assurance: owner.session.assurance,
    chatAllowed: denied.chatAllowed,
  };
  const created = await owner.client.post("/api/relay/atlas/threads", {
    headers: { ...(await owner.headers()), "idempotency-key": randomUUID() },
    data: { title: "BP release admission denial" },
  });
  assert.equal(denied.chatAllowed, false);
  assert.equal(created.status(), 403);
  report.checks.push(
    "elevated owner remains denied by existing Atlas admission; no grants changed",
  );
} catch (e) {
  report.blocker =
    e.code === "ERR_ASSERTION"
      ? "Admission prerequisite failed"
      : "Authenticated read collection failed";
} finally {
  if (owner) await owner.close();
  if (auth) await auth.close();
  report.finalImages = images();
  report.stableDeployment =
    JSON.stringify(report.images) === JSON.stringify(report.finalImages);
  report.passed =
    !report.blocker &&
    report.stableDeployment &&
    report.trials.length === 4 &&
    report.trials
      .filter((t) => t.expectation !== "observe")
      .every((t) => t.passed);
  const out = `docs/examples/bp-ai-release/live-reads-${id}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      out,
      passed: report.passed,
      trials: report.trials.map((t) => ({
        name: t.name,
        passed: t.passed,
        intents: t.intents,
        tools: t.tools,
        limit: t.limit,
      })),
      owner: report.owner,
      blocker: report.blocker,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
