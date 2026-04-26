"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { TypeChip } from "@athyper/ui/layout";
import type { HeaderIdentity } from "../types";

export interface EntityIdentityBarProps {
  identity: HeaderIdentity;
  /** Pre-composed action cluster + mode-toggle buttons. */
  actionsSlot?: ReactNode;
  onBack?: () => void;
  className?: string;
}

export function EntityIdentityBar({
  identity,
  actionsSlot,
  onBack,
  className,
}: EntityIdentityBarProps) {
  const { subtleBadge } = resolveSemanticColors(identity.status.intent);

  return (
    <div className={cn("px-4 py-3 sm:px-5 lg:px-[22px]", className)}>
      {/* Row 1: chip · number · version · status → actions */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Back + chip group */}
        {onBack ? (
          <div className="inline-flex items-center h-[34px] rounded-full border border-border overflow-hidden shrink-0">
            <button
              onClick={onBack}
              aria-label="Go back"
              className="h-full px-2.5 flex items-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-r border-border"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center">
              {identity.typeLabel}
            </span>
          </div>
        ) : (
          <TypeChip className="shrink-0">{identity.typeLabel}</TypeChip>
        )}

        {/* Number */}
        <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
          {identity.number}
        </span>

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

      {/* Row 2: title (optional) */}
      {identity.title && (
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {identity.title}
        </p>
      )}
    </div>
  );
}
