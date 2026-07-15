"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { SelectionAction } from "./types";
import { BadgePill, partitionActions } from "./internals";

interface MobileSheetProps {
  count:   number;
  noun:    { singular: string; plural: string };
  actions: SelectionAction[];
  onClear: () => void;
  busy:    boolean;
  firstActionRef: React.RefObject<HTMLButtonElement | null>;
  testId?: string;
}

export function MobileSheet({
  count,
  noun,
  actions,
  onClear,
  busy,
  firstActionRef,
  testId,
}: MobileSheetProps) {
  const visibleActions = actions.filter((a) => !a.hidden);
  const { primary, secondary } = partitionActions(visibleActions);
  const ordered = [...primary, ...secondary];

  // Focus trap for the mobile sheet (modal semantics).
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    sheet.addEventListener("keydown", onKey);
    return () => sheet.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${count} ${count === 1 ? noun.singular : noun.plural} selected`}
      data-testid={testId}
      className="pointer-events-auto fixed inset-0 z-fixed sm:hidden"
      onClick={onClear}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 animate-fade-in"
      />
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-0 left-0 right-0 overflow-hidden",
          "rounded-t-2xl border-t border-border bg-background shadow-2xl",
          "animate-slide-in-up",
        )}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-border/60" aria-hidden="true" />
        </div>
        <div
          aria-live="polite"
          className="border-b border-border/40 px-5 py-3 text-sm font-medium text-foreground"
        >
          {count} {count === 1 ? noun.singular : noun.plural} selected
        </div>

        <div className="divide-y divide-border/40 max-h-[60vh] overflow-y-auto">
          {ordered.flatMap((action) => action.items?.length
            ? action.items.map((item) => ({ ...item, id: `${action.id}:${item.id}` }))
            : [action]).map((action, idx) => {
            const Icon = action.icon;
            const disabled = action.disabled || action.busy || busy;
            return (
              <button
                ref={idx === 0 ? firstActionRef : undefined}
                key={action.id}
                type="button"
                onClick={() => void action.onSelect()}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium",
                  "active:bg-muted/60",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  action.variant === "destructive"
                    ? "text-destructive active:bg-destructive/10"
                    : "text-foreground",
                )}
              >
                {action.busy
                  ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                  : Icon
                  ? <Icon aria-hidden="true"
                          className={cn(
                            "h-5 w-5",
                            action.variant === "destructive" ? "" : "text-muted-foreground",
                          )} />
                  : null}
                <span className="flex-1 text-left">{action.label}</span>
                {action.badge && <BadgePill tone={action.badgeTone}>{action.badge}</BadgePill>}
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-8 pt-2">
          <button
            type="button"
            onClick={onClear}
            className={cn(
              "h-12 w-full rounded-xl border border-border/60 text-sm font-medium",
              "text-muted-foreground active:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
