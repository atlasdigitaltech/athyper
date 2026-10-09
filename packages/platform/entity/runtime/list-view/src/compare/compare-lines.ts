import { entityListScopeQuery } from "@athyper/platform-api-client";
import type {
  EntityListRowV1,
  JsonValue,
  ListCompareCollectionV1,
  ListCompareFieldV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import {
  comparisonLineBestColumns,
  comparisonLineOutcome,
  comparisonLineRelativeToBaseline,
  type ComparisonCell,
  type ComparisonLineCell,
  type ComparisonLineMark,
  type ComparisonOutcome,
} from "@athyper/platform-entity-comparison";
import type { IntlRuntime } from "@athyper/platform-i18n";
import { formatFieldValue } from "../field-format";

// C4 line items (Entity list Compare blueprint 5.8 and 10a): request shapes
// and the row model. Master-list mode pages by the master Entity; small mode
// reads every line of each compared record. Absence is claimed only from a
// complete read with no line filter and line access following the parent's.

/** Master rows per page (5.8 point 2). */
export const COMPARE_MASTER_PAGE = 50;
/** Lines one small-mode record may hold (5.8 point 1: five pages of 100). */
export const COMPARE_SMALL_MAX_LINES = 500;
/** Lines read per request: the list's page limit. */
export const COMPARE_LINE_PAGE = 100;

type Query = Readonly<Record<string, unknown>>;

/** The line fields a line request names: the match key, the compared
 * fields, and each field's currency and unit field. */
export function lineRequestFields(collection: ListCompareCollectionV1): readonly string[] {
  const fields = new Set<string>(collection.matchKey.map((field) => field.key));
  for (const field of collection.fields) {
    fields.add(field.key);
    if (field.currencyField) fields.add(field.currencyField);
    if (field.unitField) fields.add(field.unitField);
  }
  return [...fields];
}

/** One compared record's lines: under that record's parent scope, with only
 * the match-key filter (master-list mode) and no other filter, ever. */
export function lineQuery(
  collection: ListCompareCollectionV1,
  parentEntityCode: string,
  recordId: string,
  masterIds?: readonly string[],
  cursor?: string,
): Query {
  return Object.freeze({
    limit: COMPARE_LINE_PAGE,
    ...(cursor ? { cursor } : {}),
    fields: lineRequestFields(collection),
    ...(masterIds ? { filter: [JSON.stringify({ field: collection.matchKey[0]!.key, operator: "in", value: [...masterIds] })] } : {}),
    countMode: "none",
    ...entityListScopeQuery({
      parentEntityCode,
      parentRecordId: recordId,
      relationshipKey: collection.relationshipKey,
      parentDescriptorHash: collection.parentDescriptorHash,
    }),
  });
}

/** A count of one record's lines (coverage, 5.8 point 6). */
export function lineCountQuery(collection: ListCompareCollectionV1, parentEntityCode: string, recordId: string): Query {
  return Object.freeze({
    limit: 1,
    fields: [collection.matchKey[0]!.key],
    countMode: "exact",
    ...entityListScopeQuery({ parentEntityCode, parentRecordId: recordId, relationshipKey: collection.relationshipKey, parentDescriptorHash: collection.parentDescriptorHash }),
  });
}

export interface MasterNarrowing {
  readonly search?: string;
  readonly filters?: Readonly<Record<string, string>>;
  /** Pinned master rows shown alone. */
  readonly pinned?: readonly string[];
}

/** A page of the master list under the common parent, narrowed by its own
 * search, filters and pins (5.8 point 4). */
export function masterQuery(
  collection: ListCompareCollectionV1,
  parentId: string,
  narrowing: MasterNarrowing,
  cursor?: string,
  count = false,
): Query {
  const master = collection.master!;
  const filters: string[] = [JSON.stringify({ field: master.parentField, operator: "eq", value: parentId })];
  for (const [field, value] of Object.entries(narrowing.filters ?? {}))
    if (value !== "" && master.filters.some((filter) => filter.key === field)) filters.push(JSON.stringify({ field, operator: "eq", value }));
  const search = narrowing.search?.trim();
  return Object.freeze({
    limit: count ? 1 : COMPARE_MASTER_PAGE,
    ...(cursor ? { cursor } : {}),
    fields: [master.identityField, ...(master.titleField ? [master.titleField] : [])],
    filter: filters,
    sort: [`${master.identityField}:asc`],
    // Pinned rows are routing identities: the list's own recordIds (≤ 100).
    ...(narrowing.pinned?.length ? { recordIds: [...narrowing.pinned] } : {}),
    ...(search && master.searchable && !count ? { search } : {}),
    countMode: count || master.exactCounts ? "exact" : "none",
  });
}

export interface MasterRow {
  readonly id: string;
  readonly label: string;
}

export type LineReadIssue =
  | { readonly kind: "incomplete"; readonly record: string }
  | { readonly kind: "duplicate"; readonly record: string; readonly label: string }
  | { readonly kind: "too_many"; readonly record: string };

export interface LineRowModel {
  readonly key: string;
  readonly label: string;
  readonly field: ListCompareFieldV1;
  readonly masterId?: string;
  readonly cells: readonly ComparisonLineCell[];
  readonly displays: readonly string[];
  readonly outcome: ComparisonOutcome;
  readonly relative?: readonly ComparisonLineMark[];
  readonly best: readonly number[];
  readonly unitsDiffer: readonly boolean[];
  readonly mixedCurrencies?: boolean;
  /** Absence is not claimed for this collection (line access is independent). */
  readonly absenceUnknown: boolean;
}

const tupleKey = (row: EntityListRowV1, keys: readonly string[]) => JSON.stringify(keys.map((key) => row.values[key] ?? null));
const empty = (value: JsonValue | undefined) => value === undefined || value === null || value === "";

/** Checks one record's line read: complete, at most one line per key. */
export function checkLineRead(
  collection: ListCompareCollectionV1,
  record: string,
  rows: readonly EntityListRowV1[],
  hasNext: boolean,
): LineReadIssue | undefined {
  if (hasNext) return collection.master ? { kind: "incomplete", record } : { kind: "too_many", record };
  const seen = new Set<string>();
  for (const row of rows) {
    const key = tupleKey(row, collection.matchKey.map((field) => field.key));
    if (seen.has(key)) return { kind: "duplicate", record, label: lineLabel(collection, row) };
    seen.add(key);
  }
  return undefined;
}

function lineLabel(collection: ListCompareCollectionV1, row: EntityListRowV1): string {
  return collection.matchKey
    .map((field) => row.displayValues?.[field.key] ?? (field.valueKind === "reference" ? "" : String(row.values[field.key] ?? "")))
    .filter(Boolean)
    .join(" · ");
}

/** Builds the line rows of one loaded page, in master order (master-list
 * mode) or label order (small mode). `lines` holds each available record's
 * rows; a missing entry means the record is unavailable. */
export function buildLineRows(input: {
  readonly collection: ListCompareCollectionV1;
  readonly records: readonly string[];
  readonly lines: ReadonlyMap<string, readonly EntityListRowV1[]>;
  readonly masterRows?: readonly MasterRow[];
  readonly baseline: number;
  readonly intl?: IntlRuntime;
}): readonly LineRowModel[] {
  const { collection, records, lines } = input;
  const keys = collection.matchKey.map((field) => field.key);
  const byRecord = records.map((id) => {
    const rows = lines.get(id);
    return rows ? new Map(rows.map((row) => [tupleKey(row, keys), row])) : undefined;
  });
  const labels = new Map<string, string>();
  const tuples: string[] = [];
  const addTuple = (tuple: string, label: string) => {
    if (labels.has(tuple)) return;
    labels.set(tuple, label);
    tuples.push(tuple);
  };
  if (input.masterRows) {
    for (const master of input.masterRows) {
      const own = byRecord.flatMap((map) => (map ? [...map.entries()] : [])).filter(([, row]) => String(row.values[keys[0]!]) === master.id);
      const seconds = [...new Map(own.map(([tuple, row]) => [tuple, row])).entries()].sort(([, a], [, b]) => lineLabel(collection, a).localeCompare(lineLabel(collection, b), undefined, { numeric: true }));
      if (!seconds.length) addTuple(JSON.stringify([master.id, ...keys.slice(1).map(() => null)]), master.label);
      for (const [tuple, row] of seconds) {
        const second = keys.length > 1 ? row.displayValues?.[keys[1]!] ?? "" : "";
        addTuple(tuple, second ? `${master.label} · ${second}` : master.label);
      }
    }
  } else {
    const all = byRecord.flatMap((map) => (map ? [...map.entries()] : []));
    for (const [tuple, row] of all.sort(([, a], [, b]) => lineLabel(collection, a).localeCompare(lineLabel(collection, b), undefined, { numeric: true })))
      addTuple(tuple, lineLabel(collection, row));
  }
  const absenceUnknown = collection.accessIndependent === true;
  const rows: LineRowModel[] = [];
  for (const tuple of tuples) {
    const masterId = input.masterRows ? String(JSON.parse(tuple)[0]) : undefined;
    for (const field of collection.fields) {
      const listField = { key: field.key, label: field.label, valueKind: field.valueKind, ...(field.options ? { filterOptions: field.options } : {}) } as unknown as ListFieldDescriptorV1;
      const cells: ComparisonLineCell[] = [];
      const displays: string[] = [];
      const units: (string | undefined)[] = [];
      const currencies: ComparisonCell[] = [];
      byRecord.forEach((map) => {
        if (!map) {
          cells.push({ state: "unavailable", reason: "record_unavailable" });
          displays.push("");
          units.push(undefined);
          currencies.push({ state: "unavailable", reason: "record_unavailable" });
          return;
        }
        const row = map.get(tuple);
        if (!row) {
          // Independent line access: a hidden line could exist, so absence is not claimed.
          cells.push(absenceUnknown ? { state: "unavailable", reason: "not_captured" } : { state: "absent" });
          displays.push("");
          units.push(undefined);
          currencies.push({ state: "empty" });
          return;
        }
        const value = row.values[field.key];
        units.push(field.unitField ? String(row.values[field.unitField] ?? "") : undefined);
        const currency = field.currencyField ? row.values[field.currencyField] : undefined;
        currencies.push(field.currencyMasked ? { state: "masked", display: "" } : empty(currency) ? { state: "empty" } : { state: "value", value: currency as JsonValue, display: String(currency) });
        if (field.masked) {
          cells.push({ state: "masked", display: String(value ?? "") });
          displays.push(String(value ?? ""));
        } else if (empty(value)) {
          cells.push({ state: "empty" });
          displays.push("");
        } else {
          let shown = row.displayValues?.[field.key] ?? formatFieldValue(value, listField, input.intl);
          if (field.valueKind === "money" && typeof currency === "string" && currency) shown = `${currency} ${shown}`;
          if (field.unitField && row.values[field.unitField]) shown = `${shown} / ${String(row.values[field.unitField])}`;
          cells.push({ state: "value", value: value as JsonValue, display: shown });
          displays.push(shown);
        }
      });
      const kind = field.valueKind;
      const money = kind === "money" ? { currencies: field.currencyField ? currencies : undefined } : undefined;
      const rawOutcome = comparisonLineOutcome(kind, cells, money);
      const relative = input.baseline >= 0 ? comparisonLineRelativeToBaseline(kind, cells, input.baseline, money) : undefined;
      // Unit rule (5.8 point 7): the most common unit is the comparison unit.
      const present = units.filter((unit): unit is string => unit !== undefined);
      const counts = new Map<string, number>();
      for (const unit of present) counts.set(unit, (counts.get(unit) ?? 0) + 1);
      const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const unitsDiffer = units.map((unit) => Boolean(field.unitField && unit !== undefined && counts.size > 1 && unit !== common));
      // Without an evaluation amount, values in different units cannot be compared (5 EA is not 5 BOX).
      const outcome: ComparisonOutcome = counts.size > 1 && !field.evaluation && rawOutcome !== "differs" ? "not_comparable" : rawOutcome;
      let best: readonly number[] = [];
      let mixedCurrencies = false;
      if (field.better && !(counts.size > 1 && !field.evaluation)) {
        const ranked = comparisonLineBestColumns(kind, cells, field.better, money);
        best = ranked.best.filter((index) => !unitsDiffer[index]);
        mixedCurrencies = ranked.mixedCurrencies;
      }
      rows.push({
        key: `${tuple}:${field.key}`,
        label: collection.fields.length > 1 ? `${labels.get(tuple)} · ${field.label}` : labels.get(tuple)!,
        field,
        ...(masterId ? { masterId } : {}),
        cells,
        displays,
        outcome,
        ...(relative ? { relative } : {}),
        best,
        unitsDiffer,
        ...(mixedCurrencies ? { mixedCurrencies: true } : {}),
        absenceUnknown,
      });
    }
  }
  return rows;
}
