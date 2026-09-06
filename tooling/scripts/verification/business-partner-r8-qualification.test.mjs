import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyBusinessPartnerR8Qualification } from "./verify-business-partner-r8-qualification.mjs";
import {
  testQualification,
  baseManifest,
} from "./business-partner-r8-test-fixtures.mjs";

test("keeps R8 blocked while all five production receipts are pending", () => {
  assert.deepEqual(verifyBusinessPartnerR8Qualification(), {
    gates: 5,
    passed: 0,
    productionQualified: false,
  });
});
test("rejects a production claim without retained gate receipts", () => {
  assert.throws(
    () =>
      verifyBusinessPartnerR8Qualification({
        manifest: {
          ...baseManifest(),
          productionQualified: true,
          productionQualification: "qualified",
        },
      }),
    /productionQualified must equal/,
  );
});
test("qualifies only a complete sanitized artifact and receipt set", () => {
  assert.deepEqual(verifyBusinessPartnerR8Qualification(testQualification()), {
    gates: 5,
    passed: 5,
    productionQualified: true,
  });
});
for (const [name, mutate, error] of [
  [
    "credential material",
    (a) => {
      a.target_evidence_lifecycle.evidence.connectionString =
        "postgres://user:password@host/database";
    },
    /sensitive material/,
  ],
  [
    "query credential URL",
    (a) => {
      a.target_evidence_lifecycle.evidence.note =
        "https://host/object?signature=credential";
    },
    /sensitive material/,
  ],
  [
    "unverified retention",
    (a) => {
      a.target_evidence_lifecycle.evidence.retentionVerified = false;
    },
    /verified compliance retention/,
  ],
  [
    "automation-only accessibility",
    (a) => {
      a.manual_accessibility.evidence.checks = [];
    },
    /manual journey checks/,
  ],
  [
    "empty assistive technology",
    (a) => {
      a.manual_accessibility.evidence.assistiveTechnologies = [""];
    },
    /technology names/,
  ],
  [
    "empty catalogs",
    (a) => {
      a.clean_upgrade_parity.evidence.catalogReport.comparedObjectCounts.columns =
        { clean: 0, upgrade: 0 };
    },
    /nonempty zero-drift/,
  ],
  [
    "same catalog database",
    (a) => {
      a.clean_upgrade_parity.evidence.catalogReport.databases.upgrade.database_oid =
        "1";
    },
    /distinct databases/,
  ],
  [
    "hidden catalog drift",
    (a) => {
      a.clean_upgrade_parity.evidence.catalogReport.differences.columns.changed =
        ["column"];
    },
    /zero-drift/,
  ],
  [
    "wrong rollback hash",
    (a) => {
      a.production_canary_rollback.evidence.canaryReport.afterRollback.neon.artifactHash =
        "d".repeat(64);
    },
    /neon must activate/,
  ],
  [
    "missing deployment acknowledgement",
    (a) => {
      a.production_canary_rollback.evidence.canaryReport.deployments[0].acknowledgement_id =
        null;
    },
    /studio must activate/,
  ],
  [
    "duplicate correlations",
    (a) => {
      a.production_canary_rollback.evidence.canaryReport.rollbackJobs.mesh.correlationId =
        a.production_canary_rollback.evidence.canaryReport.publish.correlationId;
    },
    /correlation proof/,
  ],
  [
    "mixed source revisions",
    (a) => {
      a.manual_accessibility.sourceRevision = "f".repeat(40);
    },
    /same source revision/,
  ],
  [
    "case-only duplicate owner",
    (a) => {
      a.named_owner_certification.evidence.certifications[1].name =
        a.named_owner_certification.evidence.certifications[0].name.toUpperCase();
    },
    /four distinct people/,
  ],
  [
    "unsigned certification",
    (a) => {
      a.named_owner_certification.evidence.certifications[0].approvalRef = null;
    },
    /approval references/,
  ],
])
  test(`rejects ${name}`, () =>
    assert.throws(
      () => verifyBusinessPartnerR8Qualification(testQualification(mutate)),
      error,
    ));

test("recomputes artifact digest instead of accepting a formatted hash", () => {
  const fixture = testQualification();
  fixture.artifacts[Object.keys(fixture.artifacts)[0]] = Buffer.from("{}");
  assert.throws(
    () => verifyBusinessPartnerR8Qualification(fixture),
    /digest does not match/,
  );
});
test("pins owner review to exact prerequisite receipt bytes", () => {
  const fixture = testQualification();
  fixture.receiptBytes[Object.keys(fixture.receiptBytes)[0]] =
    Buffer.from("changed receipt");
  assert.throws(
    () => verifyBusinessPartnerR8Qualification(fixture),
    /reviewed receipt digest does not match/,
  );
});
test("does not allow widening the evidence root or duplicate gates", () => {
  assert.throws(
    () =>
      verifyBusinessPartnerR8Qualification({
        manifest: { ...baseManifest(), evidenceDirectory: "governance" },
      }),
    /evidence directory/,
  );
  const manifest = baseManifest();
  manifest.gates.push(manifest.gates[0]);
  assert.throws(
    () => verifyBusinessPartnerR8Qualification({ manifest }),
    /exactly the five/,
  );
});

test("requires every catalog category rather than a selected passing subset", () => {
  const fixture = testQualification((a) => {
    delete a.clean_upgrade_parity.evidence.catalogReport.differences.s3Views;
  });
  assert.throws(
    () => verifyBusinessPartnerR8Qualification(fixture),
    /complete S0-S5/,
  );
});
