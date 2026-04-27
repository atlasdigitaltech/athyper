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
import { ArrowLeft } from "lucide-react";
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
        "inline-flex h-[26px] items-center rounded-md bg-foreground text-xs font-semibold tracking-wide text-background",
        onBack ? "pl-1 pr-2.5" : "px-2.5",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mr-1 flex items-center justify-center rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
          aria-label="Go back"
        >
          <ArrowLeft className="h-3 w-3" />
        </button>
      )}
      {children}
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
  title: string;

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

  /** Action buttons (right cluster). Rightmost MUST be the single primary CTA. */
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
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 min-w-0", className)}>
      {/* Identity cluster (left) */}
      <div className="flex min-w-0 flex-col gap-1">
        {/* Row 1: type-chip + title + status */}
        <div className="flex flex-wrap items-center gap-2">
          {typeChip && <TypeChip onBack={onBack}>{typeChip}</TypeChip>}
          <span
            className={cn(
              "font-semibold leading-tight text-foreground",
              titleVariant === "doc" ? "text-base" : "text-xl",
            )}
          >
            {title}
          </span>
          {statusSlot}
        </div>
        {/* Row 2: subtitle */}
        {subtitle && (
          <p className="text-xs font-normal leading-normal text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions cluster (right) */}
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      )}
    </div>
  );
}
