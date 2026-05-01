"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, Check, Pencil } from "lucide-react";
import Link from "next/link";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";

import type { HeaderIdentity } from "../types";

interface AmountSummary {
  label: string;
  amount: string;
  currency?: string;
  subtext?: string;
}

// Scale font size by character length so trillions don't overflow and $1 looks bold.
function amountFontClass(amount: string): string {
  const len = amount.length;
  if (len <= 7)  return "text-xl font-bold";
  if (len <= 10) return "text-lg font-semibold";
  if (len <= 13) return "text-base font-semibold";
  if (len <= 17) return "text-sm font-semibold";
  return "text-xs font-semibold";
}

export interface EntityIdentityBarProps {
  identity: HeaderIdentity;
  /** Pre-composed action cluster buttons. */
  actionsSlot?: ReactNode;
  /** Hero amount (e.g. invoice total) shown as two-row block in the top-right. */
  amountSummary?: AmountSummary;
  /** When true, shows the "Editing" badge next to the status badge. */
  editMode?: boolean;
  onBack?: () => void;
  /**
   * When provided, the type chip renders as a button that calls this handler
   * instead of a Link. Used by edit pages to route the click through guardNavigate.
   */
  onTypeClick?: () => void;
  className?: string;
}

export function EntityIdentityBar({
  identity,
  actionsSlot,
  amountSummary,
  editMode = false,
  onBack,
  onTypeClick,
  className,
}: EntityIdentityBarProps) {
  const { subtleBadge } = resolveSemanticColors(identity.status.intent);
  const [copied, setCopied] = useState(false);

  const canCopy = identity.identifierAction !== "none";

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(identity.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed; no visual feedback needed
    }
  };

  // ── Chip (back arrow + type label) ────────────────────────────────────────
  const chipEl = onBack ? (
    <div className="inline-flex items-center h-[32px] rounded-md border border-border overflow-hidden shrink-0">
      <button
        onClick={onBack}
        aria-label="Go back"
        className="px-1 h-full flex items-center text-background bg-foreground hover:bg-foreground/85 border-r border-r-ring transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {onTypeClick ? (
        <button
          type="button"
          onClick={onTypeClick}
          className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center hover:bg-foreground/85 transition-colors"
        >
          {identity.typeLabel}
        </button>
      ) : identity.typeHref ? (
        <Link
          href={identity.typeHref}
          className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center hover:bg-foreground/85 transition-colors"
        >
          {identity.typeLabel}
        </Link>
      ) : (
        <span className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center">
          {identity.typeLabel}
        </span>
      )}
    </div>
  ) : onTypeClick ? (
    <button
      type="button"
      onClick={onTypeClick}
      className="shrink-0 h-[32px] rounded-md border border-border bg-foreground text-background px-3 text-xs font-semibold tracking-wider flex items-center hover:bg-foreground/85 transition-colors"
    >
      {identity.typeLabel}
    </button>
  ) : identity.typeHref ? (
    <Link
      href={identity.typeHref}
      className="shrink-0 h-[32px] rounded-md border border-border bg-foreground text-background px-3 text-xs font-semibold tracking-wider flex items-center hover:bg-foreground/85 transition-colors"
    >
      {identity.typeLabel}
    </Link>
  ) : (
    <span className="shrink-0 h-[32px] rounded-md border border-border bg-foreground text-background px-3 text-xs font-semibold tracking-wider flex items-center">
      {identity.typeLabel}
    </span>
  );

  // ── Name primary ──────────────────────────────────────────────────────────
  // When name === number (documents), renders as copyable so the user can copy
  // without a secondary code row appearing below.
  const namePrimary = identity.name && identity.name !== identity.number ? (
    <span className="text-sm font-semibold text-foreground truncate leading-snug">
      {identity.name}
    </span>
  ) : canCopy ? (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums hover:text-foreground/70 transition-colors text-left"
    >
      {identity.name ?? identity.number}
      {copied && <Check className="h-3 w-3 flex-none text-muted-foreground" />}
    </button>
  ) : (
    <span className="text-sm font-semibold text-foreground tabular-nums">
      {identity.name ?? identity.number}
    </span>
  );

  // ── Code secondary — only when name is distinct from number ───────────────
  const codeSecondary = identity.name && identity.name !== identity.number ? (
    canCopy ? (
      <button
        type="button"
        onClick={handleCopyNumber}
        title="Copy to clipboard"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums hover:text-foreground/60 transition-colors text-left"
      >
        {identity.number}
        {copied && <Check className="h-2.5 w-2.5 flex-none" />}
      </button>
    ) : (
      <span className="text-xs text-muted-foreground tabular-nums">
        {identity.number}
      </span>
    )
  ) : null;

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = (
    <span className={cn(
      "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold leading-none shrink-0",
      subtleBadge,
    )}>
      {identity.status.label}
    </span>
  );

  // ── Edit-mode indicator — shown only when actively editing ────────────────
  const editingBadge = editMode ? (
    <span className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold leading-none text-primary shrink-0">
      <Pencil className="h-2.5 w-2.5" />
      Editing
    </span>
  ) : null;

  return (
    <div className={cn("px-4 py-3 sm:px-5 lg:px-[22px]", className)}>

      {/* ── sm+ (tablet / desktop) ── */}
      <div className="hidden sm:flex sm:items-center sm:gap-3 sm:min-w-0">
        {chipEl}

        {/* Name / code — immediately after chip */}
        <div className="flex flex-col min-w-0 shrink leading-none gap-0.5 max-w-[220px]">
          {namePrimary}
          {codeSecondary}
        </div>

        {identity.version && (
          <span className="text-2xs font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            {identity.version}
          </span>
        )}

        {statusBadge}
        {editingBadge}

        <div className="ml-auto flex items-center gap-4 min-w-0">
          {actionsSlot}
          {amountSummary && (
            <div className="flex flex-col items-end gap-0.5 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap justify-end">
                <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider leading-none shrink-0">
                  TOTAL
                </span>
                <span className={cn("tabular-nums text-foreground leading-tight shrink-0", amountFontClass(amountSummary.amount))}>
                  {amountSummary.amount}
                </span>
                {amountSummary.currency && (
                  <span className="text-xs font-normal text-muted-foreground shrink-0">
                    {amountSummary.currency}
                  </span>
                )}
              </div>
              {amountSummary.subtext && (
                <span className="text-2xs text-muted-foreground text-right break-words min-w-0 max-w-[260px]">
                  {amountSummary.subtext}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── mobile (< sm) ──────────────────────────────────────────────────
          Row A: chip · name/code (flex-1) · status · actions
          Row B: amount summary (if present)                              */}
      <div className="sm:hidden flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {chipEl}
          <div className="flex-1 flex flex-col min-w-0 leading-none gap-0.5">
            {namePrimary}
            {codeSecondary}
          </div>
          {statusBadge}
          {editingBadge}
          <div className="flex items-center gap-2 shrink-0">
            {actionsSlot}
          </div>
        </div>

        {amountSummary && (
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider leading-none shrink-0">
                TOTAL
              </span>
              <span className={cn("tabular-nums text-foreground shrink-0", amountFontClass(amountSummary.amount))}>
                {amountSummary.amount}
              </span>
              {amountSummary.currency && (
                <span className="text-xs text-muted-foreground shrink-0">{amountSummary.currency}</span>
              )}
            </div>
            {amountSummary.subtext && (
              <span className="text-2xs text-muted-foreground break-words">{amountSummary.subtext}</span>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
