"use client";
import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "@athyper/platform-icons";
import { useUiMessages } from "./ui-messages";

export interface ChoiceOption<V extends string = string> {
  readonly value: V;
  readonly label: string;
  /** Options that share a group are listed under its heading, in first-seen order. */
  readonly group?: string;
  readonly disabled?: boolean;
}

export interface ChoiceSelectProps<V extends string = string> {
  readonly value: V | "";
  readonly options: readonly ChoiceOption<V>[];
  readonly onChange: (value: V) => void;
  readonly id?: string;
  /** Accessible name when no `<label>` names the control. */
  readonly label?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** Submits the value with a surrounding form. */
  readonly name?: string;
  readonly title?: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}

const TYPEAHEAD_MS = 500;

/**
 * One choice from a short list, the design-system replacement for a native
 * select element (ARIA select-only combobox). Focus stays on the button; the
 * listbox opens in the top layer so panels and dialogs never clip it. Use
 * SegmentedControl for two to four visible options and SearchableSelect for
 * long or server-backed lists.
 */
export function ChoiceSelect<V extends string = string>({
  value,
  options,
  onChange,
  id: suppliedId,
  label,
  placeholder,
  disabled = false,
  required = false,
  name,
  title,
  autoFocus,
  className = "",
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: ChoiceSelectProps<V>): ReactNode {
  const generated = useId();
  const id = suppliedId ?? generated;
  const listId = `${id}-listbox`;
  const messages = useUiMessages();
  const trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null),
    typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const groups = useMemo(() => {
    const ordered = new Map<
      string | undefined,
      { option: ChoiceOption<V>; index: number }[]
    >();
    options.forEach((option, index) => {
      const rows = ordered.get(option.group) ?? [];
      rows.push({ option, index });
      ordered.set(option.group, rows);
    });
    return [...ordered];
  }, [options]);

  const enabled = (index: number) =>
    index >= 0 && index < options.length && !options[index]!.disabled;
  const step = (from: number, delta: 1 | -1) => {
    for (
      let index = from + delta;
      index >= 0 && index < options.length;
      index += delta
    )
      if (enabled(index)) return index;
    return from;
  };
  const first = () => step(-1, 1),
    last = () => step(options.length, -1);
  const show = (index = enabled(selectedIndex) ? selectedIndex : first()) => {
    if (disabled) return;
    setActive(index);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const choose = (index: number) => {
    if (!enabled(index)) return;
    close();
    const document = trigger.current?.ownerDocument,
      before = document?.activeElement;
    if (options[index]!.value !== value) onChange(options[index]!.value);
    // Return focus to the button unless the change moved it on purpose
    // (section navigation focuses the chosen section).
    const after = document?.activeElement;
    if (after === before || !after || after === document?.body)
      trigger.current?.focus();
  };
  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = {
      text:
        now - typed.current.at > TYPEAHEAD_MS ? key : typed.current.text + key,
      at: now,
    };
    const text = typed.current.text.toLocaleLowerCase();
    const start = open ? active : selectedIndex;
    const order = [...options.keys()].map(
      (offset) => (start + 1 + offset) % options.length,
    );
    const match = order.find(
      (index) =>
        enabled(index) &&
        options[index]!.label.toLocaleLowerCase().startsWith(text),
    );
    if (match === undefined) return;
    if (open) setActive(match);
    else if (options[match]!.value !== value) onChange(options[match]!.value);
  };

  const keyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (!open) {
      if (
        key === "ArrowDown" ||
        key === "ArrowUp" ||
        key === "Enter" ||
        key === " "
      ) {
        event.preventDefault();
        show();
      } else if (key === "Home" || key === "End") {
        event.preventDefault();
        show(key === "Home" ? first() : last());
      } else if (
        key.length === 1 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      )
        typeahead(key);
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => step(index, key === "ArrowDown" ? 1 : -1));
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      setActive(key === "Home" ? first() : last());
    } else if (key === "PageDown" || key === "PageUp") {
      event.preventDefault();
      setActive((index) => {
        let next = index;
        for (let count = 0; count < 10; count += 1)
          next = step(next, key === "PageDown" ? 1 : -1);
        return next;
      });
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      choose(active);
    } else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (key === "Tab") {
      // Select-only combobox: Tab accepts the highlighted option and moves on.
      if (enabled(active) && options[active]!.value !== value)
        onChange(options[active]!.value);
      close();
    } else if (
      key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    )
      typeahead(key);
  };

  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  // Position in the top layer beside the button; the position is dynamic, so it
  // is written to the element instead of an inline style prop.
  useLayoutEffect(() => {
    const element = popup.current,
      anchor = trigger.current;
    if (!open || !element || !anchor) return;
    const document = anchor.ownerDocument,
      view = document.defaultView ?? window;
    element.showPopover?.();
    const place = () => {
      const box = anchor.getBoundingClientRect();
      const viewport = view.visualViewport;
      const height = viewport?.height ?? view.innerHeight,
        width = viewport?.width ?? view.innerWidth,
        offsetTop = viewport?.offsetTop ?? 0;
      const below = Math.max(0, height + offsetTop - box.bottom - 8),
        above = Math.max(0, box.top - offsetTop - 8);
      const upwards = below < 200 && above > below;
      const maxHeight = Math.min(320, upwards ? above : below);
      const popupWidth = Math.min(
        Math.max(box.width, element.scrollWidth),
        width - 16,
      );
      const content = Math.min(maxHeight, element.scrollHeight + 2);
      element.style.setProperty(
        "--choice-left",
        `${Math.max(8, Math.min(box.left, width - popupWidth - 8))}px`,
      );
      element.style.setProperty(
        "--choice-top",
        `${upwards ? box.top - content - 4 : box.bottom + 4}px`,
      );
      element.style.setProperty("--choice-width", `${popupWidth}px`);
      element.style.setProperty("--choice-max-height", `${maxHeight}px`);
    };
    place();
    const outside = (event: PointerEvent) => {
      if (
        !anchor.contains(event.target as Node) &&
        !element.contains(event.target as Node)
      )
        close();
    };
    view.addEventListener("resize", place);
    view.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      view.removeEventListener("resize", place);
      view.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  // Keep the highlighted option in view without scrolling the surrounding page.
  useLayoutEffect(() => {
    if (!open || active < 0 || !popup.current) return;
    const row = popup.current.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    if (!row) return;
    const list = popup.current.getBoundingClientRect(),
      box = row.getBoundingClientRect();
    if (box.top < list.top) popup.current.scrollTop += box.top - list.top;
    else if (box.bottom > list.bottom)
      popup.current.scrollTop += box.bottom - list.bottom;
  }, [open, active]);

  const renderOption = ({
    option,
    index,
  }: {
    option: ChoiceOption<V>;
    index: number;
  }) => (
    <div
      key={option.value}
      id={`${id}-option-${index}`}
      data-index={index}
      data-value={option.value}
      role="option"
      aria-selected={option.value === value}
      aria-disabled={option.disabled || undefined}
      data-active={index === active || undefined}
      className="a-reference-select__option a-choice-select__option"
      onPointerDown={(event) => event.preventDefault()}
      onPointerMove={() => {
        if (enabled(index) && index !== active) setActive(index);
      }}
      onClick={() => choose(index)}
    >
      <span>{option.label}</span>
      <span aria-hidden="true">
        {option.value === value ? <CheckIcon size={16} /> : null}
      </span>
    </div>
  );
  const host =
    trigger.current?.closest('[aria-modal="true"], dialog') ??
    trigger.current?.ownerDocument.body;
  // The listbox takes the control's name: the label prop or its <label> element.
  const labelText = trigger.current?.labels?.[0]?.textContent ?? "";
  const listName =
    label ??
    (labelText.replace(trigger.current?.textContent ?? "", "").trim() ||
      undefined);

  return (
    <span className={`a-choice-select ${className}`.trim()}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        className="a-input a-choice-select__trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-required={required || undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        data-placeholder={selected ? undefined : ""}
        disabled={disabled}
        title={title}
        autoFocus={autoFocus}
        onClick={() => (open ? close() : show())}
        onKeyDown={keyboard}
        onBlur={(event) => {
          if (!popup.current?.contains(event.relatedTarget as Node)) close();
        }}
      >
        <span className="a-choice-select__value">
          {selected?.label ?? placeholder ?? messages.selectOption}
        </span>
        <ChevronDownIcon size={16} aria-hidden="true" />
      </button>
      {name ? (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      ) : null}
      {required ? (
        // Takes part in native form validation and hands focus to the button.
        <input
          className="a-choice-select__validity"
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => undefined}
          onFocus={() => trigger.current?.focus()}
        />
      ) : null}
      {open && host
        ? createPortal(
            <div
              ref={popup}
              popover="manual"
              id={listId}
              role="listbox"
              aria-label={listName}
              className="a-reference-select__popup a-choice-select__popup"
            >
              {groups.map(([group, rows], position) =>
                group === undefined ? (
                  rows.map(renderOption)
                ) : (
                  <div
                    key={`${position}-${group}`}
                    role="group"
                    aria-label={group}
                  >
                    <div
                      className="a-reference-select__group"
                      aria-hidden="true"
                    >
                      {group}
                    </div>
                    {rows.map(renderOption)}
                  </div>
                ),
              )}
            </div>,
            host,
          )
        : null}
    </span>
  );
}
