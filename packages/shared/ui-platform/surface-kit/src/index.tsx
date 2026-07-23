import type { ReactNode } from "react";

export {
  SurfaceHeader,
  type SurfaceHeaderBack,
  type SurfaceHeaderFact,
  type SurfaceHeaderKind,
  type SurfaceHeaderNavigationItem,
  type SurfaceHeaderProps,
} from "./surface-header";

// â”€â”€â”€ PageFrame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface PageFrameProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageFrame({ eyebrow, title, description, actions, children }: PageFrameProps) {
  const hasHeader = eyebrow || title || description || actions;
  return (
    <div className="flex h-full flex-col">
      {hasHeader && (
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-0.5 truncate text-xs text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {title && (
              <h1 className="truncate text-sm font-medium text-foreground">{title}</h1>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
    </div>
  );
}

// â”€â”€â”€ WorkPanel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface WorkPanelProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function WorkPanel({ title, description, actions, children }: WorkPanelProps) {
  const hasHeader = title || description || actions;
  return (
    <section className="rounded-lg border bg-card">
      {hasHeader && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5 py-2">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children && <div className="p-4">{children}</div>}
    </section>
  );
}

// â”€â”€â”€ StatePanel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface StatePanelProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function StatePanel({ title, message, action }: StatePanelProps) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// â”€â”€â”€ PanelGrid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface PanelGridProps {
  children?: ReactNode;
}

export function PanelGrid({ children }: PanelGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

// â”€â”€â”€ MetricStrip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type MetricTone = "neutral" | "positive" | "warn" | "critical";

export interface Metric {
  label: string;
  value: string;
  tone?: MetricTone;
}

export interface MetricStripProps {
  metrics: Metric[];
}

// Use semantic CSS-variable-backed classes so metrics adapt to the active theme
// preset. Avoid hardcoded Tailwind palette values (e.g. text-emerald-*) here.
const TONE_VALUE_CLASS: Record<MetricTone, string> = {
  neutral:  "text-foreground",
  positive: "text-success",
  warn:     "text-warning",
  critical: "text-destructive",
};

export function MetricStrip({ metrics }: MetricStripProps) {
  return (
    <div className="flex flex-wrap gap-px overflow-hidden rounded-lg border bg-border">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex min-w-[120px] flex-1 flex-col gap-0.5 bg-card px-4 py-3"
        >
          <span className="truncate text-xs text-muted-foreground">{metric.label}</span>
          <span className={`text-sm font-medium tabular-nums ${TONE_VALUE_CLASS[metric.tone ?? "neutral"]}`}>
            {metric.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// â”€â”€â”€ ToolbarButton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ToolbarButtonProps {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}

export function ToolbarButton({ href, onClick, children, disabled }: ToolbarButtonProps) {
  const className =
    "inline-flex h-8 items-center rounded-md border bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50";

  if (href) {
    // Anchors do not support the `disabled` attribute. Suppress navigation and
    // mark as disabled for assistive technologies when disabled=true.
    return (
      <a
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        className={className}
        onClick={disabled ? (e) => e.preventDefault() : undefined}
      >
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

// â”€â”€â”€ BoundaryBanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface BoundaryBannerProps {
  title: string;
  children?: ReactNode;
}

export function BoundaryBanner({ title, children }: BoundaryBannerProps) {
  return (
    <div className="flex items-baseline gap-2 text-xs text-warning">
      <span className="shrink-0 text-sm font-medium">{title}:</span>
      {children && <span className="text-warning">{children}</span>}
    </div>
  );
}
