import { describe, expect, it } from "vitest";

import {
  OperationScopeShadowComparator,
  OperationScopeShadowDecisionApi,
  RetiredLegacyOperationScopeDecisionApi,
  QualifiedOperationScopeRolloutResolver,
  assertOperationScopeActivationQualified,
  summarizeOperationScopeQualification,
  type OperationScopeActivationCoordinate,
  type OperationScopeShadowComparison,
} from "../operation-scope-shadow.js";
import { SqlOperationScopeRolloutResolver } from "../sql-operation-scope-rollout-resolver.js";
import type { CanonicalDecisionRequest } from "../../authorization-evaluator/index.js";
import {
  AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
  type AuthorizationDecisionEnvelope,
  type ProductionAuthorizationDecisionApi,
} from "../types.js";

const coordinate: OperationScopeActivationCoordinate = {
  plane: "neon",
  entityCode: "business_partner",
  sourceEntityOperationId: "019fc300-0000-7000-8000-000000000001",
  sourceReleaseHash: "a".repeat(64),
  sourceArtifactHash: "b".repeat(64),
};

const allow = (fingerprint: string) => ({ decision: "allow" as const, reason: "role_allow", fingerprint });
const context = { tenantId: "tenant-1", principalId: "principal-1", requestId: "request-1" };

describe("operation-scope shadow rollout", () => {
  it("returns the legacy result while recording a mismatch", async () => {
    const rows: OperationScopeShadowComparison[] = [];
    const comparator = new OperationScopeShadowComparator({ append: async (row) => { rows.push(row); } });
    await expect(comparator.evaluate({
      coordinate,
      context,
      mode: "shadow",
      legacy: async () => ({ value: "legacy", comparable: allow("legacy") }),
      candidate: async () => ({
        value: "candidate",
        comparable: { decision: "deny", reason: "scope_missing", fingerprint: "candidate" },
      }),
    })).resolves.toBe("legacy");
    expect(rows).toEqual([expect.objectContaining({ status: "mismatch" })]);
  });

  it("does not let candidate or telemetry failure change a shadow result", async () => {
    const comparator = new OperationScopeShadowComparator({ append: async () => { throw new Error("sink down"); } });
    await expect(comparator.evaluate({
      coordinate,
      context,
      mode: "shadow",
      legacy: async () => ({ value: "legacy", comparable: allow("same") }),
      candidate: async () => { throw new Error("candidate down"); },
    })).resolves.toBe("legacy");
  });

  it("cannot enter active mode without qualification evidence", async () => {
    const comparator = new OperationScopeShadowComparator({ append: async () => undefined });
    await expect(comparator.evaluate({
      coordinate,
      context,
      mode: "active",
      legacy: async () => ({ value: "legacy", comparable: allow("legacy") }),
      candidate: async () => ({ value: "candidate", comparable: allow("candidate") }),
    })).rejects.toThrow("evidence_required");
  });

  it("requires clean hash-bound, plane-local evidence before activation", () => {
    const rule = { ...coordinate, mode: "active" as const };
    expect(() => assertOperationScopeActivationQualified(rule, {
      ...coordinate,
      sampleCount: 1_000,
      mismatchCount: 0,
      candidateErrorCount: 0,
      observedFrom: new Date("2026-08-01T00:00:00Z"),
      observedThrough: new Date("2026-08-02T00:00:00Z"),
    })).not.toThrow();
    expect(() => assertOperationScopeActivationQualified(rule, {
      ...coordinate,
      plane: "mesh",
      sampleCount: 1_000,
      mismatchCount: 0,
      candidateErrorCount: 0,
      observedFrom: new Date("2026-08-01T00:00:00Z"),
      observedThrough: new Date("2026-08-02T00:00:00Z"),
    })).toThrow("plane_mismatch");
  });

  it("qualifies Neon and Mesh independently and leaves unknown operations on legacy", async () => {
    const neonRows: OperationScopeShadowComparison[] = [
      { coordinate, context, observedAt: new Date("2026-08-01T00:00:00Z"), status: "match", legacy: allow("same"), candidate: allow("same"), candidateError: null },
      { coordinate, context, observedAt: new Date("2026-08-02T00:00:00Z"), status: "match", legacy: allow("same"), candidate: allow("same"), candidateError: null },
    ];
    const evidence = summarizeOperationScopeQualification(coordinate, neonRows);
    expect(evidence.sampleCount).toBe(2);
    const resolver = new QualifiedOperationScopeRolloutResolver(
      [{ ...coordinate, mode: "shadow" }],
      [],
    );
    await expect(resolver.resolve({
      requestId: "unknown",
      mode: "entity_resource",
      subject: { plane: "mesh", tenantOrAccountId: "account", principalId: "principal" },
      evaluatedAt: new Date(),
      entityOperationId: coordinate.sourceEntityOperationId,
      resource: { tenantOrAccountId: "account", entityId: "entity", recordId: "record", dimensions: {} },
    })).resolves.toBeNull();
  });

  it("resolves persistent shadow state and leaves missing rows on legacy", async () => {
    const db = {
      executeQuery: async () => ({ rows: [{
        plane_code: "neon", entity_code: "business_partner",
        source_entity_operation_id: coordinate.sourceEntityOperationId,
        source_release_hash: coordinate.sourceReleaseHash,
        source_artifact_hash: coordinate.sourceArtifactHash, mode: "shadow",
        sample_count: null, mismatch_count: null, candidate_error_count: null,
        observed_from: null, observed_through: null,
      }] }),
    } as never;
    const resolver = new SqlOperationScopeRolloutResolver(db, "neon");
    await expect(resolver.resolve({
      requestId: "persistent-shadow", mode: "entity_resource", evaluatedAt: new Date(),
      subject: { plane: "neon", tenantOrAccountId: "tenant", principalId: "principal" },
      entityOperationId: coordinate.sourceEntityOperationId,
      resource: { tenantOrAccountId: "tenant", entityId: "entity", recordId: "record", dimensions: {} },
    })).resolves.toEqual({ coordinate, mode: "shadow" });
  });

  it("uses the audited candidate only in active mode and rolls back immediately", async () => {
    const request:CanonicalDecisionRequest={
      requestId:"active-runtime",mode:"entity_resource",evaluatedAt:new Date(),
      subject:{plane:"neon",tenantOrAccountId:"tenant",principalId:"principal"},
      entityOperationId:coordinate.sourceEntityOperationId,
      resource:{tenantOrAccountId:"tenant",entityId:"entity",recordId:"record",dimensions:{}},
    };
    const envelope=(decision:"allow"|"deny",fingerprint:string):AuthorizationDecisionEnvelope=>({
      contractVersion:AUTHORIZATION_RUNTIME_CONTRACT_VERSION,authorizationFingerprint:fingerprint,
      result:{mode:"entity_resource",decision,reason:decision==="allow"?"allowed":"explicit_deny",evidence:{
        permissionId:"permission",catalogVersion:"catalog",policyVersion:"policy",entitlementEvidenceId:"entitlement",
        planeMembershipEvidenceId:null,matchingDenyIds:[],matchingDenyProofs:[],matchingAllowProofs:[],
      }},
    });
    let mode:"active"|"legacy"="active",legacyCalls=0,shadowCandidateCalls=0,activeCandidateCalls=0;
    const api=(value:AuthorizationDecisionEnvelope,onCall:()=>void):ProductionAuthorizationDecisionApi=>({
      decide:async()=>{onCall();return value},
      decideBatch:async()=>({contractVersion:AUTHORIZATION_RUNTIME_CONTRACT_VERSION,results:[value]}),
      materialize:async()=>{throw new Error("not used")},
    });
    const qualification={...coordinate,sampleCount:1000,mismatchCount:0,candidateErrorCount:0,
      observedFrom:new Date("2026-08-01T00:00:00Z"),observedThrough:new Date("2026-08-02T00:00:00Z")};
    const decisions=new OperationScopeShadowDecisionApi(
      api(envelope("deny","legacy"),()=>legacyCalls++),
      api(envelope("deny","shadow"),()=>shadowCandidateCalls++),
      {resolve:async()=>mode==="legacy"?{coordinate,mode}:{coordinate,mode,qualification}},
      new OperationScopeShadowComparator({append:async()=>undefined}),
      api(envelope("allow","active"),()=>activeCandidateCalls++),
    );
    await expect(decisions.decide(request)).resolves.toMatchObject({result:{decision:"allow"}});
    expect({legacyCalls,shadowCandidateCalls,activeCandidateCalls}).toEqual({legacyCalls:0,shadowCandidateCalls:0,activeCandidateCalls:1});
    mode="legacy";
    await expect(decisions.decide(request)).resolves.toMatchObject({result:{decision:"deny"}});
    expect(legacyCalls).toBe(1);
  });

  it("removes the legacy Entity-operation fallback at the P5-E7 boundary", async()=>{
    const neverCalled={decide:async()=>{throw new Error("unexpected evaluator")},decideBatch:async()=>{throw new Error("unexpected evaluator")},materialize:async()=>{throw new Error("unexpected evaluator")}} as ProductionAuthorizationDecisionApi;
    const request:CanonicalDecisionRequest={requestId:"retired",mode:"entity_resource",evaluatedAt:new Date(),
      subject:{plane:"neon",tenantOrAccountId:"tenant",principalId:"principal"},entityOperationId:coordinate.sourceEntityOperationId,
      resource:{tenantOrAccountId:"tenant",entityId:"entity",recordId:"record",dimensions:{}}};
    const missing=new RetiredLegacyOperationScopeDecisionApi(neverCalled,neverCalled,{resolve:async()=>null});
    await expect(missing.decide(request)).rejects.toThrow("active_coordinate_required");
    const shadow=new RetiredLegacyOperationScopeDecisionApi(neverCalled,neverCalled,{resolve:async()=>({coordinate,mode:"shadow"})});
    await expect(shadow.decide(request)).rejects.toThrow("shadow_not_supported");
  });
});
