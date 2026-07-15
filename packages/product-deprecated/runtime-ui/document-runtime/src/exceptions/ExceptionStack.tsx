/**
 * @athyper/document-runtime — Exception Stack
 *
 * Rec 5: Replaces single alert banner with structured exception cards.
 * Unified adapter consuming PR/PO/INV exception sources.
 */
"use client";

import { useState } from "react";
import { AlertTriangle, Info, XCircle, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button } from "@athyper/ui/primitives";
import { type DocumentException } from "@athyper/api-contracts/documents";

export interface ExceptionStackProps {
  exceptions: DocumentException[];
  className?: string;
  initialVisible?: number;
}

const SEVERITY_CONFIG = {
  error: { icon: XCircle, label: "BLOCKING", badgeVariant: "destructive" as const, bg: "bg-destructive/5 border-destructive/30" },
  warning: { icon: AlertTriangle, label: "WARNING", badgeVariant: "warning" as const, bg: "bg-warning/5 border-warning/30" },
  info: { icon: Info, label: "INFO", badgeVariant: "info" as const, bg: "bg-info/5 border-info/30" },
};

const SCOPE_LABELS: Record<string, string> = {
  header: "Header", line: "Line", payment: "Payment", workflow: "Workflow",
};

export function ExceptionStack({ exceptions, className, initialVisible = 3 }: ExceptionStackProps) {
  const [showAll, setShowAll] = useState(false);

  if (exceptions.length === 0) return null;

  const sorted = [...exceptions].sort((a, b) => {
    if (a.is_blocking !== b.is_blocking) return a.is_blocking ? -1 : 1;
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const visible = showAll ? sorted : sorted.slice(0, initialVisible);
  const hiddenCount = sorted.length - initialVisible;

  return (
    <div className={cn("space-y-2", className)}>
      {visible.map((exc, i) => {
        const config = SEVERITY_CONFIG[exc.severity];
        const Icon = config.icon;

        return (
          <div
            key={`${exc.code}-${i}`}
            className={cn("flex items-start gap-3 rounded-md border px-4 py-3", config.bg)}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {exc.is_blocking && (
                  <Badge variant={config.badgeVariant} className="text-xs">{config.label}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{SCOPE_LABELS[exc.scope] ?? exc.scope}</span>
                {exc.line_number != null && (
                  <span className="text-xs text-muted-foreground">· Line {exc.line_number}</span>
                )}
              </div>
              <p className="mt-0.5 text-sm">{exc.description}</p>
            </div>
            {exc.resolution_path && (
              <Button variant="ghost" size="sm" className="shrink-0 text-xs" asChild>
                <a href={exc.resolution_path}>
                  Resolve <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        );
      })}

      {!showAll && hiddenCount > 0 && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAll(true)}>
          <ChevronDown className="mr-1 h-3 w-3" />
          Show {hiddenCount} more exception{hiddenCount > 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
