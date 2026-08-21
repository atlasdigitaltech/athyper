/**
 * Snapshot Diff Service — pure JSON diff between two document snapshots.
 *
 * Used by POST /api/runtime/v1/entities/:entity/:id/snapshots/compare to
 * produce a structured diff payload for the Versions tab's Compare drawer.
 *
 * Section-oriented output: header + per-collection (lines / components /
 * distributions / schedules). Each section reports added / removed /
 * changed rows; "changed" rows carry the field-level deltas only.
 *
 * Equality is JSON-canonical (sorted keys, primitives compared by value).
 * Nested JSON differences surface as a whole-field "before / after" pair —
 * the UI is free to drill into them, this service doesn't try to compute
 * sub-tree diffs.
 *
 * Pure functions only; no DB access. The route loads both snapshot rows
 * and hands their .*_json payloads to computeSnapshotDiff().
 */

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface FieldDelta {
  /** Column / property name. */
  field: string;
  /** Value on the left side; missing means added on the right. */
  left:  unknown;
  /** Value on the right side; missing means removed (only on left). */
  right: unknown;
}

export interface RowAddRemove {
  /** Stable identifier for the row — line_no / sequence / distribution_no
   *  / schedule_no. Falls back to row id when present. */
  identifier: string;
  /** Row id when available (UUID). Useful for the UI to deep-link. */
  row_id: string | null;
  /** Full row payload (added/removed rows render whole). */
  row: Record<string, unknown>;
}

export interface RowChange {
  identifier: string;
  row_id: string | null;
  fields: FieldDelta[];
}

export type SnapshotDiffSection =
  | "header"
  | "lines"
  | "components"
  | "distributions"
  | "schedules";

export interface SectionDiff {
  section: SnapshotDiffSection;
  added:   RowAddRemove[];
  removed: RowAddRemove[];
  changed: RowChange[];
  /** Convenience flag — true when added + removed + changed are all empty. */
  identical: boolean;
}

export interface SnapshotDiffInput {
  left:  SnapshotPayload;
  right: SnapshotPayload;
}

export interface SnapshotPayload {
  header_json:        Record<string, unknown>;
  lines_json:         Record<string, unknown>[] | null;
  components_json:    Record<string, unknown>[] | null;
  distributions_json: Record<string, unknown>[] | null;
  schedules_json:     Record<string, unknown>[] | null;
}

export interface SnapshotDiffResult {
  sections: SectionDiff[];
  /** Convenience — total fields/rows that differ across all sections. */
  total_differences: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Audit columns excluded from diffs — they change on every write and would
// drown the actual semantic deltas. created_at/created_by are also excluded
// since snapshots immortalise their own creation timestamps; the wrapped row
// audit fields are noise inside a diff.
// ──────────────────────────────────────────────────────────────────────────────

const HEADER_SKIP_FIELDS = new Set([
  "tenant_id",
  "updated_at", "updated_by",
  "row_version",
  "data",
]);

const COLLECTION_SKIP_FIELDS = new Set([
  "tenant_id",
  "created_at", "created_by",
  "updated_at", "updated_by",
  "row_version",
  "data",
]);

// ──────────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────────

export function computeSnapshotDiff(input: SnapshotDiffInput): SnapshotDiffResult {
  const sections: SectionDiff[] = [
    diffHeader(input.left.header_json, input.right.header_json),
    diffCollection("lines",         input.left.lines_json,         input.right.lines_json,         "line_no"),
    diffCollection("components",    input.left.components_json,    input.right.components_json,    "sequence"),
    diffCollection("distributions", input.left.distributions_json, input.right.distributions_json, "distribution_no"),
    diffCollection("schedules",     input.left.schedules_json,     input.right.schedules_json,     "schedule_no"),
  ];

  const total_differences = sections.reduce(
    (acc, s) => acc + s.added.length + s.removed.length + s.changed.length,
    0,
  );

  return { sections, total_differences };
}

// ──────────────────────────────────────────────────────────────────────────────
// Header diff — object-to-object field comparison
// ──────────────────────────────────────────────────────────────────────────────

function diffHeader(
  left:  Record<string, unknown>,
  right: Record<string, unknown>,
): SectionDiff {
  const allKeys = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ]);
  const changed: RowChange = { identifier: "header", row_id: null, fields: [] };

  for (const key of allKeys) {
    if (HEADER_SKIP_FIELDS.has(key)) continue;
    const lv = left[key];
    const rv = right[key];
    if (!valuesEqual(lv, rv)) {
      changed.fields.push({ field: key, left: lv, right: rv });
    }
  }
  changed.fields.sort((a, b) => a.field.localeCompare(b.field));

  return {
    section:   "header",
    added:     [],
    removed:   [],
    changed:   changed.fields.length > 0 ? [changed] : [],
    identical: changed.fields.length === 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Collection diff — row-keyed with field-level delta per matched row
// ──────────────────────────────────────────────────────────────────────────────

function diffCollection(
  section:     SnapshotDiffSection,
  left:        Record<string, unknown>[] | null,
  right:       Record<string, unknown>[] | null,
  primaryKey:  string,
): SectionDiff {
  const leftRows  = left  ?? [];
  const rightRows = right ?? [];

  // Key by row id when present (UUID — globally stable across snapshots).
  // Fall back to the primaryKey field (line_no / sequence / etc.) which is
  // stable within a parent record. If a row has neither, it's emitted under
  // a synthetic position key so it still surfaces somewhere — better than
  // silently dropping.
  function rowKey(row: Record<string, unknown>, index: number): string {
    if (typeof row["id"] === "string" && row["id"].length > 0) return `id:${row["id"]}`;
    const pk = row[primaryKey];
    if (pk != null) return `${primaryKey}:${String(pk)}`;
    return `pos:${index}`;
  }

  const leftMap  = new Map<string, Record<string, unknown>>();
  const rightMap = new Map<string, Record<string, unknown>>();
  leftRows.forEach((row, i)  => leftMap.set(rowKey(row, i),  row));
  rightRows.forEach((row, i) => rightMap.set(rowKey(row, i), row));

  const added:   RowAddRemove[] = [];
  const removed: RowAddRemove[] = [];
  const changed: RowChange[]    = [];

  // Added — present in right, missing from left
  for (const [key, row] of rightMap) {
    if (!leftMap.has(key)) {
      added.push(toAddRemove(row, primaryKey));
    }
  }
  // Removed — present in left, missing from right
  for (const [key, row] of leftMap) {
    if (!rightMap.has(key)) {
      removed.push(toAddRemove(row, primaryKey));
    }
  }
  // Changed — present in both, with at least one differing field
  for (const [key, leftRow] of leftMap) {
    const rightRow = rightMap.get(key);
    if (!rightRow) continue;
    const fields = diffRowFields(leftRow, rightRow);
    if (fields.length > 0) {
      changed.push({
        identifier: identifierFor(leftRow, primaryKey),
        row_id:     typeof leftRow["id"] === "string" ? leftRow["id"] : null,
        fields,
      });
    }
  }

  // Sort each bucket by identifier for predictable rendering. Numeric
  // identifiers (line_no=1,2,10) sort lexicographically as "1","10","2"
  // unless we cast — comparator does the right thing for both numbers and
  // strings.
  added.sort((a, b)   => smartCompare(a.identifier, b.identifier));
  removed.sort((a, b) => smartCompare(a.identifier, b.identifier));
  changed.sort((a, b) => smartCompare(a.identifier, b.identifier));

  return {
    section,
    added,
    removed,
    changed,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

function toAddRemove(
  row:        Record<string, unknown>,
  primaryKey: string,
): RowAddRemove {
  return {
    identifier: identifierFor(row, primaryKey),
    row_id:     typeof row["id"] === "string" ? row["id"] : null,
    row,
  };
}

function identifierFor(row: Record<string, unknown>, primaryKey: string): string {
  const pk = row[primaryKey];
  if (pk != null) return String(pk);
  if (typeof row["id"] === "string") return row["id"].slice(0, 8);
  return "?";
}

function diffRowFields(
  left:  Record<string, unknown>,
  right: Record<string, unknown>,
): FieldDelta[] {
  const allKeys = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ]);
  const out: FieldDelta[] = [];
  for (const key of allKeys) {
    if (COLLECTION_SKIP_FIELDS.has(key)) continue;
    const lv = left[key];
    const rv = right[key];
    if (!valuesEqual(lv, rv)) {
      out.push({ field: key, left: lv, right: rv });
    }
  }
  out.sort((a, b) => a.field.localeCompare(b.field));
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Equality — canonical JSON comparison
// Primitive equality by value; objects and arrays compared by sorted-key JSON
// string. Good enough for snapshot-vs-snapshot diffs where both payloads come
// out of the same serializer.
// ──────────────────────────────────────────────────────────────────────────────

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    return canonicalJson(a) === canonicalJson(b);
  }
  return false;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, stableReplacer);
}

function stableReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) out[key] = obj[key];
    return out;
  }
  return value;
}

function smartCompare(a: string, b: string): number {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) {
    return an - bn;
  }
  return a.localeCompare(b);
}
