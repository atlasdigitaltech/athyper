import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { buildNativeSuccessorGraph } from "./native-successor-graph.js";
import { buildNativePresentationRecovery } from "./native-presentation-recovery.js";
import { sha256 } from "./deterministic.js";
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

function setup() {
  const current = fixture();
  const view = current.source.referenceMembers!.members.surfaceView[0]!;
  view.density = "comfortable";
  current.sourceHash = sha256(current.source);
  const source = structuredClone(current.source);
  source.referenceMembers!.members.surfaceView[0]!.density = "compact";
  const surface = current.source.surfaces.find(
    (s) => s.id === view.entitySurfaceId,
  )!;
  return {
    current,
    historical: {
      source,
      sourceHash: sha256(source),
      sourceReleaseId: randomUUID(),
    },
    selections: [
      {
        surfaceKey: surface.surfaceKey,
        viewKey: view.viewKey,
        property: "density" as const,
      },
    ],
  };
}
it("copies only selected historical density onto an exact current successor", () => {
  const input = setup();
  // A historical permission difference must not be restored.
  input.historical.source.operations[0]!.requiresPreflight = true;
  input.historical.sourceHash = sha256(input.historical.source);
  const before = structuredClone(input);
  const ids = Array.from({ length: 1000 }, () => randomUUID());
  let n = 0;
  const expected = buildNativeSuccessorGraph({
    ...input.current,
    allocateId: () => ids[n++]!,
  });
  n = 0;
  const actual = buildNativePresentationRecovery({
    ...input,
    current: { ...input.current, allocateId: () => ids[n++]! },
  });
  expected.graph.referenceMembers!.members.surfaceView[0]!.density = "compact";
  expect(actual.graph).toEqual(expected.graph);
  expect(actual.baseReleaseId).toBe(input.current.sourceReleaseId);
  expect(actual.recovery.changes[0]).toMatchObject({
    before: "comfortable",
    after: "compact",
  });
  expect(input).toEqual(before);
});
it.each([
  "hash",
  "entity",
  "missing",
  "duplicate",
  "unsupported",
  "no-op",
  "targets",
])("rejects %s recovery", (kind) => {
  const input = setup();
  if (kind === "hash") input.historical.sourceHash = "0".repeat(64);
  if (kind === "entity") {
    input.historical.source.authoringSource.entityId = randomUUID();
    input.historical.sourceHash = sha256(input.historical.source);
  }
  if (kind === "missing") input.selections[0]!.viewKey = "missing";
  if (kind === "duplicate") input.selections.push(input.selections[0]!);
  if (kind === "unsupported")
    (input.selections[0] as any).property = "permissionCode";
  if (kind === "no-op") {
    input.historical.source.referenceMembers!.members.surfaceView[0]!.density =
      "comfortable";
    input.historical.sourceHash = sha256(input.historical.source);
  }
  if (kind === "targets") (input.current as any).targetEnrollment = {};
  expect(() => buildNativePresentationRecovery(input)).toThrow();
});
