"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { META_SM } from "@athyper/ui/typography";

export type AccountingDistributionMode = "single" | "split";

export interface AccountingDistributionBasisOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface AccountingDistributionEditorProps<TBasis extends string = string> {
  mode: AccountingDistributionMode;
  onModeChange: (mode: AccountingDistributionMode) => void;
  splitDisabled?: boolean;
  modeLabel?: string;
  basis?: TBasis;
  basisOptions?: ReadonlyArray<AccountingDistributionBasisOption<TBasis>>;
  onBasisChange?: (basis: TBasis) => void;
  basisLabel?: string;
  rebalanceAction?: ReactNode;
  statusBadge?: ReactNode;
  children: ReactNode;
  allocation?: {
    percent: number;
    isComplete: boolean;
    totalLabel: ReactNode;
    targetLabel: ReactNode;
  };
  addSplitAction?: (() => void) | ReactNode;
  addSplitLabel?: string;
  readOnly?: boolean;
  className?: string;
}

export function AccountingDistributionEditor<TBasis extends string = string>({
  mode,
  onModeChange,
  splitDisabled,
  modeLabel = "Distribution mode",
  basis,
  basisOptions = [],
  onBasisChange,
  basisLabel = "Split basis",
  rebalanceAction,
  statusBadge,
  children,
  allocation,
  addSplitAction,
  addSplitLabel = "Add split",
  readOnly,
  className,
}: AccountingDistributionEditorProps<TBasis>) {
  const showBasis = mode === "split" && basis && basisOptions.length > 0 && onBasisChange;
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-2.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">{modeLabel}</span>
          <AccountingModeToggle value={mode} onChange={onModeChange} splitDisabled={splitDisabled} />
        </div>
        {statusBadge}
        {mode === "split" && (
          <div className="ml-auto flex flex-wrap items-end gap-2">
            {showBasis && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-muted-foreground">{basisLabel}</span>
                <AccountingBasisToggle
                  value={basis}
                  options={basisOptions}
                  onChange={onBasisChange}
                />
              </div>
            )}
            {rebalanceAction}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-4 p-4">
        {children}

        {mode === "split" && allocation && (
          <div className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn("h-full rounded-full transition-all", allocation.isComplete ? "bg-success" : "bg-primary")}
                style={{ width: `${Math.min(100, Math.max(0, allocation.percent))}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn(META_SM, allocation.isComplete ? "text-success" : "text-muted-foreground")}>
                  {allocation.isComplete ? "Fully allocated" : "Partially allocated"}
                </span>
                <span className={cn(META_SM, "tabular-nums text-muted-foreground")}>
                  {allocation.totalLabel} / {allocation.targetLabel}
                </span>
              </div>
              {mode === "split" && !readOnly && addSplitAction && (
                typeof addSplitAction === "function" ? (
                  <button
                    type="button"
                    onClick={addSplitAction}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {addSplitLabel}
                  </button>
                ) : addSplitAction
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountingModeToggle({
  value,
  onChange,
  splitDisabled,
}: {
  value: AccountingDistributionMode;
  onChange: (mode: AccountingDistributionMode) => void;
  splitDisabled?: boolean;
}) {
  return (
    <div className="inline-flex h-9 overflow-hidden rounded-md border border-border bg-card text-sm font-medium">
      {(["single", "split"] as const).map((mode) => {
        const selected = mode === value;
        const disabled = mode === "split" && splitDisabled;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => !disabled && onChange(mode)}
            className={cn(
              "min-w-20 px-3 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
              selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

function AccountingBasisToggle<TBasis extends string>({
  value,
  options,
  onChange,
}: {
  value: TBasis;
  options: ReadonlyArray<AccountingDistributionBasisOption<TBasis>>;
  onChange: (basis: TBasis) => void;
}) {
  return (
    <div className="inline-flex h-9 overflow-hidden rounded-md border border-border bg-card text-sm font-medium">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => !option.disabled && onChange(option.value)}
            className={cn(
              "min-w-20 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
              selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
