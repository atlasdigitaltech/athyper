"use client";

import { forwardRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { SelectionAction, SelectionBadgeTone } from "./types";

export function partitionActions(actions: SelectionAction[]): {
  primary:   SelectionAction[];
  secondary: SelectionAction[];
} {
  const primary:   SelectionAction[] = [];
  const secondary: SelectionAction[] = [];
  for (const a of actions) {
    if ((a.group ?? "secondary") === "primary") primary.push(a);
    else secondary.push(a);
  }
  return { primary, secondary };
}

interface ActionButtonProps {
  action: SelectionAction;
  busy:   boolean;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton({ action, busy }, ref) {
    const Icon = action.icon;
    const disabled = action.disabled || action.busy || busy;
    const shortcutLabel = action.shortcut ? formatShortcut(action.shortcut) : undefined;

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => void action.onSelect()}
        disabled={disabled}
        aria-keyshortcuts={shortcutLabel}
        title={shortcutLabel ? `${action.label} (${shortcutLabel})` : action.label}
        data-action-id={action.id}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          action.variant === "destructive"
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-muted",
        )}
      >
        {action.busy
          ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          : Icon
          ? <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          : null}
        <span>{action.label}</span>
        {action.badge && <BadgePill tone={action.badgeTone}>{action.badge}</BadgePill>}
      </button>
    );
  },
);

interface BadgePillProps {
  tone?:    SelectionBadgeTone;
  children: ReactNode;
}

export function BadgePill({ tone = "neutral", children }: BadgePillProps) {
  return (
    <span
      className={cn(
        "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "warning" && "bg-warning/15 text-warning-foreground",
        tone === "error"   && "bg-destructive/15 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function formatShortcut(shortcut: NonNullable<SelectionAction["shortcut"]>): string {
  const parts: string[] = [];
  if (shortcut.ctrl)  parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt)   parts.push("Alt");
  parts.push(shortcut.key.toUpperCase());
  return parts.join("+");
}
