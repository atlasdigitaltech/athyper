"use client";
import {
  readBrowserStorage,
  writeBrowserStorage,
  removeBrowserStorage,
} from "@athyper/platform-ui";
import { CloseIcon } from "@athyper/platform-icons";
import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  ChoiceChips,
  Input,
  ChoiceSelect,
  SearchableSelect,
} from "@athyper/platform-ui";

/** Up to this many published choices render as chips; more use a searchable picker. */
export const FILTER_CHIP_LIMIT = 8;
import type {
  EntityListDescriptorV1,
  ListFieldDescriptorV1 as EntityField,
  ListFilterOperator,
  ListFilterV1,
} from "@athyper/contract-platform-entity-list";
import {
  ENTITY_LIST_RELATIVE_DATE_VALUES,
  entityListRelativeDateRange,
} from "@athyper/contract-platform-entity-list";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { createEntityReferenceMessages } from "@athyper/platform-i18n/entity-reference-messages";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import { filterInputValue } from "./filter-state";

type ListFieldDescriptorV1 = Pick<
  EntityField,
  | "key"
  | "label"
  | "valueKind"
  | "filterOperators"
  | "filterOptions"
  | "semanticRole"
  | "referenceLookup"
>;
export const FilterReferenceLoader = createContext<((field: string, input: {query:string;cursor?:string;value?:string;signal:AbortSignal}) => Promise<{options:readonly {value:string;label:string}[];nextCursor?:string}>) | undefined>(undefined);
export const FilterChoiceLoader = createContext<
  ((field: string) => Promise<void>) | undefined
>(undefined);

type Recent = { operator: ListFilterOperator; value: string };
export function recentFilterKey(descriptor: EntityListDescriptorV1): string {
  return `athyper.entity-list.recent.${descriptor.plane}.${descriptor.entity.code}.${descriptor.scope.fingerprint}`;
}
function readRecent(
  key: string | undefined,
  field: ListFieldDescriptorV1,
): Recent[] {
  if (!key) return [];
  try {
    const values: unknown = JSON.parse(
      readBrowserStorage(`${key}.${field.key}`, "session") ?? "[]",
    );
    return Array.isArray(values)
      ? values
          .filter(
            (item): item is Recent =>
              !!item &&
              typeof item.value === "string" &&
              field.filterOperators.includes(item.operator) &&
              !filterValidationError(field, item.operator, item.value),
          )
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}
export function rememberFilters(
  key: string,
  filters: readonly ListFilterV1[],
  fields: readonly ListFieldDescriptorV1[],
): void {
  for (const filter of filters) {
    const field = fields.find((item) => item.key === filter.field);
    if (
      !field ||
      filter.operator === "relative" ||
      filter.operator === "is_null" ||
      filter.operator === "is_not_null"
    )
      continue;
    const entry = {
      operator: filter.operator,
      value: filterInputValue(filter, field.valueKind),
    };
    if (
      !entry.value ||
      entry.value.length > 1024 ||
      filterValidationError(field, entry.operator, entry.value)
    )
      continue;
    try {
      writeBrowserStorage(
        `${key}.${field.key}`,
        JSON.stringify(
          [
            entry,
            ...readRecent(key, field).filter(
              (item) =>
                item.operator !== entry.operator || item.value !== entry.value,
            ),
          ].slice(0, 5),
        ),
        "session",
      );
    } catch {
      /* Storage is optional. */
    }
  }
}
/** Why a filter value cannot be applied; shown as `list.filter.error.<code>`. */
export type FilterValidationError = "operator" | "required" | "relative" | "range" | "option" | "reference" | "boolean" | "number" | "date" | "order";
export function filterValidationError(
  field: ListFieldDescriptorV1 | undefined,
  operator: ListFilterOperator,
  raw: string,
): FilterValidationError | undefined {
  if (!field || !field.filterOperators.includes(operator))
    return "operator";
  if (operator === "is_null" || operator === "is_not_null") return undefined;
  if (!raw.trim()) return "required";
  if (operator === "relative")
    return entityListRelativeDateRange(raw)
      ? undefined
      : "relative";
  const parts =
    operator === "between" || operator === "in"
      ? raw.split(",").map((value) => value.trim())
      : [raw.trim()];
  if (
    parts.some((value) => !value) ||
    (operator === "between" && parts.length !== 2)
  )
    return "range";
  if (
    ["eq", "ne", "in"].includes(operator) &&
    !field.referenceLookup &&
    field.filterOptions?.length &&
    parts.some(
      (value) =>
        !field.filterOptions!.some((option) => String(option.value) === value),
    )
  )
    return "option";
  if (
    field.valueKind === "reference" &&
    !field.referenceLookup &&
    ["eq", "ne", "in"].includes(operator) &&
    !field.filterOptions?.length
  )
    return "reference";
  if (
    field.valueKind === "boolean" &&
    parts.some((value) => !["true", "false"].includes(value))
  )
    return "boolean";
  const numeric = ["integer", "decimal", "money"].includes(field.valueKind),
    temporal = ["date", "datetime"].includes(field.valueKind);
  if (
    numeric &&
    parts.some(
      (value) =>
        !Number.isFinite(Number(value)) ||
        (field.valueKind === "integer" && !Number.isInteger(Number(value))),
    )
  )
    return "number";
  if (
    temporal &&
    parts.some((value) => {
      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
      const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
      return (
        Number.isNaN(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== value.slice(0, 10) ||
        (field.valueKind === "date" && value.length !== 10) ||
        (field.valueKind === "datetime" &&
          (Number.isNaN(new Date(value).valueOf()) || !value.includes("T")))
      );
    })
  )
    return "date";
  if (
    operator === "between" &&
    (numeric
      ? Number(parts[0]) > Number(parts[1])
      : temporal
        ? new Date(parts[0]!).valueOf() > new Date(parts[1]!).valueOf()
        : false)
  )
    return "order";
  return undefined;
}
type Intl = Pick<ReturnType<typeof useEntityI18n>, "message">;
type RelativeGroup = "days" | "weeks" | "months" | "years";
const ROLLING = /^(last|next)_(\d+)_days$/;
const RELATIVE_DATE_GROUPS = Object.freeze(
  (["days", "weeks", "months", "years"] as const).map((group) => ({
    group,
    values: ENTITY_LIST_RELATIVE_DATE_VALUES.filter((value) => {
      const range = entityListRelativeDateRange(value)!;
      const of: RelativeGroup = range.kind === "days"
        ? Math.max(Math.abs(range.from), Math.abs(range.to)) >= 365 ? "years" : "days"
        : range.unit === "week" ? "weeks" : range.unit === "year" ? "years" : "months";
      return of === group;
    }),
  })),
);

/** A relative period's name, from the catalogue. */
export function relativePeriodLabel(value: string, intl: Intl): string {
  const rolling = ROLLING.exec(value);
  if (rolling) return intl.message(rolling[1] === "last" ? "list.relative.lastDays" : "list.relative.nextDays", { count: Number(rolling[2]) });
  return intl.message(`list.relative.${value}`);
}

/** Describe the existing server calendar semantics without assuming browser timezone. */
export function relativePeriodDescription(value: string, intl: Intl): string | undefined {
  const rolling = ROLLING.exec(value);
  if (rolling) return intl.message(rolling[1] === "last" ? "list.relative.describe.lastDays" : "list.relative.describe.nextDays", { count: Number(rolling[2]) });
  return entityListRelativeDateRange(value) ? intl.message(`list.relative.describe.${value}`) : undefined;
}
function RelativeDatePicker({
  value,
  label,
  onChange,
}: {
  readonly value: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
}) {
  const intl = useEntityI18n();
  const descriptionId = useId();
  const description = relativePeriodDescription(value, intl);
  const options = useMemo(
    () =>
      RELATIVE_DATE_GROUPS.flatMap((group) =>
        group.values.map((option) => ({ value: option, label: relativePeriodLabel(option, intl), group: intl.message(`list.relative.group.${group.group}`) })),
      ),
    [intl],
  );
  // A short, grouped, fixed list: a select-only choice, not a search.
  return (
    <div className="a-entity-list__period-control">
      <ChoiceSelect
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        placeholder={intl.message("list.filter.selectRelative")}
        aria-describedby={description ? descriptionId : undefined}
      />
      {description ? (
        <small id={descriptionId}>
          {intl.message("list.filter.serverCalendar", { description })}
        </small>
      ) : null}
    </div>
  );
}

function ChoicePicker({
  field,
  label,
  value,
  multiple,
  onChange,
  recentValues,
  onClearRecent,
}: {
  field: ListFieldDescriptorV1;
  label: string;
  value: string;
  multiple: boolean;
  onChange: (value: string) => void;
  recentValues: readonly string[];
  onClearRecent?: () => void;
}) {
  const intl = useEntityI18n();
  const id = useId(),
    load = useContext(FilterChoiceLoader),
    referenceLoad = useContext(FilterReferenceLoader),
    pending = useRef(false);
  const mounted = useRef(false),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(false);
  const i18n = useOptionalI18n();
  const message = (key: keyof typeof entityEnglishMessages) => {
    const text = i18n?.message(key);
    return text && text !== key ? text : entityEnglishMessages[key];
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const openChoices = () => {
    // An empty loaded catalogue is distinct from choices not fetched yet.
    if (
      !field.referenceLookup &&
      field.valueKind !== "boolean" &&
      field.filterOptions === undefined &&
      load &&
      !pending.current
    ) {
      pending.current = true;
      setLoading(true);
      setLoadError(false);
      void load(field.key)
        .catch(() => {
          if (mounted.current) setLoadError(true);
        })
        .finally(() => {
          pending.current = false;
          if (mounted.current) setLoading(false);
        });
    }
  };
  const loadReferencePage = useMemo(() => field.referenceLookup && referenceLoad ? (input: Parameters<NonNullable<typeof referenceLoad>>[1]) => referenceLoad(field.key, input) : undefined, [field.referenceLookup, field.key, referenceLoad]);
  const options = useMemo(
    () =>
      (field.valueKind === "boolean"
        ? [
            { value: true, label: intl.message("list.chrome.yes") },
            { value: false, label: intl.message("list.chrome.no") },
          ]
        : (field.filterOptions ?? [])
      ).map((option) => ({ value: String(option.value), label: option.label })),
    [field.filterOptions, field.valueKind, intl],
  );
  return (
    <SearchableSelect
      id={id}
      label={label}
      value={value}
      options={options}
      loadPage={loadReferencePage}
      onChange={onChange}
      multipleValues={
        multiple
          ? value
              .split(",")
              .map((key) => key.trim())
              .filter(Boolean)
          : undefined
      }
      onMultipleChange={
        multiple ? (values) => onChange(values.join(",")) : undefined
      }
      onOpen={openChoices}
      recentValues={recentValues}
      onClearRecent={onClearRecent}
      locale={i18n?.localization.uiLocale}
      status={
        loading
          ? message("entity.reference.loading")
          : loadError
            ? message("entity.reference.loadError")
            : undefined
      }
      onRetry={loadError ? openChoices : undefined}
      retryLabel={message("entity.reference.retry")}
      messages={createEntityReferenceMessages(message)}
    />
  );
}

function DateSetPicker({
  field,
  value,
  label,
  onChange,
}: {
  field: ListFieldDescriptorV1;
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const localization = useOptionalI18n()?.localization;
  const intl = useEntityI18n();
  const [pending, setPending] = useState("");
  const dates = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const valid =
    pending &&
    !filterValidationError(
      { ...field, filterOperators: ["eq"] },
      "eq",
      pending,
    );
  return (
    <div>
      <div className="a-entity-list__choice-chips">
        {dates.map((date, index) => (
          <button
            type="button"
            key={date}
            aria-label={intl.message("list.filter.removeDate", { date })}
            onClick={() =>
              onChange(dates.filter((_, i) => i !== index).join(","))
            }
          >
            {date} <CloseIcon aria-hidden="true" size={16} />
          </button>
        ))}
      </div>
      <Input
        type={field.valueKind === "date" ? "date" : "datetime-local"}
        step="any"
        locale={localization?.formatLocale}
        weekStart={localization?.weekStart}
        value={pending}
        aria-label={label}
        onChange={(event) => setPending(event.currentTarget.value)}
      />
      <Button
        size="small"
        variant="secondary"
        disabled={!valid || dates.includes(pending)}
        onClick={() => {
          onChange([...dates, pending].join(","));
          setPending("");
        }}
      >
        {intl.message("list.filter.addDate")}
      </Button>
    </div>
  );
}

export function FilterValueEditor({
  field,
  operator,
  value,
  filterNumber,
  onChange,
  historyKey,
}: {
  readonly field: ListFieldDescriptorV1;
  readonly operator: ListFilterOperator;
  readonly value: string;
  readonly filterNumber: number;
  readonly onChange: (value: string) => void;
  readonly historyKey?: string;
}) {
  const intl = useEntityI18n();
  const label = intl.message("list.filter.valueFor", { field: field.label, number: filterNumber }),
    errorId = useId(),
    [historyVersion, setHistoryVersion] = useState(0);
  const recent = (
    operator === "relative" ? [] : readRecent(historyKey, field)
  ).filter((item) => item.operator === operator);
  void historyVersion;
  if (operator === "is_null" || operator === "is_not_null")
    return (
      <span className="a-entity-list__filter-no-value">{intl.message("list.filter.noValueRequired")}</span>
    );
  const error = value
    ? filterValidationError(field, operator, value)
    : undefined;
  const temporal = field.valueKind === "date" || field.valueKind === "datetime",
    type =
      field.valueKind === "date"
        ? "date"
        : field.valueKind === "datetime"
          ? "datetime-local"
          : ["integer", "decimal", "money"].includes(field.valueKind)
            ? "number"
            : "text";
  const step =
    field.valueKind === "integer"
      ? 1
      : type === "number" || type === "datetime-local"
        ? "any"
        : undefined;
  const choiceOperator = ["eq", "ne", "in"].includes(operator),
    publishedChoices =
      field.valueKind === "boolean"
        ? [
            { value: "true", label: intl.message("list.chrome.yes") },
            { value: "false", label: intl.message("list.chrome.no") },
          ]
        : field.filterOptions?.map((option) => ({ value: String(option.value), label: option.label })),
    chips =
      choiceOperator &&
      field.valueKind !== "reference" &&
      field.valueKind !== "enum" &&
      !!publishedChoices?.length &&
      publishedChoices.length <= FILTER_CHIP_LIMIT,
    searchable =
      choiceOperator &&
      !chips &&
      (!!publishedChoices?.length || field.valueKind === "reference" || field.valueKind === "enum" || field.filterOptions !== undefined);
  const clearRecent = () => {
    try {
      removeBrowserStorage(`${historyKey}.${field.key}`, "session");
    } catch {}
    setHistoryVersion((version) => version + 1);
  };
  let control: React.ReactNode;
  if (operator === "relative")
    control = (
      <RelativeDatePicker label={label} value={value} onChange={onChange} />
    );
  else if (operator === "between") {
    const [from = "", to = ""] = value.split(",", 2);
    control = (
      <div className="a-entity-list__filter-range-inputs">
        <label>
          {intl.message("list.filter.from")}
          <Input
            type={type}
            step={step}
            value={from.trim()}
            max={temporal ? to.trim() || undefined : undefined}
            aria-label={intl.message("list.filter.fromFor", { label })}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(`${event.currentTarget.value},${to.trim()}`)
            }
          />
        </label>
        <label>
          {intl.message("list.filter.to")}
          <Input
            type={type}
            step={step}
            min={temporal ? from.trim() || undefined : undefined}
            value={to.trim()}
            aria-label={intl.message("list.filter.toFor", { label })}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(`${from.trim()},${event.currentTarget.value}`)
            }
          />
        </label>
      </div>
    );
  } else if (searchable && !chips)
    control = (
      <ChoicePicker
        key={`${field.key}-${operator}`}
        field={field}
        label={label}
        value={value}
        multiple={operator === "in"}
        onChange={onChange}
        recentValues={recent.flatMap((item) =>
          item.value.split(",").map((key) => key.trim()),
        )}
        onClearRecent={historyKey ? clearRecent : undefined}
      />
    );
  else if (chips)
    control = (
      <ChoiceChips
        label={label}
        items={publishedChoices!}
        multiple={operator === "in"}
        values={value.split(",").map((item) => item.trim()).filter(Boolean)}
        onValuesChange={(values) => onChange(values.join(","))}
      />
    );
  else if (operator === "in" && temporal)
    control = (
      <DateSetPicker
        key={field.key}
        field={field}
        value={value}
        label={label}
        onChange={onChange}
      />
    );
  else
    control = (
      <Input
        type={operator === "in" ? "text" : type}
        step={step}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={
          operator === "in"
            ? intl.message("list.filter.enterValues")
            : intl.message("list.filter.enterValue")
        }
      />
    );
  return (
    <div className="a-entity-list__filter-control">
      <span className="a-entity-list__filter-label">{intl.message("list.chrome.value")}</span>
      {control}
      {field.valueKind === "datetime" && operator !== "relative" ? (
        <small>{intl.message("list.filter.timeZone", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</small>
      ) : null}
      {error ? (
        <small
          id={errorId}
          role="alert"
          className="a-entity-list__filter-error"
        >
          {intl.message(`list.filter.error.${error}`)}
        </small>
      ) : null}
      {recent.length && !searchable ? (
        <div className="a-entity-list__recent a-filter-chip-group" role="group" aria-label={intl.message("list.filter.recentFor", { field: field.label })}>
          <span aria-hidden="true">{intl.message("list.filter.recent")}</span>
          {recent.map((item) => (
            <button
              type="button"
              key={item.value}
              className="a-filter-chip"
              onClick={() => onChange(item.value)}
            >
              {item.operator === "relative"
                ? relativePeriodLabel(item.value, intl)
                : item.value
                    .split(",")
                    .map(
                      (key) =>
                        field.filterOptions?.find(
                          (option) => String(option.value) === key.trim(),
                        )?.label ?? key,
                    )
                    .reduce((first, second) => intl.message("list.text.listed", { first, second }))}
            </button>
          ))}
          <Button variant="ghost" size="small" onClick={clearRecent}>
            {intl.message("list.filter.clearRecent")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
