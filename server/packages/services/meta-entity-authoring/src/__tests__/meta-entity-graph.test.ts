import type { MetaEntityPhase2Graph } from "@athyper/meta-entity-authoring-contracts";
import { describe, expect, it } from "vitest";
import { canonicalizeMetaEntityGraph, diffCanonicalPaths, validateMetaEntityGraph } from "../meta-entity-graph.js";

const IDS = {
  profile: "018f0000-0000-7000-8000-000000000001",
  field: "018f0000-0000-7000-8000-000000000002",
  key: "018f0000-0000-7000-8000-000000000003",
  keyField: "018f0000-0000-7000-8000-000000000004",
};

function graph(): MetaEntityPhase2Graph {
  return {
    runtimeProfile: {
      id: IDS.profile, profileKey: "default", backingKind: "table", storagePlane: "neon",
      storageSchema: "document", storageObject: "purchase_order", apiExposure: "api",
      readMode: "generic", writeMode: "generic", readHandlerKey: null, writeHandlerKey: null,
      createMode: "direct", concurrencyMode: "none", recordVersionFieldKey: null,
      tenantFieldKey: "tenant_id", softDeleteFieldKey: null, draftTtlHours: null,
    },
    fields: [{
      id: IDS.field, fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" },
      cardinality: "one", valueOrigin: "stored", writeMode: "write_once", storagePath: "id",
      defaultSpec: null, computationSpec: null, validationSpec: null, status: "active",
      keyUsageCount: 1, searchUsageCount: 0, relationUsageCount: 0,
    }],
    keys: [{
      id: IDS.key, keyKey: "primary", keyKind: "primary", uniquenessScope: "tenant",
      nullSemantics: "not_allowed", status: "active",
      fields: [{ id: IDS.keyField, entityFieldId: IDS.field, position: 1 }],
    }],
    searchProfiles: [], relations: [], surfaces: [], operations: [], surfaceOperations: [],
    operationRules: [], flows: [], policyBindings: [], fieldPolicyBindings: [], testCases: [],
    lifecycleBindings: [], lifecycleOperationBindings: [], numberingBindings: [],
  };
}

describe("canonical Entity graph", () => {
  it("uses deterministic DDL property names", () => {
    const first = canonicalizeMetaEntityGraph(graph());
    const second = canonicalizeMetaEntityGraph({ ...graph(), fields: [...graph().fields].reverse() });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schema_version: "5.2",
      runtime_profile: { storage_plane: "neon", tenant_field_key: "tenant_id" },
      fields: [{ field_key: "id", type_config: { kind: "uuid" } }],
    });
  });

  it("reports semantic paths without treating key order as a change", () => {
    const before = canonicalizeMetaEntityGraph(graph());
    const changed = graph();
    changed.runtimeProfile.storageObject = "purchase_order_v2";
    expect(diffCanonicalPaths(before, canonicalizeMetaEntityGraph(changed))).toEqual([
      "$.runtime_profile.storage_object",
    ]);
  });

  it("does not leak authoring row identifiers into an immutable release contract", () => {
    const first = graph();
    const second = graph();
    second.runtimeProfile.id = "018f0000-0000-7000-8000-000000000051";
    second.fields[0]!.id = "018f0000-0000-7000-8000-000000000052";
    second.keys[0]!.id = "018f0000-0000-7000-8000-000000000053";
    second.keys[0]!.fields[0]!.id = "018f0000-0000-7000-8000-000000000054";
    second.keys[0]!.fields[0]!.entityFieldId = second.fields[0]!.id;
    expect(canonicalizeMetaEntityGraph(second)).toEqual(canonicalizeMetaEntityGraph(first));
  });

  it("rejects dangling normalized bindings before SQL", () => {
    const invalid = graph();
    invalid.keys[0]!.fields[0]!.entityFieldId = "018f0000-0000-7000-8000-000000000099";
    expect(validateMetaEntityGraph(invalid)).toEqual([
      expect.objectContaining({ code: "key.field.missing", section: "keys" }),
    ]);
  });

  it("rejects a Phase 4 flow step that does not resolve to a reusable surface", () => {
    const invalid = graph();
    invalid.flows = [{
      id: "018f0000-0000-7000-8000-000000000060", flowKey: "maintain", flowKind: "edit",
      title: "Maintain", description: null, navigationMode: "linear", entryOperationId: null,
      completionOperationId: null, allowDraftResume: true, status: "active",
      steps: [{ id: "018f0000-0000-7000-8000-000000000061", stepKey: "details",
        surfaceId: "018f0000-0000-7000-8000-000000000099", position: 0, titleOverride: null,
        description: null, entryCondition: null, completionCondition: null, isOptional: false }],
    }];
    expect(validateMetaEntityGraph(invalid)).toContainEqual(
      expect.objectContaining({ code: "flow.step.surface.missing", section: "flows" }),
    );
  });

  it("normalizes lifecycle coordinates and rejects dangling operation mappings", () => {
    const candidate = graph();
    candidate.lifecycleBindings = [{ id: "018f0000-0000-7000-8000-000000000070", bindingKey: "primary",
      stateFieldId: IDS.field, targetPlane: "neon", lifecycleCode: "purchase_order.standard",
      lifecycleRevision: 2, required: true, status: "active" }];
    candidate.lifecycleOperationBindings = [{ id: "018f0000-0000-7000-8000-000000000071",
      lifecycleBindingId: candidate.lifecycleBindings[0]!.id,
      operationId: "018f0000-0000-7000-8000-000000000099", mappingKey: "submit",
      transitionCode: "draft_to_submitted", status: "active" }];
    expect(canonicalizeMetaEntityGraph(candidate)).toMatchObject({
      schema_version: "5.2",
      lifecycle_bindings: [{ binding_key: "primary", state_field_key: "id", target_plane: "neon" }],
    });
    expect(validateMetaEntityGraph(candidate)).toContainEqual(
      expect.objectContaining({ code: "lifecycle.operation.missing", section: "lifecycle" }),
    );
  });

  it("rejects a required lifecycle without an active operation mapping", () => {
    const candidate = graph();
    candidate.lifecycleBindings = [{ id: "018f0000-0000-7000-8000-000000000072", bindingKey: "primary",
      stateFieldId: IDS.field, targetPlane: "mesh", lifecycleCode: "network_account.standard",
      lifecycleRevision: 1, required: true, status: "active" }];
    candidate.lifecycleOperationBindings = [];
    expect(validateMetaEntityGraph(candidate)).toContainEqual(
      expect.objectContaining({ code: "lifecycle.operation.required", section: "lifecycle" }),
    );
  });

  it("normalizes numbering coordinates and rejects a mutable target field", () => {
    const candidate = graph();
    candidate.numberingBindings = [{
      id: "018f0000-0000-7000-8000-000000000073",
      bindingKey: "primary_number",
      fieldId: IDS.field,
      operationId: null,
      targetPlane: "neon",
      policyCode: "example.primary_number",
      policyRevision: 1,
      assignmentMode: "manual",
      required: true,
      status: "active",
    }];
    expect(canonicalizeMetaEntityGraph(candidate)).toMatchObject({
      schema_version: "5.2",
      numbering_bindings: [{ binding_key: "primary_number", field_key: "id", target_plane: "neon" }],
    });
    expect(validateMetaEntityGraph(candidate)).toContainEqual(
      expect.objectContaining({ code: "numbering.field.invalid", section: "numbering" }),
    );
  });
});
