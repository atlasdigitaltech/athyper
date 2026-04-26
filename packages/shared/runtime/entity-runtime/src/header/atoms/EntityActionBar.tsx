"use client";

import { Loader2, ChevronDown } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
        "inline-flex items-center gap-[7px] h-[34px] px-3.5 rounded-lg text-xs font-semibold tracking-wider leading-none whitespace-nowrap transition-opacity",
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
        "h-[34px] px-3 rounded-lg text-xs font-medium text-muted-foreground border border-border bg-card hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap",
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

// ── Main bar ──────────────────────────────────────────────────────────────

export function EntityActionBar({ actions, onAction, className }: EntityActionBarProps) {
  const sorted = [...actions].sort((a, b) => a.order - b.order);
  const primary   = sorted.filter(a => a.placement === "primary");
  const secondary = sorted.filter(a => a.placement === "secondary");
  const overflow  = sorted.filter(a => a.placement === "overflow");
  const danger    = sorted.filter(a => a.placement === "danger");
  const inMenu    = [...overflow, ...danger];

  if (sorted.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {primary.map(a => <ActionButton key={a.id} action={a} onAction={onAction} />)}
      {secondary.map(a => <SecondaryButton key={a.id} action={a} onAction={onAction} />)}

      {inMenu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-[34px] px-2.5 gap-1 text-xs">
              More
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {overflow.map(a => {
              const Icon = a.icon ? getActionIcon(a.icon) : null;
              return (
                <DropdownMenuItem
                  key={a.id}
                  disabled={a.disabled || a.pending}
                  onClick={() => { a.onSelect?.(); onAction?.(a.id); }}
                  className="text-xs gap-2"
                >
                  {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                  {a.label}
                </DropdownMenuItem>
              );
            })}
            {overflow.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
            {danger.map(a => {
              const Icon = a.icon ? getActionIcon(a.icon) : null;
              return (
                <DropdownMenuItem
                  key={a.id}
                  disabled={a.disabled || a.pending}
                  onClick={() => { a.onSelect?.(); onAction?.(a.id); }}
                  className="text-xs gap-2 text-destructive focus:text-destructive"
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {a.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
