"use client";

/**
 * WorkbenchMetaShell â€” left-rail navigation shell for workbench detail pages.
 *
 * Renders a collapsible sidebar with:
 *   - A back-navigation link at the top
 *   - A list of mode items (icon + label + optional badge) in the rail
 *   - A `<Back>` button and tooltip on collapsed rail
 *
 * The active mode is highlighted; the caller controls `activeMode` and responds
 * to `onModeChange`. Rail width can be collapsed for a narrow icon-only view.
 *
 * Used in finance detail workbenches (AP invoice, bank reconciliation) and
 * record detail pages that have multiple view modes.
 */

import { type ReactNode } from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge } from "../primitives/Badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../primitives/Tooltip";

export interface WorkbenchModeItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  disabled?: boolean;
  visible?: boolean;
}

export interface WorkbenchModeSwitcherProps {
  modes: WorkbenchModeItem[];
  activeMode: string;
  onModeChange?: (mode: WorkbenchModeItem) => void;
  iconOnly?: boolean;
  className?: string;
}

export function WorkbenchModeSwitcher({
  modes,
  activeMode,
  onModeChange,
  iconOnly = false,
  className,
}: WorkbenchModeSwitcherProps) {
  const visibleModes = modes.filter((mode) => mode.visible !== false);
  if (visibleModes.length === 0) return null;

  const content = visibleModes.map((mode) => {
    const Icon = mode.icon;
    const active = mode.key === activeMode;
    const showIconOnly = iconOnly && Boolean(Icon);
    const button = (
      <button
        key={mode.key}
        type="button"
        role="tab"
        aria-label={mode.label}
        aria-selected={active}
        disabled={mode.disabled}
        onClick={() => onModeChange?.(mode)}
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center rounded-md text-sm font-medium leading-none transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          showIconOnly ? "w-8 px-0" : "gap-1.5 px-3",
          active
            ? "border border-border bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
          mode.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
        )}
      >
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        {showIconOnly ? (
          <span className="sr-only">{mode.label}</span>
        ) : (
          <span className="truncate">{mode.label}</span>
        )}
        {mode.badge !== undefined && (
          <Badge variant="muted" className="ml-0.5 h-5 px-1.5 text-xs">
            {mode.badge}
          </Badge>
        )}
      </button>
    );

    if (!showIconOnly) return button;

    return (
      <Tooltip key={mode.key}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          {mode.label}
        </TooltipContent>
      </Tooltip>
    );
  });

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          "inline-flex min-w-0 items-center gap-1 rounded-md bg-muted p-1",
          className,
        )}
        role="tablist"
        aria-label="Workbench modes"
      >
        {content}
      </div>
    </TooltipProvider>
  );
}

export interface WorkbenchMetaShellProps {
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  modes?: WorkbenchModeItem[];
  activeMode?: string;
  onModeChange?: (mode: WorkbenchModeItem) => void;
  modeIconOnly?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
}

export function WorkbenchMetaShell({
  label,
  title,
  subtitle,
  backLabel = "Back",
  onBack,
  modes = [],
  activeMode = modes[0]?.key ?? "",
  onModeChange,
  modeIconOnly,
  actions,
  children,
  className,
  headerClassName,
}: WorkbenchMetaShellProps) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}>
      <header className={cn("shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm", headerClassName)}>
        <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2">
          <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-sm font-medium leading-none text-background">
            {onBack && (
              <button
                type="button"
                className="flex h-full w-9 items-center justify-center border-r border-background/20 bg-inherit text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
                aria-label={backLabel}
                title={backLabel}
                onClick={onBack}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
            )}
            <span className="px-3 text-xs leading-none">{label.toUpperCase()}</span>
          </div>

          <div className="min-w-[12rem] flex-1">
            <div className="truncate text-sm font-medium leading-5 text-foreground">{title}</div>
            {subtitle && <div className="truncate text-xs leading-4 text-muted-foreground">{subtitle}</div>}
          </div>

          {modes.length > 0 && (
            <WorkbenchModeSwitcher
              modes={modes}
              activeMode={activeMode}
              onModeChange={onModeChange}
              iconOnly={modeIconOnly}
              className="ml-auto"
            />
          )}

          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>

      {children}
    </section>
  );
}
