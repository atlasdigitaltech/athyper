"use client";

import { type ReactNode } from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge } from "../primitives/Badge";

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
  className?: string;
}

export function WorkbenchModeSwitcher({
  modes,
  activeMode,
  onModeChange,
  className,
}: WorkbenchModeSwitcherProps) {
  const visibleModes = modes.filter((mode) => mode.visible !== false);
  if (visibleModes.length === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-md bg-muted p-1",
        className,
      )}
      role="tablist"
      aria-label="Workbench modes"
    >
      {visibleModes.map((mode) => {
        const Icon = mode.icon;
        const active = mode.key === activeMode;
        return (
          <button
            key={mode.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={mode.disabled}
            onClick={() => onModeChange?.(mode)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "border border-border bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              mode.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden="true" />}
            <span className="truncate">{mode.label}</span>
            {mode.badge !== undefined && (
              <Badge variant="muted" className="ml-0.5 h-5 px-1.5 text-[11px]">
                {mode.badge}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
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
  actions,
  children,
  className,
  headerClassName,
}: WorkbenchMetaShellProps) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}>
      <header className={cn("shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm", headerClassName)}>
        <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2">
          <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-sm font-semibold text-background">
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
            <span className="px-3 text-xs leading-none tracking-wide">{label.toUpperCase()}</span>
          </div>

          <div className="min-w-[12rem] flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
            {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
          </div>

          {modes.length > 0 && (
            <WorkbenchModeSwitcher
              modes={modes}
              activeMode={activeMode}
              onModeChange={onModeChange}
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
