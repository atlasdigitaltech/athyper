import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { parseProductLocalization } from "./authoring/product-localization.js";
import {
  importOwnedLabelLocalization,
  compileOwnedLabelLocalization,
  encodeOwnedLabels,
  decodeOwnedLabels,
  ownedLabelRows,
  loadOwnedLabelRows,
  type HistoricalLabelIdentity,
} from "./owned-label-codec.js";
import { canonicalJson } from "./deterministic.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = {
  entityId: id(1),
  changeSetId: id(2),
  tenantId: null,
  supportedLocales: ["en", "ms", "ar"],
};
const hash = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex");
const source = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../../../${path}`, import.meta.url), "utf8"),
  );
// Explicit test fixture selection: State Region has no localization resource.
// Extract only declared labelKey/defaultText pairs for an English-only synthetic
// localization fixture. This is not a full-definition migration or inferred label.
function selectedLabels(
  value: unknown,
  labels = new Map<string, string>(),
): Map<string, string> {
  if (!value || typeof value !== "object") return labels;
  const row = value as Record<string, unknown>;
  if (typeof row.labelKey === "string" && typeof row.defaultText === "string") {
    if (
      labels.has(row.labelKey) &&
      labels.get(row.labelKey) !== row.defaultText
    )
      throw Error("conflicting fixture label");
    labels.set(row.labelKey, row.defaultText);
  }
  for (const child of Object.values(row)) selectedLabels(child, labels);
  return labels;
}
function identities(value: {
  defaultLocale: string;
  values: Record<string, Record<string, string>>;
}): HistoricalLabelIdentity[] {
  let next = 10;
  return Object.entries(value.values).map(([labelKey, locales]) => ({
    labelKey,
    id: id(next++),
    translations: Object.fromEntries(
      Object.keys(locales)
        .filter((locale) => locale !== value.defaultLocale)
        .map((locale) => [locale, id(next++)]),
    ),
  }));
}
function fixtures() {
  const country = source(
    "metadata/entities/common/reference/country/localization.json",
  );
  const declared = source(
    "metadata/entities/common/reference/state_region/definition.json",
  );
  const state = {
    schema: "athyper.meta-entity-localization/1",
    defaultLocale: "en",
    requiredLocales: ["en"],
    values: Object.fromEntries(
      [...selectedLabels(declared)].map(([key, text]) => [key, { en: text }]),
    ),
  };
  return [
    { name: "Country", value: country },
    { name: "State Region (declared labels only)", value: state },
  ];
}
for (const { name, value } of fixtures()) {
  it(`round-trips ${name} through the same closed codec and runtime localization parser`, () => {
    const graph = importOwnedLabelLocalization(value, {
      ...context,
      sourceHash: hash(value),
      identities: identities(value),
    });
    const encoded = encodeOwnedLabels(graph, context);
    const decoded = decodeOwnedLabels(encoded, context);
    expect(encodeOwnedLabels(decoded, context)).toBe(encoded);
    expect(compileOwnedLabelLocalization(decoded, context)).toEqual(value);
    const consumer = parseProductLocalization(
      compileOwnedLabelLocalization(decoded, context),
    );
    const original = parseProductLocalization(value);
    for (const label of decoded.labels) {
      const reference = {
        labelKey: label.labelKey,
        defaultText: label.defaultText,
      };
      expect(consumer.localize(reference)).toEqual(
        original.localize(reference),
      );
    }
    const rows = ownedLabelRows(decoded, context);
    expect(loadOwnedLabelRows(rows, decoded, context)).toEqual(decoded);
    const foreignRows = structuredClone(rows);
    foreignRows["metadata.entity_label"]![0]!.change_set_id = id(99);
    expect(() => loadOwnedLabelRows(foreignRows, decoded, context)).toThrow(
      "FOUNDATION_OWNERSHIP_MISMATCH",
    );
    expect(rows["metadata.entity_label"]?.length).toBe(
      Object.keys(value.values).length,
    );
    expect(
      rows["metadata.entity_label"]?.every(
        (row) =>
          row.tenant_id === null &&
          row.change_set_id === context.changeSetId &&
          row.shared_resource_hash === null,
      ),
    ).toBe(true);
    expect(
      encodeOwnedLabels(
        {
          ...graph,
          labels: [...graph.labels].reverse(),
          translations: [...graph.translations].reverse(),
        },
        context,
      ),
    ).toBe(encoded);
  });
}
it("rejects wrong source evidence and an incomplete identity map", () => {
  const { value } = fixtures()[0]!;
  expect(() =>
    importOwnedLabelLocalization(value, {
      ...context,
      sourceHash: "0".repeat(64),
      identities: identities(value),
    }),
  ).toThrow("FOUNDATION_SOURCE_HASH_MISMATCH");
  expect(() =>
    importOwnedLabelLocalization(value, {
      ...context,
      sourceHash: hash(value),
      identities: [],
    }),
  ).toThrow("FOUNDATION_IDENTITY_MAP_INVALID");
  const unsupported = { ...value, operations: [] };
  expect(() =>
    importOwnedLabelLocalization(unsupported, {
      ...context,
      sourceHash: hash(unsupported),
      identities: identities(value),
    }),
  ).toThrow("FOUNDATION_UNSUPPORTED_PROPERTY");
  expect(() => decodeOwnedLabels("{", context)).toThrow(
    "FOUNDATION_JSON_INVALID",
  );
});
it("records a 1,365-label synthetic encoding measurement without claiming a production budget", () => {
  const value = {
    schema: "athyper.meta-entity-localization/1",
    defaultLocale: "en",
    requiredLocales: ["en"],
    values: Object.fromEntries(
      Array.from({ length: 1365 }, (_, i) => [
        `fixture.label.${i}`,
        { en: `Label ${i}` },
      ]),
    ),
  };
  const started = performance.now();
  const graph = importOwnedLabelLocalization(value, {
    ...context,
    sourceHash: hash(value),
    identities: identities(value),
  });
  const encoded = encodeOwnedLabels(graph, context);
  expect(
    compileOwnedLabelLocalization(decodeOwnedLabels(encoded, context), context),
  ).toEqual(value);
  console.info(
    JSON.stringify({
      fixture: "owned-labels-1365",
      labels: 1365,
      bytes: Buffer.byteLength(encoded),
      elapsedMs: Math.round(performance.now() - started),
      productionBudgetApproved: false,
    }),
  );
});
