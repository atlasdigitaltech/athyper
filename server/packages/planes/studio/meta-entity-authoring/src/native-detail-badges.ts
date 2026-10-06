import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type MetaEntityGraph,
  type NormalizedCoreRow,
  type NormalizedLayoutRow,
  type ReferenceMember,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  compileNativeFieldChoices,
  type NativeFieldChoiceContext,
} from "./native-field-choices.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";

export interface LegacyDetailBadge {
  readonly field: string;
  readonly tones: Readonly<
    Record<string, "neutral" | "success" | "warning" | "danger">
  >;
}
export interface NativeBadgeDerivation {
  readonly id: string;
  readonly surfaceId: string;
  readonly fieldId: string;
  readonly bindingKey: string;
  readonly sourceIndex: number;
  readonly sourceHash: string;
}
export interface NativeDetailBadgesContext {
  readonly surface: NormalizedCoreRow<"surface">;
  readonly maximumBadges: number;
  readonly fields: readonly {
    readonly key: string;
    readonly representation: "plain" | "masked" | "omitted";
    readonly choices: NativeFieldChoiceContext;
  }[];
}
const fail = (): never => {
  throw new FoundationContractError("NATIVE_DETAIL_BADGES_INVALID", "/badges");
};
/** Badge tones are presentation oracles: only independently admitted plain
 * fields may be read. The current reference contract has no masked-condition use. */
export function compileNativeDetailBadges(
  bindings: readonly NormalizedLayoutRow<"binding">[],
  choices: readonly ReferenceMember<"fieldChoice">[],
  context: NativeDetailBadgesContext,
): readonly LegacyDetailBadge[] {
  validateConversionJsonData(bindings, "/badges");
  validateNormalizedCoreRow("surface", context.surface);
  if (
    context.surface.surfaceKind !== "detail" ||
    !Number.isSafeInteger(context.maximumBadges) ||
    context.maximumBadges < 1 ||
    bindings.length > context.maximumBadges ||
    new Set(context.fields.map((f) => f.key)).size !== context.fields.length ||
    new Set(context.fields.map((f) => f.choices.field.id)).size !==
      context.fields.length
  )
    fail();
  const ids = new Set<string>(),
    fields = new Set<string>(),
    keys = new Set<string>();
  return [...bindings]
    .sort((a, b) => a.position - b.position)
    .map((binding, i) => {
      validateNormalizedLayoutRow("binding", binding);
      const field = context.fields.find(
        (f) => f.choices.field.id === binding.entityFieldId,
      );
      if (
        !field ||
        field.representation !== "plain" ||
        field.choices.field.dataType !== "enum" ||
        binding.bindingKind !== "badge" ||
        binding.entitySurfaceId !== context.surface.id ||
        binding.overlayId !== null ||
        binding.entitySurfaceSectionId !== null ||
        binding.position !== i + 1 ||
        ids.has(binding.id) ||
        fields.has(binding.entityFieldId) ||
        keys.has(binding.bindingKey)
      )
        fail();
      ids.add(binding.id);
      fields.add(binding.entityFieldId);
      keys.add(binding.bindingKey);
      // This legacy shape represents field and tone only. Other badge options
      // cannot be silently discarded by an inverse/whole-release projection.
      for (const [key, value] of Object.entries(binding)) {
        if (
          ![
            "id",
            "entitySurfaceId",
            "entityFieldId",
            "bindingKey",
            "bindingKind",
            "position",
            "columnSpan",
            "meaningfulForForm",
            "componentDisplayId",
          ].includes(key) &&
          value !== null
        )
          fail();
      }
      if (binding.columnSpan !== 1 || binding.meaningfulForForm !== false)
        fail();
      return {
        field: field!.key,
        tones: compileNativeFieldChoices(
          choices.filter((c) => c.entityFieldId === binding.entityFieldId),
          field!.choices,
        ).tones,
      };
    });
}
function declarations(
  source: MetaEntityGraph,
  surfaceId: string,
): readonly LegacyDetailBadge[] {
  const surfaces = source.surfaces?.filter((s) => s.id === surfaceId);
  if (surfaces?.length !== 1 || surfaces[0]!.surfaceKind !== "detail")
    return fail();
  const value = (
    surfaces[0]!.layoutConfig?.recordPresentation as
      Record<string, unknown> | undefined
  )?.badges;
  validateConversionJsonData(value, "/badges");
  if (
    !Array.isArray(value) ||
    value.some(
      (b) =>
        !b ||
        typeof b !== "object" ||
        Object.keys(b).sort().join() !== "field,tones",
    )
  )
    return fail();
  validateFoundationNode(
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
          // Dynamic tone keys are checked by exact choice projection below.
        },
        required: ["field"],
      },
    },
    (value as LegacyDetailBadge[]).map((b) => ({ field: b.field })),
    "/badges",
  );
  if (
    !Array.isArray(value) ||
    value.some(
      (b) =>
        !b ||
        typeof b !== "object" ||
        Object.keys(b).sort().join() !== "field,tones",
    ) ||
    new Set(value.map((b) => b.field)).size !== value.length
  )
    return fail();
  return value as unknown as readonly LegacyDetailBadge[];
}
export function validateNativeBadgeDerivations(
  source: MetaEntityGraph,
  prepared: MetaEntityGraph,
  rows: readonly NativeBadgeDerivation[],
): void {
  validateConversionJsonData(rows, "/badgeDerivations");
  if (
    !Array.isArray(rows) ||
    rows.some((r) => !r || typeof r !== "object" || Array.isArray(r)) ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    fail();
  const oldIds = new Set(source.surfaceFieldBindings?.map((b) => b.id));
  const seen = new Set<string>();
  for (const row of rows) {
    validateFoundationNode(
      {
        type: "object",
        properties: {
          id: referenceUuid,
          surfaceId: referenceUuid,
          fieldId: referenceUuid,
          bindingKey: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
          sourceIndex: { type: "integer", minimum: 0, maximum: 32766 },
          sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      },
      row,
      "/badgeDerivations",
    );
    const badge = declarations(source, row.surfaceId)[row.sourceIndex];
    const fields = source.fields?.filter(
      (f) => f.id === row.fieldId && f.fieldKey === badge?.field,
    );
    const slot = canonicalJson([row.surfaceId, row.sourceIndex]);
    const expected = {
      id: row.id,
      entitySurfaceId: row.surfaceId,
      entityFieldId: row.fieldId,
      bindingKey: row.bindingKey,
      position: row.sourceIndex + 1,
      columnSpan: 1,
    };
    const bindings = prepared.surfaceFieldBindings?.filter(
      (b) => b.id === row.id,
    );
    if (
      !badge ||
      sha256(badge) !== row.sourceHash ||
      fields?.length !== 1 ||
      oldIds.has(row.id) ||
      seen.has(slot) ||
      bindings?.length !== 1 ||
      canonicalJson(bindings[0]) !== canonicalJson(expected)
    )
      fail();
    seen.add(slot);
  }
  for (const surface of source.surfaces ?? []) {
    const record = surface.layoutConfig?.recordPresentation as
      Record<string, unknown> | undefined;
    if (!record || !Object.hasOwn(record, "badges")) continue;
    const badges = declarations(source, surface.id!);
    if (rows.filter((r) => r.surfaceId === surface.id).length !== badges.length)
      fail();
  }
}
export function createLegacyNativeDetailBadgesAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly contexts: readonly NativeDetailBadgesContext[];
  readonly mappings: readonly NativeBadgeDerivation[];
  readonly bindings: readonly NormalizedLayoutRow<"binding">[];
  readonly choices: readonly ReferenceMember<"fieldChoice">[];
}): NativeNestedConversionAdapter {
  if (
    Object.keys(input).sort().join() !==
    "bindings,choices,contexts,dependencies,mappings,resource,source,sourceHash"
  )
    fail();
  // Context contains an installed label resolver; copy its data, preserve port.
  const contexts = input.contexts.map((c) => ({
    ...c,
    surface: structuredClone(c.surface),
    fields: c.fields.map((f) => ({
      ...f,
      choices: {
        ...f.choices,
        field: structuredClone(f.choices.field),
        domainValues: f.choices.domainValues && [...f.choices.domainValues],
      },
    })),
  }));
  const source = structuredClone(input.source),
    bindings = structuredClone(input.bindings),
    choices = structuredClone(input.choices),
    mappings = structuredClone(input.mappings);
  const resource = structuredClone(input.resource),
    dependencies = structuredClone(input.dependencies);
  if (
    sha256(source) !== input.sourceHash ||
    new Set(contexts.map((c) => c.surface.id)).size !== contexts.length ||
    canonicalJson(bindings.map((b) => b.id).sort()) !==
      canonicalJson(mappings.map((m) => m.id).sort())
  )
    fail();
  const projected = new Map<string, readonly LegacyDetailBadge[]>();
  for (const c of contexts) {
    const result = compileNativeDetailBadges(
      bindings.filter((b) => b.entitySurfaceId === c.surface.id),
      choices,
      c,
    );
    if (
      canonicalJson(result) !==
      canonicalJson(declarations(source, c.surface.id))
    )
      fail();
    projected.set(c.surface.id, result);
  }
  if (mappings.some((m) => !projected.has(m.surfaceId))) fail();
  const prepared = structuredClone(source);
  for (const s of prepared.surfaces ?? []) {
    if (!projected.has(s.id!)) continue;
    const record = {
      ...(s.layoutConfig!.recordPresentation as Record<string, unknown>),
    };
    delete record.badges;
    Reflect.set(s, "layoutConfig", {
      ...s.layoutConfig,
      recordPresentation: record,
    });
  }
  Reflect.set(prepared, "surfaceFieldBindings", [
    ...(prepared.surfaceFieldBindings ?? []),
    ...mappings.map((m) => ({
      id: m.id,
      entitySurfaceId: m.surfaceId,
      entityFieldId: m.fieldId,
      bindingKey: m.bindingKey,
      position: m.sourceIndex + 1,
      columnSpan: 1,
    })),
  ]);
  validateNativeBadgeDerivations(source, prepared, mappings);
  for (const binding of bindings) {
    const m = mappings.find((m) => m.id === binding.id)!;
    if (
      binding.entitySurfaceId !== m.surfaceId ||
      binding.entityFieldId !== m.fieldId ||
      binding.bindingKey !== m.bindingKey ||
      binding.position !== m.sourceIndex + 1
    )
      fail();
  }
  return {
    resource,
    dependencies,
    badgeDerivations: mappings,
    forward(graph) {
      if (sha256(graph) !== sha256(source)) fail();
      return structuredClone(prepared);
    },
    reverse(graph, target) {
      // Restore from current typed rows, never replay captured badge values.
      const result = structuredClone(graph);
      if (
        !target.referenceMembers ||
        canonicalJson(
          target.surfaceFieldBindings.filter((b) =>
            mappings.some((m) => m.id === b.id),
          ),
        ) !== canonicalJson(bindings)
      )
        fail();
      for (const c of contexts) {
        if (
          target.surfaces.filter(
            (s) => s.id === c.surface.id && s.surfaceKind === "detail",
          ).length !== 1
        )
          fail();
        const fields = c.fields.map((f) => {
          const rows = target.fields.filter((r) => r.id === f.choices.field.id);
          if (
            rows.length !== 1 ||
            target.fieldIdentities?.filter(
              (identity) =>
                identity.id === rows[0]!.fieldIdentityId &&
                identity.fieldKey === f.key,
            ).length !== 1
          )
            fail();
          return { ...f, choices: { ...f.choices, field: rows[0]! } };
        });
        const badges = compileNativeDetailBadges(
          target.surfaceFieldBindings.filter(
            (b) =>
              bindings.some((r) => r.id === b.id) &&
              b.entitySurfaceId === c.surface.id,
          ),
          target.referenceMembers!.members.fieldChoice,
          { ...c, fields },
        );
        const surfaces = result.surfaces!.filter((s) => s.id === c.surface.id);
        if (surfaces.length !== 1) fail();
        Reflect.set(surfaces[0]!, "layoutConfig", {
          ...surfaces[0]!.layoutConfig,
          recordPresentation: {
            ...(surfaces[0]!.layoutConfig!.recordPresentation as object),
            badges,
          },
        });
      }
      Reflect.set(
        result,
        "surfaceFieldBindings",
        result.surfaceFieldBindings!.filter(
          (b) => !mappings.some((m) => m.id === b.id),
        ),
      );
      if (canonicalJson(result) !== canonicalJson(source)) fail();
      return result;
    },
  };
}
