import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_PARTNER_360_P1_APPROVAL_GATES,
  BUSINESS_PARTNER_360_P1_EVIDENCE_CODES,
  BUSINESS_PARTNER_360_P1_PROVIDER_CODES,
  evaluateBusinessPartner360P1Qualification,
  type BusinessPartner360P1QualificationPacket,
} from "../../business-partner-360/evaluate-business-partner-360-p1-qualification.js";

test("P1 packet reports the unconfigured release environment without converting skips or simulations into passes", () => {
  const packet = pendingP1Packet();
  const result = evaluateBusinessPartner360P1Qualification(
    packet,
    pendingP1Approvals(),
  );
  assert.equal(result.releaseReady, false);
  assert.deepEqual(result.pendingEvidence, [
    "protected_value_deployment",
    "attachment_expiry",
    "mesh_live_transport",
    "studio_durable_failover",
    "authenticated_browser",
    "http_performance",
    "manual_accessibility",
    "notification_oncall",
  ]);
  assert.deepEqual(
    result.pendingApprovals,
    BUSINESS_PARTNER_360_P1_APPROVAL_GATES,
  );
  assert.deepEqual(result.invalid, ["RELEASE_ENVIRONMENT_INVALID"]);
  assert.equal(packet.browser.executedCases, 0);
  assert.equal(packet.browser.skippedCases, 10);
});

test("P1 accepts only complete measured qualification plus eight durable approvals", () => {
  const original = pendingP1Packet();
  const packet: BusinessPartner360P1QualificationPacket = {
    ...original,
    environment: {
      name: "qa-release-20260830",
      classification: "release_non_production",
      environmentRef: "environments/qa-release-20260830/deployment-42",
    },
    evidence: original.evidence.map((value) => ({
      ...value,
      status: "passed" as const,
    })),
    browser: {
      executedCases: 14,
      skippedCases: 0,
      fixtureFamilies: [
        "organization",
        "supplier",
        "customer",
        "dual_role",
        "person_workforce",
        "external_worker",
        "mesh_linked",
      ],
    },
    performance: {
      summaryP95Ms: 499,
      sectionP95Ms: 749,
      firstUsefulIdentityP75Ms: 1499,
      cachedSwitchMaxMs: 99,
      summaryPayloadP95Bytes: 75 * 1024,
      sectionPayloadP95Bytes: 100 * 1024,
    },
    accessibility: {
      supportedBrowsers: ["chromium", "firefox", "webkit"],
      screenReader: true,
      keyboardFocus: true,
      reflow200Percent: true,
      responsive: true,
      localization: true,
      rtl: true,
    },
    operations: {
      sinkRef: "alerts/nonprod/bp360/exercise-42",
      deliveredAt: "2026-08-30T16:00:00+08:00",
      acknowledgedAt: "2026-08-30T16:01:00+08:00",
      participantIds: ["oncall.primary", "support.lead"],
    },
  };
  const approvals = BUSINESS_PARTNER_360_P1_APPROVAL_GATES.map((gate) => ({
    gate,
    status: "approved" as const,
    approverId: `owner.${gate}`,
    approvedAt: "2026-08-30T17:00:00+08:00",
    evidenceRef: `release/bp360/${gate}/approval-001`,
  }));
  assert.deepEqual(
    evaluateBusinessPartner360P1Qualification(packet, approvals),
    {
      qualificationComplete: true,
      approvalsComplete: true,
      releaseReady: true,
      pendingEvidence: [],
      pendingApprovals: [],
      invalid: [],
    },
  );
});

test("P1 rejects an unapproved connected provider and claimed pass with incomplete measurements", () => {
  const original = pendingP1Packet();
  const packet: BusinessPartner360P1QualificationPacket = {
    ...original,
    environment: {
      name: "qa",
      classification: "release_non_production",
      environmentRef: "environments/qa/deployment-42",
    },
    evidence: original.evidence.map((value) => ({
      ...value,
      status: "passed" as const,
    })),
    providers: original.providers.map((value) =>
      value.code === "finance"
        ? { code: value.code, status: "connected" as const }
        : value,
    ),
  };
  const result = evaluateBusinessPartner360P1Qualification(packet, []);
  assert.equal(result.releaseReady, false);
  assert.ok(
    result.invalid.includes("PROVIDER_FINANCE_OWNER_APPROVAL_REQUIRED"),
  );
  assert.ok(result.invalid.includes("AUTHENTICATED_BROWSER_EXECUTION_INVALID"));
  assert.ok(result.invalid.includes("SUMMARY_P95_MS_INVALID"));
  assert.ok(
    result.invalid.includes("MANUAL_ACCESSIBILITY_CERTIFICATION_INVALID"),
  );
  assert.ok(result.invalid.includes("NOTIFICATION_ONCALL_EVIDENCE_INVALID"));
});

function pendingP1Packet(): BusinessPartner360P1QualificationPacket {
  return {
    schemaVersion: 1,
    kind: "athyper.business-partner-360.p1-qualification",
    release: "phase-1",
    environment: {
      name: "release-environment-unassigned",
      classification: "release_non_production",
      environmentRef: null,
    },
    evidence: BUSINESS_PARTNER_360_P1_EVIDENCE_CODES.map((code) => ({
      code,
      status: code === "provider_authority" ? "passed" : "pending",
      evidenceRef: `docs/architecture/test-contracts/${code}.json`,
    })),
    providers: BUSINESS_PARTNER_360_P1_PROVIDER_CODES.map((code) => ({
      code,
      status: "not_configured",
      reasonCode: "PROVIDER_NOT_CONFIGURED",
    })),
    browser: { executedCases: 0, skippedCases: 10, fixtureFamilies: [] },
    performance: {
      summaryP95Ms: null,
      sectionP95Ms: null,
      firstUsefulIdentityP75Ms: null,
      cachedSwitchMaxMs: null,
      summaryPayloadP95Bytes: null,
      sectionPayloadP95Bytes: null,
    },
    accessibility: {
      supportedBrowsers: [],
      screenReader: false,
      keyboardFocus: false,
      reflow200Percent: false,
      responsive: false,
      localization: false,
      rtl: false,
    },
    operations: {
      sinkRef: null,
      deliveredAt: null,
      acknowledgedAt: null,
      participantIds: [],
    },
  };
}

function pendingP1Approvals(): Parameters<
  typeof evaluateBusinessPartner360P1Qualification
>[1] {
  return BUSINESS_PARTNER_360_P1_APPROVAL_GATES.map((gate) => ({
    gate,
    status: "pending",
    approverId: null,
    approvedAt: null,
    evidenceRef: null,
  }));
}
