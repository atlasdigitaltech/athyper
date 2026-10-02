/** Live model completion and durable replay using an existing ordinary DEV session. */
import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";
import { startAtlasQualificationAttempt, finishAtlasQualificationAttempt } from "./atlas-qualification-attempt.mjs";
const plane = process.env.ATHYPER_ATLAS_PLANE ?? "neon";
assert.ok(["neon", "studio", "mesh"].includes(plane));
const origin = `https://${plane}.dev.athyper.test`;
const out = resolve(process.argv[2] ?? artifactDirectory("atlas-model"));
const attempt = startAtlasQualificationAttempt(out, { plane });
const report = { plane, startedAt: new Date().toISOString(), passed: false, checks: [] };
let client;
try {
  client = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true,
  storageState: process.env.ATHYPER_BROWSER_STATE ?? `tests/e2e/.auth/dev/${plane}/catl.admin.json`, timeout: 120000 });
  const session = await (await client.get("/api/auth/session")).json();
  assert.equal(session.state, "authenticated", "Existing authenticated DEV session required");
  assert.match(session.tenantId, /^[0-9a-f-]{36}$/i);
  const csrf = (await client.storageState()).cookies.find(c => c.domain === new URL(origin).hostname && ["__Host-athyper-csrf", "athyper-csrf"].includes(c.name));
  const headers = { origin, ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf.value) } : {}) };
  const admissionResponse = await client.get("/api/relay/atlas/admission");
  assert.equal(admissionResponse.status(), 200);
  const admission = await admissionResponse.json();
  assert.equal(admission.chatAllowed, true);
  const created = await client.post("/api/relay/atlas/threads", { headers: { ...headers, "idempotency-key": randomUUID() }, data: { title: "DEV model answer and replay qualification" } });
  assert.equal(created.status(), 201);
  const { threadId } = await created.json(); report.threadId = threadId;
  const data = { clientRequestId: randomUUID(), publicModelId: "atlas-re-1.0-local", dataClass: "synthetic", catalogPolicyRevision: admission.policyRevision,
    userText: "Synthetic pilot verification only. What is 7 multiplied by 9? Reply with the integer and no business facts." };
  const run = async () => {
    const response = await client.post(`/api/relay/atlas/threads/${threadId}/runs`, { headers: { ...headers, "idempotency-key": data.clientRequestId }, data });
    if (response.status() !== 200) writeFileSync(join(out, "run-error.json"), await response.text(), { mode: 0o600 });
    assert.equal(response.status(), 200);
    return (await response.text()).split(/\r?\n\r?\n/).flatMap(frame => {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      return data ? [JSON.parse(data)] : [];
    });
  };
  const started = performance.now(); const events = await run();
  report.elapsedMs = Math.round(performance.now() - started);
  writeFileSync(join(out, "events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
  assert.equal(events.at(-1)?.event.type, "run.completed");
  const text = events => events.filter(e => e.event.type === "message.delta").map(e => e.event.text).join("");
  assert.match(text(events), /did not obtain an authorized Entity read/);
  assert.ok(!/\b63\b/.test(text(events)), "Entity-only mode must not manufacture an ungrounded arithmetic answer");
  assert.ok(!events.some(e => e.event.type === "source.cited"), "No owner evidence should be invented");
  report.runId = events[0].runId; assert.match(report.runId, /^[0-9a-f-]{36}$/i);
  const providerRows = () => JSON.parse(execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "psql", "-X", "-qAt", "-U", "postgres", "-d", `athyper_${plane}`, "-v", "ON_ERROR_STOP=1"], {
    input: `SELECT coalesce(jsonb_agg(entry ORDER BY provider_call_id),'[]'::jsonb) FROM ai.atlas_provider_usage WHERE tenant_id='${session.tenantId}' AND run_id='${report.runId}';`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  const beforeReplay = providerRows();
  assert.ok(beforeReplay.length > 0, "Actual model provider execution required");
  const replay = await run();
  assert.equal(replay[0].runId, report.runId); assert.equal(replay.at(-1)?.event.type, "run.completed"); assert.equal(text(replay), text(events));
  const historyResponse = await client.get(`/api/relay/atlas/threads/${threadId}/messages`); assert.equal(historyResponse.status(), 200);
  const history = await historyResponse.json();
  assert.ok(history.items.some(m => m.role === "assistant" && m.content?.some(b => b.type === "text" && b.text === text(events))));
  const rows = providerRows();
  assert.deepEqual(rows, beforeReplay, "Replay must preserve exactly the original provider receipts");
  const config = JSON.parse(readFileSync("deploy/config/atlas/local-inference.json", "utf8"));
  const entry = rows[0];
  for (const row of rows) { assert.equal(row.providerId, "ollama"); assert.equal(row.actualModelId, config.model.upstream); assert.equal(row.bindingRevision, config.model.digest); }
  const tags = JSON.parse(execFileSync("docker", ["exec", "athyper-dev-source-api-1", "node", "--input-type=module", "-e", 'const r=await fetch("http://atlas-inference:11434/api/tags");if(!r.ok)throw Error("MODEL_TAGS_UNAVAILABLE");const d=await r.json();console.log(JSON.stringify(d.models.map(m=>({name:m.name,digest:m.digest}))));'], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  assert.ok(tags.some(model => model.name === config.model.upstream && model.digest.replace(/^sha256:/, "") === config.model.digest.replace(/^sha256:/, "")), "Actual local model registry must match configured digest");
  report.loadedModelPins = tags;
  report.provider = { providerId: entry.providerId, actualModelId: entry.actualModelId, bindingRevision: entry.bindingRevision, providerCalls: rows.length, usage: entry.usage };
  report.checks.push("actual pinned model path returned bounded no-owner-evidence refusal", "no owner citation fabricated", "durable answer readback", "idempotent replay with no additional provider calls");
  report.passed = true;
} catch (error) {
  report.failure = error.message; report.actual = error.actual; report.expected = error.expected; report.location = error.stack?.split("\n").find(line => line.includes("qualify-atlas-model-dev")); process.exitCode = 1;
} finally {
  try {
    finishAtlasQualificationAttempt(out, "report.json", attempt, report);
    console.log(JSON.stringify(report));
  } finally { await client?.dispose(); }
}
