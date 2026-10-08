import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityListResultV1 } from "../../packages/contracts/platform/entity-list/src/types";
import { groupedRows } from "../../packages/platform/entity/runtime/list-view/src/grouped-rows";
import { createEffectiveLocalization, createIntlRuntime } from "../../packages/platform/foundation/i18n/src/index";
import { referenceList } from "../../tooling/scripts/verification/localized-reference-fixture";

const intl = (locale: string) => createIntlRuntime({ localization: createEffectiveLocalization({ uiLocale: locale, formatLocale: locale, timeZone: "UTC" }), messages: {} });
const page = (values: readonly (string | null | undefined)[]): EntityListResultV1 => ({
  schemaVersion: 1, descriptorHash: "test", scopeFingerprint: "test", queryHash: "test",
  rows: values.map((value, index) => ({ id: String(index), values: value === undefined ? {} : { created_at: value } })),
  pagination: { pageSize: 20, hasNext: false, hasPrevious: false, countMode: "none" },
});

test("grouping keeps server order, raw identity and authoritative counts despite identical date labels", async () => {
  const descriptor = await referenceList();
  const values = ["2026-09-30T12:00:01Z", "2026-09-30T12:00:02Z", "2026-04-01T12:00:00Z"];
  const result = page(values);
  const groups = values.toReversed().map((value, index) => ({ value, label: "ignored", count: index + 10 }));
  const output = groupedRows({ ...result, groups }, "created_at", descriptor, intl("en"));
  assert.deepEqual(output.map(group => group.rows[0]?.id), ["2", "1", "0"]);
  assert.deepEqual(output.map(group => group.count), [10, 11, 12]);
  assert.equal(output[1]!.label, output[2]!.label);
  assert.notEqual(output[1]!.key, output[2]!.key);
  const localized = groupedRows({ ...result, groups }, "created_at", descriptor, intl("ar"));
  assert.deepEqual(localized.map(group => group.key), output.map(group => group.key));
});

test("grouping keeps missing, null and empty values distinct and preserves row order without server buckets", async () => {
  const descriptor = await referenceList();
  const output = groupedRows(page([undefined, null, "", null]), "created_at", descriptor, intl("en"));
  assert.equal(new Set(output.map(group => group.key)).size, 3);
  assert.deepEqual(output.map(group => group.label), ["—", "—", "—"]);
  // No server buckets (counts not exact): no group count, never a page count.
  assert.deepEqual(output.map(group => group.count), [undefined, undefined, undefined]);
});
