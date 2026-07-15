/**
 * @athyper/document-runtime — Validation Banner
 *
 * Spec v1.2 §4.3: Stacked warning/blocker notices rendered between the
 * ProcessHealthStrip and ExceptionStack. Blockers render first (red),
 * then warnings (amber). Each notice has an optional action button.
 */
"use client";

import { AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { Button } from "@athyper/ui/primitives";
import { type ValidationNotice } from "@athyper/api-contracts/documents";

export interface ValidationBannerProps {
  notices: ValidationNotice[];
  onActionHint?: (hint: string) => void;
  className?: string;
}

export function ValidationBanner({
  notices,
  onActionHint,
  className,
}: ValidationBannerProps) {
  if (notices.length === 0) return null;

  // Sort blockers first, then warnings
  const sorted = [...notices].sort((a, b) => {
    if (a.level !== b.level) return a.level === "blocked" ? -1 : 1;
    return 0;
  });

  return (
    <div className={cn("space-y-2", className)}>
      {sorted.map((notice) => {
        const isBlocker = notice.level === "blocked";
        const colors = resolveSemanticColors(isBlocker ? "error" : "warning");
        const Icon = isBlocker ? XCircle : AlertTriangle;

        return (
          <div
            key={notice.code}
            className={cn(
              "flex items-center gap-3 rounded-md border px-4 py-2.5",
              colors.subtleBadge,
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn("flex-1 text-sm", isBlocker && "font-medium")}>
              {notice.message}
            </span>
            {notice.action_hint && onActionHint && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => onActionHint(notice.action_hint!)}
              >
                Resolve
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
