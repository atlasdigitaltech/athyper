"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { TypeChip } from "@athyper/ui/layout";
import type { HeaderIdentity } from "../types";

export interface EntityIdentityBarProps {
  identity: HeaderIdentity;
  /** Pre-composed action cluster + mode-toggle buttons. */
  actionsSlot?: ReactNode;
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
  onBack,
  onTypeClick,
  className,
}: EntityIdentityBarProps) {
  const { subtleBadge } = resolveSemanticColors(identity.status.intent);
  const [copied, setCopied] = useState(false);

  const canCopy = identity.identifierAction !== "none";
  const descText = identity.description ?? identity.title;
  const shouldTruncate = identity.descriptionTruncate !== false;

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(identity.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed; no visual feedback needed
    }
  };

  return (
    <div className={cn("px-4 py-3 sm:px-5 lg:px-[22px]", className)}>
      {/* Row 1: chip · number · version · status → actions */}
      <div className="flex items-center gap-3 min-w-0">

        {/* Back + chip group OR standalone chip */}
        {onBack ? (
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
          <button type="button" onClick={onTypeClick} className="shrink-0">
            <TypeChip>{identity.typeLabel}</TypeChip>
          </button>
        ) : identity.typeHref ? (
          <Link href={identity.typeHref} className="shrink-0">
            <TypeChip>{identity.typeLabel}</TypeChip>
          </Link>
        ) : (
          <TypeChip className="shrink-0">{identity.typeLabel}</TypeChip>
        )}

        {/* Identity block: name primary, code secondary (stacked) */}
        <div className="flex flex-col min-w-0 shrink leading-none gap-0.5">
          {identity.name ? (
            <span className="text-sm font-semibold text-foreground truncate">
              {identity.name}
            </span>
          ) : (
            /* no name — render number prominently in place of name */
            canCopy ? (
              <button
                type="button"
                onClick={handleCopyNumber}
                title="Copy to clipboard"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums hover:text-foreground/70 transition-colors text-left"
              >
                {identity.number}
                {copied && <Check className="h-3 w-3 flex-none text-muted-foreground" />}
              </button>
            ) : (
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {identity.number}
              </span>
            )
          )}

          {/* Code — only shown when name is present */}
          {identity.name && (
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
          )}
        </div>

        {/* Inline classification: "· Vendor", "· Manufacturer" — config-driven */}
        {identity.classification && (
          <span className="text-sm font-normal text-muted-foreground shrink-0">
            · {identity.classification}
          </span>
        )}

        {/* Version badge */}
        {identity.version && (
          <span className="text-2xs font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            {identity.version}
          </span>        
        )}

        {/* Status badge */}
        <span className={cn(
          "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold leading-none shrink-0",
          subtleBadge,
        )}>
          {identity.status.label}
        </span>

        {/* Push actions to right */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {actionsSlot}
        </div>
      </div>

      {/* Row 2: description (or legacy title) — optional, truncated by default */}
      {descText && (
        <p className={cn(
          "mt-1 text-xs text-muted-foreground",
          shouldTruncate ? "truncate" : "line-clamp-2",
        )}>
          {descText}
        </p>
      )}
    </div>
  );
}
