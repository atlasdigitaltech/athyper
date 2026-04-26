/**
 * @athyper/document-runtime — DocumentIdentityCard
 *
 * Layout (single row, wraps on narrow viewports):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ [back?][TYPE]   number  status        [● action][● action]  │
 *   │                 description                  ● due meta     │
 *   └─────────────────────────────────────────────────────────────┘
 */
"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";

// ── Types ──────────────────────────────────────────────────────────

export type Intent = "success" | "warning" | "error" | "info" | "neutral";

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
  intent: Intent;
}

export interface DocumentIdentityCardProps {
  /** Type label shown in the leading chip (e.g. "INVOICE"). */
  typeLabel: string;
  /** Document number / business key (e.g. "INV-2025-0042"). */
  number: string;
  statusLabel: string;
  /** Drives the colour of the status badge. */
  statusIntent?: Intent;
  /** Document title / description shown on the second row. */
  title?: string;
  /** Due-date summary shown beneath the action buttons. */
  dueMeta?: IdentityDueMeta;
  /** First three actions render as buttons; any extras collapse into "More". */
  actions?: IdentityAction[];
  /** Slot override — renders instead of the built-in action buttons. */
  actionsSlot?: ReactNode;
  /** When non-empty, all non-destructive actions are disabled and reasons surface as a tooltip. */
  blockedReasons?: string[];
  onAction?: (action: string) => void;
  /** Renders a back-arrow split with the type chip. */
  onBack?: () => void;
  /** Optional click handler on the type chip. When omitted, the chip is non-interactive. */
  onTypeClick?: () => void;
  className?: string;
}

const MAX_VISIBLE_ACTIONS = 3;

// ── Sub-components ─────────────────────────────────────────────────

function TypeChip({
  label,
  onClick,
  standalone = true,
}: {
  label: string;
  onClick?: () => void;
  /** false when nested inside the back-pill wrapper (which supplies its own border/radius). */
  standalone?: boolean;
}) {
  const baseClass = cn(
    "inline-flex items-center h-[34px] px-4 leading-none shrink-0",
    "bg-foreground text-background text-xs font-semibold tracking-wider",
    standalone && "rounded-full border border-border",
    onClick && "transition-opacity hover:opacity-85",
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={baseClass}>
      {label}
    </button>
  ) : (
    <span className={baseClass}>{label}</span>
  );
}

function StatusBadge({ label, intent }: { label: string; intent: Intent }) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[18px] px-[7px] rounded-sm",
        "text-xs font-semibold leading-none border shrink-0",
        resolveSemanticColors(intent).subtleBadge,
      )}
    >
      {label}
    </span>
  );
}

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
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 h-[34px] px-3.5 rounded-lg",
        "text-xs font-semibold tracking-wider leading-none whitespace-nowrap",
        "transition-opacity",
        variant === "destructive"
          ? "bg-destructive text-destructive-foreground hover:opacity-90"
          : "bg-foreground text-background hover:opacity-85",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-background/60 flex-none" />
      {label}
    </button>
  );
}

function DueMetaLine({ meta }: { meta: IdentityDueMeta }) {
  const colors = resolveSemanticColors(meta.intent);
  return (
    <div className="flex items-center gap-1.5 text-xs flex-wrap justify-end">
      <span aria-hidden className={cn("size-1.5 rounded-full flex-none", colors.dot)} />
      <span className={cn("font-medium", colors.text)}>{meta.label}</span>
      {meta.date  && <span className="text-muted-foreground">· {meta.date}</span>}
      {meta.terms && <span className="text-muted-foreground">· {meta.terms}</span>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

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
  onBack,
  onTypeClick,
  className,
}: DocumentIdentityCardProps) {
  const isBlocked = blockedReasons.length > 0;
  const visible   = actions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflow  = actions.length > MAX_VISIBLE_ACTIONS;

  const renderedActions: ReactNode = actionsSlot ?? (visible.length > 0 ? (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {visible.map((a) => (
        <DotButton
          key={a.action}
          label={a.label}
          variant={a.variant}
          disabled={a.disabled || (isBlocked && a.variant !== "destructive")}
          onClick={() => onAction?.(a.action)}
        />
      ))}
      {overflow && <DotButton label="More" onClick={() => onAction?.("__more")} />}
    </div>
  ) : null);

  const showRightColumn = renderedActions || dueMeta;

  return (
    <div className={cn("px-4 py-2 sm:px-5 lg:px-[22px] bg-muted/50", className)}>
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">

        {/* LEFT: identity zone */}
        <div className="flex items-center gap-3 flex-1 min-w-[200px]">

          {onBack ? (
            <div className="inline-flex items-center h-[34px] rounded-full border border-border overflow-hidden shrink-0">
              <button
                type="button"
                onClick={onBack}
                aria-label="Go back"
                className="flex items-center justify-center h-full w-9 bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-r border-border"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <TypeChip label={typeLabel} onClick={onTypeClick} standalone={false} />
            </div>
          ) : (
            <TypeChip label={typeLabel} onClick={onTypeClick} />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm font-semibold tabular-nums text-foreground leading-tight">
                {number}
              </span>
              <StatusBadge label={statusLabel} intent={statusIntent} />
            </div>
            {title && (
              <div className="mt-0.5 text-xs font-medium text-muted-foreground leading-snug truncate max-w-[340px]">
                {title}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: actions + due meta */}
        {showRightColumn && (
          <div
            className="flex-none flex flex-col items-end gap-1.5 self-center"
            title={isBlocked ? blockedReasons.join("\n") : undefined}
          >
            {renderedActions}
            {dueMeta && <DueMetaLine meta={dueMeta} />}
          </div>
        )}
      </div>
    </div>
  );
}