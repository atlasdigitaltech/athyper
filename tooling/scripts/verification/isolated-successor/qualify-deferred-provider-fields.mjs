import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
import { artifactHash, releaseId } from "./release-boundary.mjs";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911";
const candidate = JSON.parse(fs.readFileSync(root + "/read-candidate.json"));
const container = JSON.parse(
  cp.execFileSync("docker", ["inspect", "athyper-bp-r19s-read-api"], {
    encoding: "utf8",
  }),
)[0];
assert.equal(container.Id, candidate.id);
assert.equal(container.Image, candidate.image);
const authority = assertAuthorityUnchanged("revoked");
const report = {
  schemaVersion: 1,
  kind: "isolated_deferred_provider_fields_qualification",
  capturedAt: new Date().toISOString(),
  releaseId,
  artifactHash,
  candidate,
  checks: [],
  qualifiedForRecordedScope: false,
  fullMigrationClosed: false,
};
const send = (name, path, method = "GET") => {
  const r = JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-r19s-auth-client",
        "node",
        "/app/server/qualification-client/read-session-client.mjs",
        "catl.admin",
        path,
        method,
      ],
      {
        input: method === "GET" ? undefined : "{}",
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ),
  );
  assert.equal(r.artifact, artifactHash);
  report.checks.push({
    name,
    status: r.status,
    artifact: r.artifact,
    requestRef: createHash("sha256")
      .update(r.requestId ?? "")
      .digest("hex"),
  });
  return r;
};
try {
  const r = send(
    "scoped_summary",
    "/api/neon/business-partners/f7688c3d-8c92-5651-a469-da3f4f786375/360/summary?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
  );
  assert.equal(r.status, 200);
  assert.ok(r.body.primaryContact?.id);
  assert.ok(r.body.primaryContact?.displayName);
  assert.ok(!Object.hasOwn(r.body.primaryContact, "email"));
  assert.ok(!Object.hasOwn(r.body.primaryContact, "phone"));
  report.checks.push({
    name: "readable_contact_preserved_deferred_email_phone_omitted",
    passed: true,
  });
  const denied = send(
    "read_candidate_write_closed",
    "/api/records/business_partner/exports",
    "POST",
  );
  assert.equal(denied.status, 405);
  assert.equal(denied.body.code, "READ_QUALIFICATION_ONLY");
  const after = assertAuthorityUnchanged("revoked");
  assert.equal(after.sha256, authority.sha256);
  report.authority = after;
  report.qualifiedForRecordedScope = true;
} catch (e) {
  report.blocker = String(e.message).slice(0, 250);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "governance/policy/reports/business-partner-deferred-provider-fields.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
