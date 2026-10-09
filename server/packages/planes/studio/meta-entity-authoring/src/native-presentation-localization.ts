import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
  type OwnedLabelGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityRuntimeLocalizedTextV1 } from "@athyper/contract-platform-entity-runtime";
import { canonicalJson, sha256 } from "./deterministic.js";
import { compileNativeLocalizedText } from "./native-localized-labels.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
export interface NativeEntityLabelDerivation {
  readonly labelId: string;
  readonly sources: readonly {
    readonly surfaceId: string;
    readonly sourceHash: string;
  }[];
}
const fail = (): never => {
  throw new FoundationContractError(
    "NATIVE_PRESENTATION_LOCALIZATION_INVALID",
    "/localization",
  );
};
type Bundle = {
  readonly title?: EntityRuntimeLocalizedTextV1;
  readonly entity?: EntityRuntimeLocalizedTextV1;
  readonly fields?: Readonly<Record<string, EntityRuntimeLocalizedTextV1>>;
  readonly options?: Readonly<
    Record<string, Readonly<Record<string, EntityRuntimeLocalizedTextV1>>>
  >;
};
export interface NativeLocalizationOwners {
  readonly surfaceId: string;
  readonly titleLabelId?: string;
  readonly entityLabelId?: string;
  /** Keys are source field keys; values are explicit owner label FKs. */
  readonly fields?: Readonly<
    Record<string, { readonly fieldId: string; readonly labelId: string }>
  >;
  readonly options?: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          {
            readonly fieldId: string;
            readonly choiceId: string;
            readonly labelId: string;
          }
        >
      >
    >
  >;
}
function bundle(graph: MetaEntityGraph, surfaceId: string): Bundle {
  const surface = graph.surfaces?.filter((s) => s.id === surfaceId);
  if (surface?.length !== 1) return fail();
  const layout = surface[0]!.layoutConfig;
  const record = layout?.recordPresentation as
    Record<string, unknown> | undefined;
  const value =
    surface[0]!.surfaceKind === "detail"
      ? record?.localizedLabels
      : layout?.localizedLabels;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !["title", "entity", "fields", "options"].includes(k),
    )
  )
    return fail();
  for (const key of ["fields", "options"] as const)
    if (
      Object.hasOwn(value, key) &&
      (!Reflect.get(value, key) ||
        typeof Reflect.get(value, key) !== "object" ||
        Array.isArray(Reflect.get(value, key)))
    )
      fail();
  return value as Bundle;
}
export function validateNativeEntityLabelDerivation(
  source: MetaEntityGraph,
  prepared: MetaEntityGraph,
  d: NativeEntityLabelDerivation,
): void {
  validateConversionJsonData(d, "/entityLabelDerivation");
  validateFoundationNode(
    {
      type: "object",
      properties: {
        labelId: referenceUuid,
        sources: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              surfaceId: referenceUuid,
              sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
            },
          },
        },
      },
    },
    d,
    "/entityLabelDerivation",
  );
  const label = prepared.ownedLabels?.labels.find((l) => l.id === d.labelId);
  if (
    !label ||
    prepared.entity.entityLabelId !== d.labelId ||
    (source.entity.entityLabelId !== undefined &&
      source.entity.entityLabelId !== d.labelId) ||
    canonicalJson({ ...prepared.entity, entityLabelId: undefined }) !==
      canonicalJson({ ...source.entity, entityLabelId: undefined }) ||
    new Set(d.sources.map((s) => s.surfaceId)).size !== d.sources.length
  )
    fail();
  const declared = (source.surfaces ?? []).filter((s) => {
    const record = s.layoutConfig?.recordPresentation as
      Record<string, unknown> | undefined;
    const value =
      s.surfaceKind === "detail"
        ? record?.localizedLabels
        : s.layoutConfig?.localizedLabels;
    return value && typeof value === "object" && Object.hasOwn(value, "entity");
  });
  if (
    canonicalJson(declared.map((s) => s.id).sort()) !==
    canonicalJson(d.sources.map((s) => s.surfaceId).sort())
  )
    fail();
  for (const s of d.sources) {
    const entity = bundle(source, s.surfaceId).entity;
    if (
      !entity ||
      sha256(entity) !== s.sourceHash ||
      entity.labelKey !== label!.labelKey ||
      entity.defaultText !== label!.defaultText ||
      canonicalJson(
        compileNativeLocalizedText(
          prepared.ownedLabels!,
          d.labelId,
          entity.values === undefined ? "key-default" : "translations",
        ),
      ) !== canonicalJson(entity)
    )
      fail();
  }
}
/** Consumes repeated localization declarations only after exact owned-label
 * projection and explicit field/choice/surface/root owner enrollment. */
export function createHistoricalNativePresentationLocalizationAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly labels: OwnedLabelGraph;
  readonly owners: readonly NativeLocalizationOwners[];
}): NativeNestedConversionAdapter {
  validateConversionJsonData(input, "/localization");
  input = structuredClone(input);
  if (
    Object.keys(input).sort().join() !==
    "dependencies,labels,owners,resource,source,sourceHash"
  )
    fail();
  const source = input.source,
    owners = input.owners;
  if (
    sha256(source) !== input.sourceHash ||
    !source.ownedLabels ||
    new Set(owners.map((o) => o.surfaceId)).size !== owners.length ||
    [
      "entityId",
      "changeSetId",
      "tenantId",
      "contract",
      "defaultLocale",
      "requiredLocales",
    ].some(
      (k) =>
        canonicalJson(Reflect.get(source.ownedLabels!, k)) !==
        canonicalJson(Reflect.get(input.labels, k)),
    )
  )
    fail();
  for (const kind of ["labels", "translations"] as const)
    for (const row of source.ownedLabels![kind])
      if (
        input.labels[kind].filter(
          (l) => l.id === row.id && canonicalJson(l) === canonicalJson(row),
        ).length !== 1
      )
        fail();
  const declarations =
    source.surfaces?.filter((s) => {
      const record = s.layoutConfig?.recordPresentation as
        Record<string, unknown> | undefined;
      return Object.hasOwn(
        s.surfaceKind === "detail" ? (record ?? {}) : (s.layoutConfig ?? {}),
        "localizedLabels",
      );
    }) ?? [];
  if (
    canonicalJson(declarations.map((s) => s.id).sort()) !==
    canonicalJson(owners.map((o) => o.surfaceId).sort())
  )
    fail();
  const sourceBundles = new Map(
    owners.map((o) => [o.surfaceId, bundle(source, o.surfaceId)]),
  );
  const entityOwners = owners.filter((o) => o.entityLabelId !== undefined);
  if (new Set(entityOwners.map((o) => o.entityLabelId)).size > 1) fail();
  const entityLabelDerivation = entityOwners.length
    ? {
        labelId: entityOwners[0]!.entityLabelId!,
        sources: entityOwners.map((o) => ({
          surfaceId: o.surfaceId,
          sourceHash: sha256(sourceBundles.get(o.surfaceId)!.entity),
        })),
      }
    : undefined;
  function projected(
    labels: OwnedLabelGraph,
    owner: NativeLocalizationOwners,
  ): Bundle {
    const shape = sourceBundles.get(owner.surfaceId)!;
    if (
      Object.keys(shape).sort().join() !==
      Object.keys(owner)
        .filter((k) => k !== "surfaceId")
        .map((k) =>
          k === "titleLabelId" ? "title" : k === "entityLabelId" ? "entity" : k,
        )
        .sort()
        .join()
    )
      fail();
    const text = (id: string, source: EntityRuntimeLocalizedTextV1) => {
      const result = compileNativeLocalizedText(
        labels,
        id,
        source.values === undefined ? "key-default" : "translations",
      );
      if (canonicalJson(result) !== canonicalJson(source)) fail();
      return result;
    };
    const result: Record<string, unknown> = {};
    if (shape.title) result.title = text(owner.titleLabelId!, shape.title);
    if (shape.entity) result.entity = text(owner.entityLabelId!, shape.entity);
    if (shape.fields) {
      if (
        canonicalJson(Object.keys(shape.fields).sort()) !==
        canonicalJson(Object.keys(owner.fields ?? {}).sort())
      )
        fail();
      result.fields = Object.fromEntries(
        Object.entries(shape.fields).map(([key, value]) => [
          key,
          text(owner.fields![key]!.labelId, value),
        ]),
      );
    }
    if (shape.options) {
      if (
        canonicalJson(Object.keys(shape.options).sort()) !==
        canonicalJson(Object.keys(owner.options ?? {}).sort())
      )
        fail();
      result.options = Object.fromEntries(
        Object.entries(shape.options).map(([key, values]) => {
          if (
            canonicalJson(Object.keys(values).sort()) !==
            canonicalJson(Object.keys(owner.options![key] ?? {}).sort())
          )
            fail();
          return [
            key,
            Object.fromEntries(
              Object.entries(values).map(([value, label]) => [
                value,
                text(owner.options![key]![value]!.labelId, label),
              ]),
            ),
          ];
        }),
      );
    }
    if (canonicalJson(result) !== canonicalJson(shape)) fail();
    return result as Bundle;
  }
  for (const owner of owners) {
    validateFoundationNode(referenceUuid, owner.surfaceId, "/owner/surfaceId");
    const check = (row: object, keys: string) => {
      if (Object.keys(row).sort().join() !== keys) fail();
      for (const value of Object.values(row))
        validateFoundationNode(referenceUuid, value, "/owner/id");
    };
    for (const row of Object.values(owner.fields ?? {}))
      check(row, "fieldId,labelId");
    for (const rows of Object.values(owner.options ?? {}))
      for (const row of Object.values(rows))
        check(row, "choiceId,fieldId,labelId");
    projected(input.labels, owner);
    for (const [key, binding] of Object.entries(owner.fields ?? {}))
      if (
        source.fields?.filter(
          (f) => f.id === binding.fieldId && f.fieldKey === key,
        ).length !== 1
      )
        fail();
    for (const [key, options] of Object.entries(owner.options ?? {}))
      for (const binding of Object.values(options))
        if (
          source.fields?.filter(
            (f) => f.id === binding.fieldId && f.fieldKey === key,
          ).length !== 1
        )
          fail();
  }
  const prepared = structuredClone(source);
  Reflect.set(prepared, "ownedLabels", input.labels);
  if (entityLabelDerivation)
    Reflect.set(prepared, "entity", {
      ...prepared.entity,
      entityLabelId: entityLabelDerivation.labelId,
    });
  for (const surface of prepared.surfaces ?? []) {
    if (!sourceBundles.has(surface.id!)) continue;
    const layout = { ...surface.layoutConfig };
    if (surface.surfaceKind === "detail") {
      const record = { ...(layout.recordPresentation as object) };
      Reflect.deleteProperty(record, "localizedLabels");
      layout.recordPresentation = record;
    } else delete layout.localizedLabels;
    Reflect.set(surface, "layoutConfig", layout);
  }
  if (entityLabelDerivation)
    validateNativeEntityLabelDerivation(
      source,
      prepared,
      entityLabelDerivation,
    );
  return {
    resource: input.resource,
    dependencies: input.dependencies,
    ...(entityLabelDerivation ? { entityLabelDerivation } : {}),
    forward(graph) {
      if (sha256(graph) !== input.sourceHash) fail();
      return structuredClone(prepared);
    },
    reverse(graph, target) {
      if (
        !target.ownedLabels ||
        canonicalJson(target.ownedLabels) !== canonicalJson(input.labels)
      )
        return fail();
      const result = structuredClone(graph);
      for (const owner of owners) {
        const surface = target.surfaces.filter((s) => s.id === owner.surfaceId);
        if (
          surface.length !== 1 ||
          (owner.titleLabelId !== undefined &&
            surface[0]!.labelId !== owner.titleLabelId) ||
          (owner.entityLabelId !== undefined &&
            target.entity.entityLabelId !== owner.entityLabelId)
        )
          fail();
        for (const [key, binding] of Object.entries(owner.fields ?? {})) {
          const field = target.fields.filter(
            (f) => f.id === binding.fieldId && f.labelId === binding.labelId,
          );
          if (
            field.length !== 1 ||
            target.fieldIdentities?.filter(
              (i) => i.id === field[0]!.fieldIdentityId && i.fieldKey === key,
            ).length !== 1
          )
            fail();
        }
        for (const [key, values] of Object.entries(owner.options ?? {}))
          for (const [value, binding] of Object.entries(values))
            if (
              target.referenceMembers?.members.fieldChoice.filter(
                (c) =>
                  c.id === binding.choiceId &&
                  c.entityFieldId === binding.fieldId &&
                  c.valueText === value &&
                  c.labelId === binding.labelId,
              ).length !== 1 ||
              target.fields.filter(
                (f) =>
                  f.id === binding.fieldId &&
                  target.fieldIdentities?.some(
                    (i) => i.id === f.fieldIdentityId && i.fieldKey === key,
                  ),
              ).length !== 1
            )
              fail();
        const localizedLabels = projected(target.ownedLabels!, owner);
        const legacy = result.surfaces!.find((s) => s.id === owner.surfaceId);
        if (!legacy) return fail();
        const layout = { ...legacy.layoutConfig };
        if (legacy.surfaceKind === "detail")
          layout.recordPresentation = {
            ...(layout.recordPresentation as object),
            localizedLabels,
          };
        else layout.localizedLabels = localizedLabels;
        Reflect.set(legacy, "layoutConfig", layout);
      }
      // Remove only conversion-added rows; historical source rows stay exact.
      const oldLabels = new Set(source.ownedLabels!.labels.map((l) => l.id));
      const oldTranslations = new Set(
        source.ownedLabels!.translations.map((l) => l.id),
      );
      Reflect.set(result, "ownedLabels", {
        ...target.ownedLabels,
        labels: target.ownedLabels.labels.filter((l) => oldLabels.has(l.id)),
        translations: target.ownedLabels.translations.filter((l) =>
          oldTranslations.has(l.id),
        ),
      });
      if (entityLabelDerivation && source.entity.entityLabelId === undefined)
        Reflect.deleteProperty(result.entity, "entityLabelId");
      if (canonicalJson(result) !== canonicalJson(source)) fail();
      return result;
    },
  };
}
