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

test("a reference group heading never shows the raw identifier", async () => {
  const base = await referenceList();
  const descriptor = { ...base, fields: [...base.fields, { key: "owner", label: "Owner", valueKind: "reference", defaultVisible: true, defaultOrder: 99, filterOperators: ["eq"], sortable: false, groupable: true, aggregations: [] }] } as typeof base;
  const id = "7f3c2e1d-4b5a-4c6d-8e9f-000000000001";
  const other = "7f3c2e1d-4b5a-4c6d-8e9f-000000000002";
  const result: EntityListResultV1 = {
    ...page([]),
    rows: [
      { id: "1", values: { owner: id }, displayValues: { owner: "Acme Holdings" } },
      { id: "2", values: { owner: other } },
    ],
  };
  const output = groupedRows(result, "owner", descriptor, intl("en"));
  // The resolved label wins; an unresolved reference shows a neutral placeholder.
  assert.deepEqual(output.map(group => group.label), ["Acme Holdings", intl("en").message("entity.value.referenceUnavailable")]);
  // A server bucket for a reference carries the server's authorized label.
  const counted = groupedRows({ ...result, groups: [{ value: other, label: "Beta Ltd", count: 4 }] }, "owner", descriptor, intl("en"));
  assert.equal(counted[0]!.label, "Beta Ltd");
  assert.equal(JSON.stringify(output.concat(counted).map(group => group.label)).includes("7f3c2e1d"), false);
});
