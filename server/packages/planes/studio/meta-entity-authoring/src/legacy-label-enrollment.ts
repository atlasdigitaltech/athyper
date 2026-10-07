import {
  FoundationContractError,
  parseLabelCommands,
  type LabelCommandBatch,
  type MetaEntityGraph,
  type NormalizedAuthoringPolicy,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
/** Proposal only: extracts explicit localization declarations, never invents keys,
 * translations, UUIDs or ownership. Existing label commands allocate after admission. */
export function prepareLegacyLabelEnrollment(
  source: MetaEntityGraph,
  input: {
    sourceHash: string;
    revision: number;
    idempotencyKey: string;
    defaultLocale: string;
    requiredLocales: readonly string[];
    declarations?: readonly {
      sourcePath: string;
      labelKey: string;
      defaultText: string;
      values?: Readonly<Record<string, string>>;
    }[];
  },
  policy: NormalizedAuthoringPolicy,
) {
  const fail = (code: string, path: string): never => {
    throw new FoundationContractError(code, path);
  };
  validateConversionJsonData(source, "/source");
  if (
    sha256(source) !== input.sourceHash ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0
  )
    fail("LEGACY_LABEL_SOURCE_MISMATCH", "/source");
  if (
    ![
      "athyper.meta-entity-contract/2.1",
      "athyper.meta-entity-contract/2.2",
    ].includes(source.contractSchema) ||
    source.ownedLabels !== undefined
  )
    fail("LEGACY_LABEL_SOURCE_ALREADY_ENROLLED", "/source");
  if (
    !input.requiredLocales.includes(input.defaultLocale) ||
    new Set(input.requiredLocales).size !== input.requiredLocales.length ||
    input.requiredLocales.some((l) => !policy.supportedLocales.includes(l))
  )
    fail("LEGACY_LABEL_LOCALE_INVALID", "/locales");
  const labels = new Map<
    string,
    { defaultText: string; values: Record<string, string>; paths: string[] }
  >();
  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, path + "/" + i));
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (Object.hasOwn(row, "labelKey") && Object.hasOwn(row, "defaultText")) {
      if (
        typeof row.labelKey !== "string" ||
        typeof row.defaultText !== "string"
      )
        fail("LEGACY_LABEL_DECLARATION_INVALID", path);
      if (
        row.defaultLocale !== undefined &&
        row.defaultLocale !== input.defaultLocale
      )
        fail("LEGACY_LABEL_LOCALE_CONFLICT", path);
      const values: Record<string, string> = {};
      if (row.values !== undefined) {
        if (
          !row.values ||
          typeof row.values !== "object" ||
          Array.isArray(row.values)
        )
          fail("LEGACY_LABEL_DECLARATION_INVALID", path + "/values");
        for (const [locale, text] of Object.entries(row.values as object)) {
          if (
            typeof text !== "string" ||
            !policy.supportedLocales.includes(locale)
          )
            fail(
              "LEGACY_LABEL_TRANSLATION_INVALID",
              path + "/values/" + locale,
            );
          values[locale] = text;
        }
        if (values[input.defaultLocale] !== row.defaultText)
          fail("LEGACY_LABEL_DEFAULT_CONFLICT", path);
      } else values[input.defaultLocale] = row.defaultText as string;
      for (const locale of input.requiredLocales)
        if (!Object.hasOwn(values, locale))
          fail("LEGACY_LABEL_TRANSLATION_REQUIRED", path + "/values/" + locale);
      const key = row.labelKey as string,
        prior = labels.get(key);
      if (
        prior &&
        (prior.defaultText !== row.defaultText ||
          canonicalJson(prior.values) !== canonicalJson(values))
      )
        fail("LEGACY_LABEL_KEY_CONFLICT", path);
      labels.set(key, {
        defaultText: row.defaultText as string,
        values,
        paths: [...(prior?.paths ?? []), path],
      });
    }
    for (const [key, v] of Object.entries(row))
      visit(v, path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1"));
  }
  visit(source, "");
  const mappedPaths = new Set<string>();
  for (const declaration of input.declarations ?? []) {
    const path = declaration.sourcePath;
    if (
      !path.startsWith("/") ||
      /~(?:[^01]|$)/.test(path) ||
      mappedPaths.has(path)
    )
      fail("LEGACY_LABEL_MAPPING_PATH_INVALID", path);
    mappedPaths.add(path);
    let value: unknown = source;
    for (const part of path.slice(1).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
        fail("LEGACY_LABEL_MAPPING_PATH_INVALID", path);
      value = (value as Record<string, unknown>)[key];
    }
    if (typeof value !== "string" || value !== declaration.defaultText)
      fail("LEGACY_LABEL_MAPPING_TEXT_MISMATCH", path);
    visit(
      {
        labelKey: declaration.labelKey,
        defaultText: declaration.defaultText,
        ...(declaration.values ? { values: declaration.values } : {}),
      },
      path,
    );
  }
  if (!labels.size) fail("LEGACY_LABEL_DECLARATIONS_REQUIRED", "/source");
  const commands: LabelCommandBatch["commands"][number][] = [
    {
      kind: "updateMember",
      memberKind: "labelSettings",
      set: {
        defaultLocale: input.defaultLocale,
        requiredLocales: [...input.requiredLocales],
      },
    },
  ];
  const bindings = [];
  for (const [index, [labelKey, label]] of [...labels]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .entries()) {
    const tempRef = "label_" + index;
    commands.push({
      kind: "addMember",
      memberKind: "label",
      tempRef,
      value: { labelKey, defaultText: label.defaultText },
    });
    for (const [localeCode, text] of Object.entries(label.values).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    ))
      if (localeCode !== input.defaultLocale)
        commands.push({
          kind: "addMember",
          memberKind: "labelTranslation",
          tempRef: "translation_" + commands.length,
          value: { label: { $tempRef: tempRef }, localeCode, text },
        });
    bindings.push({ labelKey, tempRef, sourcePaths: label.paths });
  }
  const batch = parseLabelCommands(
    {
      contract: "entity.authoring-label-commands/1",
      expectedRevision: input.revision,
      idempotencyKey: input.idempotencyKey,
      commands,
    },
    policy,
  );
  return {
    sourceHash: input.sourceHash,
    revision: input.revision,
    batch,
    bindings,
    proposalHash: sha256({ sourceHash: input.sourceHash, batch, bindings }),
    authority: "not-established" as const,
  };
}
