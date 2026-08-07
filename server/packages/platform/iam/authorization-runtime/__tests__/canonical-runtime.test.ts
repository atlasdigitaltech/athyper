import { describe, expect, it } from "vitest";

import type {
  AllowProof,
  CanonicalAuthorizationRepository,
  CanonicalDecisionRequest,
  DecisionFacts,
  ResolvedPermission,
  ScopeConstraint,
} from "../../authorization-evaluator/index.js";
import {
  CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
} from "../../authorization-evaluator/index.js";
import {
  CanonicalAuthorizationDeniedError,
  CanonicalConsumerAuthorization,
  NoopAuthorizationDecisionAuditSink,
  ProductionAuthorizationDecisionService,
  ProductionAuthorizationSessionV2Service,
  contextResource,
  createAuthorizationRequestContextV2,
  createMeshAuthorizationRuntime,
} from "../index.js";
import type {
  AuthorizationDecisionAuditRecord,
  AuthorizationDecisionAuditSink,
  SessionCatalogSnapshot,
} from "../index.js";

const NOW = new Date("2026-07-27T00:00:00.000Z");
const SUBJECT = {
  plane: "neon",
  tenantOrAccountId: "tenant-1",
  principalId: "principal-1",
  mfaSatisfied: true,
  sodSatisfied: true,
} as const;
const PERMISSION: ResolvedPermission = {
  permissionId: "permission-read",
  canonicalCode: "neon.invoice.read",
  entityId: "invoice",
  entityOperationId: "operation-read",
  registeredNonEntity: false,
  shareable: true,
  delegable: true,
};
const TENANT_SCOPE: ScopeConstraint = {
  scopeId: "tenant-scope",
  tenantOrAccountId: "tenant-1",
  tenantWide: true,
  dimensions: {},
};

class RecordingAudit implements AuthorizationDecisionAuditSink {
  readonly rows: AuthorizationDecisionAuditRecord[] = [];
  async append(rows: readonly AuthorizationDecisionAuditRecord[]) {
    this.rows.push(...rows);
  }
}

class FixtureRepository implements CanonicalAuthorizationRepository {
  readonly authority: "neon_admin" | "mesh";
  readonly contractVersion = CANONICAL_AUTHORIZATION_CONTRACT_VERSION;

  constructor(
    private readonly allows: readonly AllowProof[],
    private readonly catalogVersion = "catalog-v5",
    authority: "neon_admin" | "mesh" = "neon_admin",
  ) {
    this.authority = authority;
  }

  async loadDecisionFacts(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly DecisionFacts[]> {
    return requests.map((request) => ({
      requestId: request.requestId,
      permission: request.mode === "registered_capability"
        ? {
            permissionId: request.permissionId,
            canonicalCode: "neon.ai.execute",
            registeredNonEntity: true,
            shareable: false,
            delegable: false,
          }
        : PERMISSION,
      gates: {
        identityActive: true,
        principalActive: true,
        planeMembershipActive: true,
        requestResolvedExactly: true,
        permissionPlaneEligible: true,
        hardPolicySatisfied: true,
        mfaSatisfied: true,
        sodSatisfied: true,
      },
      entitlement: {
        available: true,
        evidenceId: "entitlement-1",
        semantics: request.subject.plane === "mesh"
          ? "mesh_account_product"
          : request.subject.plane === "admin"
          ? "admin_platform_managed"
          : "neon_plan_module_feature",
      },
      denies: [],
      allowProofs: request.mode === "registered_capability"
        ? [{
            kind: "group_role",
            proofId: "capability-role",
            permissionId: request.permissionId,
            active: true,
            constraints: [TENANT_SCOPE],
            groupActive: true,
            groupMembershipActive: true,
            roleAssignmentActive: true,
          }]
        : this.allows,
      catalogVersion: this.catalogVersion,
      policyVersion: "policy-v5",
    }));
  }
}

function groupAllow(): AllowProof {
  return {
    kind: "group_role",
    proofId: "group-role-1",
    permissionId: PERMISSION.permissionId,
    active: true,
    constraints: [TENANT_SCOPE],
    groupActive: true,
    groupMembershipActive: true,
    roleAssignmentActive: true,
  };
}

function aclAllow(recordId: string): AllowProof {
  return {
    kind: "record_acl",
    proofId: `acl-${recordId}`,
    permissionId: PERMISSION.permissionId,
    active: true,
    constraints: [TENANT_SCOPE],
    recordAclId: `acl-${recordId}`,
    permissionShareable: true,
    entityId: "invoice",
    recordId,
  };
}

function resource(recordId: string) {
  return {
    tenantOrAccountId: "tenant-1",
    entityId: "invoice",
    recordId,
    dimensions: {},
  };
}

describe("Wave 5 canonical runtime", () => {
  it("uses one implementation for single, batch, and materialization and audits all", async () => {
    const audit = new RecordingAudit();
    const service = new ProductionAuthorizationDecisionService(
      new FixtureRepository([groupAllow()]),
      audit,
    );
    const request: CanonicalDecisionRequest = {
      requestId: "single",
      mode: "entity_resource",
      subject: SUBJECT,
      assurance: { mfaSatisfied: true, sodSatisfied: true },
      evaluatedAt: NOW,
      entityOperationId: "operation-read",
      resource: resource("record-1"),
    };
    const single = await service.decide(request);
    const batch = await service.decideBatch([{ ...request, requestId: "batch" }]);
    const materialized = await service.materialize({
      requestId: "materialize",
      mode: "collection",
      subject: SUBJECT,
      assurance: { mfaSatisfied: true, sodSatisfied: true },
      evaluatedAt: NOW,
      entityOperationId: "operation-read",
    });
    expect(single.result.decision).toBe("allow");
    expect(batch.results[0]?.result.decision).toBe("allow");
    expect(materialized.materialization.organizationalAllowClauses)
      .toHaveLength(1);
    expect(audit.rows).toHaveLength(3);
  });

  it("keeps collection and resource semantics identical across consumers", async () => {
    const service = new ProductionAuthorizationDecisionService(
      new FixtureRepository([groupAllow()]),
      new NoopAuthorizationDecisionAuditSink(),
    );
    const consumers = new CanonicalConsumerAuthorization(service);
    const collectionResults = await Promise.all(
      (["list", "count", "export", "batch", "session"] as const).map(
        (consumer) => consumers.collection({
          consumer,
          subject: SUBJECT,
          entityOperationId: "operation-read",
          evaluatedAt: NOW,
        }),
      ),
    );
    expect(collectionResults.map((result) => result.materialization))
      .toEqual(collectionResults.map(() => collectionResults[0]!.materialization));

    const resourceResults = await Promise.all(
      ([
        "detail", "read", "download", "share", "update", "delete",
        "workflow", "document", "metadata", "admin", "ai",
      ] as const).map((consumer) => consumers.resource({
        consumer,
        subject: SUBJECT,
        entityOperationId: "operation-read",
        resource: resource("record-1"),
        evaluatedAt: NOW,
      })),
    );
    expect(resourceResults.map((result) => result.result.decision))
      .toEqual(resourceResults.map(() => "allow"));
  });

  it("enforces content and attachment ACLs only on the exact record", async () => {
    const consumers = new CanonicalConsumerAuthorization(
      new ProductionAuthorizationDecisionService(
        new FixtureRepository([aclAllow("shared-record")]),
        new NoopAuthorizationDecisionAuditSink(),
      ),
    );
    await expect(consumers.resource({
      consumer: "read",
      subject: SUBJECT,
      entityOperationId: "operation-read",
      resource: resource("shared-record"),
      evaluatedAt: NOW,
    })).resolves.toBeDefined();
    await expect(consumers.resource({
      consumer: "download",
      subject: SUBJECT,
      entityOperationId: "operation-read",
      resource: resource("other-record"),
      evaluatedAt: NOW,
    })).rejects.toBeInstanceOf(CanonicalAuthorizationDeniedError);
    await expect(consumers.resource({
      consumer: "document",
      subject: SUBJECT,
      entityOperationId: "operation-read",
      resource: resource("other-record"),
      evaluatedAt: NOW,
    })).rejects.toBeInstanceOf(CanonicalAuthorizationDeniedError);
  });

  it("rejects delegated authority without ordinary provenance/subset", async () => {
    const invalidDelegation: AllowProof = {
      kind: "delegation",
      proofId: "delegation-1",
      permissionId: PERMISSION.permissionId,
      active: true,
      constraints: [{
        scopeId: "delegated-company-b",
        tenantOrAccountId: "tenant-1",
        tenantWide: false,
        dimensions: { company_code: ["company-b"] },
      }],
      delegationId: "delegation-1",
      permissionDelegable: true,
      delegatorOrdinaryProofIds: ["ordinary-1"],
      upstreamAuthorityKinds: ["group_role"],
      delegatedScopes: [{
        scopeId: "delegated-company-b",
        tenantOrAccountId: "tenant-1",
        tenantWide: false,
        dimensions: { company_code: ["company-b"] },
      }],
      delegatorOrdinaryScopes: [{
        scopeId: "ordinary-company-a",
        tenantOrAccountId: "tenant-1",
        tenantWide: false,
        dimensions: { company_code: ["company-a"] },
      }],
    };
    const consumers = new CanonicalConsumerAuthorization(
      new ProductionAuthorizationDecisionService(
        new FixtureRepository([invalidDelegation]),
        new NoopAuthorizationDecisionAuditSink(),
      ),
    );
    await expect(consumers.resource({
      consumer: "workflow",
      subject: SUBJECT,
      entityOperationId: "operation-read",
      resource: {
        ...resource("record-b"),
        dimensions: { company_code: "company-b" },
      },
      evaluatedAt: NOW,
    })).rejects.toBeInstanceOf(CanonicalAuthorizationDeniedError);
  });

  it("builds session v2 from the evaluator catalog version and hides ACL-only access", async () => {
    const service = new ProductionAuthorizationDecisionService(
      new FixtureRepository([aclAllow("shared-record")]),
      new NoopAuthorizationDecisionAuditSink(),
    );
    const catalog: SessionCatalogSnapshot = {
      catalogVersion: "catalog-v5",
      entries: [{
        permissionId: PERMISSION.permissionId,
        canonicalCode: PERMISSION.canonicalCode,
        entityOperationId: PERMISSION.entityOperationId,
      }],
    };
    const sessions = new ProductionAuthorizationSessionV2Service(
      { resolve: async () => ({
        principalId: "principal-1",
        identityBindingId: "binding-1",
      }) },
      { load: async () => catalog },
      service,
      300,
    );
    const session = await sessions.resolve({
      externalSubjectId: "external-1",
      realmKey: "athyper",
      tenantOrAccountId: "tenant-1",
      plane: "neon",
      evaluatedAt: NOW,
      mfaSatisfied: true,
      sodSatisfied: true,
    });
    expect(session.catalogVersion).toBe("catalog-v5");
    expect(session.decisions[0]).toMatchObject({
      available: false,
      reason: "acl_record_only",
    });
    expect(session.decisions[0]?.organizationalScope?.sharedRecords)
      .toHaveLength(1);
    const context = createAuthorizationRequestContextV2({
      session,
      expectedCatalogVersion: "catalog-v5",
      mfaSatisfied: true,
      sodSatisfied: true,
      selectedDimensions: { company_code: "company-a" },
      now: NOW,
    });
    expect(contextResource(context, {
      entityId: "invoice",
      recordId: "shared-record",
    })).toMatchObject({
      tenantOrAccountId: "tenant-1",
      dimensions: { company_code: "company-a" },
    });
    expect(() => createAuthorizationRequestContextV2({
      session,
      expectedCatalogVersion: "catalog-other",
      mfaSatisfied: true,
      sodSatisfied: true,
      now: NOW,
    })).toThrow("session/UI and server catalog versions diverged");
  });

  it("fails closed on missing Mesh configuration and exposes no Neon fallback", () => {
    expect(() => createMeshAuthorizationRuntime({
      meshDb: undefined as never,
      expectedDatabaseName: "athyper_mesh",
      evaluatorRevision: "test",
    })).toThrow("Mesh database configuration is required");
    expect(() => createMeshAuthorizationRuntime({
      meshDb: {} as never,
      expectedDatabaseName: "",
      evaluatorRevision: "test",
    })).toThrow("expected authorization database name is required");
  });

  it("evaluates Mesh while Neon is unavailable", async () => {
    const service = new ProductionAuthorizationDecisionService(
      new FixtureRepository([{
        ...groupAllow(),
        constraints: [{
          ...TENANT_SCOPE,
          tenantOrAccountId: "account-1",
        }],
      }], "mesh-catalog-v5", "mesh"),
      new NoopAuthorizationDecisionAuditSink(),
    );
    const result = await service.decide({
      requestId: "mesh-without-neon",
      mode: "entity_resource",
      subject: {
        plane: "mesh",
        tenantOrAccountId: "account-1",
        principalId: "mesh-principal-1",
      },
      assurance: { mfaSatisfied: true, sodSatisfied: true },
      evaluatedAt: NOW,
      entityOperationId: "operation-read",
      resource: {
        tenantOrAccountId: "account-1",
        entityId: "invoice",
        recordId: "record-1",
        dimensions: {},
      },
    });
    expect(result.result.decision).toBe("allow");
    expect(result.result.evidence.catalogVersion).toBe("mesh-catalog-v5");
  });
});
