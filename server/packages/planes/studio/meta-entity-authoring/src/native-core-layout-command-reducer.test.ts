import { describe, expect, it } from "vitest";
import {
  nativeCoreLayoutMembers,
  parseNativeCoreLayoutCommands,
  type NativeCoreLayoutCommandBatch,
  type NativeCoreLayoutCommand,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { validateGraph } from "./deterministic.js";
import { applyNativeCoreLayoutCommands } from "./native-core-layout-command-reducer.js";
const policy = {
  maxBatchBytes: 100_000,
  maxCommands: 30,
  maxMembers: 100,
  authoringSchemaHash: "b".repeat(64),
};
const batch = (
  commands: readonly NativeCoreLayoutCommand[],
): NativeCoreLayoutCommandBatch => ({
  contract: "entity.authoring-native-core-layout-commands/1",
  expectedRevision: 4,
  idempotencyKey: "native-command-test-0001",
  commands,
});
const before = () => ({
  core: layoutFixtureContext().core,
  layout: layoutFixture(),
});
const run = (commands: readonly NativeCoreLayoutCommand[]) =>
  applyNativeCoreLayoutCommands(
    before(),
    parseNativeCoreLayoutCommands(batch(commands), policy),
    layoutFixtureContext(),
    () => coreFixtureId(90),
    (kind) => (kind === "binding" ? { overlayId: null } : {}),
  );
describe("native core/layout commands", () => {
  it("updates every family through the same closed contract without changing identity or input", () => {
    const initial = before();
    const commands: NativeCoreLayoutCommand[] = [
      {
        kind: "updateMember",
        memberKind: "field",
        id: initial.core.field[1]!.id,
        set: { description: "Business code" },
        clear: [],
      },
      {
        kind: "updateMember",
        memberKind: "runtime",
        id: initial.core.runtime[0]!.id,
        set: { apiExposure: "catalog_only", readMode: "none" },
        clear: [],
      },
      {
        kind: "updateMember",
        memberKind: "surface",
        id: coreFixtureId(41),
        set: { columnCount: 3 },
        clear: [],
      },
      {
        kind: "updateMember",
        memberKind: "section",
        id: coreFixtureId(60),
        set: { columnCount: 3 },
        clear: [],
      },
      {
        kind: "updateMember",
        memberKind: "binding",
        id: coreFixtureId(61),
        set: { columnSpan: 2 },
        clear: [],
      },
    ];
    const saved = run(commands);
    expect(saved.core.field[1]!.description).toBe("Business code");
    expect(saved.core.runtime[0]!.apiExposure).toBe("catalog_only");
    expect(saved.layout.binding[0]!.columnSpan).toBe(2);
    expect(saved.core.field.map((f) => f.id)).toEqual(
      initial.core.field.map((f) => f.id),
    );
    expect(before()).toEqual(initial);
  });
  it("clears explicitly nullable values and preserves a no-op echo", () => {
    const row = before().core.field[1]!;
    const result = run([
      {
        kind: "updateMember",
        memberKind: "field",
        id: row.id,
        set: {},
        clear: ["description"],
      },
    ]);
    expect(result.core.field[1]!.description).toBeNull();
    expect(
      run([
        {
          kind: "updateMember",
          memberKind: "field",
          id: row.id,
          set: {},
          clear: [],
        },
      ]).core,
    ).toEqual(before().core);
  });
  it("rejects property bags, service-owned fields and overlapping patches", () => {
    const c = {
      kind: "updateMember",
      memberKind: "field",
      id: coreFixtureId(2),
      set: {},
      clear: [],
    };
    for (const set of [
      { typeConfig: {} },
      { fieldIdentityId: coreFixtureId(12) },
      { nonsense: true },
    ])
      expect(() =>
        parseNativeCoreLayoutCommands(batch([{ ...c, set }] as never), policy),
      ).toThrow();
    expect(() =>
      parseNativeCoreLayoutCommands(
        batch([
          { ...c, set: { description: "x" }, clear: ["description"] },
        ] as never),
        policy,
      ),
    ).toThrow("NATIVE_PATCH_OVERLAP");
  });
  it("resolves typed temporary identities and requires separately supplied initialization", () => {
    const original = before().layout.binding[0]!;
    const { id: _, overlayId: __, ...value } = original;
    const commands = [
      { kind: "removeMember", memberKind: "binding", id: original.id },
      {
        kind: "addMember",
        memberKind: "binding",
        tempRef: "replacement",
        value,
      },
      {
        kind: "updateMember",
        memberKind: "binding",
        id: { $tempRef: "replacement" },
        set: { columnSpan: 2 },
        clear: [],
      },
    ] as const;
    const result = run(commands);
    expect(result.identities.replacement).toBe(coreFixtureId(90));
    expect(result.layout.binding[0]!.id).toBe(coreFixtureId(90));
    const owned = Object.entries(nativeCoreLayoutMembers.field.columns)
      .filter(([, c]) => c.serviceOwned)
      .map(([p]) => p);
    const field = before().core.field[1]!;
    const addValue = Object.fromEntries(
      Object.entries(field).filter(([p]) => p !== "id" && !owned.includes(p)),
    );
    expect(() =>
      run([
        {
          kind: "addMember",
          memberKind: "field",
          tempRef: "field",
          value: addValue,
        },
      ] as never),
    ).toThrow("NATIVE_INITIALIZATION_SOURCE_REQUIRED");
  });
  it("resolves forward parent references and temporary reorder scopes atomically", () => {
    const { id: sectionId, ...sectionValue } = before().layout.section[0]!;
    const {
      id: bindingId,
      overlayId: _,
      ...bindingValue
    } = before().layout.binding[0]!;
    const commands: NativeCoreLayoutCommand[] = [
      { kind: "removeMember", memberKind: "binding", id: bindingId },
      { kind: "removeMember", memberKind: "section", id: sectionId },
      {
        kind: "addMember",
        memberKind: "binding",
        tempRef: "binding",
        value: {
          ...bindingValue,
          entitySurfaceSectionId: { $tempRef: "section" },
        },
      },
      {
        kind: "addMember",
        memberKind: "section",
        tempRef: "section",
        value: sectionValue,
      },
      {
        kind: "reorderMembers",
        memberKind: "binding",
        scope: {
          entitySurfaceId: coreFixtureId(41),
          overlayId: null,
          entitySurfaceSectionId: { $tempRef: "section" },
          bindingKind: "field",
        },
        ids: [{ $tempRef: "binding" }],
      },
    ];
    let id = 90;
    const next = applyNativeCoreLayoutCommands(
      before(),
      parseNativeCoreLayoutCommands(batch(commands), policy),
      layoutFixtureContext(),
      () => coreFixtureId(id++),
      (kind) => (kind === "binding" ? { overlayId: null } : {}),
    );
    expect(next.layout.binding[0]!.entitySurfaceSectionId).toBe(
      next.identities.section,
    );
    expect(next.layout.section[0]!.id).toBe(next.identities.section);
    expect(next.layout.binding[0]!.position).toBe(1);
    const invalid = structuredClone(commands);
    (invalid[2] as any).value.entitySurfaceSectionId = { $tempRef: "binding" };
    id = 90;
    expect(() =>
      applyNativeCoreLayoutCommands(
        before(),
        parseNativeCoreLayoutCommands(batch(invalid), policy),
        layoutFixtureContext(),
        () => coreFixtureId(id++),
        () => ({ overlayId: null }),
      ),
    ).toThrow("AUTHORING_TEMP_REF_INVALID");
  });
  it("rejects native graphs before the legacy release compiler can decode their members", () => {
    const graph = {
      contractSchema: "athyper.meta-entity-contract/2.4",
      fields: before().core.field,
    };
    const report = validateGraph(
      graph as unknown as Parameters<typeof validateGraph>[0],
    );
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: "NATIVE_GRAPH_RELEASE_COMPILATION_NOT_QUALIFIED",
      }),
    ]);
  });
  it("rejects dangling removal, unknown ids, incomplete order and excessive batches", () => {
    expect(() =>
      run([
        { kind: "removeMember", memberKind: "section", id: coreFixtureId(60) },
      ]),
    ).toThrow();
    expect(() =>
      run([
        { kind: "removeMember", memberKind: "binding", id: coreFixtureId(99) },
      ]),
    ).toThrow("AUTHORING_MEMBER_NOT_FOUND");
    expect(() =>
      run([
        {
          kind: "reorderMembers",
          memberKind: "binding",
          scope: {
            entitySurfaceId: coreFixtureId(41),
            overlayId: null,
            entitySurfaceSectionId: coreFixtureId(60),
            bindingKind: "field",
          },
          ids: [coreFixtureId(99)],
        },
      ]),
    ).toThrow("NATIVE_REORDER_INCOMPLETE");
    expect(() =>
      parseNativeCoreLayoutCommands(
        batch([
          {
            kind: "removeMember",
            memberKind: "binding",
            id: coreFixtureId(61),
          },
        ]),
        { ...policy, maxBatchBytes: 10 },
      ),
    ).toThrow("AUTHORING_BATCH_LIMIT");
  });
});
