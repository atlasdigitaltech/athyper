import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  JsonValue,
  ListCompareFieldV1,
  ListCompareLocationV1,
  ListCompareV1,
  ListFieldDescriptorV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  comparisonBestColumns,
  comparisonRelativeToBaseline,
  comparisonRowOutcome,
  differingWords,
  type ComparisonCell,
  type ComparisonOutcome,
  type ComparisonWordSegment,
} from "@athyper/platform-entity-comparison";
import type { IntlRuntime } from "@athyper/platform-i18n";
import { formatFieldValue } from "../field-format";

// Record comparison model (Entity list Compare blueprint sections 7 and 8):
// one standalone request, then cells, outcomes, baseline marks, the
// same-label marker and differing words, all from values already loaded.

/** The title field the list publishes (its `title` role), if readable. */
export function compareTitleField(descriptor: EntityListDescriptorV1): string | undefined {
  return descriptor.fields.find((field) => field.semanticRole === "title" && field.key !== descriptor.entity.identityField)?.key;
}

/** Fields the Compare request names: the identity, the title, the compared
 * fields and each money field's currency field (section 7.1). */
export function compareRequestFields(descriptor: EntityListDescriptorV1, compare: ListCompareV1): readonly string[] {
  const fields = new Set<string>([descriptor.entity.identityField]);
  const title = compareTitleField(descriptor);
  if (title) fields.add(title);
  for (const section of compare.sections)
    for (const field of section.fields) {
      fields.add(field.key);
      if (field.currencyField) fields.add(field.currencyField);
    }
  // C4: the compared records' reference to the master list's common parent.
  for (const collection of compare.collections ?? []) if (collection.master && !collection.unavailable) fields.add(collection.master.recordParentField);
  return Object.freeze([...fields]);
}

/** The standalone Compare request (section 7.1): record IDs and fields only.
 * No cursor, hierarchy, group, search, filters, sort or standard view; the
 * caller sends the list's own locked scope and work context. */
export function compareQueryState(
  descriptor: EntityListDescriptorV1,
  compare: ListCompareV1,
  location: ListCompareLocationV1,
): Pick<ListLocationStateV1, "filters" | "sort" | "columns" | "pageSize"> & { readonly recordIds: readonly string[] } {
  return Object.freeze({
    filters: Object.freeze([]),
    sort: Object.freeze([]),
    columns: compareRequestFields(descriptor, compare),
    pageSize: location.records.length,
    recordIds: location.records,
  });
}

export interface CompareColumnModel {
  readonly id: string;
  readonly code?: string;
  readonly title?: string;
  readonly unavailable: boolean;
  readonly baseline: boolean;
  readonly statusValue?: JsonValue;
  /** Rows differing from the baseline; only with a baseline, for non-baseline columns. */
  readonly differFromBaseline?: number;
}

export interface CompareRowModel {
  readonly key: string;
  readonly label: string;
  readonly field: ListCompareFieldV1;
  readonly cells: readonly ComparisonCell[];
  readonly outcome: ComparisonOutcome;
  /** Why the row is not compared, when it is a money currency reason. */
  readonly currencyNotCompared?: boolean;
  readonly relative?: readonly ComparisonOutcome[];
  /** Cells showing the same label as another column for a different record (section 8.6). */
  readonly differentRecord: readonly boolean[];
  /** Differing words against the baseline, per column (section 8.7). */
  readonly words: readonly (readonly ComparisonWordSegment[] | undefined)[];
  /** C3: columns holding the best value (section 8.5). */
  readonly best: readonly number[];
  /** C3: a money row with more than one currency ranks nothing. */
  readonly mixedCurrencies?: boolean;
}

/** C3 summary chip (section 5.6): one per field with a summary label and a best value. */
export interface CompareSummaryModel {
  readonly label: string;
  readonly columns: readonly number[];
  readonly display: string;
}

export interface CompareSectionModel {
  readonly key: string;
  readonly label: string;
  readonly collapsed: boolean;
  readonly rows: readonly CompareRowModel[];
  readonly differs: number;
  readonly notCompared: number;
}

export interface CompareModel {
  readonly columns: readonly CompareColumnModel[];
  /** At most six, in declaration order (section 5.6). */
  readonly summaries: readonly CompareSummaryModel[];
  readonly sections: readonly CompareSectionModel[];
  readonly fields: number;
  readonly differs: number;
  readonly notCompared: number;
  readonly available: number;
}

const empty = (value: JsonValue | undefined) => value === undefined || value === null || value === "";

/** Builds the comparison from the response rows, in the URL's column order. */
export function buildCompareModel(input: {
  readonly descriptor: EntityListDescriptorV1;
  readonly compare: ListCompareV1;
  readonly location: ListCompareLocationV1;
  readonly rows: readonly EntityListRowV1[];
  readonly intl?: IntlRuntime;
}): CompareModel {
  const { descriptor, compare, location } = input;
  const byId = new Map(input.rows.map((row) => [row.id, row]));
  const listed = new Map(descriptor.fields.map((field) => [field.key, field]));
  const title = compareTitleField(descriptor);
  const records = location.records.map((id) => byId.get(id));
  const baseline = location.baseline ? location.records.indexOf(location.baseline) : -1;
  const display = (row: EntityListRowV1, key: string, field: ListFieldDescriptorV1 | undefined) =>
    row.displayValues?.[key] ?? formatFieldValue(row.values[key], field, input.intl);
  const cellOf = (row: EntityListRowV1 | undefined, field: ListCompareFieldV1): ComparisonCell => {
    if (!row) return { state: "unavailable", reason: "record_unavailable" };
    const value = row.values[field.key];
    const listField = listed.get(field.key);
    if (field.masked) return { state: "masked", display: empty(value) ? "" : display(row, field.key, listField) };
    if (empty(value)) return { state: "empty" };
    let shown = display(row, field.key, listField);
    if (field.valueKind === "money" && field.currencyField && !field.currencyMasked) {
      const currency = row.values[field.currencyField];
      if (typeof currency === "string" && currency) shown = `${currency} ${shown}`;
    }
    return { state: "value", value: value as JsonValue, display: shown };
  };
  const currencyCells = (field: ListCompareFieldV1): readonly ComparisonCell[] | undefined => {
    if (field.valueKind !== "money" || !field.currencyField) return undefined;
    return records.map((row): ComparisonCell => {
      if (!row) return { state: "unavailable", reason: "record_unavailable" };
      if (field.currencyMasked) return { state: "masked", display: "" };
      const value = row.values[field.currencyField!];
      return empty(value) ? { state: "empty" } : { state: "value", value: value as JsonValue, display: String(value) };
    });
  };
  const columns: CompareColumnModel[] = location.records.map((id, index) => {
    const row = records[index];
    const identity = row?.values[descriptor.entity.identityField];
    return {
      id,
      ...(row && !empty(identity) ? { code: display(row, descriptor.entity.identityField, listed.get(descriptor.entity.identityField)) } : {}),
      ...(row && title && !empty(row.values[title]) ? { title: display(row, title, listed.get(title)) } : {}),
      unavailable: !row,
      baseline: index === baseline,
      ...(row && compare.statusField !== undefined && !empty(row.values[compare.statusField]) ? { statusValue: row.values[compare.statusField] as JsonValue } : {}),
    };
  });
  const differFromBaseline = columns.map(() => 0);
  const sections = compare.sections.map((section): CompareSectionModel => {
    const rows = section.fields.map((field): CompareRowModel => {
      const cells = records.map((row) => cellOf(row, field));
      const kind = field.valueKind;
      const currencies = currencyCells(field);
      const money = kind === "money" ? { currencies } : undefined;
      const outcome = comparisonRowOutcome(kind, cells, money);
      const relative = baseline >= 0 ? comparisonRelativeToBaseline(kind, cells, baseline, money) : undefined;
      relative?.forEach((mark, index) => {
        if (index !== baseline && mark === "differs") differFromBaseline[index]!++;
      });
      const ranked = field.better ? comparisonBestColumns(kind, cells, field.better, money) : undefined;
      const currencyNotCompared =
        kind === "money" && outcome === "not_comparable" && cells.filter((cell) => cell.state !== "unavailable" || cell.reason !== "record_unavailable").every((cell) => cell.state === "value" || cell.state === "empty");
      return {
        key: field.key,
        label: field.label,
        field,
        cells,
        outcome,
        ...(currencyNotCompared ? { currencyNotCompared: true } : {}),
        ...(relative ? { relative } : {}),
        differentRecord: sameLabelDifferentRecord(kind, cells, outcome),
        best: ranked?.best ?? [],
        ...(ranked?.mixedCurrencies ? { mixedCurrencies: true } : {}),
        words: cells.map((cell, index) => {
          const base = baseline >= 0 ? cells[baseline] : undefined;
          if (kind !== "text" || index === baseline || relative?.[index] !== "differs" || cell.state !== "value" || base?.state !== "value") return undefined;
          return typeof cell.value === "string" && typeof base.value === "string" ? differingWords(cell.value, base.value) : undefined;
        }),
      };
    });
    return {
      key: section.key,
      label: section.label,
      collapsed: section.collapsed === true,
      rows,
      differs: rows.filter((row) => row.outcome === "differs").length,
      notCompared: rows.filter((row) => row.outcome === "not_comparable").length,
    };
  });
  const summaries = sections
    .flatMap((section) => section.rows)
    .flatMap((row): CompareSummaryModel[] => {
      const first = row.best[0];
      const cell = first === undefined ? undefined : row.cells[first];
      return row.field.summaryLabel && cell?.state === "value" ? [{ label: row.field.summaryLabel, columns: row.best, display: cell.display }] : [];
    })
    .slice(0, 6);
  return {
    summaries,
    columns: columns.map((column, index) => (baseline >= 0 && index !== baseline && !column.unavailable ? { ...column, differFromBaseline: differFromBaseline[index]! } : column)),
    sections,
    fields: sections.reduce((total, section) => total + section.rows.length, 0),
    differs: sections.reduce((total, section) => total + section.differs, 0),
    notCompared: sections.reduce((total, section) => total + section.notCompared, 0),
    available: records.filter(Boolean).length,
  };
}

/** Section 8.6: in a differing reference row, cells whose label is shared by
 * another column holding a different record. Never shows an identifier. */
function sameLabelDifferentRecord(kind: ListCompareFieldV1["valueKind"], cells: readonly ComparisonCell[], outcome: ComparisonOutcome): readonly boolean[] {
  if (kind !== "reference" || outcome !== "differs") return cells.map(() => false);
  const records = new Map<string, Set<string>>();
  for (const cell of cells)
    if (cell.state === "value") records.set(cell.display, (records.get(cell.display) ?? new Set()).add(JSON.stringify(cell.value)));
  return cells.map((cell) => cell.state === "value" && (records.get(cell.display)?.size ?? 0) > 1);
}

/** Keys of differing rows in display order, for previous and next difference. */
export function differenceOrder(model: CompareModel): readonly string[] {
  return model.sections.flatMap((section) => section.rows.filter((row) => row.outcome === "differs").map((row) => `${section.key}:${row.key}`));
}
