import { expect, it, vi } from "vitest";
import { compileNativeAuthorization } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { createEntityAuthorizationRegistrations } from "../shared/entity-runtime/read-registrations.js";
import { resolveNativeBootstrapAuthorization } from "./native-bootstrap-authorization.js";

it.each([undefined, "shared.reference.inspect"])(
  "uses actual read registrations and preserves exact permission %s",
  async (code) => {
    const { graph, c } = nativeReleaseFixture();
    if (code)
      graph.operationPermissions = graph.operations.map((o) => ({
        entityOperationId: o.id,
        targetPlane: "studio",
        permissionCode: code,
        permissionKind: "entity_operation",
      }));
    const context = resolveNativeBootstrapAuthorization(
      graph,
      c.core.identities,
      1000,
    );
    const compiled = compileNativeAuthorization(
      {
        profiles: graph.referenceMembers!.members.authorizationProfile,
        fields: graph.referenceMembers!.members.fieldAccess,
        operations: graph.operations,
      },
      context,
    );
    const queries = {
      list: vi.fn(async () => ({
        data: [],
        pagination: { pageSize: 1, hasMore: false, countMode: "none" as const },
      })),
      get: vi.fn(async () => ({ data: { id: "internal" } })),
    };
    const entries = createEntityAuthorizationRegistrations(
      queries,
      compiled.profile,
    );
    const registry = createEntityAuthorizationRuntimeRegistry(entries);
    expect(() =>
      registry.qualify(compiled.profile, compiled.runtime),
    ).not.toThrow();
    for (const entry of entries) {
      expect(entry.operation.permissionCode).toBe(code);
      const handler = context.handlers.find(
        (h) => h.key === entry.handler.key,
      )!;
      expect(handler.targets).toEqual([entry.operation.target]);
      expect(handler.effects).toEqual([entry.operation.effect]);
      expect(handler.requiresPreflight).toBe(entry.operation.requiresPreflight);
      await entry.handler.invoke();
    }
    expect(queries.list).toHaveBeenCalledOnce();
    expect(queries.get).toHaveBeenCalledOnce();
  },
);
it.each([
  { scopeKind: "global" },
  { coordinateSource: "request" },
  { coordinateKey: "other" },
  { missingValueBehavior: undefined },
  { resolverKey: "unknown" },
  { status: "deprecated" },
  { targetPlane: "neon" },
  { decisionMode: "other" },
])("rejects unsupported authored scope %j", (patch) => {
  const { graph, c } = nativeReleaseFixture();
  Object.assign(graph.operationScopeBindings![0]!, patch);
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow("BINDING_UNSUPPORTED");
});
it.each([
  { handlerKey: "another.handler" },
  { handlerVersion: 2 },
  { authorizationTarget: "existing" },
  { authorizationEffect: "write" },
  { requiresParentRead: true },
  { requiresPreflight: true },
])("rejects mismatched operation semantics %j", (patch) => {
  const { graph, c } = nativeReleaseFixture();
  Object.assign(graph.operations[0]!, patch);
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow("BINDING_UNSUPPORTED");
});
it("rejects duplicate permissions instead of interpreting them as undefined", () => {
  const { graph, c } = nativeReleaseFixture();
  const permission = {
    entityOperationId: graph.operations[0]!.id,
    targetPlane: "studio" as const,
    permissionCode: "shared.reference.inspect",
    permissionKind: "entity_operation",
  };
  graph.operationPermissions = [permission, permission];
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow("BINDING_UNSUPPORTED");
});
it("requires exact identity, field coverage and profile roles", () => {
  const { graph, c } = nativeReleaseFixture();
  expect(() => resolveNativeBootstrapAuthorization(graph, [], 1000)).toThrow(
    "BINDING_UNSUPPORTED",
  );
  graph.referenceMembers!.members.authorizationProfile[0]!.directoryOperationId =
    graph.operations[1]!.id;
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow("BINDING_UNSUPPORTED");
});
it("rejects undeclared, duplicate or cross-plane scope and foreign permission rows", () => {
  const { graph, c } = nativeReleaseFixture();
  const original = structuredClone(graph.operationScopeBindings!);
  graph.operationScopeBindings = [];
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow();
  graph.operationScopeBindings = [original[0]!, original[0]!];
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow();
  graph.operationScopeBindings = original;
  graph.operationPermissions = [
    {
      entityOperationId: c.core.entityId,
      targetPlane: "studio",
      permissionCode: "shared.reference.inspect",
      permissionKind: "entity_operation",
    },
  ];
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow();
});
