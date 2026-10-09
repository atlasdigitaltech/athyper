import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { buildNativeSuccessorGraph } from "./native-successor-graph.js";
import { sha256 } from "./deterministic.js";
import { compileNativeRelease } from "./native-release-compilation.js";
function fixture() {
  const f = nativeReleaseFixture();
  const prior = randomUUID();
  function rebase(v: unknown): void {
    if (Array.isArray(v)) v.forEach(rebase);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (
          (k === "changeSetId" || k.endsWith("ChangeSetId")) &&
          x === f.graph.authoringSource.entityId
        )
          Reflect.set(v, k, prior);
        else rebase(x);
      }
  }
  rebase(f.graph);
  const source = {
    ...f.graph,
    fieldIdentities: f.c.core.identities.map((i) => ({
      ...i,
      identityStatus: "reserved" as const,
      introducedChangeSetId: f.graph.ownedLabels!.changeSetId,
      createdBy: randomUUID(),
      createdAt: "2026-10-09T00:00:00.000Z",
      firstReleaseId: null,
      retiredAt: null,
      retiredBy: null,
      retirementReleaseId: null,
      replacementIdentityId: null,
    })),
  };
  return {
    source,
    sourceHash: sha256(source),
    sourceReleaseId: randomUUID(),
    sourceRevision: 4,
    changeSetId: randomUUID(),
    authorId: randomUUID(),
    maximumMembers: 10000,
  };
}
it("rebases complete owned members but preserves stable identity provenance and source bytes", () => {
  const f = fixture(),
    before = sha256(f.source);
  const r = buildNativeSuccessorGraph(f);
  expect(sha256(f.source)).toBe(before);
  expect(r.graph.fieldIdentities).toEqual(f.source.fieldIdentities);
  expect(r.graph.fields.map((f) => f.fieldIdentityId)).toEqual(
    f.source.fields.map((f) => f.fieldIdentityId),
  );
  expect(r.graph.fields.map((f) => f.id)).not.toEqual(
    f.source.fields.map((f) => f.id),
  );
  expect(r.graph.ownedLabels!.changeSetId).toBe(f.changeSetId);
  expect(r.identitySources).toHaveLength(f.source.fields.length);
  for (const s of r.identitySources) {
    expect(s.sourceReleaseId).toBe(f.sourceReleaseId);
    expect(s.targetFieldId).toBe(r.memberIds[s.sourceFieldId]);
  }
  expect(
    r.graph.referenceMembers!.members.target.map((t) => t.targetPlane),
  ).toEqual(
    f.source.referenceMembers!.members.target.map((t) => t.targetPlane),
  );
});
it("does not rewrite literal label text that equals a member UUID", () => {
  const f = fixture();
  const row = f.source.ownedLabels!.labels[0]!;
  Object.assign(row, { defaultText: f.source.fields[0]!.id });
  f.sourceHash = sha256(f.source);
  const r = buildNativeSuccessorGraph(f);
  expect(r.graph.ownedLabels!.labels[0]!.defaultText).toBe(
    f.source.fields[0]!.id,
  );
});
it("rejects changed source, reused draft, allocation collision, incomplete and retired identities", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.sourceHash = "0".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.changeSetId = f.source.ownedLabels!.changeSetId;
    },
    (f: ReturnType<typeof fixture>) => {
      f.source.fieldIdentities.pop();
      f.sourceHash = sha256(f.source);
    },
  ]) {
    const f = fixture();
    change(f);
    expect(() => buildNativeSuccessorGraph(f)).toThrow();
  }
  const f = fixture();
  expect(() =>
    buildNativeSuccessorGraph({
      ...f,
      allocateId: () => f.source.fields[0]!.id,
    }),
  ).toThrow();
});
it("accepts complete explicitly authored target enrollment and remaps its local references", () => {
  const f = fixture();
  const members = f.source.referenceMembers!.members;
  const planes = ["studio", "neon", "mesh"] as const;
  const enrollment = {
    members: {
      target: planes.flatMap((targetPlane, n) =>
        members.target.map((r) => ({
          ...r,
          id: randomUUID(),
          targetPlane,
          position: n + 1,
        })),
      ),
      authorizationProfile: planes.flatMap((targetPlane) =>
        members.authorizationProfile.map((r) => ({
          ...r,
          id: randomUUID(),
          targetPlane,
        })),
      ),
      fieldAccess: planes.flatMap((targetPlane) =>
        members.fieldAccess.map((r) => ({
          ...r,
          id: randomUUID(),
          targetPlane,
        })),
      ),
      accessPermission: [],
    },
    operationPermissions: [],
    operationScopeBindings: planes.flatMap((targetPlane) =>
      f.source.operationScopeBindings!.map((r) => ({
        ...r,
        id: randomUUID(),
        targetPlane,
        bindingKey: r.bindingKey + "_" + targetPlane,
      })),
    ),
  };
  const result = buildNativeSuccessorGraph({
    ...f,
    targetEnrollment: enrollment,
  });
  expect(
    result.graph.referenceMembers!.members.target.map((t) => t.targetPlane),
  ).toEqual(planes);
  expect(result.graph.referenceMembers!.members.fieldAccess).toHaveLength(
    f.source.fields.length * 3,
  );
  for (const field of result.graph.referenceMembers!.members.fieldAccess)
    expect(result.graph.fields.some((f) => f.id === field.entityFieldId)).toBe(
      true,
    );
  expect(() =>
    buildNativeSuccessorGraph({
      ...f,
      targetEnrollment: {
        ...enrollment,
        members: {
          ...enrollment.members,
          target: enrollment.members.target.slice(1),
        },
      },
    }),
  ).toThrow();
});

it("compiles a rebased successor with inherited controls through the existing native compiler", () => {
  const f = fixture();
  const original = nativeReleaseFixture();
  const result = buildNativeSuccessorGraph(f);
  const controls = result.graph.operations.map((operation) => ({
    ...operation,
    requiresMfa: original.controls.find(
      (c) => c.operationKey === operation.operationKey,
    )!.requiresMfa,
  }));
  // Synthetic registered context coordinates follow the fresh members. This
  // does not stand in for installed resource resolution in the command host.
  function bind(value: unknown): unknown {
    if (typeof value === "string") return result.memberIds[value] ?? value;
    if (Array.isArray(value)) return value.map(bind);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          result.memberIds[key] ?? key,
          bind(v),
        ]),
      );
    return value;
  }
  const context = bind(original.c) as typeof original.c;
  context.authorization.changeSetId = f.changeSetId;
  const compiled = compileNativeRelease(
    result.graph,
    { ...context, graphHash: sha256(result.graph) },
    controls,
  );
  expect(compiled.contractHash).toBe(sha256(result.graph));
});
