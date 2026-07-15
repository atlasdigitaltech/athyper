"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../primitives/dropdown-menu";
import type { SelectionAction } from "./types";
import { ActionButton, BadgePill, partitionActions } from "./internals";

interface DesktopPillProps {
  count:      number;
  noun:       { singular: string; plural: string };
  actions:    SelectionAction[];
  onClear:    () => void;
  busy:       boolean;
  firstActionRef: React.RefObject<HTMLButtonElement | null>;
  testId?:    string;
}

const MAX_WIDTH_PX = 720;

export function DesktopPill({
  count,
  noun,
  actions,
  onClear,
  busy,
  firstActionRef,
  testId,
}: DesktopPillProps) {
  const visibleActions = actions.filter((a) => !a.hidden);
  const { primary, secondary } = partitionActions(visibleActions);

  // Overflow collapse: if the rendered pill width would exceed the threshold,
  // tuck secondary actions into a "More" dropdown. We measure on mount and on
  // resize; the unobserved-DOM cost is small because there's at most one bar.
  const pillRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const check = () => {
      // Force-render expanded first to measure the natural width, then
      // collapse if it overflows. The `data-measuring` attribute lets us
      // suppress the visual change while measuring.
      el.dataset.measuring = "true";
      setCollapsed(false);
      requestAnimationFrame(() => {
        const width = el.scrollWidth;
        const threshold = Math.min(MAX_WIDTH_PX, window.innerWidth * 0.9);
        setCollapsed(width > threshold && secondary.length > 0);
        delete el.dataset.measuring;
      });
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [secondary.length, primary.length, count]);

  const renderedSecondary = collapsed ? [] : secondary;
  const overflowSecondary = collapsed ? secondary : [];

  return (
    <div
      ref={pillRef}
      role="region"
      aria-label={`${count} ${count === 1 ? noun.singular : noun.plural} selected`}
      data-testid={testId}
      data-busy={busy ? "true" : undefined}
      className={cn(
        "pointer-events-auto hidden sm:flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-2",
        "shadow-lg ring-1 ring-border/20",
        "animate-slide-in-up",
        busy && "ring-2 ring-primary/30",
      )}
    >
      <span
        aria-live="polite"
        className={cn(
          "px-2 text-xs font-medium text-foreground whitespace-nowrap",
          "transition-colors",
        )}
        data-floating-selection-count
        key={count}
      >
        {count} {count === 1 ? noun.singular : noun.plural} selected
      </span>

      {primary.length > 0 && <Separator />}

      {primary.map((action, idx) => (
        <Fragment key={action.id}>
          <ActionButton
            action={action}
            busy={busy}
            ref={idx === 0 ? firstActionRef : undefined}
          />
        </Fragment>
      ))}

      {renderedSecondary.length > 0 && <Separator />}

      {renderedSecondary.map((action) => (
        <ActionButton key={action.id} action={action} busy={busy} />
      ))}

      {overflowSecondary.length > 0 && (
        <>
          <Separator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                disabled={busy}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium",
                  "text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              {overflowSecondary.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled || action.busy || busy}
                  onSelect={() => void action.onSelect()}
                  className={cn(
                    action.variant === "destructive" && "text-destructive focus:text-destructive",
                  )}
                >
                  {action.icon && <action.icon className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{action.label}</span>
                  {action.badge && <BadgePill tone={action.badgeTone}>{action.badge}</BadgePill>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <Separator />

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className={cn(
          "rounded-md px-2 py-1.5 text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Separator() {
  return <span aria-hidden="true" className="h-4 w-px bg-border/50" />;
}

