import assert from "node:assert/strict";
import test from "node:test";
import {
  comparisonBestColumns,
  comparisonLineBestColumns,
  comparisonLineOutcome,
  comparisonLineRelativeToBaseline,
  comparisonRelativeToBaseline,
  comparisonRowOutcome,
  equalComparisonValues,
  formatComparisonValue,
  groupComparisonFields,
  type ComparisonCell,
} from "../../packages/platform/entity/runtime/comparison/src/index";
import { createEffectiveLocalization, createIntlRuntime } from "../../packages/platform/foundation/i18n/src/index";

// The shared comparison core's rules (Entity list Compare blueprint, section 8).

const v = (value: unknown): ComparisonCell => ({ state: "value", value: value as never, display: String(value) });
const empty: ComparisonCell = { state: "empty" };
const masked: ComparisonCell = { state: "masked", display: "••••" };
const gone: ComparisonCell = { state: "unavailable", reason: "record_unavailable" };

test("equality by value kind is exact and never reads labels", () => {
  assert.equal(equalComparisonValues("string", "Steel", "steel"), false);
  assert.equal(equalComparisonValues("string", "Steel ", "Steel"), false);
  assert.equal(equalComparisonValues("decimal", "1.50", "1.5"), true);
  assert.equal(equalComparisonValues("decimal", "12345678901234567890.1234", "12345678901234567890.1235"), false);
  assert.equal(equalComparisonValues("integer", 7, "7"), true);
  assert.equal(equalComparisonValues("datetime", "2026-10-09T00:00:00Z", "2026-10-09T08:00:00+08:00"), true);
  assert.equal(equalComparisonValues("date", "2026-10-09", "2026-10-10"), false);
  // Two references with the same label are different records.
  assert.equal(equalComparisonValues("reference", "id-1", "id-2"), false);
  assert.equal(equalComparisonValues("json", { a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
});

test("row outcomes: empty is comparable, masked and unavailable are not", () => {
  assert.equal(comparisonRowOutcome("string", [v("A"), v("A"), v("A")]), "same");
  assert.equal(comparisonRowOutcome("string", [v("A"), v("B")]), "differs");
  assert.equal(comparisonRowOutcome("string", [empty, empty]), "same");
  assert.equal(comparisonRowOutcome("string", [empty, v("A")]), "differs");
  assert.equal(comparisonRowOutcome("string", [masked, masked]), "not_comparable");
  assert.equal(comparisonRowOutcome("string", [v("A"), gone]), "not_comparable");
});

test("a whole unavailable record leaves row outcomes; masked and not-captured cells still do not compare (decision 11)", () => {
  assert.equal(comparisonRowOutcome("string", [v("A"), gone, v("A")]), "same");
  assert.equal(comparisonRowOutcome("string", [v("A"), gone, v("B")]), "differs");
  assert.equal(comparisonRowOutcome("string", [v("A"), gone, masked]), "not_comparable");
  // Fewer than two available records cannot be compared.
  assert.equal(comparisonRowOutcome("string", [v("A"), gone]), "not_comparable");
  assert.equal(comparisonRowOutcome("money", [v("100"), gone, v("100.00")], { currencies: [v("USD"), gone, v("USD")] }), "same");
  // Snapshot-shaped rows never hold record_unavailable: a not-captured cell
  // keeps the row not comparable, so C1's snapshot behaviour is unchanged.
  const notCaptured: ComparisonCell = { state: "unavailable", reason: "not_captured" };
  assert.equal(comparisonRowOutcome("string", [notCaptured, v("Asia")]), "not_comparable");
  assert.equal(comparisonRowOutcome("string", [v("Asia"), notCaptured]), "not_comparable");
});

test("money compares only with an equal, readable, unmasked currency in every cell", () => {
  const usd = v("USD"), myr = v("MYR");
  assert.equal(comparisonRowOutcome("money", [v("100.00"), v("100")], { currencies: [usd, usd] }), "same");
  assert.equal(comparisonRowOutcome("money", [v("100.00"), v("100")], { currencies: [usd, myr] }), "differs");
  assert.equal(comparisonRowOutcome("money", [v("100"), v("120")], { currencies: [usd, usd] }), "differs");
  // No currency field, a masked currency, or a currency not recorded: not compared.
  assert.equal(comparisonRowOutcome("money", [v("100"), v("100")], { currencies: undefined }), "not_comparable");
  assert.equal(comparisonRowOutcome("money", [v("100"), v("100")]), "not_comparable");
  assert.equal(comparisonRowOutcome("money", [v("100"), v("100")], { currencies: [masked, masked] }), "not_comparable");
  assert.equal(comparisonRowOutcome("money", [v("100"), v("100")], { currencies: [usd, empty] }), "not_comparable");
});

test("the baseline marks columns relative to it and leaves the row outcome alone", () => {
  const cells = [v("KG"), v("KG"), v("EA"), masked];
  assert.equal(comparisonRowOutcome("string", cells), "not_comparable");
  assert.deepEqual(comparisonRelativeToBaseline("string", cells, 1), ["same", "same", "differs", "not_comparable"]);
  const amounts = [v("10"), v("10"), v("10")];
  assert.deepEqual(comparisonRelativeToBaseline("money", amounts, 0, { currencies: [v("USD"), v("MYR"), masked] }), ["same", "differs", "not_comparable"]);
});

test("formatting takes the consumer's wording for empty and unavailable cells", () => {
  const intl = createIntlRuntime({ localization: createEffectiveLocalization({ uiLocale: "en", formatLocale: "en-US" }), messages: { "activity.yes": "Yes" } });
  const labels = { empty: "Not set", unavailable: "Not available" };
  assert.equal(formatComparisonValue({ state: "empty" }, undefined, intl, labels), "Not set");
  assert.equal(formatComparisonValue({ state: "value", value: "" }, undefined, intl, labels), "Not set");
  assert.equal(formatComparisonValue({ state: "unavailable", reason: "record_unavailable" }, undefined, intl, labels), "Not available");
  assert.equal(formatComparisonValue({ state: "value", value: true }, { kind: "boolean" } as never, intl, labels), "Yes");
  assert.equal(formatComparisonValue({ state: "value", value: "12345678901234567890.1234" }, { kind: "decimal" } as never, intl, labels), "12,345,678,901,234,567,890.1234");
});

test("grouping is generic over any keyed row", () => {
  const groups = groupComparisonFields([{ key: "a", n: 1 }, { key: "z", n: 2 }], { fields: [], presentation: { sections: [{ key: "s", label: "S", fields: ["a"] }] } } as never);
  assert.deepEqual(groups.map((group) => [group.key, group.fields.map((row) => row.n)]), [["section:s", [1]], ["additional", [2]]]);
});

test("best value (C3): direction, ties, empty cells, unavailable columns, all equal and mixed currencies", () => {
  const usd = v("USD"), myr = v("MYR");
  assert.deepEqual(comparisonBestColumns("money", [v("1248500.00"), v("1192300.00"), v("1271900")], "lower", { currencies: [myr, myr, myr] }), { best: [1], mixedCurrencies: false });
  assert.deepEqual(comparisonBestColumns("money", [v("10"), v("12")], "lower", { currencies: [myr, usd] }), { best: [], mixedCurrencies: true });
  assert.deepEqual(comparisonBestColumns("money", [v("10"), v("12")], "lower", { currencies: [masked, masked] }), { best: [], mixedCurrencies: false });
  assert.deepEqual(comparisonBestColumns("date", [v("2026-11-30"), v("2026-11-15"), v("2026-11-30")], "higher").best, [0, 2]);
  assert.deepEqual(comparisonBestColumns("integer", [v(21), empty, v(28)], "lower").best, [0]);
  assert.deepEqual(comparisonBestColumns("integer", [v(21), gone, v(28)], "lower").best, [0]);
  assert.deepEqual(comparisonBestColumns("integer", [v(14), v(14)], "lower").best, []);
  assert.deepEqual(comparisonBestColumns("integer", [v(14), empty], "lower").best, []);
  assert.deepEqual(comparisonBestColumns("decimal", [v("2.50"), masked, v("1.5")], "higher").best, []);
  assert.deepEqual(comparisonBestColumns("datetime", [v("2026-10-02T09:14:00Z"), v("2026-10-01T11:05:00Z")], "lower").best, [1]);
});

test("C4 line outcomes: absent lines differ, both-absent is the same, baseline marks and best over present lines", () => {
  const absent = { state: "absent" as const };
  assert.equal(comparisonLineOutcome("decimal", [v("4.85"), absent, v("4.85")]), "differs");
  assert.equal(comparisonLineOutcome("decimal", [absent, absent]), "same");
  assert.equal(comparisonLineOutcome("decimal", [v("4.85"), v("4.850")]), "same");
  assert.equal(comparisonLineOutcome("decimal", [v("4.85"), gone, absent]), "differs"); // the unavailable record is left out (decision 11)
  assert.equal(comparisonLineOutcome("decimal", [v("4.85"), gone]), "not_comparable");
  assert.deepEqual(comparisonLineRelativeToBaseline("decimal", [absent, v("1"), absent, gone], 0), ["same", "not_in_baseline", "same", "not_comparable"]);
  assert.deepEqual(comparisonLineRelativeToBaseline("decimal", [v("1"), absent, v("2")], 0), ["same", "differs", "differs"]);
  assert.deepEqual(comparisonLineBestColumns("decimal", [v("5.40"), absent, v("4.85"), v("4.85")], "lower").best, [2, 3]);
});
