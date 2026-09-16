"use client";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckIcon, ChevronDownIcon } from "@athyper/platform-icons";
import { createPortal } from "react-dom";

export interface ReferenceOption {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}
export interface SearchableSelectMessages {
  readonly search: string;
  readonly recent: string;
  readonly all: string;
  readonly results: string;
  readonly empty: string;
  readonly unavailable: string;
  readonly required: string;
  readonly clear: string;
  readonly clearRecent?: string;
}
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
const referenceIndexes = new WeakMap<
  readonly ReferenceOption[],
  Map<string, { option: ReferenceOption; code: string; name: string }[]>
>();
/** Normalize and sort once per catalogue/locale, rather than inside each comparison. */
export function indexReferenceOptions(
  options: readonly ReferenceOption[],
  locale?: string,
) {
  const key = locale ?? "";
  let locales = referenceIndexes.get(options);
  const existing = locales?.get(key);
  if (existing) return existing;
  if (!locales) {
    locales = new Map();
    referenceIndexes.set(options, locales);
  }
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  const groups = new Map(
    [...new Set(options.map((option) => option.group))].map((group, index) => [
      group,
      index,
    ]),
  );
  const indexed = options
    .map((option) => ({
      option,
      code: normalize(option.value),
      name: normalize(option.label),
    }))
    .sort(
      (a, b) =>
        groups.get(a.option.group)! - groups.get(b.option.group)! ||
        collator.compare(a.option.label, b.option.label),
    );
  if (locales.size >= 4) locales.delete(locales.keys().next().value!);
  locales.set(key, indexed);
  return indexed;
}
export function searchIndexedReferenceOptions(
  index: ReturnType<typeof indexReferenceOptions>,
  query: string,
) {
  const term = normalize(query);
  if (!term) return index.map((item) => item.option);
  const exact: ReferenceOption[] = [],
    prefix: ReferenceOption[] = [],
    contains: ReferenceOption[] = [];
  for (const { option, code, name } of index) {
    if (code === term || name === term) exact.push(option);
    else if (code.startsWith(term) || name.startsWith(term))
      prefix.push(option);
    else if (code.includes(term) || name.includes(term)) contains.push(option);
  }
  return [...exact, ...prefix, ...contains];
}
export function searchReferenceOptions(
  options: readonly ReferenceOption[],
  query: string,
  locale?: string,
) {
  return searchIndexedReferenceOptions(
    indexReferenceOptions(options, locale),
    query,
  );
}

/** Bounded reference options; only explicit selection changes the submitted key. */
export function SearchableSelect({
  id,
  name,
  label,
  value,
  options,
  recentValues = [],
  recentLimit = 5,
  onClearRecent,
  onChange,
  disabled = false,
  required = false,
  placeholder,
  describedBy,
  locale,
  messages,
  onOpen,
  multipleValues,
  onMultipleChange,
  status,
  onRetry,
  retryLabel,
  "aria-invalid": ariaInvalid,
  onBlur: onFieldBlur,
}: {
  readonly id: string;
  readonly name?: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly ReferenceOption[];
  readonly recentValues?: readonly string[];
  readonly recentLimit?: number;
  readonly onClearRecent?: () => void;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly describedBy?: string;
  readonly locale?: string;
  readonly messages: SearchableSelectMessages;
  readonly onOpen?: () => void;
  readonly multipleValues?: readonly string[];
  readonly onMultipleChange?: (values: readonly string[]) => void;
  readonly status?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  readonly onBlur?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(-1);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 280,
  });
  const searchInput = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  const indexed = useMemo(
    () => indexReferenceOptions(options, locale),
    [options, locale],
  );
  const byKey = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const selected = byKey.get(value);
  const selectedKeys = new Set(multipleValues ?? [value]);
  const displayValue = multipleValues
    ? multipleValues.map((key) => byKey.get(key)?.label ?? key).join(", ")
    : (selected?.label ?? value);
  const recent = useMemo(
    () =>
      [...new Set(recentValues)].slice(0, recentLimit).flatMap((key) => {
        const option = byKey.get(key);
        return option ? [option] : [];
      }),
    [byKey, recentValues, recentLimit],
  );
  const matches = useMemo(
    () => searchIndexedReferenceOptions(indexed, query),
    [indexed, query],
  );
  const rows = query.trim()
    ? matches
    : [
        ...recent,
        ...matches.filter(
          (option) => !recent.some((item) => item.value === option.value),
        ),
      ];
  const activeOption = rows[active];
  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(-1);
  };
  const show = () => {
    if (disabled) return;
    onOpen?.();
    setQuery("");
    setOpen(true);
    const sorted = [
      ...recent,
      ...searchIndexedReferenceOptions(indexed, "").filter(
        (option) => !recent.some((item) => item.value === option.value),
      ),
    ];
    setActive(sorted.findIndex((option) => option.value === value));
  };
  const choose = (next: string) => {
    if (disabled || !byKey.has(next)) return;
    if (multipleValues && onMultipleChange) {
      onMultipleChange(
        selectedKeys.has(next)
          ? multipleValues.filter((key) => key !== next)
          : [...multipleValues, next],
      );
      searchInput.current?.focus();
      return;
    }
    onChange(next);
    close();
    input.current?.focus();
  };
  useEffect(() => {
    input.current?.setCustomValidity(
      required && !selected ? messages.required : "",
    );
  }, [required, selected, messages.required]);
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const document = root.current?.ownerDocument ?? globalThis.document;
    const window = document.defaultView ?? globalThis.window;
    // The top layer escapes clipping and transformed drawer containing blocks,
    // while the portal stays inside the modal for focus and accessibility.
    popup.current?.showPopover?.();
    const place = () => {
      const box = root.current!.getBoundingClientRect();
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight,
        offsetTop = viewport?.offsetTop ?? 0;
      const width = Math.min(
        box.width,
        (viewport?.width ?? window.innerWidth) - 16,
      );
      const below = Math.max(0, height + offsetTop - box.bottom - 8),
        above = Math.max(0, box.top - offsetTop - 8);
      const upwards = below < 240 && above > below;
      const maxHeight = Math.min(280, upwards ? above : below);
      setPosition({
        left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
        top: upwards
          ? box.top -
            Math.min(
              maxHeight,
              (popup.current?.scrollHeight ?? maxHeight) + 2,
            ) -
            4
          : box.bottom + 4,
        width,
        maxHeight,
      });
    };
    place();
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        close();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, rows.length]);
  useLayoutEffect(() => {
    if (!open || !activeOption || !list.current) return;
    const option = root.current?.ownerDocument.getElementById(`${id}-option-${active}`);
    if (!option) return;
    // Scroll only the popup: scrollIntoView can move the surrounding form.
    const row = option.getBoundingClientRect(),
      bounds = list.current.getBoundingClientRect();
    if (row.top < bounds.top + 1)
      list.current.scrollTop += row.top - bounds.top - 1;
    else if (row.bottom > bounds.bottom - 1)
      list.current.scrollTop += row.bottom - bounds.bottom + 1;
  }, [open, active, activeOption?.value, id, position.top, position.maxHeight]);
  const renderOption = (option: ReferenceOption, index: number) => (
    <div
      id={`${id}-option-${index}`}
      key={option.value}
      role="option"
      aria-selected={selectedKeys.has(option.value)}
      className="a-reference-select__option"
      data-active={index === active || undefined}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => choose(option.value)}
    >
      <span>{option.label}</span>
      <span className="a-reference-select__code">{option.value}</span>
      <span aria-hidden="true">
        {selectedKeys.has(option.value) ? <CheckIcon size={16} /> : null}
      </span>
    </div>
  );
  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);
  const recentCount = query.trim() ? 0 : recent.length;
  const dismiss = () => {
    close();
    input.current?.focus();
  };
  const keyboard = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      setActive((index) =>
        rows.length
          ? (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) %
            rows.length
          : -1,
      );
    } else if (
      open &&
      (event.key === "Home" || event.key === "End") &&
      event.ctrlKey
    ) {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : rows.length - 1);
    } else if (event.key === "Enter" || (!open && event.key === " ")) {
      event.preventDefault();
      if (!open) show();
      else if (activeOption) choose(activeOption.value);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
  };
  const blur = (event: React.FocusEvent) => {
    if (
      !root.current?.contains(event.relatedTarget as Node) &&
      !popup.current?.contains(event.relatedTarget as Node)
    ) {
      close();
      onFieldBlur?.();
    }
  };
  return (
    <div className="a-reference-select" ref={root}>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={multipleValues?.join(",") ?? value}
          disabled={disabled}
        />
      ) : null}
      <input
        className="a-input"
        ref={input}
        id={id}
        role="combobox"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-popup` : undefined}
        aria-required={required}
        aria-describedby={describedBy}
        required={required}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder ?? messages.search}
        value={displayValue}
        onClick={() => {
          if (!open) show();
        }}
        onBlur={blur}
        onChange={(event) => {
          show();
          setQuery(event.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={keyboard}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="a-reference-select__toggle"
        aria-label={label}
        aria-expanded={open}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) dismiss();
          else show();
        }}
      >
        <ChevronDownIcon size={18} />
      </button>
      {!required && (multipleValues ? multipleValues.length > 0 : value) ? (
        <button
          type="button"
          className="a-reference-select__clear"
          disabled={disabled}
          aria-label={messages.clear}
          onClick={() => {
            if (multipleValues) onMultipleChange?.([]);
            else onChange("");
            dismiss();
          }}
        >
          ×
        </button>
      ) : null}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popup}
              popover="manual"
              id={`${id}-popup`}
              role="dialog"
              aria-label={label}
              className="a-reference-select__popup"
              style={{ position: "fixed", ...position }}
              onBlur={blur}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  dismiss();
                }
              }}
            >
              <div className="a-reference-select__search">
                <input
                  ref={searchInput}
                  className="a-input"
                  type="text"
                  role="combobox"
                  aria-label={messages.search}
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={`${id}-options`}
                  aria-activedescendant={
                    activeOption ? `${id}-option-${active}` : undefined
                  }
                  placeholder={messages.search}
                  value={query}
                  autoComplete="off"
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                    setActive(0);
                  }}
                  onKeyDown={keyboard}
                />
              </div>
              <div
                ref={list}
                id={`${id}-options`}
                role="listbox"
                aria-multiselectable={multipleValues ? true : undefined}
                aria-label={label}
                className="a-reference-select__list"
              >
                {recentCount ? (
                  <div role="group" aria-label={messages.recent}>
                    <div
                      className="a-reference-select__group"
                      aria-hidden="true"
                    >
                      {messages.recent}
                    </div>
                    {rows.slice(0, recentCount).map(renderOption)}
                  </div>
                ) : null}
                <div
                  role="group"
                  aria-label={query.trim() ? messages.results : messages.all}
                >
                  {rows.length > recentCount ? (
                    <div
                      className="a-reference-select__group"
                      aria-hidden="true"
                    >
                      {query.trim() ? messages.results : messages.all}
                    </div>
                  ) : null}
                  {(() => {
                    const remaining = rows.slice(recentCount);
                    if (
                      query.trim() ||
                      !remaining.some((option) => option.group)
                    )
                      return remaining.map((option, index) =>
                        renderOption(option, index + recentCount),
                      );
                    const groups = new Map<
                      string,
                      { option: ReferenceOption; index: number }[]
                    >();
                    remaining.forEach((option, index) => {
                      const label = option.group ?? messages.all;
                      if (!groups.has(label)) groups.set(label, []);
                      groups
                        .get(label)!
                        .push({ option, index: index + recentCount });
                    });
                    return [...groups].map(([label, items]) => (
                      <div role="group" aria-label={label} key={label}>
                        <div
                          className="a-reference-select__group"
                          aria-hidden="true"
                        >
                          {label}
                        </div>
                        {items.map(({ option, index }) =>
                          renderOption(option, index),
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </div>
              {status ? (
                <p className="a-reference-select__empty" role="status">
                  {status}
                  {onRetry ? (
                    <button type="button" onClick={onRetry}>
                      {retryLabel}
                    </button>
                  ) : null}
                </p>
              ) : null}
              {!rows.length && !status ? (
                <p className="a-reference-select__empty">
                  {options.length ? messages.empty : messages.unavailable}
                </p>
              ) : null}
              {onClearRecent && recent.length ? (
                <button
                  type="button"
                  className="a-reference-select__clear-recent"
                  onClick={() => {
                    onClearRecent();
                    searchInput.current?.focus();
                  }}
                >
                  {messages.clearRecent}
                </button>
              ) : null}
            </div>,
            root.current?.closest('[aria-modal="true"], dialog') ??
              root.current?.ownerDocument.body ?? document.body,
          )
        : null}
      <span
        className="a-reference-select__status"
        role="status"
        aria-live="polite"
      >
        {open
          ? rows.length
            ? `${messages.results}: ${rows.length}`
            : options.length
              ? messages.empty
              : messages.unavailable
          : ""}
      </span>
    </div>
  );
}
