/**
 * @athyper/document-runtime — DocumentIdentityCard
 *
 * Layout:
 *   LEFT  — [Type chip]  |  [number + status badge (row 1)]
 *                           [description / title    (row 2)]
 *   RIGHT — [● Action buttons]  (dark filled)
 *           [● due meta line]   (intent-colored)
 */
"use client";

import React from "react";
import { cn } from "@athyper/theme/utils";

// ── Public types ───────────────────────────────────────────────────────────

export interface IdentityAction {
  action: string;
  label: string;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

export interface IdentityDueMeta {
  label: string;
  date?: string;
  terms?: string;
  intent: "success" | "warning" | "error" | "info" | "neutral";
}

export interface DocumentIdentityCardProps {
  typeLabel: string;
  number: string;
  statusLabel: string;
  /** Drives the color of the status badge */
  statusIntent?: "success" | "warning" | "error" | "info" | "neutral";
  /** Document title / description shown on the second row */
  title?: string;
  /** Due-date summary shown below action buttons */
  dueMeta?: IdentityDueMeta;
  actions?: IdentityAction[];
  /** Slot override — renders instead of the built-in action buttons */
  actionsSlot?: React.ReactNode;
  blockedReasons?: string[];
  onAction?: (action: string) => void;
  className?: string;
}

// ── Intent maps ────────────────────────────────────────────────────────────


const INTENT_DOT: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error:   "bg-destructive",
  info:    "bg-info",
  neutral: "bg-muted-foreground/50",
};

const INTENT_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  error:   "text-destructive",
  info:    "text-info",
  neutral: "text-muted-foreground",
};

// ── Status badge ───────────────────────────────────────────────────────────


// ── Dark dot-button ────────────────────────────────────────────────────────

function DotButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-[7px] h-[34px] px-3.5 rounded-lg text-xs font-semibold tracking-wider leading-none whitespace-nowrap transition-opacity",
        variant === "destructive"
          ? "bg-destructive text-destructive-foreground hover:opacity-90"
          : "bg-foreground text-background hover:opacity-85",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-background/60 flex-none" />
      {label}
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DocumentIdentityCard({
  typeLabel,
  number,
  statusLabel,
  statusIntent = "neutral",
  title,
  dueMeta,
  actions = [],
  actionsSlot,
  blockedReasons = [],
  onAction,
  className,
}: DocumentIdentityCardProps) {
  const isBlocked      = blockedReasons.length > 0;
  const visibleActions = actions.slice(0, 3);
  const hasOverflow    = actions.length > 3;

  const rightSlot = actionsSlot ?? (
    visibleActions.length > 0 && (
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {visibleActions.map((a) => (
          <DotButton
            key={a.action}
            label={a.label}
            onClick={() => onAction?.(a.action)}
            variant={a.variant}
            disabled={a.disabled || (isBlocked && a.variant !== "destructive")}
          />
        ))}
        {hasOverflow && (
          <DotButton label="More" onClick={() => onAction?.("__more")} />
        )}
      </div>
    )
  );

  return (
    <div className={cn("px-4 py-2 sm:px-5 lg:px-[22px] bg-muted/50", className)}>
      {/* Outer row: left identity zone + right action zone — wraps on mobile */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">

        {/* ── LEFT: [Type chip] | [number+status / description] ──────── */}
        <div className="flex items-center gap-3 min-w-0 flex-1" style={{ minWidth: "200px" }}>

          {/* Column 1 — type chip (logo/brand) */}
          <span className="inline-flex items-center h-[34px] px-4 rounded-lg bg-foreground text-background text-xs font-semibold tracking-wider shrink-0 leading-none">
            {typeLabel}
          </span>

          {/* Column 2 — stacked [code + status] / name */}
          <div className="min-w-0">
            {/* Row 1: code + status badge inline */}
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm font-semibold tabular-nums text-foreground leading-tight">
                {number}
              </span>
              <span className="inline-flex items-center h-[18px] px-[7px] rounded-[4px] text-xs font-semibold bg-muted text-muted-foreground border border-border leading-none shrink-0">
                {statusLabel}
              </span>
            </div>
            {/* Row 2: description */}
            {title && (
              <div className="mt-[3px] text-xs font-medium text-muted-foreground leading-snug truncate max-w-[340px]">
                {title}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: action buttons + due meta ───────────────────────── */}
        {(rightSlot || dueMeta) && (
          <div className="flex-none flex flex-col items-end gap-[6px] self-center">
            {rightSlot}

            {dueMeta && (
              <div className="flex items-center gap-1.5 text-xs flex-wrap justify-end">
                <span className={cn(
                  "w-[6px] h-[6px] rounded-full flex-none shrink-0",
                  INTENT_DOT[dueMeta.intent] ?? INTENT_DOT.neutral,
                )} />
                <span className={cn(
                  "font-medium",
                  INTENT_TEXT[dueMeta.intent] ?? INTENT_TEXT.neutral,
                )}>
                  {dueMeta.label}
                </span>
                {dueMeta.date  && <span className="text-muted-foreground">· {dueMeta.date}</span>}
                {dueMeta.terms && <span className="text-muted-foreground">· {dueMeta.terms}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
