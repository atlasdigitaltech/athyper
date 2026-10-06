import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  emptyReferenceMembers,
  type MetaEntityGraph,
  type NativeMetaEntityGraph,
  type OwnedLabelGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityRuntimeLocalizedTextV1 } from "@athyper/contract-platform-entity-runtime";
import {
  coreFixture,
  coreFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import {
  createLegacyNativePresentationLocalizationAdapter,
  validateNativeEntityLabelDerivation,
  type NativeLocalizationOwners,
} from "./native-presentation-localization.js";
import { convertLegacyLocalizedText } from "./native-localized-labels.js";
import { sha256 } from "./deterministic.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(name = "country") {
  const compiled = compileSharedReferenceProduct(
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
  const empty: OwnedLabelGraph = {
    contract: "entity.authoring-owned-labels/1",
    entityId: id(1),
    changeSetId: id(2),
    tenantId: null,
    defaultLocale: "en",
    requiredLocales: ["en"],
    labels: [],
    translations: [],
  };
  // Saved-source identities are synthetic fixture enrollment, not history repair.
  const source: MetaEntityGraph = {
    ...compiled,
    surfaceFieldBindings: compiled.surfaceFieldBindings!.map((b, i) => ({
      ...b,
      id: id(400 + i),
    })),
    contractSchema: "athyper.meta-entity-contract/2.3",
    ownedLabels: empty,
    referenceMembers: emptyReferenceMembers(),
    fieldIdentities: [],
  };
  let labels = empty,
    nextId = 100;
  const label = (text: EntityRuntimeLocalizedTextV1) => {
    const old = labels.labels.find((l) => l.labelKey === text.labelKey);
    const labelId = old?.id ?? id(nextId++);
    labels = convertLegacyLocalizedText({
      source: text,
      sourceHash: sha256(text),
      labels,
      labelId,
      translationIds: {},
    });
    return labelId;
  };
  const fields = source.fields!.map((f, i) => ({
    ...coreFixture().field[1]!,
    id: f.id!,
    fieldIdentityId: id(300 + i),
  }));
  const surfaces = source.surfaces!.map((s) =>
    coreFixtureRow("surface", s.id!, {
      surfaceKey: s.surfaceKey,
      surfaceKind: s.surfaceKind,
      layoutKind: "stack",
      isDefault: s.isDefault ?? false,
    }),
  );
  const choices: {
    id: string;
    entityFieldId: string;
    valueText: string;
    labelId: string;
    tone: null;
    position: number;
  }[] = [];
  const owners: NativeLocalizationOwners[] = [];
  for (const s of source.surfaces!) {
    const bundle = (
      s.surfaceKind === "detail"
        ? (s.layoutConfig!.recordPresentation as { localizedLabels: unknown })
            .localizedLabels
        : s.layoutConfig!.localizedLabels
    ) as {
      title: EntityRuntimeLocalizedTextV1;
      entity: EntityRuntimeLocalizedTextV1;
      fields: Record<string, EntityRuntimeLocalizedTextV1>;
      options: Record<string, Record<string, EntityRuntimeLocalizedTextV1>>;
    };
    const owner = {
      surfaceId: s.id!,
      titleLabelId: label(bundle.title),
      entityLabelId: label(bundle.entity),
      fields: Object.fromEntries(
        Object.entries(bundle.fields).map(([key, text]) => {
          const field = fields.find(
            (f) => source.fields!.find((l) => l.id === f.id)!.fieldKey === key,
          )!;
          const labelId = label(text);
          Reflect.set(field, "labelId", labelId);
          return [key, { fieldId: field.id, labelId }];
        }),
      ),
      options: Object.fromEntries(
        Object.entries(bundle.options).map(([key, values]) => [
          key,
          Object.fromEntries(
            Object.entries(values).map(([value, text], i) => {
              const field = source.fields!.find((f) => f.fieldKey === key)!;
              const old = choices.find(
                (c) => c.entityFieldId === field.id && c.valueText === value,
              );
              const choice = old ?? {
                id: id(nextId++),
                entityFieldId: field.id!,
                valueText: value,
                labelId: label(text),
                tone: null,
                position: i + 1,
              };
              if (!old) choices.push(choice);
              return [
                value,
                {
                  fieldId: field.id!,
                  choiceId: choice.id,
                  labelId: choice.labelId,
                },
              ];
            }),
          ),
        ]),
      ),
    };
    Reflect.set(
      surfaces.find((n) => n.id === s.id)!,
      "labelId",
      owner.titleLabelId,
    );
    owners.push(owner);
  }
  const input = {
    source,
    sourceHash: sha256(source),
    resource: {
      owner: "synthetic-tests",
      key: "localization-conversion",
      version: 1,
      hash: "a".repeat(64),
    },
    dependencies: [],
    labels,
    owners,
  };
  const target = {
    entity: { ...source.entity, entityLabelId: owners[0]!.entityLabelId },
    ownedLabels: labels,
    fields,
    surfaces,
    fieldIdentities: source.fields!.map((f, i) => ({
      id: id(300 + i),
      fieldKey: f.fieldKey,
    })),
    referenceMembers: {
      ...emptyReferenceMembers(),
      members: { ...emptyReferenceMembers().members, fieldChoice: choices },
    },
  } as unknown as NativeMetaEntityGraph;
  return { input, target };
}
it.each(["country", "state_region"])(
  "converts every %s localized owner with exact inverse",
  (name) => {
    const f = fixture(name),
      a = createLegacyNativePresentationLocalizationAdapter(f.input),
      p = a.forward(f.input.source);
    expect(p.entity.entityLabelId).toBe(f.target.entity.entityLabelId);
    expect(p.ownedLabels).toEqual(f.input.labels);
    expect(a.reverse(p, f.target)).toEqual(f.input.source);
    validateNativeEntityLabelDerivation(
      f.input.source,
      p,
      a.entityLabelDerivation!,
    );
    Reflect.set(f.input.owners[0]!, "titleLabelId", id(999));
    expect(a.forward(f.input.source)).toEqual(p);
  },
);
it("rejects wrong owner FKs, repeated text conflicts, unmapped declarations and root rewrites", () => {
  const f = fixture(),
    a = createLegacyNativePresentationLocalizationAdapter(f.input),
    p = a.forward(f.input.source);
  expect(() =>
    a.reverse(p, {
      ...f.target,
      entity: { ...f.target.entity, entityLabelId: id(999) },
    }),
  ).toThrow();
  expect(() =>
    a.reverse(p, {
      ...f.target,
      fields: f.target.fields.map((field) => ({ ...field, labelId: id(999) })),
    }),
  ).toThrow();
  expect(() =>
    createLegacyNativePresentationLocalizationAdapter({
      ...f.input,
      owners: f.input.owners.slice(1),
    }),
  ).toThrow();
  expect(() =>
    validateNativeEntityLabelDerivation(
      f.input.source,
      { ...p, entity: { ...p.entity, ownershipModel: "other" } },
      a.entityLabelDerivation!,
    ),
  ).toThrow();
  expect(() =>
    a.reverse(p, { ...f.target, referenceMembers: emptyReferenceMembers() }),
  ).toThrow();
});

it.each(["country", "state_region"])(
  "composes %s localization, choices and badge mappings over the same source",
  async (name) => {
    const f = fixture(name);
    const { createLegacyNativeFieldChoicesAdapter } =
      await import("./native-field-choices.js");
    const { createLegacyNativeDetailBadgesAdapter } =
      await import("./native-detail-badges.js");
    const { composeNativeNestedConversionAdapters } =
      await import("./native-graph-conversion.js");
    const { layoutFixtureRow } =
      await import("../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js");
    const { convertLegacyFieldChoices } =
      await import("./native-field-choices.js");
    const localized = createLegacyNativePresentationLocalizationAdapter(
      f.input,
    );
    const first = localized.forward(f.input.source);
    const legacyField = first.fields!.find(
      (field) => field.dataType === "enum",
    )!;
    const field = {
      ...f.target.fields.find((field) => field.id === legacyField.id)!,
      dataType: "enum" as const,
      domainCode: null,
    };
    const choiceContext = {
      field,
      maximumChoices: 20,
      domainValues: null,
      labelText: (labelId: string) =>
        f.input.labels.labels.find((label) => label.id === labelId)!
          .defaultText,
    };
    const owner = f.input.owners[0]!.options![legacyField.fieldKey]!;
    const choiceMapping = Object.fromEntries(
      Object.entries(owner).map(([value, binding]) => [
        value,
        { id: binding.choiceId, labelId: binding.labelId },
      ]),
    );
    const choices = createLegacyNativeFieldChoicesAdapter({
      source: first,
      sourceHash: sha256(first),
      resource: { ...f.input.resource, key: "choice-conversion" },
      dependencies: [],
      mappings: {
        [field.id]: { context: choiceContext, choices: choiceMapping },
      },
    });
    const second = choices.forward(first);
    const detail = first.surfaces!.find((s) => s.surfaceKind === "detail")!;
    const badgesSource = (
      detail.layoutConfig!.recordPresentation as {
        badges: readonly {
          field: string;
          tones: Record<string, "neutral" | "success" | "warning" | "danger">;
        }[];
      }
    ).badges;
    const binding = layoutFixtureRow("binding", id(999), {
      entitySurfaceId: detail.id!,
      entityFieldId: field.id,
      bindingKey: "status_badge",
      bindingKind: "badge",
      position: 1,
      columnSpan: 1,
      meaningfulForForm: false,
      componentDisplayId: id(998),
    });
    const surface = f.target.surfaces.find((s) => s.id === detail.id)!;
    const normalizedChoices = convertLegacyFieldChoices(
      {
        options: Object.entries(owner).map(([value, binding]) => ({
          value,
          label: choiceContext.labelText(binding.labelId),
        })),
        tones: badgesSource[0]!.tones,
      },
      choiceContext,
      {
        sourceHash: sha256({
          options: Object.entries(owner).map(([value, binding]) => ({
            value,
            label: choiceContext.labelText(binding.labelId),
          })),
          tones: badgesSource[0]!.tones,
        }),
        choices: choiceMapping,
      },
    );
    expect(second.referenceMembers!.members.fieldChoice).toEqual(
      normalizedChoices,
    );
    const badge = createLegacyNativeDetailBadgesAdapter({
      source: second,
      sourceHash: sha256(second),
      resource: { ...f.input.resource, key: "badge-conversion" },
      dependencies: [],
      contexts: [
        {
          surface,
          maximumBadges: 10,
          fields: [
            {
              key: legacyField.fieldKey,
              representation: "plain",
              choices: choiceContext,
            },
          ],
        },
      ],
      mappings: [
        {
          id: binding.id,
          surfaceId: detail.id!,
          fieldId: field.id,
          bindingKey: binding.bindingKey,
          sourceIndex: 0,
          sourceHash: sha256(badgesSource[0]),
        },
      ],
      bindings: [binding],
      choices: normalizedChoices,
    });
    const combined = composeNativeNestedConversionAdapters(
      { ...f.input.resource, key: "presentation-composition" },
      [localized, choices, badge],
    );
    const prepared = combined.forward(f.input.source);
    const target: NativeMetaEntityGraph = {
      ...f.target,
      fields: f.target.fields.map((f) => (f.id === field.id ? field : f)),
      surfaceFieldBindings: [
        ...f.input.source.surfaceFieldBindings!.map((b) =>
          layoutFixtureRow("binding", b.id!, {
            entitySurfaceId: b.entitySurfaceId,
            entityFieldId: b.entityFieldId,
            bindingKey: b.bindingKey,
            bindingKind: "field",
            position: b.position + 1,
            columnSpan: 1,
            meaningfulForForm: false,
          }),
        ),
        binding,
      ],
      referenceMembers: {
        ...f.target.referenceMembers!,
        members: {
          ...f.target.referenceMembers!.members,
          fieldChoice: normalizedChoices,
        },
      },
    };
    expect(combined.entityLabelDerivation).toEqual(
      localized.entityLabelDerivation,
    );
    expect(combined.badgeDerivations).toEqual(badge.badgeDerivations);
    expect(combined.reverse(prepared, target)).toEqual(f.input.source);
    expect(
      prepared.surfaces!.every(
        (surface) =>
          !Object.hasOwn(surface.layoutConfig ?? {}, "localizedLabels"),
      ),
    ).toBe(true);
    const record = prepared.surfaces!.find(
      (surface) => surface.surfaceKind === "detail",
    )!.layoutConfig!.recordPresentation as object;
    expect(Object.hasOwn(record, "badges")).toBe(false);
    expect(Object.hasOwn(record, "localizedLabels")).toBe(false);
  },
);
