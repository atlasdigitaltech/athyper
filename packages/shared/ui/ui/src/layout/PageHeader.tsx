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

/** Inverted-fill chip labelling the document family ("Invoice", "Supplier"). */
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
        "inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-[13px] font-semibold leading-none text-background",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-full w-9 items-center justify-center border-r border-background/20 bg-inherit text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
          aria-label="Go back"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      <span className="flex h-full items-center px-3 text-[12px] leading-none">{children}</span>
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

  /**
   * "inline"   -> secondary toolbar moves to the right cluster on sm+.
   * "adaptive" -> stacked through tablet widths, then inline on desktop.
   * "stacked"  -> identity/primary actions stay on row 1 and toolbar stays full-width on row 2.
   */
  actionsLayout?: "inline" | "adaptive" | "stacked";

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
  actionsLayout = "inline",
  className,
}: PageHeaderProps) {
  const stackedActions = actionsLayout === "stacked";
  const adaptiveActions = actionsLayout === "adaptive";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2",
        actionsLayout === "inline" && "sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        adaptiveActions && "xl:flex-row xl:items-start xl:justify-between xl:gap-4",
        className,
      )}
    >

      {/* Row 1 on mobile: identity (left) + primaryActions (right) */}
      <div
        className={cn(
          "flex min-w-0 items-center justify-between gap-2",
          actionsLayout === "inline" && "sm:block sm:min-w-0 sm:flex-1",
          adaptiveActions && "xl:block xl:min-w-0 xl:flex-1",
        )}
      >
        {/* Identity cluster */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5",
              actionsLayout === "inline" && "sm:hidden",
              adaptiveActions && "xl:hidden",
            )}
          >
            {primaryActions}
          </div>
        )}
      </div>

      {/* Row 2 on mobile / right cluster on sm+: secondary toolbar + primary actions merged */}
      {(actions || (!stackedActions && primaryActions)) && (
        <div
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            actionsLayout === "inline" && "sm:w-auto sm:shrink-0",
            adaptiveActions && "xl:w-auto xl:shrink-0",
          )}
        >
          {actions}
          {!stackedActions && primaryActions && (
            <div
              className={cn(
                "hidden items-center gap-1.5",
                actionsLayout === "inline" && "sm:flex",
                adaptiveActions && "xl:flex",
              )}
            >
              {primaryActions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
