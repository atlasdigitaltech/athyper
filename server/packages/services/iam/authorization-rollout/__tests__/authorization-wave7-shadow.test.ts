import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationShadowComparisonService,
  classifyMismatch,
  computeAuthorizationImmutableContextSha256,
  decisionsEqual,
  mustCompare,
  type AuthorizationComparableDecision,
  type AuthorizationImmutableShadowInput,
  type AuthorizationShadowComparisonRecord,
} from "../authorization-shadow-comparison.js";
import {
  evaluateAuthorizationCutoverGate,
  type AuthorizationCutoverGateInput,
} from "../authorization-cutover-gates.js";
import type {
  AuthorizationRolloutSelection,
} from "../authorization-rollout.types.js";

const selection: AuthorizationRolloutSelection = {
  mode: "shadow",
  planeKey: "neon",
  permissionCode: "finance.journal.post",
  reason: "matched_rule",
  policyRevision: "wave7-r1",
  ruleId: "finance-shadow",
  cohortCode: "finance-high-risk",
};

function input(
  overrides: Partial<AuthorizationImmutableShadowInput> = {},
): AuthorizationImmutableShadowInput {
  const identityContext = overrides.identityContext ?? {
    principalId: "principal-a",
    tenantId: "tenant-a",
    assurance: { mfa: true },
  };
  return {
    requestId: "req-1",
    immutableContextSha256:
      computeAuthorizationImmutableContextSha256(identityContext),
    plane: "neon",
    consumerPath: "single",
    actionClass: "financial_posting",
    permissionCode: "finance.journal.post",
    cohortCode: "finance-high-risk",
    catalogVersion: "catalog-1",
    identityContext,
    ...overrides,
  };
}

function decision(
  overrides: Partial<AuthorizationComparableDecision> = {},
): AuthorizationComparableDecision {
  return {
    plane: "neon",
    decision: "allow",
    permissionCodes: ["finance.journal.post"],
    scopes: [{ kind: "company_code", values: ["B", "A"] }],
    reason: "allowed",
    evidenceKinds: ["ordinary_authority"],
    ...overrides,
  };
}

describe("Wave 7 shadow comparison", () => {
  it("returns only the legacy decision while comparing all paths to target truth", async () => {
    const records: AuthorizationShadowComparisonRecord[] = [];
    const seenInputs: AuthorizationImmutableShadowInput[] = [];
    const service = new AuthorizationShadowComparisonService({
      sink: { append: async (record) => void records.push(record) },
      resolveOwner: () => "finance-iam",
      lowRiskSampleNumerator: 0,
    });
    const legacy = decision({ decision: "deny", reason: "legacy_deny" });
    const v2 = decision();
    const result = await service.decide(selection, input(), {
      evaluateLegacy: async (value) => {
        seenInputs.push(value);
        return legacy;
      },
      evaluateV2: async (value) => {
        seenInputs.push(value);
        return v2;
      },
      evaluateApprovedTargetTruth: async (value) => {
        seenInputs.push(value);
        return v2;
      },
    });

    expect(result).toEqual({
      authoritative: "legacy",
      decision: expect.objectContaining({
        decision: "deny",
        permissionCodes: ["finance.journal.post"],
      }),
      sampled: true,
    });
    expect(seenInputs).toHaveLength(3);
    expect(new Set(seenInputs).size).toBe(1);
    expect(Object.isFrozen(seenInputs[0])).toBe(true);
    expect(Object.isFrozen(seenInputs[0]!.identityContext)).toBe(true);
    expect(records).toEqual([
      expect.objectContaining({
        status: "mismatch",
        legacyMatchesTarget: false,
        v2MatchesTarget: true,
        ownerTeam: "finance-iam",
        expectedDisposition: "unclassified",
      }),
    ]);
  });

  it("normalizes exact typed scopes and permissions without unioning them", () => {
    expect(decisionsEqual(
      decision({
        permissionCodes: ["b", "a"],
        scopes: [
          { kind: "legal_entity", values: ["2", "1"] },
          { kind: "company_code", values: ["B", "A"] },
        ],
      }),
      decision({
        permissionCodes: ["a", "b"],
        scopes: [
          { kind: "company_code", values: ["A", "B"] },
          { kind: "legal_entity", values: ["1", "2"] },
        ],
      }),
    )).toBe(true);
    expect(decisionsEqual(
      decision({ permissionCodes: ["legacy.allow"] }),
      decision({ permissionCodes: ["v2.allow"] }),
    )).toBe(false);
  });

  it("forces 100% comparison for every high-risk action class", async () => {
    for (const action of [
      "mutation",
      "admin_action",
      "financial_posting",
      "workflow_decision",
      "delegation_use",
      "acl_protected_read",
    ] as const) {
      expect(mustCompare(action)).toBe(true);
    }
    const sink = vi.fn(async () => undefined);
    const service = new AuthorizationShadowComparisonService({
      sink: { append: sink },
      resolveOwner: () => "iam",
      lowRiskSampleNumerator: 0,
    });
    await service.decide(selection, input({ actionClass: "mutation" }), {
      evaluateLegacy: async () => decision(),
      evaluateV2: async () => decision(),
      evaluateApprovedTargetTruth: async () => decision(),
    });
    expect(sink).toHaveBeenCalledOnce();
  });

  it("samples only routine reads and reports target-truth absence as a data defect", async () => {
    const records: AuthorizationShadowComparisonRecord[] = [];
    const service = new AuthorizationShadowComparisonService({
      sink: { append: async (record) => void records.push(record) },
      resolveOwner: () => undefined,
      lowRiskSampleNumerator: 0,
    });
    const skipped = await service.decide(
      selection,
      input({ actionClass: "routine_read" }),
      {
        evaluateLegacy: async () => decision(),
        evaluateV2: async () => {
          throw new Error("must not run");
        },
        evaluateApprovedTargetTruth: async () => {
          throw new Error("must not run");
        },
      },
    );
    expect(skipped.sampled).toBe(false);
    expect(records).toEqual([]);

    await service.decide(
      selection,
      input({ actionClass: "acl_protected_read", consumerPath: "acl" }),
      {
        evaluateLegacy: async () => decision(),
        evaluateV2: async () => decision(),
        evaluateApprovedTargetTruth: async () => null,
      },
    );
    expect(records[0]).toEqual(expect.objectContaining({
      status: "mismatch",
      mismatchClasses: expect.arrayContaining(["acl", "data_defect"]),
      ownerTeam: "unowned",
    }));
  });

  it("classifies entitlement, operation, scope, delegation, and ACL differences", () => {
    expect(classifyMismatch(
      input({ actionClass: "delegation_use", consumerPath: "acl" }),
      decision({
        permissionCodes: ["legacy.generic"],
        scopes: [{ kind: "company_code", values: ["A"] }],
        reason: "entitlement_unavailable",
      }),
      decision({
        scopes: [{ kind: "company_code", values: ["B"] }],
        evidenceKinds: ["delegation", "record_acl"],
      }),
      decision(),
    )).toEqual(expect.arrayContaining([
      "acl",
      "capability",
      "delegation",
      "entitlement",
      "operation_mapping",
      "scope",
    ]));
  });

  it("classifies a target-truth-only decision difference and rejects a false context hash", async () => {
    expect(classifyMismatch(
      input(),
      decision(),
      decision(),
      decision({ decision: "deny", reason: "target_deny" }),
    )).toContain("precedence");

    const service = new AuthorizationShadowComparisonService({
      sink: { append: async () => undefined },
      resolveOwner: () => "iam",
    });
    await expect(service.decide(
      selection,
      input({ immutableContextSha256: "a".repeat(64) }),
      {
        evaluateLegacy: async () => decision(),
        evaluateV2: async () => decision(),
        evaluateApprovedTargetTruth: async () => decision(),
      },
    )).rejects.toThrow("immutable context SHA-256 mismatch");
  });
});

function cutover(
  overrides: Partial<AuthorizationCutoverGateInput> = {},
): AuthorizationCutoverGateInput {
  return {
    transition: "enforce_reads",
    sourceWatermark: 100n,
    appliedWatermark: 100n,
    maximumAllowedLag: 0n,
    partialSourceTransactions: 0,
    unreconciledConservationRows: 0,
    unexplainedHighRiskMismatches: 0,
    unownedMismatches: 0,
    approvedActiveUserParity: true,
    legacyWriterSole: true,
    authorizationWriteFreezeActive: false,
    cacheInvalidationVerifiedUnderLoad: true,
    decisionEvidenceVerifiedUnderLoad: true,
    instantRollbackPromised: false,
    rollbackProjectionStatus: "none",
    observationWindowComplete: false,
    ...overrides,
  };
}

describe("Wave 7 cutover gates", () => {
  it("allows read enforcement while legacy remains the sole writer", () => {
    expect(evaluateAuthorizationCutoverGate(cutover())).toEqual({
      allowed: true,
      reasons: [],
      lag: 0n,
    });
  });

  it("blocks partial projection, lag, parity gaps, and unexplained mismatches", () => {
    const result = evaluateAuthorizationCutoverGate(cutover({
      sourceWatermark: 105n,
      maximumAllowedLag: 2n,
      partialSourceTransactions: 1,
      unreconciledConservationRows: 2,
      unexplainedHighRiskMismatches: 1,
      unownedMismatches: 1,
      approvedActiveUserParity: false,
    }));
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "projection_lag_above_threshold",
      "partial_source_transaction",
      "conservation_reconciliation_incomplete",
      "unexplained_high_risk_mismatch",
      "unowned_mismatch",
      "approved_active_user_parity_incomplete",
    ]));
  });

  it("requires freeze, zero lag, and tested reverse projection for writer switch", () => {
    const blocked = evaluateAuthorizationCutoverGate(cutover({
      transition: "switch_writer",
      sourceWatermark: 101n,
      authorizationWriteFreezeActive: false,
      instantRollbackPromised: true,
      rollbackProjectionStatus: "reviewed",
    }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons).toEqual(expect.arrayContaining([
      "authorization_write_freeze_not_active",
      "writer_switch_requires_zero_lag",
      "rollback_projection_not_tested",
    ]));

    expect(evaluateAuthorizationCutoverGate(cutover({
      transition: "switch_writer",
      authorizationWriteFreezeActive: true,
      instantRollbackPromised: true,
      rollbackProjectionStatus: "tested",
    })).allowed).toBe(true);
  });

  it("cannot complete before the observation window", () => {
    expect(evaluateAuthorizationCutoverGate(cutover({
      transition: "complete_observation",
    })).reasons).toContain("observation_window_incomplete");
  });
});
