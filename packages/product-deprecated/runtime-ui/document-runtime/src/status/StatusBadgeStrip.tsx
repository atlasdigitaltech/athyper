/**
 * @athyper/document-runtime — Status Badge Strip
 *
 * Spec v1.2 §C.6: Renders multi-dimensional status badges inline.
 * Each badge maps a status dimension (lifecycle, accounting, settlement, matching)
 * to a compact icon-backed pill using semantic colors.
 *
 * Distinct from StatusLanes — these are compact inline badges for the header
 * identity bar, not the clickable lane chips below the header.
 */
"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  MinusCircle,
  ArrowRight,
  PauseCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { type StatusDimension } from "@athyper/api-contracts/documents";

export interface StatusBadgeStripProps {
  dimensions: StatusDimension[];
  className?: string;
}

const INTENT_ICON: Record<SemanticIntent, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  neutral: MinusCircle,
  primary: ArrowRight,
  muted: PauseCircle,
  accent: Sparkles,
};

export function StatusBadgeStrip({ dimensions, className }: StatusBadgeStripProps) {
  if (dimensions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {dimensions.map((dim) => {
        const intent = dim.intent as SemanticIntent;
        const colors = resolveSemanticColors(intent);
        const Icon = INTENT_ICON[intent] ?? MinusCircle;

        return (
          <span
            key={dim.dimension}
            role="status"
            title={`${dim.label}: ${dim.status_label}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
              colors.subtleBadge,
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="capitalize">{dim.status_label}</span>
          </span>
        );
      })}
    </div>
  );
}
