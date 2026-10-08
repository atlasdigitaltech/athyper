"use client";
import React, { useRef, type ReactNode } from "react";

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

/** Single choice among two to four options (sort direction, layout, density).
 * A radio group with one tab stop; arrow keys, Home and End move and select,
 * honouring RTL. Use `SearchableSelect` for longer or data-driven lists. */
export function SegmentedControl<V extends string>({
  label,
  labelledBy,
  value,
  options,
  onValueChange,
  disabled = false,
  className,
  describedBy,
}: {
  readonly label?: string;
  readonly labelledBy?: string;
  readonly value: V;
  readonly options: readonly SegmentedOption<V>[];
  readonly onValueChange: (value: V) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Id of text that explains the group, such as why some options are
   * unavailable. Disabled options are not focusable, so the reason belongs to
   * the group rather than to an option. */
  readonly describedBy?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const enabled = options.filter((option) => !disabled && !option.disabled);
  const focusTarget = enabled.some((option) => option.value === value) ? value : enabled[0]?.value;
  const select = (next: SegmentedOption<V>) => {
    onValueChange(next.value);
    root.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [options.indexOf(next)]?.focus();
  };
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className={className ? `a-segmented ${className}` : "a-segmented"}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === focusTarget ? 0 : -1}
          disabled={disabled || option.disabled}
          onClick={() => onValueChange(option.value)}
          onKeyDown={(event) => {
            const rtl = event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
            const position = enabled.indexOf(option);
            const step =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? rtl && event.key === "ArrowRight" ? -1 : 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? rtl && event.key === "ArrowLeft" ? 1 : -1
                  : 0;
            const next =
              event.key === "Home"
                ? enabled[0]
                : event.key === "End"
                  ? enabled.at(-1)
                  : step
                    ? enabled[(position + step + enabled.length) % enabled.length]
                    : undefined;
            if (!next) return;
            event.preventDefault();
            select(next);
          }}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
