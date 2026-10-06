import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import {
  compileNativeAuthorization,
  convertLegacyAuthorization,
  type NativeAuthorizationContext,
} from "./native-authorization.js";
import { sha256 } from "./deterministic.js";
import type { NativeOperationRow } from "@athyper/server-contract-meta-entity-authoring";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(
  name = "country",
  plane: "studio" | "neon" | "mesh" = "studio",
) {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../metadata/entities/common/reference/" +
            name +
            "/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const source = compileSharedReferenceProduct(product, plane).graph;
  const config = source.surfaces!.find(
    (s) => s.layoutConfig?.authorization,
  )!.layoutConfig!;
  const profile = config.authorization as {
    operations: {
      key: string;
      target: "collection" | "existing";
      effect: "read";
      requiresParentRead: boolean;
      requiresPreflight: boolean;
    }[];
  };
  const operations: NativeOperationRow[] = source.operations.map((o, i) => ({
    id: o.id!,
    operationKey: o.operationKey,
    operationKind: "read",
    description: null,
    labelId: id(i + 100),
    auditEventCode: o.auditEventCode,
    executionMode: "synchronous",
    idempotencyMode: "none",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: profile.operations.find(
      (p) => p.key === o.operationKey,
    )!.target,
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: (
      config.authorizationRuntime as {
        bindings: { operation: string; handler: string }[];
      }
    ).bindings.find((b) => b.operation === o.operationKey)!.handler,
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: null,
    exportMaxRecords: null,
  }));
  const resource = (key: string) => ({
    owner: "synthetic-tests",
    key,
    version: 1,
    hash: "a".repeat(64),
  });
  const c: NativeAuthorizationContext = {
    entityCode: source.entity.entityCode,
    changeSetId: id(999),
    plane,
    maximumMembers: 100,
    fields: source.fields.map((f) => ({ id: f.id!, key: f.fieldKey })),
    permissions: source.operationPermissions!.map((p) => ({
      operationId: p.entityOperationId,
      plane: p.targetPlane,
      permissionCode: p.permissionCode,
      state: "defined",
    })),
    scopes: operations.map((o) => ({
      operationId: o.id,
      plane,
      resolverKey: "tenant.record.v1",
      resolverVersion: 1,
    })),
    resolvers: [
      {
        key: "tenant.record.v1",
        version: 1,
        runtimeKey: "tenant.record.v1",
        resource: resource("tenant.record.v1"),
      },
    ],
    handlers: operations.map((o) => ({
      key: o.handlerKey!,
      version: 1,
      runtimeKey: o.handlerKey!,
      requiresPreflight: false,
      targets: [o.authorizationTarget],
      effects: ["read"],
      operationKinds: ["read"],
      resource: resource(o.handlerKey!),
    })),
    preflights: [],
  };
  const identities = {
    profileId: id(300),
    fieldIds: Object.fromEntries(c.fields.map((f, i) => [f.key, id(400 + i)])),
  };
  const hash = sha256({
    profile: config.authorization,
    runtime: config.authorizationRuntime,
  });
  const convert = () =>
    convertLegacyAuthorization(
      config.authorization,
      config.authorizationRuntime,
      c,
      operations,
      identities,
      hash,
    );
  return { source, config, c, operations, identities, hash, convert };
}
it.each(
  ["country", "state_region"].flatMap((name) =>
    ["studio", "neon", "mesh"].map((plane) => ({
      name,
      plane: plane as "studio" | "neon" | "mesh",
    })),
  ),
)(
  "round-trips $name $plane authorization and runtime bindings",
  ({ name, plane }) => {
    const f = fixture(name, plane),
      result = f.convert(),
      out = compileNativeAuthorization(result.graph, f.c, result.shape);
    expect(out.profile).toEqual(f.config.authorization);
    expect(out.runtime).toEqual(f.config.authorizationRuntime);
    expect(
      result.graph.fields.every(
        (r) => r.readOperationChangeSetId === f.c.changeSetId,
      ),
    ).toBe(true);
    expect(result.graph.operations.map((o) => o.id)).toEqual(
      f.operations.map((o) => o.id),
    );
  },
);
it("preserves undefined permission without inventing a requirement", () => {
  const f = fixture(),
    result = f.convert(),
    out = compileNativeAuthorization(result.graph, {
      ...f.c,
      permissions: f.operations.map((o) => ({
        operationId: o.id,
        plane: f.c.plane,
        state: "none",
        permissionCode: null,
      })),
    });
  expect(
    out.profile.operations.every((o) => !Object.hasOwn(o, "permissionCode")),
  ).toBe(true);
  expect(out.profile.fieldPolicies).toHaveLength(f.c.fields.length);
});
it("reads edited typed security and rejects group shapes that hide differences", () => {
  const f = fixture(),
    r = f.convert();
  const changed = {
    ...r.graph,
    fields: r.graph.fields.map((field, i) =>
      i
        ? field
        : { ...field, representation: "masked" as const, queryUses: [] },
    ),
  };
  expect(
    compileNativeAuthorization(changed, f.c).profile.fieldPolicies.find((p) =>
      p.fields.includes(f.c.fields[0]!.key),
    )!.representation,
  ).toBe("masked");
  expect(() => compileNativeAuthorization(changed, f.c, r.shape)).toThrow(
    "NATIVE_AUTHORIZATION_POLICY_NOT_REPRESENTABLE",
  );
  const foreign = {
    ...r.graph,
    fields: r.graph.fields.map((field, i) =>
      i ? field : { ...field, readOperationChangeSetId: id(998) },
    ),
  };
  expect(() => compileNativeAuthorization(foreign, f.c)).toThrow(
    "NATIVE_AUTHORIZATION_FIELD_SCOPE_INVALID",
  );
});
it("rejects missing, foreign, duplicate and incompatible runtime/permission evidence", () => {
  const f = fixture(),
    r = f.convert();
  expect(() =>
    compileNativeAuthorization(r.graph, { ...f.c, handlers: [] }),
  ).toThrow("NATIVE_AUTHORIZATION_HANDLER_UNAVAILABLE");
  expect(() =>
    compileNativeAuthorization(r.graph, {
      ...f.c,
      handlers: f.c.handlers.map((h) => ({ ...h, requiresPreflight: true })),
    }),
  ).toThrow("NATIVE_AUTHORIZATION_HANDLER_MISMATCH");
  expect(() =>
    compileNativeAuthorization(r.graph, { ...f.c, scopes: [] }),
  ).toThrow("NATIVE_AUTHORIZATION_SCOPE_INVALID");
  expect(() =>
    compileNativeAuthorization(r.graph, {
      ...f.c,
      permissions: [...f.c.permissions, f.c.permissions[0]!],
    }),
  ).toThrow("NATIVE_AUTHORIZATION_PERMISSION_STATE_UNAVAILABLE");
  expect(() =>
    compileNativeAuthorization(r.graph, {
      ...f.c,
      permissions: [
        ...f.c.permissions,
        {
          operationId: id(998),
          plane: "studio",
          permissionCode: "test.foreign",
          state: "defined",
        },
      ],
    }),
  ).toThrow("NATIVE_AUTHORIZATION_PERMISSION_INVALID");
  expect(() =>
    compileNativeAuthorization(r.graph, {
      ...f.c,
      resolvers: f.c.resolvers.map((r) => ({
        ...r,
        resource: { ...r.resource, hash: "invalid" },
      })),
    }),
  ).toThrow("NATIVE_AUTHORIZATION_RESOURCE_INVALID");
});
it("rejects source/identity mismatch and unsupported legacy policy members", () => {
  const f = fixture();
  expect(() =>
    convertLegacyAuthorization(
      f.config.authorization,
      f.config.authorizationRuntime,
      f.c,
      f.operations,
      f.identities,
      "b".repeat(64),
    ),
  ).toThrow("NATIVE_AUTHORIZATION_SOURCE_HASH_MISMATCH");
  expect(() =>
    convertLegacyAuthorization(
      f.config.authorization,
      f.config.authorizationRuntime,
      f.c,
      f.operations,
      { ...f.identities, fieldIds: {} },
      f.hash,
    ),
  ).toThrow("NATIVE_AUTHORIZATION_IDENTITY_INVENTORY_INVALID");
  const p = { ...(f.config.authorization as object), deferredOperations: [] };
  expect(() =>
    convertLegacyAuthorization(
      p,
      f.config.authorizationRuntime,
      f.c,
      f.operations,
      f.identities,
      sha256({ profile: p, runtime: f.config.authorizationRuntime }),
    ),
  ).toThrow("NATIVE_AUTHORIZATION_LEGACY_PATH_UNSUPPORTED");
});
it("rejects omitted fields, condition use and incomplete membership in the V1 compatibility projection", () => {
  const f = fixture(),
    r = f.convert();
  expect(() =>
    compileNativeAuthorization(
      { ...r.graph, fields: r.graph.fields.slice(1) },
      f.c,
    ),
  ).toThrow("NATIVE_AUTHORIZATION_FIELD_COVERAGE_INVALID");
  expect(() =>
    compileNativeAuthorization(
      {
        ...r.graph,
        fields: r.graph.fields.map((field, i) =>
          i ? field : { ...field, representation: "omitted" as const },
        ),
      },
      f.c,
    ),
  ).toThrow("NATIVE_AUTHORIZATION_FIELD_RUNTIME_UNSUPPORTED");
  expect(() =>
    compileNativeAuthorization(
      {
        ...r.graph,
        fields: r.graph.fields.map((field, i) =>
          i ? field : { ...field, queryUses: ["condition" as const] },
        ),
      },
      f.c,
    ),
  ).toThrow("NATIVE_AUTHORIZATION_FIELD_RUNTIME_UNSUPPORTED");
});

it("binds installed resource identities and inverse shape into conversion evidence", () => {
  const f = fixture(),
    first = f.convert();
  const second = convertLegacyAuthorization(
    f.config.authorization,
    f.config.authorizationRuntime,
    {
      ...f.c,
      handlers: f.c.handlers.map((h) => ({
        ...h,
        resource: { ...h.resource, hash: "b".repeat(64) },
      })),
    },
    f.operations,
    f.identities,
    f.hash,
  );
  expect(first.proof.graphHash).toBe(second.proof.graphHash);
  expect(first.proof.contextHash).not.toBe(second.proof.contextHash);
  expect(first.proof.shapeHash).toBe(sha256(first.shape));
  const edited = {
    ...first.graph,
    operations: first.graph.operations.map((o, i) =>
      i ? o : { ...o, authorizationEffect: "write" as const },
    ),
  };
  expect(() => compileNativeAuthorization(edited, f.c)).toThrow(
    "NATIVE_AUTHORIZATION_OPERATION_RUNTIME_UNSUPPORTED",
  );
});

it("does not decode unavailable permission evidence as none", () => {
  const f = fixture(),
    r = f.convert();
  expect(() =>
    compileNativeAuthorization(r.graph, { ...f.c, permissions: [] }),
  ).toThrow("NATIVE_AUTHORIZATION_PERMISSION_STATE_UNAVAILABLE");
  expect(() =>
    compileNativeAuthorization(r.graph, {
      ...f.c,
      permissions: f.c.permissions.map((p) => ({
        ...p,
        state: "none",
        permissionCode: p.permissionCode,
      })),
    }),
  ).toThrow("NATIVE_AUTHORIZATION_PERMISSION_STATE_UNAVAILABLE");
});
