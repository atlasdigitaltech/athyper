"use client";

import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { SearchIcon } from "@athyper/platform-icons";
import {
  Button,
  Input,
  Label,
  Select,
  SearchableSelect,
  choicePresentation,
} from "@athyper/platform-ui";
import React, {
  useMemo,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import { fieldTypeLabel, matchesColumnSearch } from "./columns";

const MAX_CATALOGUE_RESULTS = 20;

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

export function FieldCataloguePicker({
  heading,
  fields,
  placeholder,
  onSelect,
  onClose,
}: {
  readonly heading: string;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly placeholder: string;
  readonly onSelect: (field: ListFieldDescriptorV1) => void;
  readonly onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    searchId = useId(),
    options = useRef<HTMLDivElement>(null),
    matching = fields.filter((field) => matchesColumnSearch(field, search)),
    shown = matching.slice(0, MAX_CATALOGUE_RESULTS);
  const focusOption = (index: number) =>
    options.current
      ?.querySelectorAll<HTMLButtonElement>("[data-field-option]")
      [index]?.focus();
  const optionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? shown.length - 1
          : Math.max(
              0,
              Math.min(
                shown.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    focusOption(target);
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
        {shown.map((field, index) => (
          <button
            type="button"
            data-field-option
            key={field.key}
            onKeyDown={(event) => optionKeyDown(event, index)}
            onClick={() => onSelect(field)}
          >
            <span>
              <strong>{field.label}</strong>
              <small>
                {field.key} · {fieldTypeLabel(field.valueKind)}
              </small>
            </span>
            <span aria-hidden="true">＋</span>
          </button>
        ))}
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

export function SearchableFieldSelect({
  fields,
  value,
  label,
  onChange,
}: {
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly value: string;
  readonly label: string;
  readonly onChange: (field: ListFieldDescriptorV1) => void;
}) {
  const id = useId(),
    i18n = useOptionalI18n();
  const message = (key: keyof typeof entityEnglishMessages) => {
    const text = i18n?.message(key);
    return text && text !== key ? text : entityEnglishMessages[key];
  };
  const options = useMemo(
    () => fields.map((field) => ({ value: field.key, label: field.label })),
    [fields],
  );
  const select = (key: string) => {
    const field = fields.find((field) => field.key === key);
    if (field) onChange(field);
  };
  if (choicePresentation({ optionCount: fields.length }) === "select")
    return (
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => select(event.currentTarget.value)}
      >
        {!options.some(option => option.value === value) ? <option value={value} disabled>{value ? `Unavailable field: ${value}` : "Select a field"}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  return (
    <SearchableSelect
      id={id}
      label={label}
      value={value}
      options={options}
      onChange={select}
      required
      locale={i18n?.localization.uiLocale}
      messages={{
        search: message("entity.reference.search"),
        recent: message("entity.reference.recent"),
        all: message("entity.reference.all"),
        results: message("entity.reference.results"),
        empty: message("entity.reference.empty"),
        unavailable: message("entity.reference.unavailable"),
        required: message("entity.reference.required"),
        clear: message("entity.reference.clear"),
      }}
    />
  );
}
