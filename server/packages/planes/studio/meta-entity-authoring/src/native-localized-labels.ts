import {
  FoundationContractError,
  parseOwnedLabels,
  referenceUuid,
  validateFoundationNode,
  type OwnedLabelGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityRuntimeLocalizedText,
  type EntityRuntimeLocalizedTextV1,
} from "@athyper/contract-platform-entity-runtime";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";

const fail = (code: string): never => {
  throw new FoundationContractError(code, "/localization");
};
function admitted(graph: OwnedLabelGraph): OwnedLabelGraph {
  return parseOwnedLabels(graph, {
    entityId: graph.entityId,
    changeSetId: graph.changeSetId,
    tenantId: graph.tenantId,
    supportedLocales: graph.requiredLocales,
  });
}
/** Compile from scoped rows selected by an explicit owner FK. Key names and
 * matching text never select an owner. Translation completeness is checked by
 * the caller's publication gate; draft projections retain partial values. */
export function compileNativeLocalizedText(
  graph: OwnedLabelGraph,
  labelId: string,
  mode: "key-default" | "translations",
): EntityRuntimeLocalizedTextV1 {
  admitted(graph);
  validateFoundationNode(referenceUuid, labelId, "/localization/labelId");
  if (!["key-default", "translations"].includes(mode))
    fail("NATIVE_LOCALIZATION_MODE_INVALID");
  const labels = graph.labels.filter((l) => l.id === labelId);
  if (labels.length !== 1) fail("NATIVE_LOCALIZATION_OWNER_REQUIRED");
  const row = labels[0]!;
  const values = Object.fromEntries([
    [graph.defaultLocale, row.defaultText],
    ...graph.translations
      .filter((t) => t.labelId === labelId)
      .map((t) => [t.localeCode, t.text]),
  ]);
  return parseEntityRuntimeLocalizedText({
    labelKey: row.labelKey,
    defaultText: row.defaultText,
    ...(mode === "translations"
      ? { defaultLocale: graph.defaultLocale, values }
      : {}),
  });
}
/** Exact conversion of one legacy localized value into existing owned rows or
 * independently allocated IDs. Scope/default locale are preserved. Does not
 * establish a field/surface/root label FK or invent translation text. */
export function convertLegacyLocalizedText(input: {
  readonly source: EntityRuntimeLocalizedTextV1;
  readonly sourceHash: string;
  readonly labels: OwnedLabelGraph;
  readonly labelId: string;
  readonly translationIds: Readonly<Record<string, string>>;
}): OwnedLabelGraph {
  validateConversionJsonData(input, "/localization");
  input = structuredClone(input);
  if (
    Object.keys(input).sort().join() !==
    "labelId,labels,source,sourceHash,translationIds"
  )
    fail("NATIVE_LOCALIZATION_SOURCE_INVALID");
  admitted(input.labels);
  const source = parseEntityRuntimeLocalizedText(input.source);
  if (
    canonicalJson(source) !== canonicalJson(input.source) ||
    sha256(source) !== input.sourceHash
  )
    fail("NATIVE_LOCALIZATION_SOURCE_INVALID");
  validateFoundationNode(referenceUuid, input.labelId, "/localization/labelId");
  const translated = source.values !== undefined;
  if (translated && source.defaultLocale !== input.labels.defaultLocale)
    fail("NATIVE_LOCALIZATION_LOCALE_MISMATCH");
  const locales = Object.keys(source.values ?? {})
    .filter((l) => l !== input.labels.defaultLocale)
    .sort();
  if (
    canonicalJson(locales) !==
    canonicalJson(Object.keys(input.translationIds).sort())
  )
    fail("NATIVE_LOCALIZATION_TRANSLATION_INVENTORY_INVALID");
  const proposed = {
    id: input.labelId,
    labelKey: source.labelKey,
    defaultText: source.defaultText,
    sourceKind: "owned" as const,
    sharedLabelKey: null,
    sharedResourceKey: null,
    sharedResourceVersion: null,
    sharedResourceHash: null,
  };
  const labels = [...input.labels.labels];
  const existing = labels.filter(
    (l) => l.id === input.labelId || l.labelKey === source.labelKey,
  );
  if (existing.length) {
    if (
      existing.length !== 1 ||
      canonicalJson(existing[0]) !== canonicalJson(proposed)
    )
      fail("NATIVE_LOCALIZATION_LABEL_CONFLICT");
  } else labels.push(proposed);
  const translations = [...input.labels.translations];
  for (const locale of locales) {
    validateFoundationNode(
      referenceUuid,
      input.translationIds[locale],
      "/localization/translationId",
    );
    const row = {
      id: input.translationIds[locale]!,
      labelId: input.labelId,
      localeCode: locale,
      text: source.values![locale]!,
    };
    const existing = translations.filter(
      (t) =>
        t.id === row.id ||
        (t.labelId === row.labelId && t.localeCode === row.localeCode),
    );
    if (existing.length) {
      if (
        existing.length !== 1 ||
        canonicalJson(existing[0]) !== canonicalJson(row)
      )
        fail("NATIVE_LOCALIZATION_TRANSLATION_CONFLICT");
    } else translations.push(row);
  }
  const result = admitted({ ...input.labels, labels, translations });
  if (
    canonicalJson(
      compileNativeLocalizedText(
        result,
        input.labelId,
        translated ? "translations" : "key-default",
      ),
    ) !== canonicalJson(source)
  )
    fail("NATIVE_LOCALIZATION_NOT_LOSSLESS");
  return result;
}

/** Drafts may leave the root owner unresolved. A present owner must resolve
 * through the snapshot's exact entity/change-set/tenant label inventory. */
export function validateNativeEntityLabelOwner(
  graph: {
    readonly entity: { readonly entityLabelId?: string };
    readonly ownedLabels?: OwnedLabelGraph;
  },
  coordinate: {
    readonly entityId: string;
    readonly changeSetId: string;
    readonly tenantId: string | null;
  },
): void {
  if (!Object.hasOwn(graph.entity, "entityLabelId")) return;
  if (
    !graph.ownedLabels ||
    graph.ownedLabels.entityId !== coordinate.entityId ||
    graph.ownedLabels.changeSetId !== coordinate.changeSetId ||
    graph.ownedLabels.tenantId !== coordinate.tenantId
  )
    fail("NATIVE_LOCALIZATION_OWNER_SCOPE_INVALID");
  compileNativeLocalizedText(
    graph.ownedLabels!,
    graph.entity.entityLabelId!,
    "key-default",
  );
}
