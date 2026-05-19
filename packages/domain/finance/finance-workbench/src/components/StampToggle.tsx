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
    <span className="flex min-w-0 flex-col items-center gap-1.5">
      {icon && (
        <span className={cn(
          "flex size-7 items-center justify-center rounded-lg",
          pressed ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}>
          {icon}
        </span>
      )}
      <span className="text-doc-label font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <span className={cn(
        "text-doc-subtitle font-semibold",
        pressed ? "text-foreground" : "text-muted-foreground",
      )}>
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
    ? "border-border bg-muted/20 text-foreground shadow-sm"
    : "border-dashed border-border bg-background text-muted-foreground";

  if (onPressedChange) {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        className={cn(stampBaseClass, stateClass, "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)}
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
