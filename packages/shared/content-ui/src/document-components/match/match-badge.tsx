/**
 * @athyper/content-ui — MatchBadge
 *
 * Spec v1.1 §4.2 (Lines Grid match column) + acceptance criterion A2 + B1.
 *
 * Renders all four match states from pi_match_status_chk with text +
 * icon + color (no color-alone signifier). The `match_exception` state
 * exposes a click handler — the consumer should navigate to the open
 * match_exception row for that PIL inside its invoice_match_case.
 */
"use client";

import { CheckCircle2, AlertTriangle, CircleDashed, Circle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import type { PiMatchStatus } from "../../purchase-invoice/types";

export interface MatchBadgeProps {
  status: PiMatchStatus;
  /** Optional matched-quantity progress for `partially_matched`. */
  matchedQuantity?: number;
  /** Total quantity to display alongside `matchedQuantity`. */
  totalQuantity?: number;
  /**
   * Click handler. For `match_exception`, the consumer should navigate
   * to the open match_exception row scoped to the line.
   */
  onClick?: () => void;
  className?: string;
}

const STATUS_DESCRIPTOR: Record<PiMatchStatus, {
  label: string;
  intent: SemanticIntent;
  Icon: typeof CheckCircle2;
}> = {
  unmatched:          { label: "Unmatched",  intent: "neutral", Icon: Circle },
  partially_matched:  { label: "Partial",    intent: "warning", Icon: CircleDashed },
  fully_matched:      { label: "Matched",    intent: "success", Icon: CheckCircle2 },
  match_exception:    { label: "Exception",  intent: "error",   Icon: AlertTriangle },
};

export function MatchBadge({
  status,
  matchedQuantity,
  totalQuantity,
  onClick,
  className,
}: MatchBadgeProps) {
  const descriptor = STATUS_DESCRIPTOR[status];
  const colors = resolveSemanticColors(descriptor.intent);
  const Icon = descriptor.Icon;

  // Partial state shows X/Y matched units when available.
  const labelText = status === "partially_matched"
    && matchedQuantity != null
    && totalQuantity != null
      ? `${matchedQuantity}/${totalQuantity}`
      : descriptor.label;

  const isInteractive = Boolean(onClick);

  const content = (
    <>
      <Icon className="h-3 w-3" aria-hidden />
      <span>{labelText}</span>
    </>
  );

  const sharedClass = cn(
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
    colors.subtleBadge,
    className,
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Match status: ${descriptor.label}. Activate to view details.`}
        className={cn(sharedClass, "transition-opacity hover:opacity-85")}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      role="status"
      aria-label={`Match status: ${descriptor.label}`}
      className={sharedClass}
    >
      {content}
    </span>
  );
}
