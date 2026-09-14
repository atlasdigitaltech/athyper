import fs from "node:fs";
import cp from "node:child_process";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const parent = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
  ),
);
export const amendment = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-protected-reference-amendment-20260912.proposal.dev.json",
  ),
);
export const proposal = {
  ...parent,
  runtimeImage: amendment.runtimeImage,
  releaseSetHash: amendment.releaseSetHash,
};
export const fixtures = JSON.parse(fs.readFileSync(proposal.fixtures.path));
fixtures.ids.bankLink = amendment.bankFixture.linkId;
fixtures.ids.bank = amendment.bankFixture.accountId;
export const bp = fixtures.businessPartnerId;
export const base = "/api/neon/business-partners/" + bp + "/360/";
export const organization = "a478f9c0-8226-5d22-9599-b8fb27a45180";
export const company = "793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
export const coordinates =
  "?operatingOrganizationId=" + organization + "&companyCodeId=" + company;
export const ai = {
  entityCode: "business_partner",
  recordId: bp,
  descriptorHash:
    "1e1f4dd20f900b220b644eb936baf0474c01357be4f3b18290340efea6ad9cda",
};
export const docker = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 4000000,
  });
export const sql = (query) =>
  docker(
    [
      "exec",
      "-i",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    query,
  );
export const quote = (x) => "'" + String(x).replaceAll("'", "''") + "'";
export const fingerprint = () =>
  JSON.parse(
    sql(
      "SELECT jsonb_object_agg(name,digest) FROM (" +
        [
          "authz.group_member",
          "authz.group_role",
          "authz.role_permission",
          "authz.deny_rule",
          "authz.plane_membership",
          "runtime_meta.release_activation_head",
          "runtime_meta.applied_release",
        ]
          .map(
            (t) =>
              `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`,
          )
          .join(" UNION ALL ") +
        ") s;",
    ),
  );
export function send(account, path, method = "GET", body = {}) {
  const approval = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-protected-reference-amendment-20260912.user-approval.dev.json",
    ),
  );
  assert.equal(approval.decision, "approved");
  assert.equal(approval.proposalRevision, amendment.proposalRevision);
  for (const mode of ["api", "worker"]) {
    const c = JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0];
    assert.equal(c.Image, proposal.runtimeImage);
    assert.equal(c.State.Running, true);
  }
  const before = fingerprint();
  const response = JSON.parse(
    docker(
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
      JSON.stringify(body),
    ),
  );
  assert.deepEqual(fingerprint(), before);
  assert.equal(response.releaseSet, proposal.releaseSetHash);
  assert.equal(
    response.principalId,
    proposal.batches.find((b) => b.account === account).principalId,
  );
  return response;
}
export function journal(name, work) {
  const directory =
    os.homedir() + "/.athyper/qualification/bp/protected-reveal-20260912";
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const report = {
    createdAt: new Date().toISOString(),
    runtimeImage: proposal.runtimeImage,
    releaseSetHash: proposal.releaseSetHash,
    amendmentRevision: amendment.proposalRevision,
    checks: [],
    complete: false,
  };
  const check = (label, account, path, method, body, verify) => {
    try {
      const r = send(account, path, method, body);
      const bytes = JSON.stringify(r.body);
      const localPath = directory + "/" + name + "-" + label + ".json";
      fs.writeFileSync(localPath, bytes + "\n", { mode: 0o600 });
      const entry = {
        label,
        account,
        path,
        status: r.status,
        code: r.body?.code,
        responseSha256: createHash("sha256").update(bytes).digest("hex"),
        responsePath: localPath,
        passed: false,
      };
      report.checks.push(entry);
      try {
        verify(r);
        entry.passed = true;
      } catch (e) {
        entry.failure = e.message.slice(0, 500);
      }
      return r;
    } catch (e) {
      report.checks.push({
        label,
        account,
        path,
        passed: false,
        failure: e.message.split("\n")[0].slice(0, 200),
      });
      return null;
    }
  };
  work(check, report);
  report.complete =
    report.checks.length > 0 && report.checks.every((c) => c.passed);
  fs.writeFileSync(
    "governance/policy/reports/business-partner-protected-reveal-" +
      name +
      "-20260912.dev.json",
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log({
    name,
    complete: report.complete,
    checks: report.checks.map((c) => ({
      label: c.label,
      status: c.status,
      passed: c.passed,
      failure: c.failure,
    })),
  });
  return report;
}
