import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSharedReferenceGraph, COMMON_REFERENCE_VIEW_PERMISSION } from "../authoring/graph-builder.js";
import { compileGraph, validateGraph } from "../deterministic.js";
import { assertCommonReferenceGraph } from "@athyper/server-contract-metadata";

const definition = {
  entityCode: "country", title: "Countries", storageObject: "country", codeField: "code", titleField: "name",
  fields: [{ key: "id", label: "ID", type: "uuid" as const }, { key: "code", label: "Code", type: "string" as const }, { key: "name", label: "Name", type: "string" as const }],
  columns: ["code", "name"], searchFields: ["code", "name"], sections: [{ key: "overview", label: "Overview", fields: ["code", "name"] }],
};
describe("common reference capability enrollment", () => {
  it("reports source mode conflicts before generic unknown-property validation", () => {
    const capabilities = JSON.parse(readFileSync(new URL("../../../../../../../metadata/products/shared/entities/country/capabilities.json", import.meta.url), "utf8"));
    capabilities[0].profile = { code: "platform.collaboration.comments.standard", version: 1 };
    const result = validateGraph(buildSharedReferenceGraph({ ...definition, capabilities }, "neon"));
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CAPABILITY_AUTHORING_MODE_CONFLICT", path: "capabilities[0]" })]));
  });
  it.each(["studio", "neon", "mesh"] as const)("keeps Country reference reads separate from common collaboration on %s", (plane) => {
    const capabilities = JSON.parse(readFileSync(new URL("../../../../../../../metadata/products/shared/entities/country/capabilities.json", import.meta.url), "utf8"));
    const graph = buildSharedReferenceGraph({ ...definition, capabilities }, plane);
    const compiled = compileGraph(graph);
    expect(() => assertCommonReferenceGraph(graph, plane)).not.toThrow();
    expect(graph.operations.map(o => o.operationKey)).toEqual(["list", "read"]);
    expect(compiled.descriptor).toMatchObject({ capabilities: { comments: { enabled: true }, attachments: { enabled: true } } });
    capabilities[0].binding.actions[0].permissionCode = "common.platform.reference.view";
    expect(() => compileGraph(buildSharedReferenceGraph({ ...definition, capabilities }, plane))).toThrow();
  });
  for (const plane of ["studio", "neon", "mesh"] as const) it(`compiles one common identity with ${plane}-local bindings`, () => {
    const graph = buildSharedReferenceGraph(definition, plane);
    expect(compileGraph(graph).descriptor.referenceCapability).toBe(COMMON_REFERENCE_VIEW_PERMISSION);
    expect(graph.operationPermissions?.every(p => p.targetPlane === plane && p.permissionKind === "capability" && p.permissionCode === COMMON_REFERENCE_VIEW_PERMISSION)).toBe(true);
    expect(() => assertCommonReferenceGraph(graph, plane === "mesh" ? "neon" : "mesh")).toThrow();
  });
  it("rejects absent enrollment, sensitive fields, writable profiles and write operations", () => {
    const graph = buildSharedReferenceGraph(definition, "neon");
    expect(() => compileGraph({ ...graph, surfaces: graph.surfaces?.map(s => ({ ...s, layoutConfig: { ...s.layoutConfig, referenceCapability: undefined } })) })).toThrow();
    expect(() => compileGraph({ ...graph, fields: graph.fields.map(f => ({ ...f, dataClassification: "restricted" })) })).toThrow();
    expect(() => compileGraph({ ...graph, runtimeProfiles: graph.runtimeProfiles?.map(p => ({ ...p, writeMode: "generic" })) })).toThrow();
    expect(() => compileGraph({ ...graph, operations: graph.operations.map(o => ({ ...o, operationKind: "create" })) })).toThrow();
    expect(() => compileGraph({ ...graph, entity: { ...graph.entity, entityClass: "business" } })).toThrow();
  });
});
