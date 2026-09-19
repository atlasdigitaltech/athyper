import { expect, it } from "vitest";
import type { EntityAuthorizationProfileV1 } from "../entity-authorization.js";
import { parseEntityCanonicalReadAdmission } from "../entity-canonical-read-admission.js";
const hash = "a".repeat(64),
  profile = {
    entityCode: "entity",
    planeKey: "neon",
    operations: [
      { key: "read", effect: "read", permissionCode: "target.read" },
      { key: "write", effect: "write", permissionCode: "target.write" },
    ],
  } as EntityAuthorizationProfileV1;
const contract = {
  schemaVersion: 1,
  kind: "entity_canonical_read_admission",
  entityCode: "entity",
  planeKey: "neon",
  profileHash: hash,
  reviewRevision: "b".repeat(64),
  transitions: [
    {
      operationKey: "read",
      sourcePermissionCode: "source.read",
      targetPermissionCode: "target.read",
    },
  ],
};
it("accepts only exact versioned published read transitions", () => {
  expect(
    parseEntityCanonicalReadAdmission(contract, profile, hash).transitions,
  ).toEqual(contract.transitions);
  for (const change of [
    { schemaVersion: 2 },
    { extra: true },
    { profileHash: "c".repeat(64) },
    { entityCode: "other" },
    { transitions: [] },
    { transitions: [...contract.transitions, ...contract.transitions] },
    {
      transitions: [
        {
          operationKey: "write",
          sourcePermissionCode: "source.write",
          targetPermissionCode: "target.write",
        },
      ],
    },
    {
      transitions: [
        { ...contract.transitions[0], targetPermissionCode: "wrong.read" },
      ],
    },
  ])
    expect(() =>
      parseEntityCanonicalReadAdmission(
        { ...contract, ...change },
        profile,
        hash,
      ),
    ).toThrow();
  expect(() =>
    parseEntityCanonicalReadAdmission(
      contract,
      { ...profile, deferredOperations: ["read"] },
      hash,
    ),
  ).toThrow();
  const childProfile = {
    ...profile,
    recordReadOperation: "parent",
    operations: [
      ...profile.operations.map((o) => ({
        ...o,
        requiresParentRead: o.key === "read",
      })),
      { key: "parent", effect: "read", permissionCode: "target.parent" },
    ],
  } as EntityAuthorizationProfileV1;
  expect(() =>
    parseEntityCanonicalReadAdmission(contract, childProfile, hash),
  ).toThrow("CANONICAL_ADMISSION_PARENT_READ_REQUIRED");
  expect(() =>
    parseEntityCanonicalReadAdmission(
      {
        ...contract,
        transitions: [
          ...contract.transitions,
          {
            operationKey: "parent",
            sourcePermissionCode: "source.parent",
            targetPermissionCode: "target.parent",
          },
        ],
      },
      childProfile,
      hash,
    ),
  ).not.toThrow();
});

it("keeps v1 closed to canonical plans and pins v2 to the full profile", async () => {
  const { parseEntityAuthorizationRuntime } =
    await import("../entity-authorization-runtime.js");
  const { createHash } = await import("node:crypto");
  const p = {
    schemaVersion: 1,
    entityCode: "entity",
    planeKey: "neon",
    ownership: "tenant.record.v1",
    directory: { operation: "discover", population: "tenant" },
    recordReadOperation: "read",
    operations: [
      {
        key: "discover",
        permissionCode: "target.discover",
        scope: "tenant.record.v1",
        target: "collection",
        effect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
      },
      {
        key: "read",
        permissionCode: "target.read",
        scope: "tenant.record.v1",
        target: "existing",
        effect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
      },
    ],
    fieldPolicies: [],
    surfaces: [],
    relationships: [],
  } as EntityAuthorizationProfileV1;
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  const plan = {
    ...contract,
    profileHash: createHash("sha256")
      .update(JSON.stringify(canonical(p)))
      .digest("hex"),
  };
  const bindings = p.operations.map((o) => ({
    operation: o.key,
    handler: "entity.read.v1",
    resolver: o.scope,
  }));
  const v2 = {
    schemaVersion: 2,
    runtimeVersion: "entity-authorization.v2",
    bindings,
    canonicalReadAdmission: plan,
  };
  expect(parseEntityAuthorizationRuntime(v2, p).schemaVersion).toBe(2);
  const { createEntityAuthorizationRuntimeRegistry } =
    await import("../entity-authorization-registry.js");
  const registrations = p.operations.map((operation) => ({
    entityCode: p.entityCode,
    planeKey: p.planeKey,
    operation,
    handler: { key: "entity.read.v1", invoke: () => undefined },
    resolver: { key: operation.scope, resolve: () => undefined },
  }));
  expect(() =>
    createEntityAuthorizationRuntimeRegistry(registrations).qualify(p, v2),
  ).toThrow("Canonical read source-constraint verifier unavailable");
  expect(() =>
    createEntityAuthorizationRuntimeRegistry(registrations, {
      sourceConstraints: () => ({ state: "satisfied" }),
    }).qualify(p, v2),
  ).not.toThrow();
  expect(() =>
    createEntityAuthorizationRuntimeRegistry(registrations).qualify(p, {
      schemaVersion: 1,
      runtimeVersion: "entity-authorization.v1",
      bindings,
    }),
  ).not.toThrow();
  expect(() =>
    parseEntityAuthorizationRuntime(
      { ...v2, schemaVersion: 1, runtimeVersion: "entity-authorization.v1" },
      p,
    ),
  ).toThrow();
  expect(() =>
    parseEntityAuthorizationRuntime(
      {
        ...v2,
        canonicalReadAdmission: { ...plan, profileHash: "f".repeat(64) },
      },
      p,
    ),
  ).toThrow();
  expect(() =>
    parseEntityAuthorizationRuntime(
      Object.assign(Object.create({ untrusted: true }), v2),
      p,
    ),
  ).toThrow();
});
