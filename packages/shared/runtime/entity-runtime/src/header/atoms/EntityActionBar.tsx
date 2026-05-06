"use client";

import { Fragment } from "react";
import { Loader2, ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@athyper/ui/primitives";
import { getActionIcon } from "@athyper/icons";
import type { HeaderAction } from "../types";

export interface EntityActionBarProps {
  actions: HeaderAction[];
  /** Called after action.onSelect() fires. Use for cross-cutting concerns (telemetry, logging). */
  onAction?: (id: string) => void;
  /**
   * When true: renders only primary actions + a single "⋯" icon dropdown containing
   * all secondary/overflow/danger items. Used for the mobile header row.
   */
  compact?: boolean;
  className?: string;
}

// ── Primary action button ─────────────────────────────────────────────────

function ActionButton({ action, onAction }: { action: HeaderAction; onAction?: (id: string) => void }) {
  const Icon = action.icon ? getActionIcon(action.icon) : null;
  const isDanger = action.placement === "danger";

  const btn = (
    <button
      type="button"
      // pending uses aria-busy + pointer-events-none, not HTML disabled
      disabled={action.disabled}
      aria-busy={action.pending || undefined}
      onClick={() => { action.onSelect?.(); onAction?.(action.id); }}
      className={cn(
        "inline-flex items-center gap-[7px] h-8 px-3.5 rounded-lg text-xs font-semibold tracking-wider leading-none whitespace-nowrap transition-opacity",
        isDanger
          ? "bg-destructive text-destructive-foreground hover:opacity-90"
          : "bg-foreground text-background hover:opacity-85",
        action.disabled && "opacity-40",
        action.pending && "opacity-40 pointer-events-none",
      )}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-background/60 flex-none" />
      {action.pending
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : Icon && <Icon className="h-3 w-3" />}
      {action.label}
    </button>
  );

  // Disabled buttons suppress mouse events; wrap in span so tooltip can fire.
  if (action.disabled && action.disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="cursor-not-allowed inline-flex">
              {btn}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {action.disabledReason}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return btn;
}

// ── Secondary action button ───────────────────────────────────────────────

function SecondaryButton({ action, onAction }: { action: HeaderAction; onAction?: (id: string) => void }) {
  const btn = (
    <button
      type="button"
      disabled={action.disabled}
      aria-busy={action.pending || undefined}
      onClick={() => { action.onSelect?.(); onAction?.(action.id); }}
      className={cn(
        "h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground border border-border bg-card hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap",
        action.disabled && "opacity-40",
        action.pending && "opacity-40 pointer-events-none",
      )}
    >
      {action.pending ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
      {action.label}
    </button>
  );

  if (action.disabled && action.disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="cursor-not-allowed inline-flex">
              {btn}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {action.disabledReason}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return btn;
}

// ── Overflow groups ───────────────────────────────────────────────────────

function OverflowItem({
  action,
  destructive = false,
  onAction,
  className,
}: {
  action:       HeaderAction;
  destructive?: boolean;
  onAction?:    (id: string) => void;
  className?:   string;
}) {
  const Icon = action.icon ? getActionIcon(action.icon) : null;
  return (
    <DropdownMenuItem
      key={action.id}
      disabled={action.disabled || action.pending}
      onClick={() => { action.onSelect?.(); onAction?.(action.id); }}
      className={cn(
        destructive ? "text-xs gap-2 text-destructive focus:text-destructive" : "text-xs gap-2",
        className,
      )}
    >
      {Icon && <Icon className={`h-3.5 w-3.5 ${destructive ? "" : "text-muted-foreground"}`} />}
      {action.label}
    </DropdownMenuItem>
  );
}

function OverflowGroups({
  overflow,
  danger,
  onAction,
}: {
  overflow: HeaderAction[];
  danger:   HeaderAction[];
  onAction?: (id: string) => void;
}) {
  const lifecycle = overflow.filter(a => a.group === "lifecycle");
  const record    = overflow.filter(a => a.group === "record");
  const general   = overflow.filter(a => !a.group);

  // Build ordered sections — skip empties; inject separators between them
  const sections: { items: HeaderAction[]; label?: string; destructive?: boolean }[] = [
    { items: lifecycle },
    { items: general },
    { items: record, label: record.length > 0 && (lifecycle.length > 0 || general.length > 0) ? "Record" : undefined },
    { items: danger, destructive: true },
  ].filter(s => s.items.length > 0);

  return (
    <>
      {sections.map((section, i) => (
        <Fragment key={i}>
          {i > 0 && <DropdownMenuSeparator />}
          {section.label && (
            <DropdownMenuLabel className="text-[10px] text-muted-foreground/50 px-2 py-1 font-medium uppercase tracking-wider">
              {section.label}
            </DropdownMenuLabel>
          )}
          {section.items.map(a => (
            <OverflowItem key={a.id} action={a} destructive={section.destructive} onAction={onAction} />
          ))}
        </Fragment>
      ))}
    </>
  );
}

// ── Main bar ──────────────────────────────────────────────────────────────

export function EntityActionBar({ actions, onAction, compact = false, className }: EntityActionBarProps) {
  const sorted = [...actions].sort((a, b) => a.order - b.order);
  const primary   = sorted.filter(a => a.placement === "primary");
  const secondary = sorted.filter(a => a.placement === "secondary");
  const overflow  = sorted.filter(a => a.placement === "overflow");
  const danger    = sorted.filter(a => a.placement === "danger");

  if (sorted.length === 0) return null;

  // compact mode: all non-primary items go into a single ⋯ icon dropdown.
  // Used for the mobile identity bar row — keeps row 1 tight.
  if (compact) {
    const moreItems = [...secondary, ...overflow, ...danger];
    return (
      <div className={cn("flex items-center gap-1.5 shrink-0", className)}>
        {primary.map(a => <ActionButton key={a.id} action={a} onAction={onAction} />)}
        {moreItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 px-0 flex items-center justify-center shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[168px]">
              <OverflowGroups overflow={[...secondary, ...overflow]} danger={danger} onAction={onAction} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  // Default mode: secondary buttons visible on desktop (md+), hidden on tablet/mobile.
  // On tablet/mobile they move into the More dropdown instead.
  const hasOverflowOrDanger = overflow.length > 0 || danger.length > 0;
  const showMore = secondary.length > 0 || hasOverflowOrDanger;
  // When there are only secondary items (no overflow/danger), the More button is
  // redundant on desktop because the secondary buttons are already visible there.
  const moreHiddenOnDesktop = !hasOverflowOrDanger && secondary.length > 0;

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {primary.map(a => <ActionButton key={a.id} action={a} onAction={onAction} />)}

      {/* Secondary: visible on desktop, hidden on tablet/mobile */}
      {secondary.map(a => (
        <span key={a.id} className="hidden md:inline-flex">
          <SecondaryButton action={a} onAction={onAction} />
        </span>
      ))}

      {showMore && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 px-2.5 gap-1 text-xs", moreHiddenOnDesktop && "md:hidden")}
            >
              More
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[168px]">
            {/* Secondary items: only visible in dropdown on tablet/mobile (< md) */}
            {secondary.length > 0 && secondary.map(a => (
              <OverflowItem key={a.id} action={a} onAction={onAction} className="md:hidden" />
            ))}
            {secondary.length > 0 && hasOverflowOrDanger && (
              <DropdownMenuSeparator className="md:hidden" />
            )}
            <OverflowGroups overflow={overflow} danger={danger} onAction={onAction} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
