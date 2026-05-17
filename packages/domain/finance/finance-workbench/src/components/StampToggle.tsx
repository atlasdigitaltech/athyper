"use client";

import type { ReactNode } from "react";
import { cn } from "@athyper/theme/utils";

export interface StampToggleProps {
  label: string;
  pressed: boolean;
  icon?: ReactNode;
  activeText?: string;
  inactiveText?: string;
  className?: string;
  onPressedChange?: (pressed: boolean) => void;
}

const stampBaseClass =
  "flex min-h-20 items-center justify-center rounded-md border px-3 py-3 text-center transition-colors";

function StampContent({
  icon,
  label,
  pressed,
  activeText = "ON",
  inactiveText = "OFF",
}: Pick<StampToggleProps, "icon" | "label" | "pressed" | "activeText" | "inactiveText">) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-2">
      {icon && <span className="text-current">{icon}</span>}
      <span className="text-doc-label font-semibold uppercase text-current">
        {label}
      </span>
      <span className="text-doc-support font-semibold uppercase text-current opacity-70">
        {pressed ? activeText : inactiveText}
      </span>
    </span>
  );
}

export function StampToggle({
  label,
  pressed,
  icon,
  activeText,
  inactiveText,
  className,
  onPressedChange,
}: StampToggleProps) {
  const stateClass = pressed
    ? "border-warning/70 bg-warning/10 text-warning ring-1 ring-inset ring-warning/30"
    : "border-dashed border-border bg-background text-muted-foreground";

  if (onPressedChange) {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        className={cn(stampBaseClass, stateClass, "hover:bg-warning/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)}
        onClick={() => onPressedChange(!pressed)}
      >
        <StampContent
          icon={icon}
          label={label}
          pressed={pressed}
          activeText={activeText}
          inactiveText={inactiveText}
        />
      </button>
    );
  }

  return (
    <div className={cn(stampBaseClass, stateClass, className)}>
      <StampContent
        icon={icon}
        label={label}
        pressed={pressed}
        activeText={activeText}
        inactiveText={inactiveText}
      />
    </div>
  );
}
