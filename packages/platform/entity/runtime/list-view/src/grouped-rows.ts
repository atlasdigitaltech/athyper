import type { EntityListDescriptorV1, EntityListResultV1, EntityListRowV1 } from "@athyper/contract-platform-entity-list";
import type { IntlRuntime } from "@athyper/platform-i18n";
import { formatFieldValue } from "./field-format";

/** Raw values identify groups; labels never determine identity or ordering. */
export function groupedRows(
  page: EntityListResultV1,
  group: string | undefined,
  descriptor: EntityListDescriptorV1,
  intl: IntlRuntime,
): readonly { key: string; label: string; count: number; rows: readonly EntityListRowV1[] }[] {
  if (!group) return [{ key: "all", label: intl.message("list.group.allRecords"), count: page.rows.length, rows: page.rows }];
  const field = descriptor.fields.find(candidate => candidate.key === group);
  const keyFor = (value: unknown) => JSON.stringify([group, value === undefined ? "missing" : "value", value]);
  const buckets = new Map<string, { key: string; label: string; count?: number; rows: EntityListRowV1[] }>();
  // Map insertion order preserves the server's typed ordering, including direction.
  for (const bucket of page.groups ?? []) {
    const key = keyFor(bucket.value);
    buckets.set(key, { key, label: formatFieldValue(bucket.value, field, intl), count: bucket.count, rows: [] });
  }
  for (const row of page.rows) {
    const value = row.values[group];
    const key = keyFor(value);
    const bucket = buckets.get(key) ?? { key, label: formatFieldValue(value, field, intl), rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].filter(bucket => bucket.rows.length > 0)
    .map(bucket => ({ ...bucket, count: bucket.count ?? bucket.rows.length }));
}
