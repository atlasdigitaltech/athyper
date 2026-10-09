import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  emptyReferenceMembers,
  type NativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  coreFixtureRow,
  coreFixture,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import {
  createHistoricalNativeDetailBadgesAdapter,
  compileNativeDetailBadges,
  validateNativeBadgeDerivations,
  type LegacyDetailBadge,
  type NativeDetailBadgesContext,
} from "./native-detail-badges.js";
import { sha256 } from "./deterministic.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(name = "country") {
  const source = compileSharedReferenceProduct(
    parseSharedReferenceProduct(
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
    ),
    "studio",
  ).graph;
  const s = source.surfaces!.find((s) => s.surfaceKind === "detail")!;
  const badges = (
    s.layoutConfig!.recordPresentation as { badges: LegacyDetailBadge[] }
  ).badges;
  const f = source.fields!.find((f) => f.fieldKey === badges[0]!.field)!;
  const values = Object.keys(badges[0]!.tones);
  const field = {
    ...coreFixture().field[1]!,
    id: f.id!,
    fieldIdentityId: id(90),
    dataType: "enum" as const,
    domainCode: null,
  };
  const surface = coreFixtureRow("surface", s.id!, {
    surfaceKey: "detail",
    surfaceKind: "detail",
    layoutKind: "stack",
    isDefault: false,
  });
  const context: NativeDetailBadgesContext = {
    surface,
    maximumBadges: 10,
    fields: [
      {
        key: f.fieldKey,
        representation: "plain",
        choices: {
          field,
          maximumChoices: 20,
          domainValues: null,
          labelText: (labelId) => labelId,
        },
      },
    ],
  };
  const choices = values.map((value, i) => ({
    id: id(10 + i),
    entityFieldId: field.id,
    valueText: value,
    labelId: id(20 + i),
    tone: badges[0]!.tones[value]!,
    position: i + 1,
  }));
  const binding = layoutFixtureRow("binding", id(30), {
    entitySurfaceId: surface.id,
    entityFieldId: field.id,
    bindingKey: "status_badge",
    bindingKind: "badge",
    position: 1,
    columnSpan: 1,
    meaningfulForForm: false,
    componentDisplayId: id(40),
  });
  const mappings = [
    {
      id: binding.id,
      surfaceId: surface.id,
      fieldId: field.id,
      bindingKey: binding.bindingKey,
      sourceIndex: 0,
      sourceHash: sha256(badges[0]),
    },
  ];
  const input = {
    source,
    sourceHash: sha256(source),
    resource: {
      owner: "synthetic-tests",
      key: "badge-conversion",
      version: 1,
      hash: "a".repeat(64),
    },
    dependencies: [],
    contexts: [context],
    mappings,
    bindings: [binding],
    choices,
  };
  const target = {
    fields: [field],
    surfaces: [surface],
    surfaceFieldBindings: [binding],
    fieldIdentities: [{ id: id(90), fieldKey: f.fieldKey }],
    referenceMembers: {
      ...emptyReferenceMembers(),
      members: { ...emptyReferenceMembers().members, fieldChoice: choices },
    },
  } as unknown as NativeMetaEntityGraph;
  return { input, target, context, choices, binding, badges };
}
it.each(["country", "state_region"])(
  "accounts for %s badges through typed membership and tones",
  (name) => {
    const f = fixture(name),
      a = createHistoricalNativeDetailBadgesAdapter(f.input),
      prepared = a.forward(f.input.source);
    const detail = prepared.surfaces!.find((s) => s.surfaceKind === "detail")!;
    expect(
      Object.hasOwn(
        detail.layoutConfig!.recordPresentation as object,
        "badges",
      ),
    ).toBe(false);
    expect(prepared.surfaceFieldBindings!.length).toBe(
      f.input.source.surfaceFieldBindings!.length + 1,
    );
    expect(a.reverse(prepared, f.target)).toEqual(f.input.source);
    Reflect.set(f.input.mappings[0]!, "sourceHash", "b".repeat(64));
    expect(a.forward(f.input.source)).toEqual(prepared);
  },
);
it.each(["masked", "omitted"] as const)(
  "rejects %s badge value oracles",
  (representation) => {
    const f = fixture();
    expect(() =>
      compileNativeDetailBadges([f.binding], f.choices, {
        ...f.context,
        fields: f.context.fields.map((field) => ({ ...field, representation })),
      }),
    ).toThrow("NATIVE_DETAIL_BADGES_INVALID");
  },
);
it("rejects stale provenance, unknown source options, lossy rows and changed native tone/field identity", () => {
  const f = fixture();
  expect(() =>
    createHistoricalNativeDetailBadgesAdapter({
      ...f.input,
      sourceHash: "b".repeat(64),
    }),
  ).toThrow();
  const a = createHistoricalNativeDetailBadgesAdapter(f.input),
    p = a.forward(f.input.source);
  expect(() =>
    validateNativeBadgeDerivations(f.input.source, p, [
      { ...f.input.mappings[0]!, fieldId: id(999) },
    ]),
  ).toThrow();
  expect(() =>
    compileNativeDetailBadges(
      [{ ...f.binding, width: 250 }],
      f.choices,
      f.context,
    ),
  ).toThrow();
  expect(() =>
    compileNativeDetailBadges(
      [{ ...f.binding, position: 2 }],
      f.choices,
      f.context,
    ),
  ).toThrow();
  expect(() => a.reverse(p, { ...f.target, fieldIdentities: [] })).toThrow();
  expect(() =>
    a.reverse(p, {
      ...f.target,
      referenceMembers: {
        ...f.target.referenceMembers!,
        members: {
          ...f.target.referenceMembers!.members,
          fieldChoice: f.choices.map((c) => ({ ...c, tone: "danger" })),
        },
      },
    }),
  ).toThrow();
  const extra = structuredClone(f.input.source);
  Reflect.set(
    (
      extra.surfaces!.find((s) => s.surfaceKind === "detail")!.layoutConfig!
        .recordPresentation as { badges: object[] }
    ).badges[0]!,
    "condition",
    "salary > 100000",
  );
  expect(() =>
    createHistoricalNativeDetailBadgesAdapter({
      ...f.input,
      source: extra,
      sourceHash: sha256(extra),
    }),
  ).toThrow();
});
