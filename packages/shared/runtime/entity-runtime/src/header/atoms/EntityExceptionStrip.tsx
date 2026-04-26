"use client";

import { useState } from "react";
import { AlertTriangle, Info, XCircle, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { HeaderException } from "../types";

const SEVERITY_STYLE = {
  error:   { Icon: XCircle,       bg: "bg-destructive/5 border-destructive/30", label: "BLOCKING" },
  warning: { Icon: AlertTriangle, bg: "bg-warning/5 border-warning/30",         label: "WARNING"  },
  info:    { Icon: Info,          bg: "bg-info/5 border-info/30",               label: "INFO"     },
} as const;

export interface EntityExceptionStripProps {
  exceptions: HeaderException[];
  /** Max shown before "show N more". Defaults to 2. */
  initialVisible?: number;
  className?: string;
}

export function EntityExceptionStrip({
  exceptions,
  initialVisible = 2,
  className,
}: EntityExceptionStripProps) {
  const [showAll, setShowAll] = useState(false);

  if (exceptions.length === 0) return null;

  const sorted = [...exceptions].sort((a, b) => {
    if ((a.isBlocking ?? false) !== (b.isBlocking ?? false))
      return a.isBlocking ? -1 : 1;
    const rank = { error: 0, warning: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity];
  });

  const visible    = showAll ? sorted : sorted.slice(0, initialVisible);
  const hiddenCount = sorted.length - initialVisible;

  return (
    <div className={cn("space-y-1.5", className)}>
      {visible.map((exc) => {
        const { Icon, bg, label } = SEVERITY_STYLE[exc.severity];
        return (
          <div
            key={exc.id}
            className={cn("flex items-start gap-3 rounded-md border px-3 py-2.5", bg)}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {exc.isBlocking && (
                  <span className="text-2xs font-semibold uppercase tracking-wide text-destructive">
                    {label}
                  </span>
                )}
                {exc.scope && (
                  <span className="text-2xs text-muted-foreground capitalize">{exc.scope}</span>
                )}
                {exc.lineNumber != null && (
                  <span className="text-2xs text-muted-foreground">· Line {exc.lineNumber}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-foreground">{exc.message}</p>
            </div>
            {exc.resolutionPath && (
              <a
                href={exc.resolutionPath}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0 transition-colors"
              >
                {exc.resolutionLabel ?? "Resolve"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        );
      })}

      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Show {hiddenCount} more exception{hiddenCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
