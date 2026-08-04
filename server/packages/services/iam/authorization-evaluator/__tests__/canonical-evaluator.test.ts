import { describe, expect, it } from "vitest";

import {
  CanonicalAuthorizationEvaluator,
  applyCollectionMaterialization,
  createMeshAuthorizationRepository,
  createNeonAdminAuthorizationRepository,
  evaluateLoadedFacts,
} from "../index.js";
import type {
  CanonicalDecisionRequest,
  DecisionFacts,
  DelegationAllowProof,
  RecordAclAllowProof,
} from "../index.js";
import {
  AVAILABLE,
  NOW,
  PASSING_GATES,
  PERMISSION,
  SUBJECT,
  deny,
  facts,
  groupRole,
  request,
  scope,
  tenantScope,
} from "./truth-table.fixtures.js";

class FixtureLoader {
  constructor(private readonly rows: ReadonlyMap<string, DecisionFacts>) {}
  async loadNeonAdminFacts(requests: readonly CanonicalDecisionRequest[]) {
    return requests.map((request) => this.require(request.requestId));
  }
  async loadMeshFacts(requests: readonly CanonicalDecisionRequest[]) {
    return requests.map((request) => this.require(request.requestId));
  }
  private require(requestId: string): DecisionFacts {
    const row = this.rows.get(requestId);
    if (!row) throw new Error(`missing fixture ${requestId}`);
    return row;
  }
}

describe.each(["neon_admin", "mesh"] as const)(
  "%s repository contract",
  (authority) => {
    it("uses the same implementation for single and batch decisions", async () => {
      const target = request("same-engine", "invoice-1", {
        company_code: "company-a",
      });
      const row = facts("same-engine", [
        groupRole("role-a", [scope("company-a", {
          company_code: ["company-a"],
        })]),
      ]);
      const loader = new FixtureLoader(new Map([[row.requestId, row]]));
      const repository = authority === "neon_admin"
        ? createNeonAdminAuthorizationRepository(loader)
        : createMeshAuthorizationRepository(loader);
      const evaluator = new CanonicalAuthorizationEvaluator(repository);
      expect(await evaluator.evaluate(target)).toEqual(
        (await evaluator.evaluateBatch([target]))[0],
      );
    });
  },
);

describe("canonical evaluator truth table", () => {
  it("intersects scopes inside a proof path and unions alternative paths", () => {
    const paths = [
      groupRole("path-a", [
        scope("company-a", { company_code: ["company-a"] }),
        scope("org-x", { operating_organization: ["org-x"] }),
      ]),
      groupRole("path-b", [
        scope("company-b", { company_code: ["company-b"] }),
      ]),
    ];
    const companyAAndOrg = request("a-org", "record-a", {
      company_code: "company-a",
      operating_organization: "org-x",
    });
    const companyAOnly = request("a-only", "record-b", {
      company_code: "company-a",
      operating_organization: "org-y",
    });
    const companyB = request("b", "record-c", {
      company_code: "company-b",
    });

    expect(evaluateLoadedFacts(
      companyAAndOrg,
      facts(companyAAndOrg.requestId, paths),
    ).decision).toBe("allow");
    expect(evaluateLoadedFacts(
      companyAOnly,
      facts(companyAOnly.requestId, paths),
    ).decision).toBe("deny");
    expect(evaluateLoadedFacts(
      companyB,
      facts(companyB.requestId, paths),
    ).decision).toBe("allow");
  });

  it("subtracts collection denies without globally intersecting allow paths", () => {
    const collection: CanonicalDecisionRequest = {
      requestId: "collection",
      mode: "collection",
      subject: SUBJECT,
      evaluatedAt: NOW,
      entityOperationId: "invoice-update",
    };
    const result = evaluateLoadedFacts(collection, facts("collection", [
      groupRole("path-a", [
        scope("company-a", { company_code: ["company-a"] }),
      ]),
      groupRole("path-b", [
        scope("company-b", { company_code: ["company-b"] }),
      ]),
    ], {
      denies: [
        deny("deny-company-a", scope("deny-a", {
          company_code: ["company-a"],
        })),
      ],
    }));
    expect(result.mode).toBe("collection");
    if (result.mode !== "collection") throw new Error("wrong result mode");
    expect(applyCollectionMaterialization(result, [
      {
        tenantOrAccountId: "tenant-1",
        entityId: "invoice",
        recordId: "record-a",
        dimensions: { company_code: "company-a" },
      },
      {
        tenantOrAccountId: "tenant-1",
        entityId: "invoice",
        recordId: "record-b",
        dimensions: { company_code: "company-b" },
      },
    ])).toEqual(new Set(["record-b"]));
  });

  it("does not activate a group deny through inactive membership", () => {
    const target = request("inactive-deny", "record-a", {
      company_code: "company-a",
    });
    const result = evaluateLoadedFacts(target, facts(target.requestId, [
      groupRole("ordinary", [tenantScope()]),
    ], {
      denies: [
        deny("inactive-group-deny", tenantScope("deny-tenant"), {
          subjectKind: "group",
          groupMembershipActive: false,
        }),
      ],
    }));
    expect(result.decision).toBe("allow");
    expect(result.evidence.matchingDenyIds).toEqual([]);
  });

  it("keeps ACL authority isolated to the exact record", () => {
    const acl: RecordAclAllowProof = {
      kind: "record_acl",
      proofId: "acl-proof",
      permissionId: PERMISSION.permissionId,
      active: true,
      constraints: [tenantScope()],
      recordAclId: "acl-1",
      permissionShareable: true,
      entityId: "invoice",
      recordId: "shared-record",
    };
    const shared = request("shared", "shared-record", {});
    const other = request("other", "other-record", {});
    expect(evaluateLoadedFacts(
      shared,
      facts(shared.requestId, [acl]),
    ).decision).toBe("allow");
    expect(evaluateLoadedFacts(
      other,
      facts(other.requestId, [acl]),
    ).decision).toBe("deny");

    const collection: CanonicalDecisionRequest = {
      requestId: "acl-collection",
      mode: "collection",
      subject: SUBJECT,
      evaluatedAt: NOW,
      entityOperationId: "invoice-update",
    };
    const materialized = evaluateLoadedFacts(
      collection,
      facts(collection.requestId, [acl]),
    );
    if (materialized.mode !== "collection") throw new Error("wrong result mode");
    expect(materialized.materialization.organizationalAllowClauses).toEqual([]);
    expect(materialized.materialization.sharedRecords).toEqual([{
      proofId: "acl-proof",
      entityId: "invoice",
      recordId: "shared-record",
    }]);
  });

  it("requires ordinary provenance and a scope subset for delegation", () => {
    const delegatedCompany = scope("delegated-a", {
      company_code: ["company-a"],
    });
    const ordinaryCompanies = scope("ordinary-ab", {
      company_code: ["company-a", "company-b"],
    });
    const delegation: DelegationAllowProof = {
      kind: "delegation",
      proofId: "delegation-proof",
      permissionId: PERMISSION.permissionId,
      active: true,
      constraints: [delegatedCompany],
      delegationId: "delegation-1",
      permissionDelegable: true,
      delegatorOrdinaryProofIds: ["ordinary-proof"],
      upstreamAuthorityKinds: ["group_role"],
      delegatedScopes: [delegatedCompany],
      delegatorOrdinaryScopes: [ordinaryCompanies],
    };
    const target = request("delegated", "record-a", {
      company_code: "company-a",
    });
    expect(evaluateLoadedFacts(
      target,
      facts(target.requestId, [delegation]),
    ).decision).toBe("allow");
    expect(evaluateLoadedFacts(
      target,
      facts(target.requestId, [{
        ...delegation,
        upstreamAuthorityKinds: ["record_acl"],
      }]),
    ).decision).toBe("deny");
    expect(evaluateLoadedFacts(
      target,
      facts(target.requestId, [{
        ...delegation,
        delegatedScopes: [tenantScope("too-broad")],
      }]),
    ).decision).toBe("deny");
  });

  it("makes entitlement unavailability win before an allow override", () => {
    const target = request("entitlement-first", "record-a", {});
    const result = evaluateLoadedFacts(target, facts(target.requestId, [{
      kind: "override",
      proofId: "override-proof",
      permissionId: PERMISSION.permissionId,
      active: true,
      constraints: [tenantScope()],
      overrideId: "override-1",
      approved: true,
      expiresAt: new Date("2026-07-28T00:00:00.000Z"),
    }], {
      entitlement: {
        ...AVAILABLE,
        available: false,
        reason: "feature_suspended",
      },
    }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("entitlement_unavailable");
    expect(result.evidence.matchingAllowProofIds).toEqual([]);
  });

  it("rejects direct entity permissions in registered capability mode", () => {
    const capability: CanonicalDecisionRequest = {
      requestId: "bad-capability",
      mode: "registered_capability",
      subject: SUBJECT,
      evaluatedAt: NOW,
      permissionId: PERMISSION.permissionId,
    };
    const result = evaluateLoadedFacts(
      capability,
      facts(capability.requestId, [groupRole("role", [tenantScope()])], {
        gates: PASSING_GATES,
      }),
    );
    expect(result.reason).toBe("request_not_exact");
  });
});
