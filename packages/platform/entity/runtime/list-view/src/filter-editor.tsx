"use client";
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
  Input,
  Select,
  SearchableSelect,
  choicePresentation,
} from "@athyper/platform-ui";
import type {
  EntityListDescriptorV1,
  ListFieldDescriptorV1,
  ListFilterOperator,
  ListFilterV1,
} from "@athyper/contract-platform-entity-list";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import { filterInputValue } from "./state";

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
      window.sessionStorage.getItem(`${key}.${field.key}`) ?? "[]",
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
      window.sessionStorage.setItem(
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
      );
    } catch {
      /* Storage is optional. */
    }
  }
}
export function filterValidationError(
  field: ListFieldDescriptorV1 | undefined,
  operator: ListFilterOperator,
  raw: string,
): string | undefined {
  if (!field || !field.filterOperators.includes(operator))
    return "Choose an available field and operator.";
  if (operator === "is_null" || operator === "is_not_null") return undefined;
  if (!raw.trim()) return "Select or enter a value.";
  if (operator === "relative")
    return RELATIVE_DATE_GROUPS.some((group) =>
      group.options.some((option) => option.value === raw),
    )
      ? undefined
      : "Select a relative period.";
  const parts =
    operator === "between" || operator === "in"
      ? raw.split(",").map((value) => value.trim())
      : [raw.trim()];
  if (
    parts.some((value) => !value) ||
    (operator === "between" && parts.length !== 2)
  )
    return "Enter both range boundaries.";
  if (
    ["eq", "ne", "in"].includes(operator) &&
    field.filterOptions?.length &&
    parts.some(
      (value) =>
        !field.filterOptions!.some((option) => String(option.value) === value),
    )
  )
    return "Select an available value.";
  if (
    field.valueKind === "reference" &&
    ["eq", "ne", "in"].includes(operator) &&
    !field.filterOptions?.length
  )
    return "Reference choices are unavailable.";
  if (
    field.valueKind === "boolean" &&
    parts.some((value) => !["true", "false"].includes(value))
  )
    return "Select Yes or No.";
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
    return "Enter a valid number.";
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
    return "Enter a valid date.";
  if (
    operator === "between" &&
    (numeric
      ? Number(parts[0]) > Number(parts[1])
      : temporal
        ? new Date(parts[0]!).valueOf() > new Date(parts[1]!).valueOf()
        : false)
  )
    return "The end must be on or after the start.";
  return undefined;
}
const RELATIVE_DATE_GROUPS = Object.freeze([
  Object.freeze({
    label: "Days",
    options: Object.freeze([
      { value: "today", label: "Today" },
      { value: "yesterday", label: "Yesterday" },
      { value: "tomorrow", label: "Tomorrow" },
      { value: "last_7_days", label: "Last 7 days" },
      { value: "last_30_days", label: "Last 30 days" },
      { value: "last_90_days", label: "Last 90 days" },
      { value: "next_7_days", label: "Next 7 days" },
      { value: "next_30_days", label: "Next 30 days" },
      { value: "next_90_days", label: "Next 90 days" },
    ]),
  }),
  Object.freeze({
    label: "Weeks",
    options: Object.freeze([{ value: "this_week", label: "This week" }]),
  }),
  Object.freeze({
    label: "Months",
    options: Object.freeze([
      { value: "this_month", label: "This month" },
      { value: "this_quarter", label: "This quarter" },
    ]),
  }),
  Object.freeze({
    label: "Years",
    options: Object.freeze([
      { value: "last_365_days", label: "Last 365 days" },
      { value: "next_365_days", label: "Next 365 days" },
      { value: "last_year", label: "Last calendar year" },
      { value: "this_year", label: "This year" },
      { value: "next_year", label: "Next calendar year" },
    ]),
  }),
] as const);

/** Describe the existing server calendar semantics without assuming browser timezone. */
export function relativePeriodDescription(value: string): string | undefined {
  const rolling = /^(last|next)_(\d+)_days$/.exec(value);
  if (rolling)
    return rolling[1] === "last"
      ? `Previous ${rolling[2]} days plus today, through the end of today.`
      : `Today plus the following ${rolling[2]} days, through the end of the final day.`;
  return (
    {
      today: "Today, from start to end of day.",
      yesterday: "Yesterday, from start to end of day.",
      tomorrow: "Tomorrow, from start to end of day.",
      this_week: "The complete current week, Monday through Sunday.",
      this_month: "The complete current calendar month.",
      this_quarter: "The complete current calendar quarter.",
      last_year: "January 1 through December 31 of the previous year.",
      this_year: "January 1 through December 31 of the current year.",
      next_year: "January 1 through December 31 of the following year.",
    } as Record<string, string>
  )[value];
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
  const id = useId();
  const description = relativePeriodDescription(value);
  return (
    <div className="a-entity-list__period-control">
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-describedby={description ? id : undefined}
      >
        <option value="">Select a relative period</option>
        {RELATIVE_DATE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      {description ? (
        <small id={id}>
          {description} Uses the server calendar; recalculated when the filter
          runs.
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
  const id = useId(),
    load = useContext(FilterChoiceLoader),
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
    if (field.valueKind !== "boolean" && field.filterOptions === undefined && load && !pending.current) {
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
  const options = useMemo(
    () =>
      (
        (field.valueKind === "boolean"
          ? [
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ]
          : field.filterOptions ?? [])
      ).map((option) => ({ value: String(option.value), label: option.label })),
    [field.filterOptions, field.valueKind],
  );
  return (
    <SearchableSelect
      id={id}
      label={label}
      value={value}
      options={options}
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
      messages={{
        search: message("entity.reference.search"),
        recent: message("entity.reference.recent"),
        all: message("entity.reference.all"),
        results: message("entity.reference.results"),
        empty: message("entity.reference.empty"),
        unavailable: message("entity.reference.unavailable"),
        required: message("entity.reference.required"),
        clear: message("entity.reference.clear"),
        clearRecent: message("entity.reference.clearRecent"),
      }}
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
            aria-label={`Remove ${date}`}
            onClick={() =>
              onChange(dates.filter((_, i) => i !== index).join(","))
            }
          >
            {date} ×
          </button>
        ))}
      </div>
      <Input
        type={field.valueKind === "date" ? "date" : "datetime-local"}
        step="any"
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
        Add date
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
  const label = `Value for ${field.label} filter ${filterNumber}`,
    errorId = useId(),
    [historyVersion, setHistoryVersion] = useState(0);
  const recent = (
    operator === "relative" ? [] : readRecent(historyKey, field)
  ).filter((item) => item.operator === operator);
  void historyVersion;
  if (operator === "is_null" || operator === "is_not_null")
    return (
      <span className="a-entity-list__filter-no-value">No value required</span>
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
  const searchable =
    ["eq", "ne", "in"].includes(operator) &&
    choicePresentation({
      optionCount: field.filterOptions?.length ?? 0,
      valueKind: field.valueKind,
      semanticRole: field.semanticRole,
      multiple:
        operator === "in" &&
        (!!field.filterOptions?.length || field.valueKind === "boolean"),
    }) === "searchable";
  const clearRecent = () => {
    try {
      window.sessionStorage.removeItem(`${historyKey}.${field.key}`);
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
          From
          <Input
            type={type}
            step={step}
            value={from.trim()}
            max={temporal ? to.trim() || undefined : undefined}
            aria-label={`From ${label}`}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(`${event.currentTarget.value},${to.trim()}`)
            }
          />
        </label>
        <label>
          To
          <Input
            type={type}
            step={step}
            min={temporal ? from.trim() || undefined : undefined}
            value={to.trim()}
            aria-label={`To ${label}`}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(`${from.trim()},${event.currentTarget.value}`)
            }
          />
        </label>
      </div>
    );
  } else if (searchable)
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
  else if (
    ["eq", "ne", "in"].includes(operator) &&
    (field.filterOptions?.length || field.valueKind === "boolean")
  )
    control = (
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">Select a value</option>
        {(
          field.filterOptions ?? [
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ]
        ).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </Select>
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
            ? "Enter values separated by commas"
            : "Enter a value"
        }
      />
    );
  return (
    <div className="a-entity-list__filter-control">
      <span className="a-entity-list__filter-label">Value</span>
      {control}
      {field.valueKind === "datetime" && operator !== "relative" ? (
        <small>{`Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose an exact time, or use Relative period for whole days.`}</small>
      ) : null}
      {error ? (
        <small
          id={errorId}
          role="alert"
          className="a-entity-list__filter-error"
        >
          {error}
        </small>
      ) : null}
      {recent.length && !searchable ? (
        <div className="a-entity-list__recent">
          <Select
            aria-label={`Recent choices for ${field.label}`}
            value=""
            onChange={(event) => onChange(event.currentTarget.value)}
          >
            <option value="">Recent choices</option>
            {recent.map((item) => (
              <option key={item.value} value={item.value}>
                {item.operator === "relative"
                  ? RELATIVE_DATE_GROUPS.flatMap((group) => group.options).find(
                      (option) => option.value === item.value,
                    )?.label
                  : item.value
                      .split(",")
                      .map(
                        (key) =>
                          field.filterOptions?.find(
                            (option) => String(option.value) === key.trim(),
                          )?.label ?? key,
                      )
                      .join(", ")}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              try {
                window.sessionStorage.removeItem(`${historyKey}.${field.key}`);
              } catch {}
              setHistoryVersion((version) => version + 1);
            }}
          >
            Clear recent
          </Button>
        </div>
      ) : null}
    </div>
  );
}
