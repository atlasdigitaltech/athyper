import { expect, it } from "vitest";
import type { OwnedLabelGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  convertLegacyLocalizedText,
  compileNativeLocalizedText,
} from "./native-localized-labels.js";
import { sha256 } from "./deterministic.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const labels = (): OwnedLabelGraph => ({
  contract: "entity.authoring-owned-labels/1",
  entityId: id(1),
  changeSetId: id(2),
  tenantId: null,
  defaultLocale: "en",
  requiredLocales: ["en", "ms"],
  labels: [],
  translations: [],
});
function fixture() {
  const source = {
    labelKey: "reference.name",
    defaultText: "Name",
    defaultLocale: "en",
    values: { en: "Name", ms: "Nama" },
  };
  return {
    source,
    sourceHash: sha256(source),
    labels: labels(),
    labelId: id(3),
    translationIds: { ms: id(4) },
  };
}
it("preserves translation text, scope, explicit ownership and replay identity", () => {
  const input = fixture(),
    result = convertLegacyLocalizedText(input);
  expect(result.translations).toEqual([
    { id: id(4), labelId: id(3), localeCode: "ms", text: "Nama" },
  ]);
  expect(compileNativeLocalizedText(result, id(3), "translations")).toEqual(
    input.source,
  );
  expect(convertLegacyLocalizedText({ ...input, labels: result })).toEqual(
    result,
  );
  expect(compileNativeLocalizedText(result, id(3), "key-default")).toEqual({
    labelKey: "reference.name",
    defaultText: "Name",
  });
  expect(input.labels).toEqual(labels());
});
it("preserves key-only absence and rejects incorrect keys, locale, text, IDs and hidden extra translations", () => {
  const input = fixture();
  const source = {
    labelKey: input.source.labelKey,
    defaultText: input.source.defaultText,
  };
  const result = convertLegacyLocalizedText({
    ...input,
    source,
    sourceHash: sha256(source),
    translationIds: {},
  });
  expect(result.translations).toEqual([]);
  expect(() =>
    compileNativeLocalizedText(result, id(99), "key-default"),
  ).toThrow("NATIVE_LOCALIZATION_OWNER_REQUIRED");
  expect(() =>
    convertLegacyLocalizedText({ ...input, sourceHash: "a".repeat(64) }),
  ).toThrow();
  expect(() =>
    convertLegacyLocalizedText({
      ...input,
      labels: { ...labels(), defaultLocale: "ms" },
    }),
  ).toThrow();
  expect(() =>
    convertLegacyLocalizedText({ ...input, translationIds: { ms: id(3) } }),
  ).toThrow();
  const populated = convertLegacyLocalizedText(input);
  expect(() =>
    convertLegacyLocalizedText({
      ...input,
      labels: {
        ...populated,
        labels: populated.labels.map((l) => ({ ...l, defaultText: "Other" })),
      },
    }),
  ).toThrow();
  expect(() =>
    convertLegacyLocalizedText({
      ...input,
      labels: {
        ...populated,
        requiredLocales: ["en", "ms", "fr"],
        translations: [
          ...populated.translations,
          { id: id(9), labelId: id(3), localeCode: "fr", text: "Nom" },
        ],
      },
    }),
  ).toThrow("NATIVE_LOCALIZATION_NOT_LOSSLESS");
});

it("rejects cross-scope root ownership and unknown conversion input properties", async () => {
  const input = fixture(),
    result = convertLegacyLocalizedText(input);
  const { validateNativeEntityLabelOwner } =
    await import("./native-localized-labels.js");
  const graph = {
    entity: { entityLabelId: input.labelId },
    ownedLabels: result,
  };
  const coordinate = {
    entityId: result.entityId,
    changeSetId: result.changeSetId,
    tenantId: result.tenantId,
  };
  expect(() => validateNativeEntityLabelOwner(graph, coordinate)).not.toThrow();
  expect(() =>
    validateNativeEntityLabelOwner(graph, { ...coordinate, tenantId: id(99) }),
  ).toThrow("NATIVE_LOCALIZATION_OWNER_SCOPE_INVALID");
  expect(() =>
    validateNativeEntityLabelOwner(graph, {
      ...coordinate,
      changeSetId: id(99),
    }),
  ).toThrow("NATIVE_LOCALIZATION_OWNER_SCOPE_INVALID");
  expect(() =>
    validateNativeEntityLabelOwner(
      { ...graph, entity: { entityLabelId: "" } },
      coordinate,
    ),
  ).toThrow();
  expect(() =>
    convertLegacyLocalizedText({ ...input, ignored: {} } as typeof input),
  ).toThrow("NATIVE_LOCALIZATION_SOURCE_INVALID");
});
