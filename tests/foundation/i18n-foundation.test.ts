import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCALE_REGISTRY, SUPPORTED_UI_LOCALES, createEffectiveLocalization, createIntlRuntime, localeFallbackChain, parseAcceptLanguage, resolveRequestLocale, textDirection } from "../../packages/platform/foundation/i18n/src/index";

describe("internationalization foundation", () => {
  it("resolves request preferences across the governed locale registry", () => {
    assert.deepEqual(parseAcceptLanguage("fr-FR;q=0.9, ar-SA;q=0.8, en;q=0.5"), ["fr-FR", "ar-SA", "en"]);
    assert.equal(resolveRequestLocale({ acceptLanguage: "fr-FR;q=0.9, ar-SA;q=0.8, en;q=0.5" }), "fr");
    assert.equal(resolveRequestLocale({ cookieLocale: "ar-SA", acceptLanguage: "en" }), "ar");
    assert.equal(resolveRequestLocale({ cookieLocale: "zh-CN" }), "zh-Hans");
    assert.equal(resolveRequestLocale({ cookieLocale: "ta-IN" }), "ta");
    assert.equal(resolveRequestLocale({ cookieLocale: "zh-TW" }), "en");
    assert.deepEqual(SUPPORTED_UI_LOCALES, ["en", "ar", "ms", "zh-Hans", "hi", "ta", "fr", "de"]);
    assert.deepEqual(LOCALE_REGISTRY.map(({ code, rolloutWave }) => [code, rolloutWave]), [["en", 0], ["ar", 1], ["ms", 1], ["zh-Hans", 1], ["hi", 2], ["ta", 2], ["fr", 3], ["de", 3]]);
  });

  it("separates catalog selection from regional formatting and derives RTL", () => {
    const localization = createEffectiveLocalization({ uiLocale: "ar-SA", formatLocale: "ar-SA", timeZone: "Asia/Riyadh", weekStart: 0, weekendDays: [5, 6], source: { uiLocale: "principal", formatLocale: "principal" } });
    assert.equal(localization.uiLocale, "ar-SA");
    assert.equal(localization.catalogLocale, "ar");
    assert.equal(localization.direction, "rtl");
    assert.equal(localization.timeZone, "Asia/Riyadh");
    assert.deepEqual(localization.weekendDays, [5, 6]);
    assert.deepEqual(localeFallbackChain("ar-Arab-SA"), ["ar-Arab-SA", "ar-Arab", "ar", "en"]);
    assert.equal(textDirection("en-US"), "ltr");
    assert.equal(textDirection("ta-IN"), "ltr");
  });

  it("supports all Arabic plural categories through ICU messages", () => {
    const localization = createEffectiveLocalization({ uiLocale: "ar", formatLocale: "ar" });
    const runtime = createIntlRuntime({ localization, messages: { files: "{count, plural, zero {لا ملفات} one {ملف واحد} two {ملفان} few {# ملفات} many {# ملفًا} other {# ملف}}" } });
    assert.equal(runtime.message("files", { count: 0 }), "لا ملفات");
    assert.equal(runtime.message("files", { count: 1 }), "ملف واحد");
    assert.equal(runtime.message("files", { count: 2 }), "ملفان");
    assert.match(runtime.message("files", { count: 3 }), /ملفات/);
    assert.match(runtime.message("files", { count: 11 }), /ملفًا/);
    assert.match(runtime.message("files", { count: 100 }), /ملف$/);
  });

  it("falls back to English messages and emits an observable diagnostic", () => {
    const events: string[] = [];
    const runtime = createIntlRuntime({ localization: createEffectiveLocalization({ uiLocale: "ar" }), messages: {}, fallbackMessages: { greeting: "Hello, {name}" }, onDiagnostic: (event) => events.push(`${event.kind}:${event.messageId}`) });
    assert.equal(runtime.message("greeting", { name: "Sam" }), "Hello, Sam");
    assert.deepEqual(events, ["missing-message:greeting"]);
  });
});
