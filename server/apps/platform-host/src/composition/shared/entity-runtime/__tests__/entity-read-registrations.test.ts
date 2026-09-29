import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { buildSharedReferenceGraph, compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createEntityReadRegistrations } from "../read-registrations.js";
import type { EntityScopeAdapter } from "@athyper/server-service-records";

function fixture() {
  const graph = buildSharedReferenceGraph({ entityCode: "example_reference", title: "Examples", storageObject: "example_reference", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string" }], columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
    runtimeBindings: [ { operation: "list", handler: "entity.record.list.v1", resolver: "tenant.record.v1" }, { operation: "read", handler: "entity.record.read.v1", resolver: "tenant.record.v1" } ],
  }, "mesh");
  const descriptor = compileGraph(graph).descriptor;
  const queries = { list: vi.fn(async () => ({ data: [], pagination: { pageSize: 1, hasMore: false, countMode: "none" as const } })), get: vi.fn(async () => ({ data: { id: "record" } })) };
  const entries = createEntityReadRegistrations(queries, descriptor.authorization);
  return { descriptor, queries, entries };
}
it("qualifies only host-owned operation semantics and actual query callables", async () => {
  const f = fixture();
  const registry = createEntityAuthorizationRuntimeRegistry(f.entries);
  expect(() => registry.qualify(f.descriptor.authorization, f.descriptor.authorizationRuntime)).not.toThrow();
  await f.entries[0]!.handler.invoke();
  await f.entries[1]!.handler.invoke();
  expect(f.queries.list).toHaveBeenCalledOnce(); expect(f.queries.get).toHaveBeenCalledOnce();
  const changed = structuredClone(f.descriptor.authorizationRuntime) as { bindings: { handler: string }[] };
  changed.bindings[0]!.handler = "entity.record.delete.v1";
  expect(() => registry.qualify(f.descriptor.authorization, changed)).toThrow("Unqualified");
  const profile = structuredClone(f.descriptor.authorization) as { operations: { permissionCode: string }[] };
  profile.operations[0]!.permissionCode = "common.platform.reference.admin";
  expect(() => registry.qualify(profile, f.descriptor.authorizationRuntime)).toThrow();
});
it("does not turn query-service denial into admission", async () => {
  const f = fixture(); f.queries.get.mockRejectedValueOnce(Error("denied"));
  await expect(f.entries[1]!.handler.invoke()).rejects.toThrow("denied");
});
it("rejects wrong-plane scope admission without querying records", async () => {
  const f = fixture();
  const resolve = f.entries[1]!.resolver.resolve as EntityScopeAdapter["resolve"];
  const input = { context: { planeKey: "studio", tenantId: "tenant" }, entityCode: "example_reference", resolver: "tenant.record.v1", operationKey: "read", target: "existing", recordId: "record" } as Parameters<EntityScopeAdapter["resolve"]>[0];
  expect(await resolve(input)).toEqual({ state: "invalid" });
  expect(f.queries.get).not.toHaveBeenCalled();
});
it("keeps callable registration behind generic import boundaries", () => {
  const path = new URL("../read-registrations.ts", import.meta.url);
  const text = readFileSync(path, "utf8"), ast = ts.createSourceFile(path.pathname, text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["@athyper/server-contract-metadata", "@athyper/server-contract-records", "@athyper/server-service-records"]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node)) expect(node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require").toBe(false);
    node.forEachChild(visit);
  }
  visit(ast); expect(text).not.toMatch(/business_partner|country|currency/);
});
