import { inferenceDiagnosticEvidence } from "./atlas-inference-diagnostic-evidence.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  authenticated,
  images,
  save,
  sql,
  tenant,
  parent,
  attachment,
} from "./atlas-f6-common.mjs";
const report = {
  observedAt: new Date().toISOString(),
  kind: "authenticated-live-application-reliability",
  plane: "neon",
  actor: "catl.admin",
  imagesBefore: images(),
  requests: [],
};
let auth;
try {
  auth = await authenticated("neon", "catl.admin");
  assert.equal(
    auth.session.assurance,
    "elevated",
    "Elevated Neon session required",
  );
  report.assurance = auth.session.assurance;
  const admission = await (
    await auth.client.get("/api/relay/atlas/admission")
  ).json();
  assert.equal(admission.chatAllowed, true);
  const headers = {
    ...(await auth.headers()),
    "idempotency-key": randomUUID(),
  };
  async function generation(scenario) {
    const create = await auth.client.post("/api/relay/atlas/threads", {
      headers: { ...headers, "idempotency-key": randomUUID() },
      data: { title: "Synthetic inference reliability assessment" },
    });
    assert.equal(create.status(), 201);
    const thread = await create.json();
    const data = {
      clientRequestId: randomUUID(),
      publicModelId: "atlas-re-1.0-local",
      dataClass: "synthetic",
      catalogPolicyRevision: admission.policyRevision,
      userText:
        "Synthetic verification only. What is 7 multiplied by 9? Reply with the integer only.",
    };
    const started = performance.now();
    const runHeaders = { ...headers, "idempotency-key": randomUUID() };
    const call = async () => {
      const r = await auth.client.post(
        "/api/relay/atlas/threads/" + thread.threadId + "/runs",
        { headers: runHeaders, data },
      );
      assert.equal(r.status(), 200);
      return (await r.text()).split(/\r?\n\r?\n/).flatMap((frame) => {
        const text = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        return text ? [JSON.parse(text)] : [];
      });
    };
    const events = await call(),
      terminal = events.at(-1)?.event,
      runId = events[0]?.runId;
    const result = {
      scenario,
      workload: "generation",
      threadId: thread.threadId,
      runId,
      status: terminal?.type,
      code: terminal?.code,
      elapsedMs: Math.round(performance.now() - started),
      answerCorrect: /\b63\b/.test(
        events
          .filter((e) => e.event.type === "message.delta")
          .map((e) => e.event.text)
          .join(""),
      ),
    };
    report.requests.push(result);
    assert.match(runId, /^[0-9a-f-]{36}$/i);
    const replay = await call();
    result.replayedSameRun = replay[0]?.runId === runId;
    const entries = JSON.parse(
      sql(
        "neon",
        `SELECT coalesce(jsonb_agg(jsonb_build_object('providerCallId',entry->>'providerCallId','finishReason',entry->>'finishReason','errorClass',entry->>'errorClass','errorCode',entry->>'errorCode','readinessDiagnostics',entry->'readinessDiagnostics','bindingRevision',entry->>'bindingRevision')),'[]'::jsonb) FROM ai.atlas_provider_usage WHERE tenant_id='${tenant}' AND run_id='${runId}';`,
      ),
    );
    result.providerEntries = entries;
    assert.equal(entries.length, 1, "Replay must not duplicate inference");
    assert.equal(result.replayedSameRun, true);
    assert.equal(result.status, "run.completed");
    assert.equal(result.answerCorrect, true);
  }
  async function retrieval(scenario) {
    const started = performance.now();
    const r = await auth.client.post("/api/relay/atlas/knowledge/search", {
      headers: await auth.headers(),
      data: {
        entityCode: "business_partner",
        recordId: parent,
        query: "Indigo Lantern",
      },
    });
    const body = await r.json();
    const citations = body.citations ?? [];
    report.requests.push({
      scenario,
      workload: "retrieval",
      httpStatus: r.status(),
      ...(r.status() !== 200
        ? { errorCode: body.code, errorMessage: body.message }
        : {}),
      elapsedMs: Math.round(performance.now() - started),
      citationCount: citations.length,
      expectedAttachment: citations.some(
        (c) => c.citation?.sourceId === attachment,
      ),
    });
    assert.equal(r.status(), 200);
    assert.ok(citations.length > 0);
    assert.ok(
      citations.some((c) => c.citation?.sourceId === attachment),
      "Expected synthetic attachment citation",
    );
  }
  await generation("warm");
  for (let i = 0; i < 3; i++) {
    const results = await Promise.allSettled([
      retrieval("mixed-2"),
      generation("mixed-2"),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  }
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.blocker = e.message.split("\n")[0];
} finally {
  if (auth) await auth.close();
  report.imagesAfter = images();
  try {
    report.inferenceDiagnostics = inferenceDiagnosticEvidence(
      report.observedAt,
    );
    const d = report.inferenceDiagnostics;
    report.sharedAdmissionVerified =
      d.peakAdmitted === 1 &&
      d.unreleasedAtEnd === 0 &&
      ["generation", "embedding"].every((w) =>
        d.events.some((e) => e.workload === w && e.phase === "admitted"),
      );
    report.passed = report.passed && report.sharedAdmissionVerified;
  } catch {
    report.passed = false;
    report.diagnosticCollectionFailed = true;
  }
  report.stableDeployment =
    JSON.stringify(report.imagesBefore) === JSON.stringify(report.imagesAfter);
  report.passed = report.passed && report.stableDeployment;
  save("inference-reliability-application.json", report);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
