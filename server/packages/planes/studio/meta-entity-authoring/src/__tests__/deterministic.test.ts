import { describe, expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, compileListPresentation, runContractTests, validateGraph } from "../deterministic.js";

const graph = (reverse = false): MetaEntityGraph => ({
  contractSchema: "athyper.meta-entity-contract/2.1", entity: { entityCode: "invoice" },
  runtimeProfiles:[{profileKey:"default",backingKind:"virtual",apiExposure:"catalog_only",readMode:"none",writeMode:"none"}],
  fields: reverse ? [{ fieldKey:"total",dataType:"decimal",typeConfig:{kind:"decimal"} },{ fieldKey:"id",dataType:"uuid",typeConfig:{kind:"uuid"} }] : [{ dataType:"uuid",typeConfig:{kind:"uuid"},fieldKey:"id" },{ dataType:"decimal",typeConfig:{kind:"decimal"},fieldKey:"total" }],
  operations: [{ operationKey:"read",operationKind:"read",label:"Read",auditEventCode:"invoice.read",fieldKeys:["id","total"] }],
  tests: [{ key: "entity-code", assertion: "path_equals", path: "entity.entityCode", expected: "invoice" }],
});

describe("deterministic meta entity pipeline", () => {
  it("validates and tests without side effects", () => { expect(validateGraph(graph()).issues).toEqual([]); expect(runContractTests(graph()).passed).toBe(true); });
  it("reproduces contract and descriptor hashes independently of non-semantic insertion order", () => { const first = compileGraph(graph()); const second = compileGraph(graph(true)); expect(first.descriptorHash).toBe(second.descriptorHash); expect(first.contractHash).toBe(second.contractHash); expect(first.contractHash).toBe("0b1bf3a2f241cffb693498445c9029dbfc5e642c293eeb2a336ce8a504f58943"); expect(first.descriptorHash).toBe("b95907f0dc3f6b3c2e90a6ed1bd2cbecdbf4540fae93abfe73416ec44e99356c"); expect(first.compiler.version).toBe("1.0.0"); });
  it("reports stable reference errors", () => { const invalid = { ...graph(), operations: [{ operationKey:"read",operationKind:"read",label:"Read",auditEventCode:"invoice.read",fieldKeys:["missing"] }] }; expect(validateGraph(invalid).issues).toEqual([{ code: "OPERATION_FIELD_MISSING", path: "operations.0.fieldKeys", message: "Unknown field missing" }]); });
  it("validates cross-branch references before graph replacement", () => {
    const invalid: MetaEntityGraph = { ...graph(), surfaces:[{id:"surface-1",surfaceKey:"form",surfaceKind:"form",title:"Form"}], surfaceSections:[{id:"section-1",entitySurfaceId:"surface-1",sectionKey:"main",position:1}], surfaceFieldBindings:[{entitySurfaceId:"surface-1",entitySurfaceSectionId:"missing",entityFieldId:"field-missing",bindingKey:"amount",position:1}], relationFields:[{entityRelationTargetId:"target-missing",sourceFieldId:"field-missing",targetFieldKey:"id",position:1}], lifecycleOperationBindings:[{entityLifecycleBindingId:"binding-missing",entityOperationId:"operation-missing",mappingKey:"approve",transitionCode:"approve"}] };
    expect(validateGraph(invalid).issues.map(issue=>issue.path)).toEqual(expect.arrayContaining(["surfaceFieldBindings.0.entityFieldId","surfaceFieldBindings.0.entitySurfaceSectionId","relationFields.0.entityRelationTargetId","lifecycleOperationBindings.0.entityLifecycleBindingId","lifecycleOperationBindings.0.entityOperationId"]));
  });
  it("canonicalizes positional branches and operation field sets without reordering semantic config arrays",()=>{
    const a:MetaEntityGraph={...graph(),fields:[{id:"f1",fieldKey:"id",dataType:"uuid",typeConfig:{kind:"uuid"}},{id:"f2",fieldKey:"total",dataType:"decimal",typeConfig:{kind:"decimal"}}],operations:[{id:"o1",operationKey:"read",operationKind:"read",label:"Read",auditEventCode:"invoice.read",fieldKeys:["total","id"]}],keys:[{id:"k1",keyKey:"primary",keyKind:"primary",uniquenessScope:"tenant"}],keyFields:[{id:"kf2",entityKeyId:"k1",entityFieldId:"f2",position:2},{id:"kf1",entityKeyId:"k1",entityFieldId:"f1",position:1}]};
    const b:MetaEntityGraph={...a,fields:[...a.fields].reverse(),operations:[{...a.operations[0]!,fieldKeys:["id","total"]}],keyFields:[...(a.keyFields??[])].reverse()};
    expect(compileGraph(a).contractHash).toBe(compileGraph(b).contractHash);
  });
  it("compiles an active Studio list surface into the canonical runtime list contract", () => {
    const authored: MetaEntityGraph = {
      ...graph(),
      fields: [
        { id: "field-id", fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } },
        { id: "field-total", fieldKey: "total", dataType: "decimal", typeConfig: { kind: "decimal" } },
      ],
      searchProfiles: [{ id: "search-default", searchKey: "default", searchKind: "contains", isDefault: true, minimumQueryLength: 2 }],
      surfaces: [{ id: "surface-list", surfaceKey: "default_list", surfaceKind: "list", title: "Invoices", isDefault: true, layoutConfig: { identityField: "id", supportedModes: ["table", "compact"], defaultState: { sort: [{ field: "total", direction: "desc" }], density: "compact", mode: "table" }, search: { profileKey: "default", minimumQueryLength: 2 }, limits: { defaultPageSize: 25, allowedPageSizes: [25, 50], maxSortLevels: 2, countMode: "cached" } } }],
      surfaceFieldBindings: [
        { entitySurfaceId: "surface-list", entityFieldId: "field-id", bindingKey: "id", position: 1, displayConfig: { defaultVisible: true } },
        { entitySurfaceId: "surface-list", entityFieldId: "field-total", bindingKey: "total", position: 2, displayConfig: { defaultVisible: true, groupable: true } },
      ],
    };
    expect(validateGraph(authored).issues).toEqual([]);
    expect(compileListPresentation(authored)).toMatchObject({
      schemaVersion: 1,
      identityField: "id",
      defaultState: { columns: ["id", "total"], sort: [{ field: "total", direction: "desc" }], density: "compact", mode: "table" },
      search: { profileKey: "default", minimumQueryLength: 2 },
      limits: { defaultPageSize: 25, allowedPageSizes: [25, 50], maxSortLevels: 2, countMode: "cached" },
    });
    expect(compileGraph(authored).descriptor).toHaveProperty("listPresentation");
  });
});
