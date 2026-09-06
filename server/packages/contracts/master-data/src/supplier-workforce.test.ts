import { describe, expect, it } from "vitest";
import {
  evaluateSupplierWorkforceGate,
  getSupplierWorkforcePolicyReadiness,
  parseSupplierWorkforcePolicyCoordinates,
  supplierWorkforceScenarioIds,
  type ApprovedPolicyCoordinate,
} from "./supplier-workforce.js";

const approved = (
  decisionId: ApprovedPolicyCoordinate["decisionId"],
  hashCharacter: string,
): ApprovedPolicyCoordinate => ({
  decisionId,
  version: 1,
  hash: hashCharacter.repeat(64),
  approvedAt: "2026-09-05T00:00:00.000Z",
  approvalEvidenceId: "11111111-1111-4111-8111-111111111111",
  approvedByRoles:
    decisionId === "BP-Q004"
      ? ["workforce", "procurement", "legal"]
      : ["privacy", "legal", "workforce"],
});

describe("R7 Supplier Workforce policy boundary", () => {
  it("freezes all ten acceptance scenarios in order", () => {
    expect(supplierWorkforceScenarioIds).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `BP-WRK-${String(index + 1).padStart(3, "0")}`,
      ),
    );
  });

  it("allows requisition publication without candidate or commercial policy", () => {
    expect(evaluateSupplierWorkforceGate("requisition_publish", {})).toEqual({
      allowed: true,
      reasonCodes: [],
      policyHashes: [],
    });
  });

  it("fails candidate disclosure closed while BP-Q006 is unresolved", () => {
    expect(evaluateSupplierWorkforceGate("candidate_disclose", {})).toEqual({
      allowed: false,
      reasonCodes: ["BP_Q006_CANDIDATE_PRIVACY_POLICY_REQUIRED"],
      policyHashes: [],
    });
  });

  it("requires both approved coordinates before materialization or IAM", () => {
    const candidatePrivacy = approved("BP-Q006", "b");
    expect(
      evaluateSupplierWorkforceGate("person_resolve", { candidatePrivacy }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateSupplierWorkforceGate("iam_project", { candidatePrivacy }),
    ).toMatchObject({
      allowed: false,
      reasonCodes: ["BP_Q004_COMMERCIAL_POLICY_REQUIRED"],
    });
    expect(
      evaluateSupplierWorkforceGate("iam_project", {
        commercial: approved("BP-Q004", "a"),
        candidatePrivacy,
      }),
    ).toEqual({
      allowed: true,
      reasonCodes: [],
      policyHashes: ["a".repeat(64), "b".repeat(64)],
    });
  });

  it("rejects malformed or swapped approval coordinates", () => {
    expect(
      evaluateSupplierWorkforceGate("candidate_disclose", {
        candidatePrivacy: approved("BP-Q004", "a"),
      }),
    ).toMatchObject({
      allowed: false,
      reasonCodes: ["BP_Q006_CANDIDATE_PRIVACY_POLICY_REQUIRED"],
    });
  });

  it("loads only fully ratified coordinates and exposes bounded readiness", () => {
    const policies = parseSupplierWorkforcePolicyCoordinates(
      JSON.stringify({
        commercial: approved("BP-Q004", "a"),
        candidatePrivacy: approved("BP-Q006", "b"),
      }),
    );
    const readiness = getSupplierWorkforcePolicyReadiness(policies);
    expect(readiness.decisions["BP-Q004"]).toMatchObject({ status: "approved", version: 1 });
    expect(readiness.decisions["BP-Q006"]).toMatchObject({ status: "approved", version: 1 });
    expect(readiness.boundaries.iam_project).toMatchObject({ allowed: true });
  });

  it("rejects missing accountable roles and defaults to a closed pending state", () => {
    expect(getSupplierWorkforcePolicyReadiness(parseSupplierWorkforcePolicyCoordinates(undefined))).toMatchObject({
      decisions: { "BP-Q004": { status: "pending" }, "BP-Q006": { status: "pending" } },
      boundaries: {
        candidate_disclose: { allowed: false },
        commercial_approve: { allowed: false },
        iam_project: { allowed: false },
      },
    });
    expect(() => parseSupplierWorkforcePolicyCoordinates(JSON.stringify({
      candidatePrivacy: { ...approved("BP-Q006", "b"), approvedByRoles: ["privacy", "workforce"] },
    }))).toThrow(/Privacy\/Legal\/Workforce/);
  });
});
