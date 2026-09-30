import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const artifactHash =
    "81d8d9737fd50aecdcbb164ec958cd3a41b6e6d7515f79531340a04a8ea1be50",
  releaseId = "21bec59b-86fb-441c-93b2-5027f2999d0b";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const output =
  "governance/policy/reports/business-partner-release-20-ai.dev.json";
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
        "athyper-bp-r20-auth-client",
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
    passed: expected.includes(r.status) && r.artifact === artifactHash,
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
        "athyper-bp-r20-db",
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
      "governance/policy/reports/business-partner-release-20-commands.dev.json",
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
      "bd765e0308b36eda15efd1bc54e5c6d49dec0660c023136a58747488ed5ae794",
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
  save();
  console.log({
    aiRetrievalQualified: true,
    checks: report.checks.length,
    fullAtlasConversationQualified: false,
  });
} catch (e) {
  report.error = e.message;
  save();
  throw e;
}
