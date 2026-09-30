import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-v2-runtime-verification.dev.json",
  ),
);
const file =
  "governance/policy/reports/business-partner-release-20-provider-fields.dev.json";
const report = {
  schemaVersion: 1,
  releaseId: proof.releaseId,
  artifactHash: proof.artifactHash,
  capturedAt: new Date().toISOString(),
  checks: [],
  qualifiedForRecordedScope: false,
  fullProviderFieldQualification: false,
};
const record = "f7688c3d-8c92-5651-a469-da3f4f786375",
  base = "/api/neon/business-partners/" + record + "/360/";
const scope =
  "?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
const save = () =>
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
const send = (account, path) => {
  const r = JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "athyper-bp-r20-auth-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        account,
        path,
        "GET",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 3000000 },
    ),
  );
  assert.equal(r.artifact, proof.artifactHash);
  assert.equal(r.releaseId, proof.releaseId);
  return r;
};
const check = (account, name, r, validate) => {
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
    validate(r);
    c.passed = true;
  } catch (e) {
    c.failure = e.message.slice(0, 180);
  }
  save();
};
try {
  const before = assertAuthorityUnchanged();
  for (const account of ["catl.admin", "catl.owner"]) {
    for (const suffix of ["", scope]) {
      const r = send(account, base + "summary" + suffix);
      check(
        account,
        "summary_contact_projection" + (suffix ? "_scoped" : "_shared"),
        r,
        (r) => {
          assert.equal(r.status, 200);
          assert.equal(r.body.identity.id, record);
          const c = r.body.primaryContact;
          assert.ok(c?.id);
          assert.ok(c.displayName);
          for (const key of ["email", "phone", "emailAddress", "phoneNumber"])
            assert.equal(
              Object.hasOwn(c, key),
              false,
              "Deferred contact field leaked: " + key,
            );
        },
      );
    }
    const wrong = send(
      account,
      base +
        "summary?operatingOrganizationId=" +
        randomUUID() +
        "&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
    );
    check(account, "unknown_organization_rejected", wrong, (r) => {
      assert.ok([400, 403, 404].includes(r.status));
      assert.equal(r.body.identity, undefined);
    });
    const company = send(
      account,
      base +
        "summary?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=" +
        randomUUID(),
    );
    check(account, "unknown_company_rejected", company, (r) => {
      assert.ok([400, 403, 404].includes(r.status));
      assert.equal(r.body.identity, undefined);
    });
    for (const section of ["contacts", "banking", "identifiers"]) {
      const r = send(account, base + section + scope);
      check(account, section + "_protected_storage_values_absent", r, (r) => {
        assert.equal(r.status, 200);
        const visit = (v) => {
          if (!v || typeof v !== "object") return;
          for (const [k, x] of Object.entries(v)) {
            assert.ok(
              ![
                "protectedValueToken",
                "protected_value_token",
                "valueHash",
                "value_hash",
                "ciphertext",
                "encryptedValue",
                "encrypted_value",
              ].includes(k),
              "Storage secret field exposed: " + k,
            );
            visit(x);
          }
        };
        visit(r.body);
      });
    }
  }
  assert.equal(assertAuthorityUnchanged().sha256, before.sha256);
  report.authoritySha256 = before.sha256;
  report.qualifiedForRecordedScope = report.checks.every((c) => c.passed);
  report.limitations = [
    "No positive reveal authority assigned; positive reveal and populated masked-value semantics still require separate evidence.",
    "Projection assertions do not qualify SQL row/count filtering, independent-child ownership, or browser UI behavior.",
  ];
  if (!report.qualifiedForRecordedScope) process.exitCode = 1;
} catch (e) {
  report.blocker = e.message.slice(0, 200);
  process.exitCode = 1;
} finally {
  save();
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      qualified: report.qualifiedForRecordedScope,
      failures: report.checks.filter((c) => !c.passed),
      blocker: report.blocker,
    }),
  );
}
