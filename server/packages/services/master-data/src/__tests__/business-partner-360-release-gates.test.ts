import { describe, expect, it } from "vitest";
import {
  evaluateBusinessPartner360Release,
  evaluateBusinessPartner360Retirement,
  type BusinessPartner360ReleaseEvidence,
  BUSINESS_PARTNER_360_APPROVAL_GATES,
  evaluateBusinessPartner360Approvals,
} from "../business-partner-360-release-gates.js";
const approvals = BUSINESS_PARTNER_360_APPROVAL_GATES.map((gate) => ({
  gate,
  status: "approved" as const,
  approverId: `owner.${gate}`,
  approvedAt: "2026-08-30T12:00:00+08:00",
  evidenceRef: `evidence/bp360/${gate}/approval-001`,
}));
const evidence: BusinessPartner360ReleaseEvidence = {
  stage: "canary",
  observationMinutes: 1440,
  requestCount: 1000,
  summaryP95Ms: 450,
  sectionP95Ms: 700,
  errorRate: 0.005,
  meshFallbackRate: 0.02,
  summaryPayloadP95Bytes: 60_000,
  sectionPayloadP95Bytes: 90_000,
  definitionUnavailableCount: 0,
  functionalPassed: true,
  dataPassed: true,
  securityPrivacyPassed: true,
  contractPassed: true,
  performancePassed: true,
  resiliencePassed: true,
  uxPassed: true,
  operationsPassed: true,
  approvals,
};
describe("Business Partner 360 release gates", () => {
  it("promotes only a measured passing cohort", () => {
    expect(evaluateBusinessPartner360Release(evidence)).toEqual({
      decision: "promote",
      reasons: [],
      nextStage: "broad",
    });
  });
  it("rolls back on privacy, compatibility, definition, SLO, or payload breach", () => {
    expect(
      evaluateBusinessPartner360Release({
        ...evidence,
        securityPrivacyPassed: false,
        summaryP95Ms: 501,
        definitionUnavailableCount: 1,
      }).decision,
    ).toBe("rollback");
  });
  it("holds an under-observed cohort without calling it a failure", () => {
    expect(
      evaluateBusinessPartner360Release({
        ...evidence,
        observationMinutes: 30,
        requestCount: 20,
      }),
    ).toMatchObject({
      decision: "hold",
      reasons: expect.arrayContaining([
        "OBSERVATION_WINDOW_INCOMPLETE",
        "SAMPLE_SIZE_INSUFFICIENT",
      ]),
    });
  });
  it("requires one accountable durable approval for every release gate", () => {
    expect(evaluateBusinessPartner360Approvals(approvals)).toEqual([]);
    expect(
      evaluateBusinessPartner360Release({
        ...evidence,
        approvals: approvals.filter((approval) => approval.gate !== "privacy" && approval.gate !== "operations"),
      }),
    ).toMatchObject({
      decision: "hold",
      reasons: expect.arrayContaining(["OPERATIONS_APPROVAL_MISSING"]),
    });
    expect(
      evaluateBusinessPartner360Approvals([
        ...approvals,
        {...approvals[0]!, evidenceRef: "raw secret value is forbidden"},
      ]),
    ).toEqual(expect.arrayContaining(["FUNCTIONAL_APPROVAL_DUPLICATE"]));
  });
  it("keeps retirement separate until zero traffic, 30 days, rollback and three owners approve", () => {
    expect(
      evaluateBusinessPartner360Retirement({
        legacyCalls: 0,
        knownConsumers: 0,
        observationDays: 30,
        telemetryRetentionDays: 31,
        trafficEvidenceRef: "telemetry/bp360/zero-calls/window-001",
        zeroCallWindowStartedAt: "2026-07-30T12:00:00+08:00",
        zeroCallWindowEndedAt: "2026-08-30T12:00:00+08:00",
        compatibilityTestsPassed: true,
        rollbackApproved: true,
        rollbackApprovalRef: "release/bp360/rollback/approval-001",
        ownerApprovals: ["product", "security", "operations"].map((ownerRole) => ({ ownerRole, approverId: `owner.${ownerRole}`, approvedAt: "2026-08-30T12:00:00+08:00", evidenceRef: `release/bp360/retirement/${ownerRole}` })),
      }),
    ).toEqual({ approved: true, reasons: [] });
    expect(
      evaluateBusinessPartner360Retirement({
        legacyCalls: 1,
        knownConsumers: 0,
        observationDays: 29,
        telemetryRetentionDays: 1,
        compatibilityTestsPassed: true,
        rollbackApproved: false,
        ownerApprovals: [],
      }),
    ).toMatchObject({
      approved: false,
      reasons: expect.arrayContaining([
        "LEGACY_TRAFFIC_PRESENT",
        "ROLLBACK_NOT_APPROVED",
        "TELEMETRY_RETENTION_INSUFFICIENT",
      ]),
    });
  });
});
