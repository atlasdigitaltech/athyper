"use client";

import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { ChevronDownIcon, SearchIcon } from "@athyper/platform-icons";
import {
  Button,
  Checkbox,
  Input,
  Label,
  SearchableSelect,
} from "@athyper/platform-ui";
import React, {
  useMemo,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { createEntityReferenceMessages } from "@athyper/platform-i18n/entity-reference-messages";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { groupAvailableColumns, matchesColumnSearch, SYSTEM_FIELD_GROUP } from "./columns";

/** Large catalogues stay responsive; typical entities show every field. */
const MAX_CATALOGUE_RESULTS = 100;

export function FieldSearchInput({
  id,
  value,
  count,
  placeholder,
  autoFocus,
  onChange,
  onArrowDown,
}: {
  readonly id: string;
  readonly value: string;
  readonly count: number;
  readonly placeholder: string;
  readonly autoFocus?: boolean;
  readonly onChange: (value: string) => void;
  readonly onArrowDown?: () => void;
}) {
  return (
    <div className="a-entity-list__field-search">
      <SearchIcon size={17} />
      <Label htmlFor={id} className="a-visually-hidden">
        {placeholder}
      </Label>
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && onArrowDown) {
            event.preventDefault();
            onArrowDown();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <span>{count}</span>
    </div>
  );
}

/** Searchable field list for Sort and Filters, with the same rows as the
 * Columns list: a checkbox shows whether the field is used. Ticking adds a
 * sort level or filter, unticking removes it; at the limit unticked rows are
 * disabled. Fields are grouped by category; the system group stays collapsed
 * until opened or searched. */
export function FieldCataloguePicker({
  heading,
  fields,
  placeholder,
  selected,
  onSelect,
  onDeselect,
  onClose,
  checkboxLabel,
  limitReached = false,
}: {
  readonly heading: string;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly placeholder: string;
  /** Keys of fields already used (checked). */
  readonly selected: readonly string[];
  readonly onSelect: (field: ListFieldDescriptorV1) => void;
  readonly onDeselect: (field: ListFieldDescriptorV1) => void;
  readonly onClose: () => void;
  /** Accessible name of a row's checkbox, e.g. "Sort by Region". */
  readonly checkboxLabel: (field: ListFieldDescriptorV1) => string;
  readonly limitReached?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [systemOpen, setSystemOpen] = useState(false),
    searchId = useId(),
    options = useRef<HTMLDivElement>(null),
    matching = fields.filter((field) => matchesColumnSearch(field, search)),
    shown = matching.slice(0, MAX_CATALOGUE_RESULTS),
    groups = groupAvailableColumns(shown);
  const choices = () => [
    ...(options.current?.querySelectorAll<HTMLInputElement>("[data-field-option] input:not(:disabled)") ?? []),
  ];
  const focusOption = (index: number) => choices()[index]?.focus();
  const optionKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = choices(),
      index = enabled.indexOf(event.currentTarget);
    focusOption(
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : Math.max(0, Math.min(enabled.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))),
    );
  };
  const option = (field: ListFieldDescriptorV1) => {
    const used = selected.includes(field.key);
    return (
      <label key={field.key} data-field-option>
        <Checkbox
          aria-label={checkboxLabel(field)}
          checked={used}
          disabled={!used && limitReached}
          onKeyDown={optionKeyDown}
          onChange={() => (used ? onDeselect(field) : onSelect(field))}
        />
        <span className="a-entity-list__column-name">
          <strong>{field.label}</strong>
          <small>{field.key}</small>
        </span>
      </label>
    );
  };
  return (
    <section
      className="a-entity-list__field-catalogue"
      aria-labelledby={`${searchId}-heading`}
    >
      <div className="a-entity-list__field-catalogue-heading">
        <h3 id={`${searchId}-heading`}>{heading}</h3>
        <Button variant="ghost" size="small" onClick={onClose}>
          Close
        </Button>
      </div>
      <FieldSearchInput
        id={searchId}
        value={search}
        count={matching.length}
        placeholder={placeholder}
        onChange={setSearch}
        onArrowDown={() => focusOption(0)}
      />
      <div ref={options} className="a-entity-list__field-options">
        {groups.map((group) => {
          const collapsible = group.label === SYSTEM_FIELD_GROUP && !search.trim(),
            open = !collapsible || systemOpen;
          return (
            <div key={group.label} className="a-entity-list__column-group" role="group" aria-label={group.label}>
              {collapsible ? (
                <button
                  type="button"
                  className="a-entity-list__field-group-toggle"
                  aria-expanded={open}
                  onClick={() => setSystemOpen(!open)}
                >
                  <span>{group.label}</span>
                  <span>{group.fields.length}</span>
                  <ChevronDownIcon size={14} className="a-disclosure-caret" aria-hidden="true" />
                </button>
              ) : (
                <h4>
                  {group.label}
                  <span>{group.fields.length}</span>
                </h4>
              )}
              {open ? (
                <div className="a-entity-list__column-list a-entity-list__column-list--available">
                  {group.fields.map(option)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {matching.length > shown.length ? (
        <p className="a-entity-list__field-catalogue-hint">
          Showing the first {shown.length} of {matching.length} fields. Refine
          your search to find another field.
        </p>
      ) : null}
      {!matching.length ? (
        <div className="a-entity-list__field-catalogue-empty">
          <p>No matching fields.</p>
          {search ? (
            <Button variant="ghost" size="small" onClick={() => setSearch("")}>
              Clear search
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Field picker for list controls. Always searchable, whatever the field
 * count, so the control looks and behaves the same for every entity. */
export function SearchableFieldSelect({
  fields,
  value,
  label,
  onChange,
  onClear,
  required = true,
  placeholder,
}: {
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly value: string;
  readonly label: string;
  readonly onChange: (field: ListFieldDescriptorV1) => void;
  /** Optional pickers (for example grouping) clear to an empty value. */
  readonly onClear?: () => void;
  readonly required?: boolean;
  readonly placeholder?: string;
}) {
  const id = useId(),
    i18n = useOptionalI18n();
  const message = (key: keyof typeof entityEnglishMessages) => {
    const text = i18n?.message(key);
    return text && text !== key ? text : entityEnglishMessages[key];
  };
  // A saved field that is no longer available stays visible, labelled as such,
  // until the person explicitly picks a replacement.
  const entityIntl = useEntityI18n();
  const unavailable =
    value && !fields.some((field) => field.key === value)
      ? entityIntl.message("list.fields.unavailable", { field: value })
      : undefined;
  const options = useMemo(
    () => [
      ...(unavailable ? [{ value, label: unavailable }] : []),
      ...fields.map((field) => ({ value: field.key, label: field.label })),
    ],
    [fields, unavailable, value],
  );
  const select = (key: string) => {
    if (!key) return onClear?.();
    const field = fields.find((field) => field.key === key);
    if (field) onChange(field);
  };
  return (
    <SearchableSelect
      id={id}
      label={label}
      value={value}
      options={options}
      onChange={select}
      required={required}
      placeholder={placeholder}
      locale={i18n?.localization.uiLocale}
      messages={createEntityReferenceMessages(message)}
    />
  );
}
