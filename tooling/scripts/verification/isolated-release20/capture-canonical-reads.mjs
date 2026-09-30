import { acquireQualificationLock } from "./qualification-lock.mjs";
acquireQualificationLock();
import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
import { canonicalExecutionComparisons } from "../entity-authorization/canonical-execution-evidence.mjs";
const account = process.argv[2];
if (!["catl.admin", "catl.owner"].includes(account))
  throw Error("Named qualification account required");
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
const file =
  "governance/policy/reports/business-partner-release-20-canonical-reads." +
  account +
  ".dev.json";
if (fs.existsSync(file))
  throw Error("Preserve prior capture; use a successor capture path");
const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 24000000,
  });
const processState = () => {
  const c = JSON.parse(docker(["inspect", "athyper-bp-r20-context-api"]))[0];
  assert.equal(c.Id, candidate.containerId);
  assert.equal(c.Image, candidate.imageId);
  return { image: c.Image, id: c.Id, start: c.State.StartedAt };
};
const instance = processState(),
  authority = assertAuthorityUnchanged(),
  from = new Date().toISOString(),
  checks = [];
const base =
    "/api/neon/business-partners/f7688c3d-8c92-5651-a469-da3f4f786375/360/",
  q =
    "?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
const paths = [
  "/api/entity-runtime/business_partner/list-descriptor",
  "/api/entity-runtime/business_partner_request/list-descriptor",
  base + "summary",
  ...[
    "summary",
    "identity",
    "contacts",
    "addresses",
    "identifiers",
    "roles",
    "banking",
    "qualifications",
    "requests",
    "activity",
    "comments",
    "attachments",
  ].map((s) => base + s + q),
];
for (const path of paths) {
  console.log(
    JSON.stringify({
      account,
      progress: checks.length + 1,
      total: paths.length,
    }),
  );
  const r = JSON.parse(
    docker([
      "exec",
      "athyper-bp-r20-auth-client",
      "node",
      "/app/server/qualification-client/context-session-client.mjs",
      account,
      path,
      "GET",
    ]),
  );
  assert.equal(r.artifact, proof.artifactHash);
  assert.equal(r.releaseId, proof.releaseId);
  checks.push({
    path,
    status: r.status,
    code: r.body?.code,
    requestRef: createHash("sha256")
      .update(r.requestId ?? "")
      .digest("hex"),
  });
}
const events = docker(["logs", "--since", from, "athyper-bp-r20-context-api"])
  .split("\n")
  .flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
assert.deepEqual(processState(), instance);
assert.equal(assertAuthorityUnchanged().sha256, authority.sha256);
const parsed = canonicalExecutionComparisons(events);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  account,
  releaseId: proof.releaseId,
  artifactHash: proof.artifactHash,
  imageId: candidate.imageId,
  instance,
  authoritySha256: authority.sha256,
  checks,
  ...parsed,
  fullReleaseQualification: false,
};
fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    account,
    checks: checks.length,
    comparisons: parsed.comparisons.length,
    gaps: parsed.mappingGaps.length,
    differences: parsed.comparisons.filter((c) => c.differs).length,
    diagnosticComplete: parsed.diagnosticComplete,
  }),
);
