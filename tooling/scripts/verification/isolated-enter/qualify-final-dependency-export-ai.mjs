import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const artifactHash =
    "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
  releaseId = "c2cc6900-26c1-47ca-8dfc-1d488000950c";
import { assertAuthorityUnchanged } from "./dependency-authority-check.mjs";
const output =
  "governance/policy/reports/business-partner-dependency-final-export-ai-20260912.dev.json";
const report = {
  schemaVersion: 1,
  kind: "isolated_export_ai_retrieval",
  releaseId,
  artifactHash,
  capturedAt: new Date().toISOString(),
  checks: [],
  exportQualified: false,
  aiRetrievalQualified: false,
  fullAtlasConversationQualified: false,
};
const releaseSet = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-dependency-host-20260912.dev.json",
  ),
).releaseSetHash;
report.releaseSet = releaseSet;
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const send = (name, path, method, body, expected, account = "catl.admin") => {
  const before = assertAuthorityUnchanged();
  const r = JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        account,
        path,
        method,
      ],
      {
        input: JSON.stringify(body ?? {}),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 3000000,
      },
    ),
  );
  assert.equal(assertAuthorityUnchanged().sha256, before.sha256);
  report.checks.push({
    name,
    account,
    status: r.status,
    artifact: r.artifact,
    releaseSet: r.releaseSet,
    passed:
      expected.includes(r.status) &&
      r.artifact === artifactHash &&
      r.releaseSet === releaseSet,
    checkedAt: new Date().toISOString(),
    authorityHash: before.sha256,
  });
  save();
  assert.equal(report.checks.at(-1).passed, true, name);
  return r.body;
};
const sql = (q) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "athyper-bp-enter-db",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-Atc",
        q,
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim(),
  );
try {
  const journey = JSON.parse(
    readFileSync(
      "governance/policy/reports/business-partner-dependency-final-commands-20260912.dev.json",
      "utf8",
    ),
  );
  if (
    !journey.commandJourneyCompleted ||
    !journey.appliedCase?.targetBusinessPartnerId
  )
    throw Error("APPLIED_SUCCESSOR_RECORD_REQUIRED");
  const ai = {
    entityCode: "business_partner",
    recordId: journey.appliedCase.targetBusinessPartnerId,
    descriptorHash:
      "1e1f4dd20f900b220b644eb936baf0474c01357be4f3b18290340efea6ad9cda",
  };
  const result = send(
    "ai_authorized_summary",
    "/api/isolated/ai-record-retrieval",
    "POST",
    ai,
    [200],
  );
  assert.equal(result.toolCode, "entity_read_record");
  assert.equal(result.data.items.length, 1);
  assert.ok(
    Object.keys(result.data.items[0]).every((k) =>
      ["code", "display_name", "status", "partner_category"].includes(k),
    ),
  );
  assert.equal(result.sources[0].coordinate.recordId, ai.recordId);
  assert.equal(result.sources[0].coordinate.descriptorHash, ai.descriptorHash);
  report.aiSources = result.sources;
  send(
    "ai_wrong_descriptor",
    "/api/isolated/ai-record-retrieval",
    "POST",
    { ...ai, descriptorHash: "wrong" },
    [409],
  );
  send(
    "ai_arbitrary_field_rejected",
    "/api/isolated/ai-record-retrieval",
    "POST",
    { ...ai, fields: ["tax_number"] },
    [403],
  );
  send(
    "ai_missing_record",
    "/api/isolated/ai-record-retrieval",
    "POST",
    { ...ai, recordId: randomUUID() },
    [403],
  );
  report.aiRetrievalQualified = true;
  const queued = send(
    "export_request",
    "/api/records/business_partner/exports",
    "POST",
    {
      filter: {
        fields: ["id", "legal_name"],
        _transfer: {
          format: "json",
          fields: ["id", "legal_name"],
          rawCodes: true,
        },
      },
    },
    [202],
  );
  report.exportRequestId = queued.exportRequestId;
  assert.match(queued.exportRequestId, /^[a-f0-9-]{36}$/);
  let persisted;
  for (let i = 0; i < 60; i++) {
    persisted = sql(
      `select json_build_object('status',status,'rows',row_count,'receipt',receipt,'error',error_code) from ops.record_export_request where id='${queued.exportRequestId}'`,
    );
    if (["completed", "failed"].includes(persisted.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  report.persisted = persisted;
  save();
  assert.equal(persisted.status, "completed");
  assert.ok(persisted.rows > 0);
  const downloaded = send(
    "export_download_authorized",
    "/api/records/exports/" + queued.exportRequestId + "/download",
    "GET",
    {},
    [200],
  );
  const content = JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "--input-type=module",
        "-e",
        `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const url=new URL(readFileSync(0,'utf8'));if(url.hostname!=='athyper-bp-enter-objectstore')throw Error('WRONG_STORE');const r=await fetch(url);if(!r.ok)throw Error('DOWNLOAD_FAILED');const b=Buffer.from(await r.arrayBuffer()),rows=JSON.parse(b.toString());console.log(JSON.stringify({sha256:createHash('sha256').update(b).digest('hex'),rows:rows.length,keys:[...new Set(rows.flatMap(row=>Object.keys(row)))]}));`,
      ],
      {
        input: downloaded.url,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ),
  );
  assert.equal(content.rows, persisted.rows);
  assert.ok(content.keys.every((k) => ["id", "legal_name"].includes(k)));
  report.download = content;
  report.exportQualified = true;
  send(
    "export_sensitive_field_denied",
    "/api/records/business_partner/exports",
    "POST",
    { filter: { fields: ["tax_number"], format: "json" } },
    [403],
  );
  const events = execFileSync("docker", ["logs", "athyper-bp-enter-worker"], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })
    .split("\n")
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
  report.workerReceipt = events.find(
    (e) =>
      e.kind === "isolated_job_execution" &&
      e.jobRef === createHash("sha256").update(queued.jobId).digest("hex"),
  );
  assert.equal(report.workerReceipt?.artifactHash, artifactHash);
  assert.equal(report.workerReceipt?.releaseSet, releaseSet);
  report.execution = JSON.parse(
    execFileSync(
      "docker",
      ["inspect", "athyper-bp-enter-api", "athyper-bp-enter-worker"],
      { encoding: "utf8" },
    ),
  ).map((c) => ({ id: c.Id, image: c.Image, startedAt: c.State.StartedAt }));
  report.completedAt = new Date().toISOString();
} catch (e) {
  report.blocker = String(e.message).split("\n")[0].slice(0, 200);
  process.exitCode = 1;
} finally {
  save();
  console.log(
    JSON.stringify({
      exportQualified: report.exportQualified,
      aiRetrievalQualified: report.aiRetrievalQualified,
      blocker: report.blocker,
    }),
  );
}
