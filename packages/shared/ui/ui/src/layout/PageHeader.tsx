/**
 * PageHeader — spec §1 Region 1 · unified across all four surface modes
 *
 * Layout (always two rows):
 *   Row 1: [← back?] [type-chip?] [title] [status-slot?]   →  [actions]
 *   Row 2: [subtitle]                                            (absent when empty)
 *
 * The component is slot-based — callers compose identity and actions freely.
 * Four canonical patterns:
 *
 *   List:
 *     <PageHeader title="Invoices" actions={<>search organize create</>} />
 *
 *   Read:
 *     <PageHeader
 *       typeChip="Invoice"
 *       title="INV-A1-0001"
 *       titleVariant="doc"
 *       statusSlot={<StatusBadge status="approved" />}
 *       subtitle="Acme Consulting LLC"
 *       actions={<><SecBtn/><OverflowBtn/><PrimaryBtn/></>}
 *     />
 *
 *   Edit (same route, mode flag):
 *     same as Read but statusSlot=<ModeBadge>Editing</ModeBadge>
 *     and primary action = Save
 *
 *   Create:
 *     <PageHeader
 *       typeChip="Invoice"
 *       title="New"
 *       statusSlot={<ModeBadge>Draft</ModeBadge>}
 *       subtitle="Step 1 of 3 · Identify"
 *       actions={<button onClick={onCancel}>Cancel</button>}
 *     />
 *
 * Spec §2 sizing:
 *   title (list)   → text-xl / 600
 *   title (doc)    → text-base / 600
 *   subtitle       → text-xs / 400 / muted-foreground
 */

import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@athyper/theme/utils";

// ── TypeChip ─────────────────────────────────────────────────────────────────

/** Inverted-fill chip labelling the document family ("Invoice", "Vendor"). */
export function TypeChip({
  children,
  onBack,
  className,
}: {
  children: string;
  /** When provided, renders a back arrow button on the left of the chip label. */
  onBack?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[32px] shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-xs font-semibold tracking-wider text-background",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-full w-9 items-center justify-center border-r border-r-ring bg-foreground text-background transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
          aria-label="Go back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <span className="flex h-full items-center px-3 leading-none">{children}</span>
    </span>
  );
}

// ── ModeBadge ────────────────────────────────────────────────────────────────

/** Muted pill for transient mode labels: "Draft", "Editing", "Pending". */
export function ModeBadge({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded px-2 text-xs font-medium bg-muted text-muted-foreground border border-border",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  /** Inverted label shown left of the title (e.g. "Invoice"). Omit for list variant. */
  typeChip?: string;

  /** When provided, renders a back arrow inside the TypeChip. Ignored when typeChip is absent. */
  onBack?: () => void;

  /** Primary title: entity plural for list ("Invoices"), doc number for detail ("INV-A1-0001"). */
  title?: string;

  /**
   * "page" → text-xl/600 (list pages, create "New").
   * "doc"  → text-base/600 (detail/edit — document number is smaller than a page title).
   * Default: "page".
   */
  titleVariant?: "page" | "doc";

  /** Status badge, mode badge, or any chip-sized element placed after the title. */
  statusSlot?: ReactNode;

  /** 12/400 muted-fg — subtitle shown on the second row (party name, step counter, etc.). */
  subtitle?: string;

  /**
   * Primary CTA buttons (e.g. Create, settings menu).
   * On mobile: anchored right of the title in row 1.
   * On sm+: merged at the end of the actions row.
   */
  primaryActions?: ReactNode;

  /** Secondary toolbar (search, filters, organise). Row 2 on mobile; right cluster on sm+. */
  actions?: ReactNode;

  className?: string;
}

export function PageHeader({
  typeChip,
  onBack,
  title,
  titleVariant = "page",
  statusSlot,
  subtitle,
  primaryActions,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4", className)}>

      {/* Row 1 on mobile: identity (left) + primaryActions (right) */}
      <div className="flex min-w-0 items-center justify-between gap-2 sm:block sm:min-w-0 sm:flex-1">
        {/* Identity cluster */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {typeChip && <TypeChip onBack={onBack}>{typeChip}</TypeChip>}
            {title && (
              <span
                className={cn(
                  "font-semibold leading-tight text-foreground",
                  titleVariant === "doc" ? "text-base" : "text-xl",
                )}
              >
                {title}
              </span>
            )}
            {statusSlot}
          </div>
          {subtitle && (
            <p className="text-xs font-normal leading-normal text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        {/* Primary actions — anchored in title row on mobile, hidden here on sm+ */}
        {primaryActions && (
          <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
            {primaryActions}
          </div>
        )}
      </div>

      {/* Row 2 on mobile / right cluster on sm+: secondary toolbar + primary actions merged */}
      {(actions || primaryActions) && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none sm:shrink-0">
          {actions}
          {primaryActions && (
            <div className="hidden sm:flex items-center gap-1.5">
              {primaryActions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
