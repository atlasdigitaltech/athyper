import { describe, expect, it } from "vitest";
import { parseProductLocalization } from "./product-localization.js";

const source = {
  schema: "athyper.meta-entity-localization/1",
  defaultLocale: "en",
  requiredLocales: ["en", "ms", "ar"],
  values: {
    "entity.example.title": {
      en: "Examples",
      ms: "Contoh",
      ar: "أمثلة",
    },
  },
};

describe("Meta Entity product localization", () => {
  it("requires every declared locale and preserves the metadata fallback", () => {
    const localization = parseProductLocalization(source);
    expect(
      localization.localize({
        labelKey: "entity.example.title",
        defaultText: "Examples",
      }),
    ).toEqual({
      labelKey: "entity.example.title",
      defaultText: "Examples",
      defaultLocale: "en",
      values: { en: "Examples", ms: "Contoh", ar: "أمثلة" },
    });
  });

  it("rejects incomplete translations, unknown labels, and changed fallbacks", () => {
    const incomplete = structuredClone(source);
    delete incomplete.values["entity.example.title"]!.ar;
    expect(() => parseProductLocalization(incomplete)).toThrow(
      "ENTITY_LOCALIZATION_TRANSLATION_REQUIRED",
    );
    const localization = parseProductLocalization(source);
    expect(() => localization.localize({ labelKey: "entity.example.unknown", defaultText: "Unknown" })).toThrow("ENTITY_LOCALIZATION_LABEL_REQUIRED");
    expect(() => localization.localize({ labelKey: "entity.example.title", defaultText: "Changed" })).toThrow("ENTITY_LOCALIZATION_FALLBACK_MISMATCH");
  });
});
