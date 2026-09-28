import { expect, it } from "vitest";
import { buildSharedReferenceGraph, compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring";
import { lowerNativeRuntimePublication, compileCompiledEntityArtifacts } from "@athyper/server-service-publication";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

function fixture(plane: "studio" | "neon" | "mesh") {
  const graph = buildSharedReferenceGraph({ entityCode: "test_dictionary", title: "Dictionary", storageObject: "test_dictionary", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
    runtimeBindings: [ { operation: "list", handler: "entity.record.list.v1", resolver: "tenant.record.v1" }, { operation: "read", handler: "entity.record.read.v1", resolver: "tenant.record.v1" } ],
  }, plane);
  const persistedGraph = { ...graph,
    operationPermissions: graph.operationPermissions!.map((b, i) => ({ ...b, id: `00000000-0000-4000-8000-${String(10 + i).padStart(12, "0")}` })),
    operationScopeBindings: graph.operationScopeBindings!.map((b, i) => ({ ...b, id: `00000000-0000-4000-8000-${String(20 + i).padStart(12, "0")}` })),
  };
  const artifact = compileGraph(persistedGraph);
  const source = { releaseId: "00000000-0000-4000-8000-000000000001", releaseNo: 1, publicationKey: "metadata.reference.test_dictionary", plane, tenantId: null,
    entityCode: graph.entity.entityCode, sourceEntityId: "00000000-0000-4000-8000-000000000004", sourceReleaseHash: "e".repeat(64), revisionId: "00000000-0000-4000-8000-000000000002", sourceContractHash: artifact.contractHash, sourceDescriptorHash: artifact.descriptorHash,
    generatedAt: "2026-09-26T00:00:00.000Z", native: artifact.descriptor, contract: graph as unknown as Record<string, unknown> };
  const input = { registration: { entityCode: source.entityCode, plane, storage: { schema: "shared", object: "test_dictionary", idField: "id" }, columns: ["id", "code"] },
    permissions: [{ id: "00000000-0000-4000-8000-000000000003", kind: "capability", code: "common.platform.reference.view", scopeKinds: ["tenant"] }] };
  return { source, input };
}
it.each(["studio", "neon", "mesh"] as const)("lowers the approved native shape for %s through the existing projector", plane => {
  const f = fixture(plane), result = lowerNativeRuntimePublication(f.source, f.input);
  expect(result.artifacts.map(a => a.content.artifactType)).toEqual(["core", "operation"]);
  expect(result.runtimeContracts?.test_dictionary).toMatchObject({ entityCode: "test_dictionary", planeKey: plane, authorizationRuntime: { runtimeVersion: "entity-authorization.v1" } });
  expect(result.release.content.targetPlanes).toEqual([plane]);
  const runtime = result.runtimeContracts!.test_dictionary as Record<string, unknown>;
  expect(runtime.source).toEqual({ entity_id: f.source.sourceEntityId, release_hash: f.source.sourceReleaseHash });
  expect(runtime.operation_scope_bindings).toEqual(expect.arrayContaining([expect.objectContaining({ operationKey: "list", permissionId: f.input.permissions[0]!.id, coordinateSource: "tenant_context" }), expect.objectContaining({ operationKey: "read", scopeKind: "tenant" })]));
  const compiled = compileCompiledEntityArtifacts({ ...result,
    registry: { permissions: new Set(["common.platform.reference.view"]), sourceObjects: new Set(["shared.test_dictionary"]), handlers: new Set(), resolvers: new Set(), renderers: new Set(), evaluators: new Set() },
    canonicalizer: { canonicalBytes: value => Buffer.from(JSON.stringify(value)), sha256: bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
  });
  expect(compiled.artifacts.map(a => a.artifact.artifactType)).toEqual(expect.arrayContaining(["core", "operation", "runtime_contract"]));
});
it("keeps lowering independent of entity products and host activation", () => {
  const path = new URL("../../../../../packages/services/publication/src/compilation/native-runtime.ts", import.meta.url);
  const text = readFileSync(path, "utf8"), ast = ts.createSourceFile(path.pathname, text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["@athyper/server-platform-metadata", "@athyper/server-contract-publication", "./compiled-runtime.js", "../shared/authorization/operation-projection.js"]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node)) expect(node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require").toBe(false);
    node.forEachChild(visit);
  }
  visit(ast); expect(text).not.toMatch(/country|currency|business_partner|process\.env|fn_activate/);
});
it("refuses target drift, missing columns and missing catalog entries", () => {
  const f = fixture("studio");
  expect(() => lowerNativeRuntimePublication(f.source, { ...f.input, permissions: [] })).toThrow();
  expect(() => lowerNativeRuntimePublication(f.source, { ...f.input, registration: { ...f.input.registration, plane: "mesh" } })).toThrow("TARGET_MISMATCH");
  expect(() => lowerNativeRuntimePublication(f.source, { ...f.input, registration: { ...f.input.registration, columns: [] } })).toThrow();
});
it("carries collaboration policy into split members and rejects absent registered services", () => {
  const f = fixture("neon");
  const contents = readFileSync(new URL("../../../../../../metadata/products/shared/entities/country/capabilities.json", import.meta.url), "utf8");
  const members = JSON.parse(contents.replaceAll("country", "test_dictionary"));
  f.source.contract.capabilities = members;
  const result = lowerNativeRuntimePublication(f.source, f.input);
  expect(result.artifacts[0]!.content.capabilities).toMatchObject({ comments: { enabled: true, ownerEntityCode: "test_dictionary" }, attachments: { enabled: true } });
  expect(result.artifacts[1]!.content).toHaveProperty("commentBinding");
  expect(result.artifacts[1]!.content).toHaveProperty("attachmentBinding");
  const registry = { permissions: new Set(["common.platform.reference.view"]), sourceObjects: new Set(["shared.test_dictionary"]), handlers: new Set<string>(), resolvers: new Set<string>(), renderers: new Set<string>(), evaluators: new Set<string>() };
  const compile = () => compileCompiledEntityArtifacts({ ...result, registry,
    canonicalizer: { canonicalBytes: value => Buffer.from(JSON.stringify(value)), sha256: bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
  });
  expect(compile).toThrow();
  // Test-only callable inventory. Production must obtain this from installed services.
  for (const member of members) {
    registry.handlers.add(member.binding.serviceKey); registry.renderers.add(member.binding.serviceKey);
    registry.resolvers.add(member.binding.admissionResolverKey);
    for (const action of member.binding.actions) { registry.handlers.add(action.handlerKey); registry.permissions.add(action.permissionCode); }
  }
  expect(compile).not.toThrow();
  registry.resolvers.clear(); expect(compile).toThrow();
});
it("rejects unsupported materialization instead of silently removing it", () => {
  const f = fixture("studio"); f.source.contract.materializationBindings = [{ bindingKey: "example" }];
  expect(() => lowerNativeRuntimePublication(f.source, f.input)).toThrow("BRANCH_UNSUPPORTED");
});
