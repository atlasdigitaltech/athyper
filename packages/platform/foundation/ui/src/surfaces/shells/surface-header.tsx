import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export type SurfaceHeaderKind = "section" | "collection" | "record" | "workspace";

export interface SurfaceHeaderBack {
  label: string;
  href: string;
  /** Defaults to a left-chevron SVG when omitted. */
  icon?: ReactNode;
}

export interface SurfaceHeaderFact {
  key: string;
  label?: string;
  value: ReactNode;
  icon?: ReactNode;
}

export interface SurfaceHeaderNavigationItem {
  key: string;
  label: string;
  href: string;
  active?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface SurfaceHeaderProps {
  kind: SurfaceHeaderKind;
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  leadingVariant?: "tile" | "plain";
  back?: SurfaceHeaderBack;
  facts?: readonly SurfaceHeaderFact[];
  status?: ReactNode;
  actions?: ReactNode;
  commandBar?: ReactNode;
  navigation?: readonly SurfaceHeaderNavigationItem[];
  navigationLabel?: string;
  className?: string;
}

function BackChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10 12L6 8l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SurfaceHeader({
  kind,
  title,
  eyebrow,
  subtitle,
  leading,
  leadingVariant = "tile",
  back,
  facts = [],
  status,
  actions,
  commandBar,
  navigation = [],
  navigationLabel = "Page navigation",
  className,
}: SurfaceHeaderProps) {
  return (
    <header
      className={cn("w-full min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm", className)}
      data-surface-header-kind={kind}
    >
      <div className="flex min-h-[76px] flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {back && (
            <a
              href={back.href}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={back.label}
            >
              <span aria-hidden="true">{back.icon ?? <BackChevron />}</span>
              <span className="hidden sm:inline">{back.label}</span>
            </a>
          )}
          {leading && (
            <span
              className={
                leadingVariant === "tile"
                  ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                  : "shrink-0"
              }
            >
              {leading}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-1 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 truncate text-xl font-semibold leading-tight text-foreground">
                {title}
              </h1>
              {status && <div className="flex shrink-0 items-center gap-2">{status}</div>}
            </div>
            {subtitle && (
              <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>

        {(facts.length > 0 || actions || commandBar) && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
            {facts.length > 0 && (
              <dl className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                {facts.map((fact) => (
                  <div key={fact.key} className="flex min-w-0 items-center gap-1.5 text-sm">
                    {fact.icon && (
                      <span className="shrink-0 text-muted-foreground" aria-hidden="true">
                        {fact.icon}
                      </span>
                    )}
                    {fact.label && <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>}
                    <dd className="truncate font-medium text-foreground">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {commandBar && <div className="min-w-0 flex-1 md:flex-initial">{commandBar}</div>}
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
      </div>

      {navigation.length > 0 && (
        <nav
          className="flex min-h-14 items-end gap-1 overflow-x-auto border-t px-4"
          aria-label={navigationLabel}
        >
          {navigation.map((item) => (
            <a
              key={item.key}
              href={item.disabled ? undefined : item.href}
              onClick={
                item.onSelect && !item.disabled
                  ? (event) => {
                      event.preventDefault();
                      item.onSelect?.();
                    }
                  : undefined
              }
              aria-current={item.active ? "page" : undefined}
              aria-disabled={item.disabled || undefined}
              className={cn(
                "inline-flex h-14 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                item.active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                item.disabled && "pointer-events-none opacity-50",
              )}
            >
              <span>{item.label}</span>
              {item.badge}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
