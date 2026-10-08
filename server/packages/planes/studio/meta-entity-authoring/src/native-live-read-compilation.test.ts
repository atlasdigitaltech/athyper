import { expect, it } from "vitest";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { compileNativeLiveReadResources } from "./native-live-read-compilation.js";
import { sha256 } from "./deterministic.js";

function fixture() {
  const f = nativeReleaseFixture();
  const input: Parameters<typeof compileNativeLiveReadResources>[0] = {
    graph: f.graph,
    compiler: f.c,
    controls: f.controls,
    releaseId: "00000000-0000-4000-8000-000000000999",
    tenantId: "00000000-0000-4000-8000-000000000998",
    provider: { ...f.c.listProviders[0]!.provider, namespace: "records" },
    securityCoordinate: {
      owner: "platform",
      namespace: "entity",
      key: "fixture.security",
      version: 1,
    },
    storageCoordinate: {
      owner: "platform",
      namespace: "entity",
      key: "fixture.storage",
      version: 1,
    },
    permissions: [],
  };
  return input;
}
it("compiles one complete native source into mutually bound candidate resources", () => {
  const input = fixture();
  const result = compileNativeLiveReadResources(input);
  expect(result.security.pin.hash).toBe(sha256(result.security.content));
  expect(result.storage.pin.hash).toBe(sha256(result.storage.content));
  expect(result.security.content.source.contractHash).toBe(
    result.compiled.contractHash,
  );
  expect(result.storage.content.owners[0]!.security).toEqual(
    result.security.pin,
  );
  expect(result.storage.content.owners[0]!.fields).toHaveLength(
    input.graph.fields.length,
  );
  expect(result.security.content.fields.map((f) => f.identityId)).toEqual(
    input.graph.fields.map((f) => f.fieldIdentityId),
  );
  expect(result.security.content.operations.map((o) => o.requirement)).toEqual([
    { state: "none" },
    { state: "none" },
  ]);
  expect(compileNativeLiveReadResources(input)).toEqual(result);
});
it("rejects changed source instead of recycling its compiler evidence", () => {
  const input = fixture();
  input.graph.entity.entityCode = "changed";
  expect(() => compileNativeLiveReadResources(input)).toThrow();
});
it("does not confer storage authority on a different provider pin", () => {
  const input = fixture();
  expect(() =>
    compileNativeLiveReadResources({
      ...input,
      provider: { ...input.provider, hash: "f".repeat(64) },
    }),
  ).toThrow("NATIVE_LIVE_READ_SOURCE_UNSUPPORTED");
});
it("does not silently lower an unsupported masking policy into plain access", () => {
  const input = fixture();
  Reflect.set(
    input.graph.referenceMembers!.members.fieldAccess[0]!,
    "representation",
    "masked",
  );
  const compiler = { ...input.compiler, graphHash: sha256(input.graph) };
  expect(() =>
    compileNativeLiveReadResources({ ...input, compiler }),
  ).toThrow();
});
it("requires the exact permission catalogue coordinate for defined permissions", () => {
  const input = fixture();
  const operation = input.graph.operations[0]!;
  input.graph.operationPermissions = [
    {
      entityOperationId: operation.id,
      targetPlane: "studio",
      permissionCode: "fixture.read",
      permissionKind: "entity_operation",
    },
  ];
  const permissions = input.compiler.authorization.permissions.map((p) =>
    p.operationId === operation.id
      ? { ...p, state: "defined" as const, permissionCode: "fixture.read" }
      : p,
  );
  const compiler = {
    ...input.compiler,
    graphHash: sha256(input.graph),
    authorization: { ...input.compiler.authorization, permissions },
  };
  expect(() => compileNativeLiveReadResources({ ...input, compiler })).toThrow(
    "NATIVE_LIVE_READ_SOURCE_UNSUPPORTED",
  );
  const catalogue = {
    owner: "platform",
    namespace: "iam",
    key: "fixture",
    version: 1,
    hash: "c".repeat(64),
  };
  const result = compileNativeLiveReadResources({
    ...input,
    compiler,
    permissions: [
      {
        plane: "studio",
        code: "fixture.read",
        kind: "entity_operation",
        catalogue,
      },
    ],
  });
  expect(result.security.content.operations[0]!.requirement).toEqual({
    state: "defined",
    plane: "studio",
    code: "fixture.read",
    kind: "entity_operation",
    catalogue,
  });
});
it("rejects resource coordinate collisions and malformed release scope", () => {
  const input = fixture();
  expect(() =>
    compileNativeLiveReadResources({
      ...input,
      storageCoordinate: input.securityCoordinate,
    }),
  ).toThrow("NATIVE_LIVE_READ_SOURCE_UNSUPPORTED");
  expect(() =>
    compileNativeLiveReadResources({ ...input, releaseId: "invalid" }),
  ).toThrow();
});

it("rejects disagreement between source permission declarations and resolved compiler controls", () => {
  const input = fixture();
  const permissions = input.compiler.authorization.permissions.map(
    (p, index) =>
      index === 0
        ? { ...p, state: "defined" as const, permissionCode: "fixture.read" }
        : p,
  );
  expect(() =>
    compileNativeLiveReadResources({
      ...input,
      compiler: {
        ...input.compiler,
        authorization: { ...input.compiler.authorization, permissions },
      },
    }),
  ).toThrow();
});
