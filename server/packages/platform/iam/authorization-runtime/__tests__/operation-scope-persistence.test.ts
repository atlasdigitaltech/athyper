import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";

import {operationScopeActivationContract,type CompiledOperationScopeBindingBlueprint,type CrossPlaneEntityArtifactV1} from "@athyper/entity-operation-scope-contracts";
import {
  NormalizedOperationScopeAuthorizationRepository,
  SqlNormalizedEntitlementResolver,
  SqlOperationScopeArtifactImporter,
  SqlOperationScopeShadowSink,
  validateOperationScopeArtifactImport,
} from "../index.js";

const UUID = "019fc300-0000-7000-8000-000000000001";
const TENANT = "019fc300-0000-7000-8000-000000000002";
const PRINCIPAL = "019fc300-0000-7000-8000-000000000003";
const blueprint: CompiledOperationScopeBindingBlueprint = {
  targetPlane: "neon",
  sourceEntityOperationId: UUID,
  entityCode: "business_partner",
  operationKey: "read",
  permissionCode: "neon.business_partner.read",
  decisionMode: "entity_resource",
  scopeKind: "tenant",
  coordinateSource: "tenant_context",
  coordinateKey: null,
  resolverKey: null,
};

describe("P5-E2 persistence boundaries", () => {
  it("rejects mixed-entity artifacts before opening a transaction", () => {
    const problems = validateOperationScopeArtifactImport({
      targetPlane: "neon",
      expectedDatabaseName: "athyper_neon",
      tenantId: null,
      appliedReleaseId: TENANT,
      sourceEntityId: UUID,
      sourceReleaseId: PRINCIPAL,
      sourceReleaseHash: "a".repeat(64),
      sourceCompiledHash: "b".repeat(64),
      actorId: PRINCIPAL,
      effectiveFrom: new Date(),
      bindings: [blueprint, { ...blueprint, sourceEntityOperationId: TENANT, entityCode: "supplier" }],
    });
    expect(problems).toContain("bindings.mixed_entity_codes");
  });

  it("rejects an unsafe cross-plane envelope before opening a transaction",async()=>{
    let opened=false;const db={transaction:()=>{opened=true;throw new Error("transaction opened")}} as unknown as Kysely<Record<string,never>>;
    const artifact:CrossPlaneEntityArtifactV1={artifact_schema_code:"athyper.meta-entity-plane-artifact",artifact_schema_version:"1.1",plane:"neon",
      source:{entity_id:TENANT,entity_code:"business_partner",release_id:UUID,release_hash:"a".repeat(64),revision_id:PRINCIPAL,revision_hash:"b".repeat(64),contract_hash:"c".repeat(64)},
      activation_contract:{...operationScopeActivationContract("neon"),targetPlane:"mesh"},contract:{},operation_scope_bindings:[]};
    await expect(new SqlOperationScopeArtifactImporter(db).importArtifact({artifact,expectedDatabaseName:"athyper_neon",tenantId:null,appliedReleaseId:TENANT,
      sourceCompiledHash:"d".repeat(64),actorId:PRINCIPAL,effectiveFrom:new Date()})).rejects.toThrow("envelope_invalid");
    expect(opened).toBe(false);
  });

  it("imports one exact artifact transactionally after resolving the local permission", async () => {
    const statements: string[] = [];
    let projectionReads = 0;
    const executor = {
      executeQuery: async (query: { sql: string }) => {
        statements.push(query.sql);
        if (query.sql.includes("current_database")) return { rows: [{ database_name: "athyper_neon" }] };
        if (query.sql.includes("FROM authz.entity_operation_binding operation")) {
          projectionReads += 1;
          return { rows: projectionReads === 1 ? [] : [{ id: TENANT }] };
        }
        return { rows: [] };
      },
    };
    const db = {
      transaction: () => ({ execute: async (work: (trx: typeof executor) => Promise<unknown>) => work(executor) }),
    } as unknown as Kysely<Record<string, never>>;
    const result = await new SqlOperationScopeArtifactImporter(db).import({
      targetPlane: "neon", expectedDatabaseName: "athyper_neon", tenantId: null,
      appliedReleaseId: TENANT, sourceEntityId: UUID, sourceReleaseId: PRINCIPAL,
      sourceReleaseHash: "a".repeat(64),
      sourceCompiledHash: "b".repeat(64), actorId: PRINCIPAL,
      effectiveFrom: new Date("2026-08-02T00:00:00Z"), bindings: [blueprint],
    });
    expect(result).toEqual(expect.objectContaining({ noOp: false, insertedBindingIds: [TENANT] }));
    expect(statements.some((sql) => sql.includes("set_config('app.database_plane'"))).toBe(true);
    expect(statements.some((sql) => sql.includes("fn_stage_entity_operation_projection"))).toBe(true);
  });

  it("resolves candidate facts exclusively from normalized binding and authz rows", async () => {
    const db = fakeDb((sql) => {
      if (sql.includes("current_database")) return [{ database_name: "athyper_neon" }];
      if (sql.includes("FROM authz.entity_operation_binding")) return [{
        permission_id: UUID, canonical_code: "neon.business_partner.read",
        module_id: TENANT,
        entity_id: TENANT, entity_operation_id: UUID,
        source_release_hash: "a".repeat(64), source_compiled_hash: "b".repeat(64),
        is_shareable: false, is_delegable: false, requires_mfa: false, requires_sod: false,
        scope_kind: "tenant",
      }];
      if (sql.includes("AS identity_active")) return [{
        identity_active: true, tenant_active: true, principal_active: true,
        membership_id: UUID, membership_until: null,
      }];
      if (sql.includes("FROM authz.group_member gm")) return [{
        proof_id: UUID, group_id: UUID, role_id: UUID, scope_id: UUID,
        scope_kind: "tenant", target_id: TENANT, effective_until: null,
      }];
      return [];
    });
    const repository = new NormalizedOperationScopeAuthorizationRepository(db, {
      plane: "neon",
      expectedDatabaseName: "athyper_neon",
      entitlementResolver: { resolve: async () => ({
        available: true, evidenceId: "entitlement:new-authz",
        semantics: "neon_plan_module_feature",
      }) },
    });
    const [facts] = await repository.loadDecisionFacts([{
      requestId: "request-1", mode: "entity_resource", evaluatedAt: new Date(),
      subject: { plane: "neon", tenantOrAccountId: TENANT, principalId: PRINCIPAL },
      entityOperationId: UUID,
      resource: { tenantOrAccountId: TENANT, entityId: TENANT, recordId: UUID, dimensions: {} },
    }]);
    expect(facts?.gates.requestResolvedExactly).toBe(true);
    expect(facts?.catalogVersion).toBe(`normalized:${"b".repeat(64)}`);
    expect(facts?.allowProofs).toEqual([expect.objectContaining({ kind: "group_role" })]);
  });

  it("writes an append-only comparison using the exact artifact coordinate", async () => {
    const captured: { sql?: string; parameters?: readonly unknown[] } = {};
    const db = {
      executeQuery: async (query: { sql: string; parameters: readonly unknown[] }) => {
        captured.sql = query.sql;
        captured.parameters = query.parameters;
        return { rows: [] };
      },
    } as unknown as Kysely<Record<string, never>>;
    await new SqlOperationScopeShadowSink(db).append({
      coordinate: {
        plane: "neon", entityCode: "business_partner", sourceEntityOperationId: UUID,
        sourceReleaseHash: "a".repeat(64), sourceArtifactHash: "b".repeat(64),
      },
      context: { tenantId: TENANT, principalId: PRINCIPAL, requestId: "request-1" },
      observedAt: new Date("2026-08-03T00:00:00Z"), status: "match",
      legacy: { decision: "allow", reason: "allowed", fingerprint: "c".repeat(64) },
      candidate: { decision: "allow", reason: "allowed", fingerprint: "d".repeat(64) },
      candidateError: null,
    });
    expect(captured.sql).toContain("INSERT INTO ops.authorization_shadow_comparison");
    expect(captured.parameters?.slice(0, 6)).toEqual([
      TENANT, "neon", "business_partner", UUID, "a".repeat(64), "b".repeat(64),
    ]);
  });

  it("keeps normalized scope on each plane's existing entitlement authority", async () => {
    const statements:string[]=[];
    const db=fakeDb((sql)=>{statements.push(sql);return [{
      available:true,evidence_id:"entitlement:1",reason_code:null,
      next_authority_change_at:"2026-08-04T00:00:00Z",
    }]});
    const evidence=await new SqlNormalizedEntitlementResolver(db,"neon").resolve({
      plane:"neon",tenantId:TENANT,principalId:PRINCIPAL,permissionId:UUID,moduleId:TENANT,evaluatedAt:new Date("2026-08-03T00:00:00Z"),
    });
    expect(statements[0]).toContain("master.resolve_neon_permission_entitlement");
    expect(evidence).toMatchObject({available:true,evidenceId:"entitlement:1",semantics:"neon_plan_module_feature"});
    await expect(new SqlNormalizedEntitlementResolver(db,"mesh").resolve({
      plane:"neon",tenantId:TENANT,principalId:PRINCIPAL,permissionId:UUID,moduleId:TENANT,evaluatedAt:new Date(),
    })).rejects.toThrow("cross-plane");
  });
});

function fakeDb(resolveRows: (sql: string) => readonly unknown[]): Kysely<Record<string, never>> {
  return {
    executeQuery: async (query: { sql: string }) => ({ rows: resolveRows(query.sql) }),
  } as unknown as Kysely<Record<string, never>>;
}
