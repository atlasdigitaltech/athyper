import { describe, expect, it } from "vitest";
import {
  compileOperationScopeBindingBlueprints,
  operationScopeActivationContract,
  validateCrossPlaneEntityArtifact,
  validateEntityOperationScopeBinding,
  type EntityOperationScopeBindingContract,
} from "./index";

const base: EntityOperationScopeBindingContract = {
  bindingId: "019fc300-0000-7000-8000-000000000001",
  targetPlane: "neon",
  tenantId: null,
  sourceEntityId: "019fc300-0000-7000-8000-000000000002",
  sourceEntityOperationId: "019fc300-0000-7000-8000-000000000003",
  sourceReleaseId: "019fc300-0000-7000-8000-000000000004",
  sourceReleaseHash: "a".repeat(64),
  sourceCompiledArtifactId: "019fc300-0000-7000-8000-000000000005",
  sourceCompiledHash: "b".repeat(64),
  entityCode: "purchase_invoice",
  operationKey: "create",
  permissionCode: "neon.p2p.purchase_invoice.create",
  decisionMode: "entity_resource",
  scopeKind: "company_code",
  coordinateSource: "request_field",
  coordinateKey: "company_code_id",
  resolverKey: null,
  missingValueBehavior: "deny",
  status: "published",
};

describe("Entity operation scope binding contract", () => {
  it("accepts a fail-closed request-field binding", () => {
    expect(validateEntityOperationScopeBinding(base)).toEqual([]);
  });

  it("rejects scope widening and incompatible coordinate sources", () => {
    expect(validateEntityOperationScopeBinding({
      ...base,
      decisionMode: "collection",
      coordinateSource: "record_field",
      missingValueBehavior: "allow" as "deny",
    })).toEqual(expect.arrayContaining([
      "missing_value_behavior.must_deny",
      "collection.coordinate_source_invalid",
    ]));
  });

  it("requires tenant scope to come from authenticated context", () => {
    expect(validateEntityOperationScopeBinding({ ...base, scopeKind: "tenant" })).toContain("tenant_scope.context_required");
  });

  it("emits only explicit, enabled, plane-eligible binding blueprints", () => {
    expect(compileOperationScopeBindingBlueprints({
      targetPlane: "neon",
      entityCode: "business_partner",
      operations: [
        {
          id: base.sourceEntityOperationId,
          operation_code: "update",
          permission_code: "neon.business_partner.update",
          enabled: true,
          plane_filter: ["neon"],
          authorization: {
            decision_mode: "entity_resource",
            missing_value_behavior: "deny",
            bindings: [{
              scope_kind: "tenant",
              coordinate_source: "tenant_context",
              coordinate_key: null,
              resolver_key: null,
            }],
          },
        },
        {
          id: "019fc300-0000-7000-8000-000000000099",
          operation_code: "mesh_only",
          permission_code: "mesh.business_partner.read",
          enabled: true,
          plane_filter: ["mesh"],
          authorization: null,
        },
      ],
    })).toEqual([expect.objectContaining({
      targetPlane: "neon",
      operationKey: "update",
      permissionCode: "neon.business_partner.update",
      missingValueBehavior: "deny",
    })]);
  });

  it("validates one portable fail-closed artifact envelope for Neon and Mesh",()=>{
    for(const plane of ["neon","mesh"] as const){
      expect(validateCrossPlaneEntityArtifact({artifact_schema_code:"athyper.meta-entity-plane-artifact",
        artifact_schema_version:"1.1",plane,source:{entity_id:base.sourceEntityId,entity_code:"business_partner",
          release_id:base.sourceReleaseId,release_hash:base.sourceReleaseHash,revision_id:base.bindingId,
          revision_hash:"c".repeat(64),contract_hash:"d".repeat(64)},activation_contract:operationScopeActivationContract(plane),
        contract:{operations:[],operation_scope_bindings:[]},operation_scope_bindings:[]})).toEqual([]);
    }
  });
});
