import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildSharedReferenceGraph } from "../authoring/graph-builder.js";
import { compileSystemReferenceTarget } from "../compilation/target-compiler.js";

function source() {
  const graph = buildSharedReferenceGraph({ entityCode: "example_reference", title: "Examples", storageObject: "example_reference",
    codeField: "code", titleField: "code", fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
  }, "studio");
  return { ...graph, surfaces: graph.surfaces?.map(surface => surface.surfaceKind === "list"
    ? { ...surface, layoutConfig: { ...surface.layoutConfig, systemReferenceProduct: {
      schema: "athyper.system-reference-source/1", productHash: "a".repeat(64), moduleCode: "ent", targetPlanes: ["studio", "neon", "mesh"],
    } } } : surface) };
}
it("derives three targets from one unchanged source with stable authored identities", () => {
  const graph = source(), before = structuredClone(graph);
  const outputs = ["studio", "neon", "mesh"].map(plane => compileSystemReferenceTarget(graph, plane as "studio" | "neon" | "mesh"));
  expect(new Set(outputs.map(output => output.sourceContractHash)).size).toBe(1);
  expect(new Set(outputs.map(output => output.artifact.descriptorHash)).size).toBe(3);
  for (const output of outputs) {
    expect(output.graph.fields).toEqual(before.fields);
    expect(output.graph.operations).toEqual(before.operations);
    expect(output.graph.runtimeProfiles?.[0]?.storagePlane).toBe(output.targetPlane);
    expect(output.graph.operationPermissions?.every(p => p.targetPlane === output.targetPlane)).toBe(true);
    expect(output.graph.operationScopeBindings?.every(b => b.targetPlane === output.targetPlane)).toBe(true);
  }
  expect(graph).toEqual(before);
});
it("rejects missing, duplicate and unapproved target enrollment", () => {
  const graph = source();
  const marker = graph.surfaces![0]!.layoutConfig!.systemReferenceProduct as { targetPlanes: string[] };
  marker.targetPlanes = ["studio"];
  expect(() => compileSystemReferenceTarget(graph, "mesh")).toThrow("TARGET_NOT_ENROLLED");
  marker.targetPlanes = ["studio", "studio"];
  expect(() => compileSystemReferenceTarget(graph, "studio")).toThrow();
  delete graph.surfaces![0]!.layoutConfig!.systemReferenceProduct;
  expect(() => compileSystemReferenceTarget(graph, "studio")).toThrow("SOURCE_MARKER_REQUIRED");
});
it("does not admit a writable source or a source from another plane", () => {
  const graph = source();
  Object.assign(graph.runtimeProfiles![0]!, { writeMode: "generic" });
  expect(() => compileSystemReferenceTarget(graph, "neon")).toThrow();
  Object.assign(graph.runtimeProfiles![0]!, { writeMode: "none", storagePlane: "neon" });
  expect(() => compileSystemReferenceTarget(graph, "neon")).toThrow();
});
it("enforces the reference target compiler import boundary", () => {
  const text = readFileSync(new URL("../compilation/target-compiler.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("target-compiler.ts", text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["@athyper/server-contract-meta-entity-authoring", "@athyper/server-contract-metadata", "../deterministic.js"]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node)) expect(node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require").toBe(false);
    node.forEachChild(visit);
  }
  visit(ast);
  expect(text).not.toMatch(/country|currency|business_partner|process\.env|activationAuthority/);
});
