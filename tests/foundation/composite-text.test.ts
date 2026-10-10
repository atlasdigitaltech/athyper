import assert from "node:assert/strict";
import test from "node:test";
import { createEffectiveLocalization, createIntlRuntime } from "../../packages/platform/foundation/i18n/src/index";
import { entityFallbackMessages, entityMessages } from "../../packages/platform/foundation/i18n/src/entity-catalogs";
import { amountText, labelledText, listText, nameText, pathText, perUnitText, separatedText } from "../../packages/platform/entity/runtime/list-view/src/composite-text";

// Composite text (shared list layout foundation, known gap 2): separators,
// order and punctuation come from the locale's messages and list format, not
// from a join() in code.

const runtime = (locale: string) =>
  createIntlRuntime({ localization: createEffectiveLocalization({ uiLocale: locale, formatLocale: locale }), messages: entityMessages(locale), fallbackMessages: entityFallbackMessages });

test("English keeps the established forms", () => {
  const intl = runtime("en");
  assert.equal(listText(intl, ["1000 Cash", "Records", undefined, "2"]), "1000 Cash, Records, 2");
  assert.equal(separatedText(intl, ["Rank 2 of 5", "+12.5%"]), "Rank 2 of 5 · +12.5%");
  assert.equal(labelledText(intl, "Status", "Open"), "Status: Open");
  assert.equal(amountText(intl, "100.00", "MYR", "currencyLast"), "100.00 MYR");
  assert.equal(amountText(intl, "100.00", "MYR", "currencyFirst"), "MYR 100.00");
  assert.equal(perUnitText(intl, "MYR 5.00", "EA"), "MYR 5.00 / EA");
  assert.equal(pathText(intl, ["GL account", "Fiscal period", "Month"]), "GL account › Fiscal period › Month");
  assert.equal(nameText(intl, "PRJ-01", "Website relaunch"), "PRJ-01 Website relaunch");
  assert.equal(intl.message("list.aggregate.cellName", { group: "1000 Cash", measure: "Records", value: "2" }), "1000 Cash, Records 2");
});

test("Arabic uses its own list punctuation and turns the path arrow", () => {
  const intl = runtime("ar");
  assert.equal(listText(intl, ["أ", "ب", "ج"]), "أ، ب، ج");
  assert.equal(pathText(intl, ["أ", "ب"]), "أ ‹ ب");
  assert.equal(intl.message("list.matrix.cellName", { row: "أ", column: "ب", value: "ج" }), "أ، ب، ج");
});

test("without a runtime, the English form is returned", () => {
  assert.equal(listText(undefined, ["a", "", "b"]), "a, b");
  assert.equal(separatedText(undefined, ["a", null, "b"]), "a · b");
  assert.equal(nameText(undefined, "A", undefined), "A");
});
