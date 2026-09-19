import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  docker,
  fingerprint,
  fixtures,
  bp,
  base,
  ai,
} from "./neon-final-client.mjs";

const phase = process.argv[2];
if (!["before-recovery", "after-recovery"].includes(phase))
  throw Error("BOUNDARY_PHASE_REQUIRED");
const p = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-neon-denial-image-20260912.proposal.dev.json",
  ),
);
const manifest = JSON.parse(fs.readFileSync(p.candidateManifest));
const output =
  "governance/policy/reports/business-partner-neon-denial-" +
  phase +
  "-20260912.dev.json";
if (fs.existsSync(output)) throw Error("PRESERVE_EVIDENCE");
const before = fingerprint(),
  checks = [];
for (const mode of ["api", "worker"]) {
  const c = JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0];
  assert.equal(c.Image, p.runtimeImage);
  assert.equal(c.State.Running, true);
  const mount = c.Mounts.find(
    (m) => m.Destination === "/app/server/qualification",
  );
  for (const f of manifest.harness)
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(mount.Source + "/" + f.name))
        .digest("hex"),
      f.sha256,
    );
}
for (const [actor, principalId] of [
  ["catl.admin", "cca94907-7519-5871-8e3c-6b11aa545c93"],
  ["catl.owner", "645b6a55-3355-526a-9643-3900425bde47"],
]) {
  const routes = [
    ["identity", "/api/iam/me", "GET", {}, 200],
    ["record", "/api/records/business_partner/" + bp, "GET", {}, 403],
    ...["summary", "banking", "comments", "attachments"].map((section) => [
      section,
      base + section,
      "GET",
      {},
      403,
    ]),
    [
      "bank-command",
      base + "banking/reveal",
      "POST",
      { bankAccountLinkId: fixtures.ids.bankLink },
      403,
    ],
    [
      "tax-command",
      base + "identifiers-tax/reveal",
      "POST",
      { taxRegistrationId: fixtures.ids.tax },
      403,
    ],
    ["atlas", "/api/isolated/ai-record-retrieval", "POST", ai, 403],
  ];
  for (const [surface, path, method, body, expected] of routes) {
    const payload = surface.endsWith("command")
      ? {
          ...body,
          purpose: "qualification.neon",
          revealId: randomUUID(),
          purposeExpiresAt: new Date(Date.now() + 30000).toISOString(),
        }
      : body;
    const r = JSON.parse(
      docker(
        [
          "exec",
          "-i",
          "athyper-bp-enter-ui-session-client",
          "node",
          "/app/server/qualification-client/session-client.mjs",
          actor,
          path,
          method,
        ],
        JSON.stringify(payload),
      ),
    );
    const check = {
      actor,
      surface,
      status: r.status,
      code: r.body?.code,
      releaseSet: r.releaseSet,
      passed:
        r.status === expected &&
        r.principalId === principalId &&
        r.releaseSet === p.releaseSetHash,
    };
    if (expected === 403)
      check.passed &&=
        !JSON.stringify(r.body).includes("GB82WEST12345698765432") &&
        !JSON.stringify(r.body).includes("SYNTHETICGB123456789");
    checks.push(check);
  }
}
const after = fingerprint();
assert.deepEqual(after, before);
const report = {
  createdAt: new Date().toISOString(),
  phase,
  runtimeImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  checks,
  passed: checks.every((c) => c.passed),
  before,
  after,
  authorizationAndActivationFingerprintsUnchanged: true,
  grantMutation: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
console.log({ phase, passed: report.passed, checks });
if (!report.passed) process.exitCode = 1;
