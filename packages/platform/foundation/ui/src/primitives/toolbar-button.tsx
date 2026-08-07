import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface ToolbarButtonProps {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

const BASE_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-lg border bg-background px-3 text-sm font-medium text-foreground transition-colors " +
  "hover:bg-accent hover:text-accent-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function ToolbarButton({ href, onClick, children, disabled, className }: ToolbarButtonProps) {
  if (href) {
    // Keep href so the element stays in tab order and retains focus styling.
    // aria-disabled + tabIndex=-1 + pointer-events-none is the accessible
    // disabled pattern for anchors (removing href breaks keyboard nav).
    return (
      <a
        href={href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={cn(BASE_CLASS, disabled && "pointer-events-none opacity-50", className)}
        onClick={disabled ? (e) => e.preventDefault() : undefined}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(BASE_CLASS, "disabled:pointer-events-none disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}
