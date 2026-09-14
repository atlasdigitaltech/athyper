import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const artifactHash =
    "81d8d9737fd50aecdcbb164ec958cd3a41b6e6d7515f79531340a04a8ea1be50",
  releaseId = "21bec59b-86fb-441c-93b2-5027f2999d0b";
const positive = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-release-20-export-ai.dev.json",
    ),
  ),
  commands = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-release-20-commands.dev.json",
    ),
  ),
  proposal = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-release20-isolated-transfer-grants.proposal.dev.json",
    ),
  );
assert.equal(positive.exportQualified, true);
assert.equal(commands.commandJourneyCompleted, true);
assert.equal(commands.importQualified, true);
const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 3000000,
  });
const processes = JSON.parse(
  docker(["inspect", "athyper-bp-r20-api", "athyper-bp-r20-worker"]),
).map((c) => ({ id: c.Id, image: c.Image, startedAt: c.State.StartedAt }));
assert.ok(processes.every((c) => c.image === proposal.runtimeImage));
assert.deepEqual(processes, positive.execution);
const report = {
  schemaVersion: 1,
  kind: "successor_transfer_revocation",
  releaseId,
  artifactHash,
  execution: processes,
  checks: [],
  qualified: false,
  sharedDevGrantsChanged: false,
  revokedAccessRestored: false,
};
let status = "active",
  paused = false;
const save = () =>
  fs.writeFileSync(
    "governance/policy/reports/business-partner-release-20-revocation.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const send = (name, path, method, body, expected, account = "catl.admin") => {
  const before = assertAuthorityUnchanged(status);
  const r = JSON.parse(
    cp.execFileSync(
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
      },
    ),
  );
  assert.equal(assertAuthorityUnchanged(status).sha256, before.sha256);
  const check = {
    name,
    status: r.status,
    code: r.body?.code,
    artifact: r.artifact,
    passed: r.status === expected && r.artifact === artifactHash,
    checkedAt: new Date().toISOString(),
  };
  report.checks.push(check);
  save();
  assert.equal(check.passed, true, name);
  return r.body;
};
try {
  report.before = assertAuthorityUnchanged();
  send(
    "owner_without_export_grant",
    "/api/records/business_partner/exports",
    "POST",
    { filter: { fields: ["id"] } },
    403,
    "catl.owner",
  );
  docker(["pause", "athyper-bp-r20-worker"]);
  paused = true;
  const queued = send(
    "export_queued_before_revocation",
    "/api/records/business_partner/exports",
    "POST",
    {
      filter: { fields: ["id"], _transfer: { fields: ["id"], format: "json" } },
    },
    202,
  );
  assert.match(queued.exportRequestId, /^[a-f0-9-]{36}$/);
  report.queuedExport = queued.exportRequestId;
  cp.execFileSync(
    "node",
    [
      "tooling/scripts/verification/isolated-release20/revoke-test-grants.mjs",
      "--revoke",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  status = "revoked";
  report.after = assertAuthorityUnchanged(status);
  save();
  send(
    "new_export_after_revocation",
    "/api/records/business_partner/exports",
    "POST",
    { filter: { fields: ["id"] } },
    403,
  );
  send(
    "download_after_revocation",
    "/api/records/exports/" + positive.exportRequestId + "/download",
    "GET",
    {},
    403,
  );
  send(
    "import_after_revocation",
    "/api/neon/business-partner-imports",
    "POST",
    {
      schemaVersion: 1,
      release: {
        releaseId,
        compiledHash:
          "bd765e0308b36eda15efd1bc54e5c6d49dec0660c023136a58747488ed5ae794",
      },
      batch: {
        schemaVersion: 1,
        batchKey: "revoked-" + randomUUID(),
        rows: [
          {
            rowKey: "revoked-row-0001",
            operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
            proposedPayload: {
              legalName: "Revocation negative case",
              registrationCountryCode: "GB",
            },
          },
        ],
      },
    },
    403,
  );
  const recordId = commands.appliedCase.targetBusinessPartnerId;
  send(
    "existing_read_grants_preserved",
    "/api/records/business_partner/" + recordId,
    "GET",
    {},
    200,
  );
  send(
    "existing_ai_read_grants_preserved",
    "/api/isolated/ai-record-retrieval",
    "POST",
    {
      entityCode: "business_partner",
      recordId,
      descriptorHash:
        "bd765e0308b36eda15efd1bc54e5c6d49dec0660c023136a58747488ed5ae794",
    },
    200,
  );
  docker(["unpause", "athyper-bp-r20-worker"]);
  paused = false;
  let job;
  for (let n = 0; n < 60; n++) {
    job = JSON.parse(
      docker([
        "exec",
        "athyper-bp-r20-db",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-Atc",
        `SELECT json_build_object('status',status,'artifactKey',artifact_key,'error',error_code,'detail',error_detail) FROM ops.record_export_request WHERE id='${queued.exportRequestId}'`,
      ]),
    );
    if (["failed", "completed"].includes(job.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  report.staleQueuedContext = job;
  save();
  assert.equal(job.status, "failed");
  assert.equal(job.artifactKey, null);
  assert.ok(
    job.error === "FORBIDDEN" ||
      (job.error === "ERROR" &&
        job.detail === "Record export authority was revoked before execution"),
  );
  report.final = assertAuthorityUnchanged("revoked");
  report.qualified = true;
  report.completedAt = new Date().toISOString();
  report.limitations = [
    "Only the two approved isolated transfer permissions were revoked. Existing read grants remain unchanged.",
    "Local revocation and stale queued context qualified; no cross-instance synchronization claim.",
    "Previously issued presigned URLs retain their bounded TTL; new download requests are denied.",
  ];
} catch (e) {
  report.blocker = String(e.message).split("\n")[0].slice(0, 200);
  process.exitCode = 1;
} finally {
  if (paused) docker(["unpause", "athyper-bp-r20-worker"]);
  save();
  console.log(
    JSON.stringify({ qualified: report.qualified, blocker: report.blocker }),
  );
}
