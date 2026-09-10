import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compilePublicationPlan,
  resolveEffectiveHead,
  headPin,
  digest,
  parseBindingManifest,
  type PublicationSnapshot,
  type HeadCandidate,
} from "./publication-plan.mjs";
const hash = "a".repeat(64),
  tenant = "44444444-4444-4444-8444-444444444444";
const profile = {
  schemaVersion: 1,
  entityCode: "example",
  planeKey: "neon",
  ownership: "tenant.record.v1",
  directory: { operation: "discover", population: "tenant" },
  recordReadOperation: "read",
  operations: [
    {
      key: "read",
      permissionCode: "neon.example.read",
      scope: "tenant.record.v1",
      target: "existing",
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    },
  ],
  fieldPolicies: [
    {
      key: "identity",
      fields: ["id"],
      readOperation: "read",
      representation: "plain",
      writeOperations: [],
      queryUses: [],
    },
  ],
  surfaces: [],
  relationships: [],
};
const manifest = {
  schemaVersion: 1,
  entityCode: "example",
  planeKey: "neon",
  runtimeContractVersion: "entity-authorization.v1",
  handlers: [
    {
      key: "record",
      source: { path: "server/example.ts", anchors: ["record"] },
      workflow: "read",
      requirement: "Fresh authorization",
    },
  ],
  workflows: [
    {
      key: "read",
      preflight: false,
      requirements: ["No workflow"],
      source: null,
    },
  ],
  operations: [
    {
      key: "read",
      handler: "record",
      variant: "default",
      disposition: "mapped",
      reason: "Read handler",
    },
  ],
};
profile.operations.push({
  ...profile.operations[0]!,
  key: "discover",
  target: "collection",
});
manifest.operations.push({ ...manifest.operations[0]!, key: "discover" });
function head(overrides: Partial<HeadCandidate> = {}): HeadCandidate {
  return {
    publicationKey: "metadata.entity.example",
    appliedPublicationKey: "metadata.entity.example",
    appliedReleaseId: "release",
    headVersion: 1,
    headReleaseNo: 25,
    headArtifactHash: hash,
    appliedStatus: "active",
    appliedReleaseNo: 25,
    appliedArtifactHash: hash,
    appliedSourceReleaseId: "source",
    descriptorId: "descriptor",
    descriptorStatus: "active",
    descriptorKind: "entity_runtime",
    descriptorTenantId: null,
    descriptorReleaseId: "source",
    descriptorContractHash: hash,
    contractStatus: "published",
    contractTenantId: null,
    entityCode: "example",
    planeKey: "neon",
    releaseId: "source",
    releaseNo: 25,
    contractHash: hash,
    compiledHash: hash,
    descriptor: {
      entityCode: "example",
      fields: [{ key: "id" }],
      operations: {
        read: { code: "read", permissionCode: "neon.example.read" },
      },
    },
    ...overrides,
  };
}
function snapshot(): PublicationSnapshot {
  return {
    schemaVersion: 1,
    environment: "fixture",
    capturedAt: "2026-09-09T00:00:00Z",
    tenantId: tenant,
    planeKey: "neon",
    entityCode: "example",
    candidates: [head()],
    permissions: [
      {
        id: "permission",
        code: "neon.example.read",
        status: "published",
        kind: "entity_operation",
        scopes: ["tenant"],
      },
    ],
    bindings: [],
  };
}
function compile(s = snapshot(), m: unknown = manifest, p: unknown = profile) {
  return compilePublicationPlan({
    snapshot: s,
    manifest: m,
    profile: p,
    readSource: () => "record",
  });
}
test("tenant override wins over newer global release; unrelated tenant/plane cannot win", () => {
  const s = snapshot();
  s.candidates.push(
    head({
      contractTenantId: tenant,
      descriptorTenantId: tenant,
      releaseNo: 17,
      headReleaseNo: 17,
      appliedReleaseNo: 17,
    }),
  );
  s.candidates.push(
    head({
      contractTenantId: "other",
      descriptorTenantId: "other",
      releaseNo: 100,
    }),
    head({ planeKey: "mesh", releaseNo: 101 }),
  );
  assert.equal(resolveEffectiveHead(s).releaseNo, 17);
});
test("staged and retired descriptors are excluded", () => {
  const s = snapshot();
  s.candidates.push(head({ descriptorStatus: "staged", releaseNo: 100 }));
  assert.equal(resolveEffectiveHead(s).releaseNo, 25);
  s.candidates[0]!.descriptorStatus = "retired";
  assert.throws(() => resolveEffectiveHead(s), /No effective/);
});
test("equal-precedence heads fail closed instead of selecting arbitrary row", () => {
  const s = snapshot();
  s.candidates.push(head());
  assert.throws(() => resolveEffectiveHead(s), /Ambiguous/);
});
test("incompatible head, release, tenant and contract hashes fail closed", () => {
  for (const change of [
    { headArtifactHash: "b".repeat(64) },
    { appliedSourceReleaseId: "wrong" },
    { descriptorTenantId: tenant },
    { descriptorContractHash: "b".repeat(64) },
    { headVersion: 0 },
  ]) {
    const s = snapshot();
    Object.assign(s.candidates[0]!, change);
    assert.throws(() => resolveEffectiveHead(s));
  }
});
test("head pin changes on activation, including previously absent tenant override", () => {
  const s = snapshot(),
    pin = digest(headPin(s));
  s.candidates[0]!.headVersion++;
  assert.notEqual(digest(headPin(s)), pin);
});
test("deterministic candidate retains legacy metadata and never emits grants or activation", () => {
  const s = snapshot(),
    before = JSON.stringify(s),
    a = compile(s),
    b = compile(s);
  assert.equal(a.candidateHash, b.candidateHash);
  assert.equal(JSON.stringify(s), before);
  assert.equal(a.publicationEligible, false);
  assert.equal(a.enforcementEligible, false);
  assert.deepEqual(a.grantChanges, []);
  assert.equal(a.rollback.restoreGrants, false);
  assert.equal(a.coverage.operations, 2);
});
test("missing catalog and incompatible scope are explicit review gaps, never widened", () => {
  const s = snapshot();
  s.permissions[0]!.scopes = ["operating_organization"];
  assert.deepEqual(compile(s).candidate.bindings[0]!.gaps, [
    "permission_scope_review_required",
  ]);
  s.permissions = [];
  assert.deepEqual(compile(s).candidate.bindings[0]!.gaps, [
    "permission_catalog_missing",
  ]);
});
test("organization resolver does not manufacture a tenant grant requirement", () => {
  const p = structuredClone(profile);
  p.ownership = "organization.record.v1";
  p.operations[0]!.scope = "organization.record.v1";
  const s = snapshot();
  s.permissions[0]!.scopes = ["operating_organization"];
  assert.deepEqual(compile(s, manifest, p).candidate.bindings[0]!.gaps, []);
});
test("unknown properties and versions rejected", () => {
  assert.throws(() => parseBindingManifest({ ...manifest, allow: true }));
  assert.throws(() => parseBindingManifest({ ...manifest, schemaVersion: 2 }));
});
test("missing, duplicate and unknown handler/workflow references rejected", () => {
  for (const m of [
    { ...manifest, operations: [] },
    {
      ...manifest,
      operations: [...manifest.operations, ...manifest.operations],
    },
    {
      ...manifest,
      operations: [{ ...manifest.operations[0], handler: "absent" }],
    },
    {
      ...manifest,
      handlers: [{ ...manifest.handlers[0], workflow: "absent" }],
    },
  ])
    assert.throws(() => compile(snapshot(), m));
});
test("missing source and unsafe paths rejected", () => {
  assert.throws(
    () =>
      compilePublicationPlan({
        snapshot: snapshot(),
        profile,
        manifest,
        readSource: () => "different",
      }),
    /Unresolved source/,
  );
  const m = structuredClone(manifest);
  m.handlers[0]!.source.path = "server/../../secret.ts";
  assert.throws(() => compile(snapshot(), m), /Unsafe/);
});
test("preflight cannot be silently dropped", () => {
  const p = structuredClone(profile);
  p.operations[0]!.requiresPreflight = true;
  assert.throws(() => compile(snapshot(), manifest, p), /Preflight mismatch/);
});
test("cross-plane and legacy permission changes rejected", () => {
  assert.throws(
    () => compile(snapshot(), { ...manifest, planeKey: "mesh" }),
    /Cross-entity/,
  );
  const s = snapshot();
  s.candidates[0]!.descriptor.operations.read.permissionCode = "changed";
  assert.throws(() => compile(s), /permission mismatch/);
});
test("unmapped root fields and installed operations reject candidate", () => {
  const s = snapshot();
  s.candidates[0]!.descriptor.fields.push({ key: "secret" });
  assert.throws(() => compile(s));
  const t = snapshot();
  t.candidates[0]!.descriptor.operations.remove = { permissionCode: "delete" };
  assert.throws(() => compile(t), /Unmapped/);
});
test("incompatible selected-release binding remains blocked; old-release bindings are not reused", () => {
  const s = snapshot();
  s.bindings = [
    {
      operationKey: "read",
      permissionCode: "neon.example.read",
      appliedReleaseId: "release",
      tenantId: null,
      releaseId: "source",
      compiledHash: "b".repeat(64),
      status: "published",
      effective: true,
      decisionMode: "entity_resource",
      scopes: [],
    },
  ];
  assert.ok(
    compile(s).candidate.bindings[0]!.gaps.includes(
      "installed_binding_incompatible",
    ),
  );
  s.bindings[0]!.appliedReleaseId = "old";
  assert.equal(compile(s).candidate.bindings[0]!.installedBinding, null);
});

test("future or expired published bindings cannot satisfy installed coverage", () => {
  const s = snapshot();
  s.bindings = [
    {
      operationKey: "read",
      permissionCode: "neon.example.read",
      appliedReleaseId: "release",
      tenantId: null,
      releaseId: "source",
      compiledHash: hash,
      status: "published",
      effective: false,
      decisionMode: "entity_resource",
      scopes: [],
    },
  ];
  assert.equal(compile(s).candidate.bindings[0]!.installedBinding, null);
});

test("edited draft cannot inherit an old release hash or installed binding IDs", () => {
  const s = snapshot();
  s.candidates[0]!.descriptor.source = { release_hash: hash };
  s.candidates[0]!.descriptor.operation_scope_bindings = [{ bindingId: "old" }];
  const result = compile(s);
  assert.equal(
    Object.hasOwn(result.candidate.descriptorDraft, "source"),
    false,
  );
  assert.equal(
    Object.hasOwn(result.candidate.descriptorDraft, "operation_scope_bindings"),
    false,
  );
  assert.equal(result.candidate.generatedCoordinatesRequired.length, 4);
  assert.equal(s.candidates[0]!.descriptor.source.release_hash, hash);
});
