"use client";
import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { SegmentedControl, type SegmentedOption } from "./segmented-control";

/** Compact view settings: an icon trigger and a small popover of switches and choices,
 * shared by the record navigation and side panels. It closes on an outside pointer and on
 * Escape (returning focus to the trigger) before any surrounding panel handles Escape.
 * `indicator` marks a trigger whose settings currently hide something. */
export function SettingsMenu({
  label,
  icon,
  indicator = false,
  className = "",
  children,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly indicator?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const titleId = useId();
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target))
        menu.current.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={menu}
      className={`a-settings-menu ${className}`}
      data-indicator={indicator || undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !menu.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        menu.current.removeAttribute("open");
        menu.current.querySelector<HTMLElement>("summary")?.focus();
      }}
    >
      <summary aria-label={label} title={label}>{icon}</summary>
      <div className="a-settings-menu__panel" role="group" aria-labelledby={titleId}>
        <p id={titleId} className="a-settings-menu__title">{label}</p>
        {children}
      </div>
    </details>
  );
}

/** An on/off setting. `closeOnChange` closes the menu for settings that change the view. */
export function SettingsSwitch({
  label,
  description,
  checked,
  disabled = false,
  closeOnChange = false,
  onCheckedChange,
}: {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly closeOnChange?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="a-settings-menu__switch"
      onClick={(event) => {
        onCheckedChange?.(!checked);
        if (closeOnChange) event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      <span className="a-settings-menu__copy">
        {label}
        {description ? <small>{description}</small> : null}
      </span>
      <span className="a-settings-menu__track" aria-hidden="true" />
    </button>
  );
}

/** One choice among two to four options, labelled inside the menu. */
export function SettingsChoice<V extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  readonly label: string;
  readonly value: V;
  readonly options: readonly SegmentedOption<V>[];
  readonly onValueChange: (value: V) => void;
}) {
  const labelId = useId();
  return (
    <div className="a-settings-menu__choice">
      <span id={labelId}>{label}</span>
      <SegmentedControl labelledBy={labelId} value={value} options={options} onValueChange={onValueChange} />
    </div>
  );
}
