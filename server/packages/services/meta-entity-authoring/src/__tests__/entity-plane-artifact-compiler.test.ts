import { describe, expect, it } from "vitest";
import { compileEntityPlaneArtifact } from "../entity-plane-artifact-compiler.js";

const id = "11111111-1111-4111-8111-111111111111";

describe("normalized Entity plane artifact compiler", () => {
  it("compiles an Athyper admin-preview descriptor without runtime authorization bindings", () => {
    const compiled = compileEntityPlaneArtifact({
      plane: "athyper",
      entityId: "019fc300-0000-7000-8000-000000000002",
      entityCode: "business_partner",
      releaseId: "019fc300-0000-7000-8000-000000000004",
      releaseHash: "a".repeat(64),
      revisionId: "019fc300-0000-7000-8000-000000000005",
      revisionHash: "b".repeat(64),
      contractHash: "c".repeat(64),
      contract: { operations: [] },
    });
    expect(compiled).toMatchObject({
      artifact_schema_code: "athyper.meta-entity-admin-preview",
      plane: "athyper",
      activation_contract: { activeRequires: "verified_signature" },
      operation_scope_bindings: [],
    });
  });

  it("resolves a headless operation through its plane-specific permission binding", () => {
    const compiled = compileEntityPlaneArtifact({
      plane: "neon", entityId: id, entityCode: "business_partner",
      releaseId: id, releaseHash: "a".repeat(64), revisionId: id,
      revisionHash: "b".repeat(64), contractHash: "c".repeat(64),
      contract: {
        operations: [{ operation_key: "create", status: "active" }],
        operation_permissions: [{ operation_key: "create", target_plane: "neon",
          permission_code: "neon.business_partner.create", permission_kind: "entity_operation", status: "active" }],
        operation_scope_bindings: [{ operation_key: "create", target_plane: "neon",
          decision_mode: "entity_resource", scope_kind: "tenant", coordinate_source: "tenant_context",
          coordinate_key: null, resolver_key: null, missing_value_behavior: "deny", status: "active" }],
      },
    });
    expect(compiled.operation_scope_bindings).toEqual([
      expect.objectContaining({ operationKey: "create", permissionCode: "neon.business_partner.create",
        permissionKind: "entity_operation", scopeKind: "tenant" }),
    ]);
    expect(compiled.operation_scope_bindings[0]?.sourceEntityOperationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(compiled).toMatchObject({artifact_schema_version:"1.1",activation_contract:{
      targetPlane:"neon",initialMode:"shadow",activeRequires:"qualified_parity_certificate",rollbackMode:"legacy",
    }});
  });

  it("rejects an active operation without a binding for the target plane", () => {
    expect(() => compileEntityPlaneArtifact({
      plane: "mesh", entityId: id, entityCode: "document_envelope",
      releaseId: id, releaseHash: "a".repeat(64), revisionId: id,
      revisionHash: "b".repeat(64), contractHash: "c".repeat(64),
      contract: { operations: [{ operation_key: "publish", permission_code: "mesh.document_envelope.publish", status: "active" }], operation_scope_bindings: [] },
    })).toThrow("authorization_missing");
  });
});
