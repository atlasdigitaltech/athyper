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

function multiPlaneFixture() {
  const fixture = nativeReleaseFixture();
  const members = fixture.graph.referenceMembers!.members;
  const profiles = structuredClone(members.authorizationProfile);
  const fields = structuredClone(members.fieldAccess);
  const scopes = structuredClone(fixture.graph.operationScopeBindings!);
  let sequence = 800;
  const nextId = () =>
    `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  members.authorizationProfile = ["studio", "neon", "mesh"].flatMap(
    (targetPlane) =>
      profiles.map((row) => ({
        ...row,
        id: nextId(),
        targetPlane: targetPlane as "studio" | "neon" | "mesh",
      })),
  );
  members.fieldAccess = ["studio", "neon", "mesh"].flatMap((targetPlane) =>
    fields.map((row) => ({
      ...row,
      id: nextId(),
      targetPlane: targetPlane as "studio" | "neon" | "mesh",
    })),
  );
  fixture.graph.operationScopeBindings = ["studio", "neon", "mesh"].flatMap(
    (targetPlane) =>
      scopes.map((row) => ({
        ...row,
        targetPlane: targetPlane as "studio" | "neon" | "mesh",
      })),
  );
  fixture.graph.operationPermissions = fixture.graph.operations.map(
    (operation) => ({
      entityOperationId: operation.id,
      targetPlane: "mesh",
      permissionCode: "shared.reference.inspect",
      permissionKind: "entity_operation",
    }),
  );
  return fixture;
}

it.each(["studio", "neon", "mesh"] as const)(
  "isolates authored permissions and scopes for %s",
  (plane) => {
    const { graph, c } = multiPlaneFixture();
    const before = structuredClone(graph);
    const context = resolveNativeBootstrapAuthorization(
      graph,
      c.core.identities,
      1000,
      plane,
    );
    expect(context.plane).toBe(plane);
    expect(context.scopes.every((scope) => scope.plane === plane)).toBe(true);
    expect(
      context.permissions.every(
        (permission) =>
          permission.plane === plane &&
          permission.state === (plane === "mesh" ? "defined" : "none") &&
          permission.permissionCode ===
            (plane === "mesh" ? "shared.reference.inspect" : null),
      ),
    ).toBe(true);
    expect(graph).toEqual(before);
  },
);

it("requires explicit selection for multiple authored targets", () => {
  const { graph, c } = multiPlaneFixture();
  expect(() =>
    resolveNativeBootstrapAuthorization(graph, c.core.identities, 1000),
  ).toThrow("BINDING_UNSUPPORTED");
});

it.each(["profile", "scope", "field"])(
  "does not borrow another plane's missing %s",
  (kind) => {
    const { graph, c } = multiPlaneFixture();
    if (kind === "profile")
      graph.referenceMembers!.members.authorizationProfile =
        graph.referenceMembers!.members.authorizationProfile.filter(
          (row) => row.targetPlane !== "mesh",
        );
    if (kind === "scope")
      graph.operationScopeBindings = graph.operationScopeBindings!.filter(
        (row) => row.targetPlane !== "mesh",
      );
    if (kind === "field")
      graph.referenceMembers!.members.fieldAccess =
        graph.referenceMembers!.members.fieldAccess.filter(
          (row) => row.targetPlane !== "mesh",
        );
    expect(() =>
      resolveNativeBootstrapAuthorization(
        graph,
        c.core.identities,
        1000,
        "mesh",
      ),
    ).toThrow();
  },
);
