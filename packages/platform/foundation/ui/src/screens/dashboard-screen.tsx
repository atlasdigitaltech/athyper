import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

// ── DashboardScreen ───────────────────────────────────────────────────────────

export interface DashboardScreenProps {
  /** Full-width strip of KPI metrics above the card sections. */
  kpiStrip?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DashboardScreen({ kpiStrip, children, className }: DashboardScreenProps) {
  return (
    // max-w-[1680px]: intentionally wider than max-w-content-full (1536px) to
    // match the dashboard standard used across the workspace. No theme token
    // exists at 1680px — add max-w-content-2xl to the preset if this value
    // is adopted more broadly.
    <div className={cn("mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8", className)}>
      {kpiStrip && <div className="mb-6">{kpiStrip}</div>}
      <div className="flex flex-col gap-8">{children}</div>
    </div>
  );
}

// ── DashboardSection ─────────────────────────────────────────────────────────

export interface DashboardSectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Wraps children in a bordered card panel. Default: false. */
  panel?: boolean;
}

export function DashboardSection({
  title,
  description,
  actions,
  children,
  panel = false,
}: DashboardSectionProps) {
  const hasIdentity = title || description;
  const hasHeader = hasIdentity || actions;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-4">
          {/* Only render the left column when there is actual text to show —
              avoids an empty div taking up space when only actions are given. */}
          {hasIdentity && (
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {panel ? (
        <div className="rounded-lg border bg-card p-4">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

// ── DashboardCardGrid ─────────────────────────────────────────────────────────

export interface DashboardCardGridProps {
  children: ReactNode;
}

/** Responsive grid: 1 col → 2 cols on md → 3 cols on xl. */
export function DashboardCardGrid({ children }: DashboardCardGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}
