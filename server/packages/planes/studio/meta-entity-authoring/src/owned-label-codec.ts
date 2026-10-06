import { parseProductLocalization } from "./authoring/product-localization.js";
import { createHash } from "node:crypto";
import {
  FoundationContractError,
  assertOwnedLabelsComplete,
  parseOwnedLabels,
  ownedLabelMappings,
  type OwnedLabelGraph,
  type OwnedLabelContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";

export interface LegacyLabelIdentity {
  readonly labelKey: string;
  readonly id: string;
  readonly translations: Readonly<Record<string, string>>;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("FOUNDATION_LEGACY_INVALID", path);
  return value as Record<string, unknown>;
}
function closed(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      fail("FOUNDATION_UNSUPPORTED_PROPERTY", `${path}/${key}`);
}

/** Converts only the declared localization resource, never a whole entity definition.
 * UUIDs come from an explicit migration identity map, not random regeneration.
 * sourceHash binds that map to the exact source content used in this rehearsal.
 */
export function importOwnedLabelLocalization(
  value: unknown,
  input: OwnedLabelContext & {
    readonly sourceHash: string;
    readonly identities: readonly LegacyLabelIdentity[];
  },
): OwnedLabelGraph {
  if (
    createHash("sha256").update(canonicalJson(value)).digest("hex") !==
    input.sourceHash
  )
    fail("FOUNDATION_SOURCE_HASH_MISMATCH", "/sourceHash");
  const root = object(value, "");
  closed(root, ["schema", "defaultLocale", "requiredLocales", "values"], "");
  if (root.schema !== "athyper.meta-entity-localization/1")
    fail("FOUNDATION_LEGACY_VERSION_UNSUPPORTED", "/schema");
  if (typeof root.defaultLocale !== "string")
    fail("FOUNDATION_LEGACY_INVALID", "/defaultLocale");
  const values = object(root.values, "/values");
  const identityMap = new Map(
    input.identities.map((item) => [item.labelKey, item]),
  );
  if (
    identityMap.size !== input.identities.length ||
    identityMap.size !== Object.keys(values).length
  )
    fail("FOUNDATION_IDENTITY_MAP_INVALID", "/identities");
  const labels: OwnedLabelGraph["labels"][number][] = [];
  const translations: OwnedLabelGraph["translations"][number][] = [];
  for (const [key, raw] of Object.entries(values)) {
    const identity = identityMap.get(key);
    if (!identity)
      return fail("FOUNDATION_IDENTITY_MAP_INVALID", `/identities/${key}`);
    const locales = object(raw, `/values/${key}`);
    const defaultText = locales[root.defaultLocale as string];
    if (typeof defaultText !== "string")
      fail("FOUNDATION_LEGACY_DEFAULT_REQUIRED", `/values/${key}`);
    labels.push({
      id: identity.id,
      labelKey: key,
      defaultText: defaultText as string,
      sourceKind: "owned",
      sharedLabelKey: null,
      sharedResourceKey: null,
      sharedResourceVersion: null,
      sharedResourceHash: null,
    });
    const nonDefault = Object.keys(locales).filter(
      (locale) => locale !== root.defaultLocale,
    );
    if (Object.keys(identity.translations).length !== nonDefault.length)
      fail(
        "FOUNDATION_IDENTITY_MAP_INVALID",
        `/identities/${key}/translations`,
      );
    for (const locale of nonDefault) {
      const id = Object.hasOwn(identity.translations, locale)
        ? identity.translations[locale]
        : undefined;
      if (!id || typeof locales[locale] !== "string")
        fail("FOUNDATION_IDENTITY_MAP_INVALID", `/identities/${key}/${locale}`);
      translations.push({
        id: id!,
        labelId: identity.id,
        localeCode: locale,
        text: locales[locale] as string,
      });
    }
  }
  return parseOwnedLabels(
    {
      contract: "entity.authoring-owned-labels/1",
      entityId: input.entityId,
      changeSetId: input.changeSetId,
      tenantId: input.tenantId,
      defaultLocale: root.defaultLocale,
      requiredLocales: root.requiredLocales,
      labels,
      translations,
    },
    input,
  );
}

/** Existing localization wire format; this projection grants no permissions. */
export function compileOwnedLabelLocalization(
  graph: OwnedLabelGraph,
  context: OwnedLabelContext,
) {
  assertOwnedLabelsComplete(graph, context);
  const output = {
    schema: "athyper.meta-entity-localization/1" as const,
    defaultLocale: graph.defaultLocale,
    requiredLocales: graph.requiredLocales,
    values: Object.fromEntries(
      graph.labels.map((label) => [
        label.labelKey,
        Object.fromEntries([
          [graph.defaultLocale, label.defaultText],
          ...graph.translations
            .filter((t) => t.labelId === label.id)
            .map((t) => [t.localeCode, t.text]),
        ]),
      ]),
    ),
  };
  try {
    parseProductLocalization(output);
  } catch {
    return fail("FOUNDATION_RUNTIME_LOCALIZATION_INCOMPATIBLE", "/labels");
  }
  return output;
}
export function encodeOwnedLabels(
  graph: OwnedLabelGraph,
  context: OwnedLabelContext,
): string {
  parseOwnedLabels(graph, context);
  // Row order is nonsemantic for these two families; there are no position columns.
  return canonicalJson({
    ...graph,
    labels: [...graph.labels].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    translations: [...graph.translations].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
  });
}
export function decodeOwnedLabels(
  encoded: string,
  context: OwnedLabelContext,
): OwnedLabelGraph {
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return fail("FOUNDATION_JSON_INVALID", "");
  }
  return parseOwnedLabels(value, context);
}

/** Generated column mapping proof only. No SQL execution and no audit attribution synthesis. */
export function ownedLabelRows(
  graph: OwnedLabelGraph,
  context: OwnedLabelContext,
) {
  parseOwnedLabels(graph, context);
  return Object.fromEntries(
    Object.entries(ownedLabelMappings).map(([branch, mapping]) => [
      mapping.table,
      graph[branch as keyof typeof ownedLabelMappings].map((row) =>
        Object.fromEntries([
          ["entity_id", graph.entityId],
          ["change_set_id", graph.changeSetId],
          ["tenant_id", graph.tenantId],
          ...Object.entries(mapping.columns).map(([property, column]) => [
            column,
            Reflect.get(row, property),
          ]),
        ]),
      ),
    ]),
  );
}

/** Inverse mapping rehearsal; only selected columns are accepted. Production row
 * attribution and database enforcement remain separate, unimplemented gates. */
export function loadOwnedLabelRows(
  rows: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>,
  root: Pick<OwnedLabelGraph, "defaultLocale" | "requiredLocales">,
  context: OwnedLabelContext,
): OwnedLabelGraph {
  closed(
    rows as Record<string, unknown>,
    Object.values(ownedLabelMappings).map((mapping) => mapping.table),
    "/rows",
  );
  const members = Object.fromEntries(
    Object.entries(ownedLabelMappings).map(([branch, mapping]) => {
      const source = rows[mapping.table];
      if (!Array.isArray(source))
        return fail("FOUNDATION_REQUIRED_PROPERTY", `/rows/${mapping.table}`);
      return [
        branch,
        source.map((row, index) => {
          const value = object(row, `/rows/${mapping.table}/${index}`);
          closed(
            value,
            [
              "entity_id",
              "change_set_id",
              "tenant_id",
              ...Object.values(mapping.columns),
            ],
            `/rows/${mapping.table}/${index}`,
          );
          if (
            value.entity_id !== context.entityId ||
            value.change_set_id !== context.changeSetId ||
            value.tenant_id !== context.tenantId
          )
            fail(
              "FOUNDATION_OWNERSHIP_MISMATCH",
              `/rows/${mapping.table}/${index}`,
            );
          return Object.fromEntries(
            Object.entries(mapping.columns).map(([property, column]) => [
              property,
              value[column],
            ]),
          );
        }),
      ];
    }),
  );
  return parseOwnedLabels(
    {
      contract: "entity.authoring-owned-labels/1",
      entityId: context.entityId,
      changeSetId: context.changeSetId,
      tenantId: context.tenantId,
      ...root,
      ...members,
    },
    context,
  );
}
