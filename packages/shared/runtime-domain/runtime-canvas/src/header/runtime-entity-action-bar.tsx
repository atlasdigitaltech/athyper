"use client";

import { Fragment } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { getActionIcon } from "@athyper/icons";
import { cn } from "@athyper/theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@athyper/ui/primitives";
import type { HeaderAction } from "./types";
import {
  headerDangerActionClass,
  headerIconButtonClass,
  headerPrimaryActionClass,
} from "./header-chrome";
import { RuntimeRecordMoreMenu } from "./runtime-record-more-menu";

export interface RuntimeEntityActionBarProps {
  actions: HeaderAction[];
  onAction?: (id: string) => void;
  compact?: boolean;
  className?: string;
}

function runAction(action: HeaderAction, onAction?: (id: string) => void) {
  void action.onSelect?.();
  onAction?.(action.id);
}

function ActionButton({ action, onAction }: { action: HeaderAction; onAction?: (id: string) => void }) {
  const Icon = action.icon ? getActionIcon(action.icon) : null;
  const isDanger = action.placement === "danger";

  const btn = (
    <button
      type="button"
      disabled={action.disabled}
      aria-busy={action.pending || undefined}
      onClick={() => runAction(action, onAction)}
      className={cn(
        isDanger ? headerDangerActionClass : headerPrimaryActionClass,
        "whitespace-nowrap",
        action.disabled && "opacity-40",
        action.pending && "pointer-events-none opacity-40",
      )}
    >
      {action.pending
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : Icon && <Icon className="h-3.5 w-3.5" />}
      {action.label}
    </button>
  );

  if (action.disabled && action.disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-not-allowed">
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

function OverflowItem({
  action,
  destructive = false,
  onAction,
  className,
}: {
  action: HeaderAction;
  destructive?: boolean;
  onAction?: (id: string) => void;
  className?: string;
}) {
  const Icon = action.icon ? getActionIcon(action.icon) : null;
  return (
    <DropdownMenuItem
      disabled={action.disabled || action.pending}
      onClick={() => runAction(action, onAction)}
      className={cn(
        destructive ? "gap-2 text-xs text-destructive focus:text-destructive" : "gap-2 text-xs",
        className,
      )}
    >
      {Icon && <Icon className={cn("h-3.5 w-3.5", !destructive && "text-muted-foreground")} />}
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
  danger: HeaderAction[];
  onAction?: (id: string) => void;
}) {
  const lifecycle = overflow.filter((action) => action.group === "lifecycle");
  const record = overflow.filter((action) => action.group === "record");
  const general = overflow.filter((action) => !action.group);

  const sections: { items: HeaderAction[]; label?: string; destructive?: boolean }[] = [
    { items: lifecycle },
    { items: general },
    { items: record, label: record.length > 0 && (lifecycle.length > 0 || general.length > 0) ? "Record" : undefined },
    { items: danger, destructive: true },
  ].filter((section) => section.items.length > 0);

  return (
    <>
      {sections.map((section, i) => (
        <Fragment key={i}>
          {i > 0 && <DropdownMenuSeparator />}
          {section.label && (
            <DropdownMenuLabel className="px-2 py-1 text-xs font-mediumr text-muted-foreground/50">
              {section.label}
            </DropdownMenuLabel>
          )}
          {section.items.map((action) => (
            <OverflowItem
              key={action.id}
              action={action}
              destructive={section.destructive}
              onAction={onAction}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function RuntimeEntityActionBar({
  actions,
  onAction,
  compact = false,
  className,
}: RuntimeEntityActionBarProps) {
  const sorted = [...actions].sort((a, b) => a.order - b.order);
  const primary = sorted.filter((action) => action.placement === "primary");
  const nonPrimary = sorted.filter((action) => action.placement !== "primary");

  if (sorted.length === 0) return null;

  // Compact (mobile): primary buttons + ⋯ icon dropdown for all others
  if (compact) {
    return (
      <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
        {primary.map((action) => <ActionButton key={action.id} action={action} onAction={onAction} />)}
        {nonPrimary.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={headerIconButtonClass} aria-label="More actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[168px]">
              <OverflowGroups
                overflow={nonPrimary.filter((a) => a.placement !== "danger")}
                danger={nonPrimary.filter((a) => a.placement === "danger")}
                onAction={onAction}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  // Default: primary buttons + ⋮ More actions panel for all non-primary
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {primary.map((action) => <ActionButton key={action.id} action={action} onAction={onAction} />)}
      {nonPrimary.length > 0 && (
        <RuntimeRecordMoreMenu actions={nonPrimary} onAction={onAction} />
      )}
    </div>
  );
}
