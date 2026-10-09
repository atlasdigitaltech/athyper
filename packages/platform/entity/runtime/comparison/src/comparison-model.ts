import {
  compareDecimals,
  isExactDecimal,
  type JsonValue,
  type ListValueKind,
} from "@athyper/contract-platform-entity-list";
import type { EntityDetailDescriptorV1 } from "@athyper/contract-platform-entity-runtime";
import type { IntlRuntime } from "@athyper/platform-i18n";
import { formatExactDecimal } from "@athyper/platform-i18n/entity-value";

// The comparison core (Entity list Compare blueprint, sections 5.5, 8 and 11).
// Columns are peers: a row "differs", never "changed". The snapshot view
// adapts its directional before/after onto this model.

export type ComparisonPresentation = Pick<
  EntityDetailDescriptorV1,
  "fields" | "presentation"
>;

/** Root field groups only. Related objects/collections require explicit provider identities;
 * array indexes, display labels and section names must never become record identities. */
export interface ComparisonFieldGroup<Row extends { readonly key: string }> {
  readonly key: string;
  readonly label?: string;
  readonly tabLabel?: string;
  readonly fields: readonly Row[];
}

/** Intersects layout references with the authorized API projection. Never creates a field,
 * placeholder, section count or hidden section name from layout metadata alone. */
export function groupComparisonFields<Row extends { readonly key: string }>(
  fields: readonly Row[],
  metadata?: ComparisonPresentation,
): readonly ComparisonFieldGroup<Row>[] {
  const remaining = new Map(fields.map((field) => [field.key, field]));
  const groups: ComparisonFieldGroup<Row>[] = [];
  const layout = metadata?.presentation;
  const sections = layout?.sections ?? [];
  const tabs = layout?.navigation?.tabs ?? [];
  const ordered = [
    ...tabs.flatMap((tab) =>
      tab.sectionKeys.flatMap(
        (key) => sections.find((s) => s.key === key) ?? [],
      ),
    ),
    ...sections,
  ];
  for (const section of ordered) {
    const members = section.fields.flatMap((key) => {
      const field = remaining.get(key);
      if (!field) return [];
      remaining.delete(key);
      return [field];
    });
    if (members.length)
      groups.push({
        key: `section:${section.key}`,
        label: section.label,
        tabLabel: tabs.find((tab) => tab.sectionKeys.includes(section.key))
          ?.label,
        fields: members,
      });
  }
  // Older captures and fields outside the current layout stay inspectable without a guessed mapping.
  if (remaining.size)
    groups.push({ key: "additional", fields: [...remaining.values()] });
  return groups;
}

/** A cell as it is formatted: a returned value, a value known to be empty, or
 * a value that cannot be shown for a stated reason (section 8.1). */
export type ComparisonInputCell =
  | { readonly state: "value"; readonly value?: unknown }
  | { readonly state: "empty" }
  | { readonly state: "unavailable"; readonly reason: "not_captured" | "record_unavailable" };

/** The consumer's wording for the two states without a value. */
export interface ComparisonStateLabels {
  readonly empty: string;
  readonly unavailable: string;
}

export function formatComparisonValue(
  cell: ComparisonInputCell,
  field: Pick<ComparisonPresentation["fields"][number], "kind" | "options"> | undefined,
  intl: IntlRuntime,
  labels: ComparisonStateLabels,
): string {
  if (cell.state === "unavailable") return labels.unavailable;
  if (cell.state === "empty") return labels.empty;
  const value = cell.value;
  if (value === null || value === undefined || value === "")
    return labels.empty;
  if (typeof value === "boolean")
    return intl.message(value ? "activity.yes" : "activity.no");
  if (field?.options && typeof value === "string")
    return (
      field.options.find((option) => option.value === value)?.label ?? value
    );
  if (typeof value === "number" && Number.isFinite(value))
    return intl.number(value, { maximumFractionDigits: 20 });
  // Exact decimal strings are formatted by kind without losing precision (C1b).
  if (
    typeof value === "string" &&
    (field?.kind === "integer" || field?.kind === "decimal" || field?.kind === "money") &&
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  )
    return formatExactDecimal(value, intl);
  if (
    typeof value === "string" &&
    (field?.kind === "date" || field?.kind === "datetime")
  ) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp))
      return intl.date(
        value,
        field.kind === "date"
          ? { dateStyle: "medium", timeZone: "UTC" }
          : { dateStyle: "medium", timeStyle: "short" },
      );
  }
  // Decimal strings/money retain exact precision; references retain captured identity.
  // Never resolve a historical reference against today's label or infer currency.
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// --- Section 8: cell states, equality, outcomes and baseline -----------------

export type ComparisonCell =
  | { readonly state: "value"; readonly value: JsonValue; readonly display: string }
  | { readonly state: "empty" }
  | { readonly state: "masked"; readonly display: string }
  | { readonly state: "unavailable"; readonly reason: "not_captured" | "record_unavailable" };

export type ComparisonOutcome = "same" | "differs" | "not_comparable";

export interface ComparisonColumn {
  /** Internal (record or snapshot identity); never displayed. */
  readonly key: string;
  /** Readable identity and title, or the snapshot title. */
  readonly heading: string;
  readonly baseline?: true;
}

export interface ComparisonRow {
  /** Field key. */
  readonly key: string;
  readonly label: string;
  /** One per column, in column order. */
  readonly cells: readonly ComparisonCell[];
  readonly outcome: ComparisonOutcome;
  /** Only with a baseline: each column relative to it (the baseline itself is "same"). */
  readonly relativeToBaseline?: readonly ComparisonOutcome[];
}

/** The value kinds a comparison row may hold; UUID fields are refused at publication. */
export type ComparisonValueKind = Exclude<ListValueKind, "uuid">;

/** Section 8.2: equality by value kind, for two value cells' values. */
export function equalComparisonValues(kind: ComparisonValueKind, a: JsonValue, b: JsonValue): boolean {
  switch (kind) {
    case "integer":
    case "decimal":
    case "money":
      return isExactDecimal(a) && isExactDecimal(b) ? compareDecimals(a, b) === 0 : canonical(a) === canonical(b);
    case "datetime": {
      const left = typeof a === "string" ? Date.parse(a) : Number.NaN;
      const right = typeof b === "string" ? Date.parse(b) : Number.NaN;
      return Number.isFinite(left) && Number.isFinite(right) ? left === right : canonical(a) === canonical(b);
    }
    case "json":
      return canonical(a) === canonical(b);
    default:
      // Strings exactly (no folding or trimming), booleans, enum values, calendar
      // dates and reference identities: the stored value, never its label.
      return typeof a === "object" || typeof b === "object" ? canonical(a) === canonical(b) : a === b;
  }
}

/** Money is compared only with an equal, readable currency in every cell
 * (section 8.2). `currencies` is undefined when no currency field is declared
 * or readable; a masked currency arrives as a masked cell. */
export interface ComparisonCurrencyRule {
  readonly currencies: readonly ComparisonCell[] | undefined;
}

function comparableCells(cells: readonly ComparisonCell[]): cells is readonly Extract<ComparisonCell, { state: "value" | "empty" }>[] {
  return cells.every((cell) => cell.state === "value" || cell.state === "empty");
}

function cellsEqual(kind: ComparisonValueKind, a: ComparisonCell, b: ComparisonCell): boolean {
  if (a.state === "empty" || b.state === "empty") return a.state === b.state;
  return a.state === "value" && b.state === "value" && equalComparisonValues(kind, a.value, b.value);
}

/** A column whose whole record is unavailable (decision 11). */
const recordUnavailable = (cell: ComparisonCell) => cell.state === "unavailable" && cell.reason === "record_unavailable";

/** Section 8.3: whole-record-unavailable columns are left out (decision 11);
 * over the remaining columns, a row is not comparable when any cell is masked
 * or not captured, or money fails the currency rule, and it differs when its
 * cells are not all equal. Fewer than two available columns cannot be
 * compared. */
export function comparisonRowOutcome(
  kind: ComparisonValueKind,
  allCells: readonly ComparisonCell[],
  money?: ComparisonCurrencyRule,
): ComparisonOutcome {
  const available = allCells.flatMap((cell, index) => (recordUnavailable(cell) ? [] : [index]));
  if (available.length < 2) return "not_comparable";
  const cells = available.map((index) => allCells[index]!);
  if (!comparableCells(cells)) return "not_comparable";
  if (kind === "money") {
    const currencies = money?.currencies?.length === allCells.length ? available.map((index) => money.currencies![index]!) : undefined;
    if (!currencies || !currencies.every((cell) => cell.state === "value")) return "not_comparable";
    const first = currencies[0]!;
    if (!currencies.every((cell) => cellsEqual("string", first, cell))) return "differs";
  }
  const first = cells[0];
  return first && cells.every((cell) => cellsEqual(kind, first, cell)) ? "same" : "differs";
}

/** Section 8.4: each column relative to the baseline column. The row's own
 * outcome does not change with the baseline. */
export function comparisonRelativeToBaseline(
  kind: ComparisonValueKind,
  cells: readonly ComparisonCell[],
  baseline: number,
  money?: ComparisonCurrencyRule,
): readonly ComparisonOutcome[] {
  return cells.map((cell, index) => {
    if (index === baseline) return "same";
    const pair = [cells[baseline]!, cell];
    const currencies = money?.currencies ? [money.currencies[baseline]!, money.currencies[index]!] : undefined;
    return comparisonRowOutcome(kind, pair, kind === "money" ? { currencies } : undefined);
  });
}

/** Section 8.5 (C3): the columns holding the best value by the authored
 * direction. Only over comparable rows: a masked or not-captured cell, or a
 * money row failing the currency rule, ranks nothing. Unavailable columns are
 * left out (decision 11), empty cells are never best, ties are all best, and a
 * row whose values are all equal, or with fewer than two values, has none.
 * Money with more than one currency ranks nothing and says so. */
export function comparisonBestColumns(
  kind: ComparisonValueKind,
  cells: readonly ComparisonCell[],
  better: "lower" | "higher",
  money?: ComparisonCurrencyRule,
): { readonly best: readonly number[]; readonly mixedCurrencies: boolean } {
  const none = { best: [] as readonly number[], mixedCurrencies: false };
  if (comparisonRowOutcome(kind, cells, money) === "not_comparable") return none;
  const values = cells.flatMap((cell, index) => (cell.state === "value" ? [{ index, value: cell.value }] : []));
  if (kind === "money") {
    const currencies = new Set(values.map(({ index }) => {
      const currency = money?.currencies?.[index];
      return currency?.state === "value" ? JSON.stringify(currency.value) : "";
    }));
    if (currencies.size > 1) return { best: [], mixedCurrencies: true };
  }
  if (values.length < 2) return none;
  const order = (a: JsonValue, b: JsonValue): number => {
    if (kind === "integer" || kind === "decimal" || kind === "money")
      return isExactDecimal(a) && isExactDecimal(b) ? compareDecimals(a, b) : 0;
    if (kind === "datetime") return Date.parse(String(a)) - Date.parse(String(b));
    if (kind === "date") return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    return 0;
  };
  let top = values[0]!;
  for (const candidate of values) {
    const comparison = order(candidate.value, top.value);
    if ((better === "lower" && comparison < 0) || (better === "higher" && comparison > 0)) top = candidate;
  }
  const best = values.filter((candidate) => order(candidate.value, top.value) === 0).map((candidate) => candidate.index);
  return best.length === values.length ? none : { best, mixedCurrencies: false };
}

/** Canonical JSON: object keys sorted, so key order never makes a difference. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
