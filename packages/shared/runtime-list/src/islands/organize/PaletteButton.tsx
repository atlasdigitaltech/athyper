"use client";

import { forwardRef } from "react";
import type { ComponentType, SVGProps } from "react";

interface PaletteButtonProps {
  icon:       ComponentType<SVGProps<SVGSVGElement>>;
  label:      string;
  active?:    boolean;
  badge?:     number;
  dirty?:     boolean;
  disabled?:  boolean;
  expanded?:  boolean;
  size?:      "default" | "compact";
  chrome?:    "default" | "plain";
  onClick?:   () => void;
}

export const PaletteButton = forwardRef<HTMLButtonElement, PaletteButtonProps>(function PaletteButton(
  {
    icon: Icon,
    label,
    active = false,
    badge,
    dirty = false,
    disabled = false,
    expanded,
    size = "default",
    chrome = "default",
    onClick,
  },
  ref,
) {
  const showBadge = typeof badge === "number" && badge > 0;
  const showDirty = dirty && !showBadge;
  const highlighted = active || expanded;
  const buttonSize = size === "compact" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "compact" ? "size-5" : "size-4";
  const inactiveClass = chrome === "plain"
    ? "border-0 bg-transparent text-muted-foreground hover:text-foreground"
    : "border-0 bg-transparent text-muted-foreground hover:text-foreground";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={[
        "relative inline-flex shrink-0 items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        buttonSize,
        highlighted
          ? "border border-primary/30 bg-primary/10 text-primary shadow-sm"
          : inactiveClass,
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].filter(Boolean).join(" ")}
    >
      <Icon aria-hidden="true" className={iconSize} />
      {showBadge && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-xs font-medium leading-4 text-primary-foreground">
          {badge}
        </span>
      )}
      {showDirty && (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background" />
      )}
    </button>
  );
});
