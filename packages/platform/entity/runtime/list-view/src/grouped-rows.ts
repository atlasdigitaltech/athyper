import type { EntityListDescriptorV1, EntityListResultV1, EntityListRowV1 } from "@athyper/contract-platform-entity-list";
import type { IntlRuntime } from "@athyper/platform-i18n";
import { formatFieldValue } from "./field-format";

/** Raw values identify groups; labels never determine identity or ordering. */
export function groupedRows(
  page: EntityListResultV1,
  group: string | undefined,
  descriptor: EntityListDescriptorV1,
  intl: IntlRuntime,
): readonly { key: string; label: string; count?: number; rows: readonly EntityListRowV1[] }[] {
  if (!group) return [{ key: "all", label: intl.message("list.group.allRecords"), rows: page.rows }];
  const field = descriptor.fields.find(candidate => candidate.key === group);
  const keyFor = (value: unknown) => JSON.stringify([group, value === undefined ? "missing" : "value", value]);
  const buckets = new Map<string, { key: string; label: string; count?: number; rows: EntityListRowV1[] }>();
  // Server buckets (exact counts only) come first in the server's order: the
  // raw stored value, ascending. That order ignores the person's sort direction
  // and published choice order; groups seen only on this page follow in the
  // order their first row appears.
  for (const bucket of page.groups ?? []) {
    const key = keyFor(bucket.value);
    // A reference bucket carries the server's authorized label; never format its raw value.
    const label = field?.valueKind === "reference" ? bucket.label : formatFieldValue(bucket.value, field, intl);
    buckets.set(key, { key, label, count: bucket.count, rows: [] });
  }
  for (const row of page.rows) {
    const value = row.values[group];
    const key = keyFor(value);
    const bucket = buckets.get(key) ?? { key, label: formatFieldValue(value, field, intl), rows: [] };
    // Prefer the server-resolved display value (reference labels), so a heading
    // never shows a raw identifier.
    const display = row.displayValues?.[group];
    if (display) bucket.label = display;
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }
  // A count is the server's full-set count under exact counts, or absent; the
  // rows on this page never stand in for a group total (foundation section 5).
  return [...buckets.values()].filter(bucket => bucket.rows.length > 0);
}
