import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  BUSINESS_PARTNER_360_P0_APPROVAL_GATES,
  BUSINESS_PARTNER_360_P0_EVIDENCE_CODES,
  evaluateBusinessPartner360P0Approvals,
  type BusinessPartner360P0ApprovalPacket,
} from "../../business-partner-360/evaluate-business-partner-360-p0-approvals.js";
import { provisionBusinessPartner360AcceptanceFixtures } from "../../business-partner-360/provision-business-partner-360-acceptance-fixtures.js";
import { runBusinessPartner360MaterializationEvidence } from "../../business-partner-360/run-business-partner-360-materialization-evidence.js";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("P0 plans exactly seven deterministic BP360 acceptance families", async () => {
  const plan = await provisionBusinessPartner360AcceptanceFixtures({
    neonDatabaseUrl: "postgresql://postgres@127.0.0.1:55432/athyper_neon",
    meshDatabaseUrl: "postgresql://postgres@127.0.0.1:55432/athyper_mesh",
    dryRun: true,
  });
  assert.equal(plan.mode, "planned");
  assert.deepEqual(
    plan.families.map((value) => value.family),
    [
      "organization",
      "supplier",
      "customer",
      "dual_role",
      "person_workforce",
      "external_worker",
      "mesh_linked",
    ],
  );
  assert.equal(
    new Set(plan.families.map((value) => value.businessPartnerId)).size,
    7,
  );
});

test("P0 disposable runner refuses shared containers and records manifest hashes", async () => {
  const runner = `${await read("db/scripts/provisioning/apply-disposable-ddl-manifest.ts")}\n${await read("db/scripts/provisioning/foundation-runner.ts")}`;
  assert.match(runner, /\^athyper-bs360-/);
  assert.match(runner, /athyper\.environment/);
  assert.match(runner, /disposable_local/);
  assert.match(runner, /business-partner-360-integration-baseline/);
  assert.match(runner, /manifestSha256/);
  assert.match(runner, /receiptCount/);
});

test("P0 fixture payload is risk-negative and person/workforce remains independent", async () => {
  const fixture = await read(
    "db/scripts/business-partner-360/provision-business-partner-360-acceptance-fixtures.ts",
  );
  assert.doesNotMatch(
    fixture,
    /risk(?:Score|Band|Class|Trend|Incident|Exposure)/i,
  );
  assert.match(fixture, /master\.person/);
  assert.match(fixture, /master\.employee/);
  assert.match(fixture, /master\.external_worker/);
  assert.match(fixture, /control\.mesh_business_partner_account_link/);
  assert.doesNotMatch(fixture, /person_sensitive_profile/);
});

test("P0 production repository evidence is local-only, rollback-only, and covers typed plus legacy policy", async () => {
  await assert.rejects(
    runBusinessPartner360MaterializationEvidence({
      neonDatabaseUrl:
        "postgresql://postgres@shared.example.test:5432/athyper_neon",
      confirmation: "RUN-BS360-MATERIALIZATION-EVIDENCE",
    }),
    /only loopback athyper_neon/,
  );
  await assert.rejects(
    runBusinessPartner360MaterializationEvidence({
      neonDatabaseUrl: "postgresql://postgres@127.0.0.1:55432/athyper_neon",
    }),
    /execution requires --confirm/,
  );
  const source = await read(
    "db/scripts/business-partner-360/run-business-partner-360-materialization-evidence.ts",
  );
  for (const value of [
    "KyselyBusinessPartnerCaseRepository",
    "extensionMaterializationCounts",
    "exactReplay",
    "fingerprintConflictRejected",
    "legacy_untyped",
    "legacyJsonInterpreted: false",
    "RollbackEvidence",
  ])
    assert.match(source, new RegExp(value));
});

test("P0 approval packet remains fail-closed until browser evidence and seven accountable approvals exist", () => {
  const packet = pendingP0Packet();
  const pending = evaluateBusinessPartner360P0Approvals(packet);
  assert.equal(pending.p0Closed, false);
  assert.deepEqual(pending.pendingEvidence, ["authenticated_browser_leakage"]);
  assert.deepEqual(pending.pendingApprovals, [
    "business_data",
    "architecture_contract",
    "release_owner",
    "integration_baseline",
    "materialization_legacy_policy",
    "security",
    "privacy_data_protection",
  ]);
  assert.deepEqual(pending.invalid, []);

  const complete = evaluateBusinessPartner360P0Approvals({
    ...packet,
    evidence: packet.evidence.map((item) => ({
      ...item,
      status: "passed" as const,
    })),
    approvals: packet.approvals.map((item, index) => ({
      ...item,
      status: "approved" as const,
      approverId: `owner.${item.gate}.${index}`,
      approvedAt: "2026-08-30T14:00:00+08:00",
      approvalRef: `release/bp360/p0/${item.gate}/approval-001`,
    })),
  });
  assert.equal(complete.p0Closed, true);
  assert.deepEqual(complete.invalid, []);

  const prematureSecurityApproval = evaluateBusinessPartner360P0Approvals({
    ...packet,
    approvals: completeApprovals(packet),
  });
  assert.equal(prematureSecurityApproval.p0Closed, false);
  assert.ok(
    prematureSecurityApproval.invalid.includes(
      "SECURITY_PRIVACY_APPROVED_BEFORE_BROWSER_EVIDENCE",
    ),
  );

  const sharedApprover = "owner.shared.security-privacy";
  const notIndependent = evaluateBusinessPartner360P0Approvals({
    ...packet,
    evidence: packet.evidence.map((item) => ({
      ...item,
      status: "passed" as const,
    })),
    approvals: packet.approvals.map((item, index) => ({
      ...item,
      status: "approved" as const,
      approverId: ["security", "privacy_data_protection"].includes(item.gate)
        ? sharedApprover
        : `owner.${item.gate}.${index}`,
      approvedAt: "2026-08-30T14:00:00+08:00",
      approvalRef: `release/bp360/p0/${item.gate}/approval-001`,
    })),
  });
  assert.equal(notIndependent.p0Closed, false);
  assert.ok(
    notIndependent.invalid.includes(
      "SECURITY_PRIVACY_APPROVERS_NOT_INDEPENDENT",
    ),
  );
});

function pendingP0Packet(): BusinessPartner360P0ApprovalPacket {
  return {
    schemaVersion: 1,
    kind: "athyper.business-partner-360.p0-approval-packet",
    release: "phase-1",
    evidence: BUSINESS_PARTNER_360_P0_EVIDENCE_CODES.map((code) => ({
      code,
      status: code === "authenticated_browser_leakage" ? "pending" : "passed",
      evidenceRef: `docs/architecture/test-contracts/${code}.json`,
    })),
    approvals: BUSINESS_PARTNER_360_P0_APPROVAL_GATES.map((gate) => ({
      gate,
      ownerRole: `Test owner for ${gate}`,
      status: "pending",
      approverId: null,
      approvedAt: null,
      evidenceRef: `docs/architecture/test-contracts/${gate}.json`,
      approvalRef: null,
    })),
  };
}

function completeApprovals(packet: BusinessPartner360P0ApprovalPacket) {
  return packet.approvals.map((item, index) => ({
    ...item,
    status: "approved" as const,
    approverId: `owner.${item.gate}.${index}`,
    approvedAt: "2026-08-30T14:00:00+08:00",
    approvalRef: `release/bp360/p0/${item.gate}/approval-001`,
  }));
}
