import { acquireQualificationLock } from "./qualification-lock.mjs";
acquireQualificationLock();
import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
import { canonicalExecutionComparisons } from "../entity-authorization/canonical-execution-evidence.mjs";
const candidate = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-release-20-context-candidate.dev.json",
  ),
);
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-v2-runtime-verification.dev.json",
  ),
);
const output =
  "governance/policy/reports/business-partner-release-20-context-qualification.dev.json";
const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 12000000,
  });
const inspect = () => {
  const c = JSON.parse(docker(["inspect", "athyper-bp-r20-context-api"]))[0];
  assert.equal(c.Id, candidate.containerId);
  assert.equal(c.Image, candidate.imageId);
  assert.equal(c.State.Running, true);
  return { id: c.Id, image: c.Image, startedAt: c.State.StartedAt };
};
const start = new Date().toISOString(),
  processBefore = inspect(),
  authority = assertAuthorityUnchanged();
const report = {
  schemaVersion: 1,
  capturedAt: start,
  releaseId: proof.releaseId,
  artifactHash: proof.artifactHash,
  candidate,
  checks: [],
  accounts: [],
  qualified: false,
  fullUiQualified: false,
  grantsChanged: false,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
function send(account, path, method = "GET") {
  const r = JSON.parse(
    docker([
      "exec",
      "athyper-bp-r20-auth-client",
      "node",
      "/app/server/qualification-client/context-session-client.mjs",
      account,
      path,
      method,
    ]),
  );
  // Read-only rejection happens before artifact dispatch and carries no artifact receipt.
  if (method === "GET") {
    assert.equal(r.artifact, proof.artifactHash);
    assert.equal(r.releaseId, proof.releaseId);
  }
  return r;
}
function check(account, name, r, test) {
  const c = {
    account,
    name,
    status: r.status,
    requestRef: createHash("sha256")
      .update(r.requestId ?? "")
      .digest("hex"),
    passed: false,
  };
  report.checks.push(c);
  try {
    test(r);
    c.passed = true;
  } catch (e) {
    c.failure = e.message.slice(0, 180);
  }
  save();
}
try {
  const base = "/api/entity-runtime/business_partner_request",
    q = "?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180";
  for (const account of ["catl.admin", "catl.owner"]) {
    const from = new Date().toISOString();
    check(
      account,
      "selector_discovery",
      send(account, base + "/list-descriptor"),
      (r) => {
        assert.equal(r.status, 200);
        assert.equal(r.body.scope.status, "context_required");
        assert.deepEqual(r.body.scope.workContext.requiredCoordinates, [
          "operatingOrganizationId",
        ]);
        assert.equal(r.body.scope.workContext.schemaVersion, 1);
      },
    );
    check(
      account,
      "unselected_rows_closed",
      send(account, base + "/list"),
      (r) => {
        assert.equal(r.status, 409);
        assert.equal(r.body.code, "RECORD_LIST_SCOPE_REQUIRED");
      },
    );
    check(
      account,
      "selected_descriptor",
      send(account, base + "/list-descriptor" + q),
      (r) => {
        assert.equal(r.status, 200);
        assert.equal(r.body.scope.status, "ready");
      },
    );
    const listed = send(account, base + "/list" + q);
    check(account, "selected_rows", listed, (r) => {
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body.rows));
    });
    check(
      account,
      "unknown_scope_rejected",
      send(
        account,
        base + "/list-descriptor?operatingOrganizationId=" + randomUUID(),
      ),
      (r) => {
        assert.equal(r.status, 403);
      },
    );
    check(
      account,
      "candidate_writes_closed",
      send(account, "/api/records/business_partner/exports", "POST"),
      (r) => {
        assert.equal(r.status, 405);
        assert.equal(r.body.code, "READ_QUALIFICATION_ONLY");
      },
    );
    const events = docker([
      "logs",
      "--since",
      from,
      "athyper-bp-r20-context-api",
    ])
      .split("\n")
      .flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      });
    report.accounts.push({ account, ...canonicalExecutionComparisons(events) });
    save();
  }
  assert.deepEqual(inspect(), processBefore);
  assert.equal(assertAuthorityUnchanged().sha256, authority.sha256);
  report.authoritySha256 = authority.sha256;
  report.qualified = report.checks.every((c) => c.passed);
  if (!report.qualified) process.exitCode = 1;
  report.limitations = [
    "API/DTO and selected list execution only; no authenticated browser interaction asserted.",
    "Candidate is a separate read-only image; prior full command/import/export qualification belongs to its original image.",
    "Policy traces are evidence, not acceptance of reviewed dispositions.",
  ];
} catch (e) {
  report.blocker = e.message.slice(0, 220);
  process.exitCode = 1;
} finally {
  save();
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      qualified: report.qualified,
      failures: report.checks.filter((c) => !c.passed),
      blocker: report.blocker,
    }),
  );
}
