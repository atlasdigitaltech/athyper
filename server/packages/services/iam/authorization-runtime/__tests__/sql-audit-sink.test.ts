import { describe, expect, it } from "vitest";

import { SqlAuthorizationDecisionAuditSink } from "../sql-audit-sink.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const PERMISSION_ID = "44444444-4444-4444-8444-444444444444";

describe("SQL authorization decision audit sink", () => {
  it("writes Neon decisions to the canonical audit contract", async () => {
    const queries: string[] = [];
    const db = {
      async executeQuery(query: { sql: string }) {
        queries.push(query.sql);
        return query.sql.includes("runtime_meta.authorization_epoch")
          ? { rows: [{ global_epoch: 0, boundary_epoch: 0, plane_epoch: 0 }] }
          : { rows: [] };
      },
    };
    const sink = new SqlAuthorizationDecisionAuditSink(
      db as never,
      "neon",
      "p5-g-test",
    );

    await sink.append([{
      request: {
        requestId: "request-1",
        mode: "entity_resource",
        subject: {
          plane: "neon",
          tenantOrAccountId: TENANT_ID,
          principalId: PRINCIPAL_ID,
        },
        evaluatedAt: new Date("2026-08-03T00:00:00.000Z"),
        entityOperationId: OPERATION_ID,
        resource: {
          tenantOrAccountId: TENANT_ID,
          entityId: "business_partner",
          recordId: "BP-1",
          dimensions: {},
        },
      },
      envelope: {
        contractVersion: "wave5.canonical-runtime.v1",
        authorizationFingerprint: "fingerprint-1",
        result: {
          requestId: "request-1",
          mode: "entity_resource",
          decision: "allow",
          reason: "complete_allow_path",
          evidence: {
            permissionId: PERMISSION_ID,
            canonicalCode: "metadata.entity.business_partner.read",
            entitlementEvidenceId: "entitlement-1",
            matchingDenyIds: [],
            matchingAllowProofIds: ["role-1"],
            matchingDenyProofs: [],
            matchingAllowProofs: [],
            catalogVersion: "catalog-1",
            policyVersion: "policy-1",
          },
        },
      },
      evaluationMicroseconds: 1250,
    }]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(
      "INSERT INTO audit.authorization_decision_evidence",
    );
    expect(queries[0]).not.toContain("log.auth_decision_evidence_v2");
  });

  it("resolves a Mesh account to its tenant before writing canonical evidence", async () => {
    const queries: string[] = [];
    const db = {
      async executeQuery(query: { sql: string }) {
        queries.push(query.sql);
        return query.sql.includes("FROM mesh.network_account")
          ? { rows: [{ tenant_id: TENANT_ID }] }
          : { rows: [] };
      },
    };
    const sink = new SqlAuthorizationDecisionAuditSink(
      db as never,
      "mesh",
      "p5-h-test",
    );
    const accountId = "55555555-5555-4555-8555-555555555555";

    await sink.append([{
      request: {
        requestId: "mesh-request-1",
        mode: "collection",
        subject: { plane: "mesh", tenantOrAccountId: accountId, principalId: PRINCIPAL_ID },
        evaluatedAt: new Date("2026-08-03T00:00:00.000Z"),
        entityOperationId: OPERATION_ID,
      },
      envelope: {
        contractVersion: "wave5.canonical-runtime.v1",
        authorizationFingerprint: "mesh-fingerprint-1",
        result: {
          requestId: "mesh-request-1",
          mode: "collection",
          decision: "deny",
          reason: "no_complete_allow_path",
          evidence: {
            permissionId: PERMISSION_ID,
            canonicalCode: "mesh.document_envelope.list",
            entitlementEvidenceId: "mesh-entitlement-1",
            matchingDenyIds: [], matchingAllowProofIds: [],
            matchingDenyProofs: [], matchingAllowProofs: [],
            catalogVersion: "mesh-catalog-1", policyVersion: "mesh-policy-1",
          },
        },
      },
      evaluationMicroseconds: 900,
    }]);

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("FROM mesh.network_account");
    expect(queries[1]).toContain("INSERT INTO audit.authorization_decision_evidence");
    expect(queries[1]).not.toContain("mesh_log.auth_decision_evidence_v2");
  });
});
