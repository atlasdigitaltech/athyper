"use client";

import { X } from "lucide-react";
import { ORGANIZE_FIELD_CARD_CLASS, ORGANIZE_FIELD_LABEL_CLASS, ORGANIZE_ICON_BUTTON_CLASS } from "./styles";

interface ActiveFilterCardProps {
  /** Field / dimension label shown at the top of the card. */
  label: string;
  /** Called when the user clicks the dismiss (×) button. */
  onClear: () => void;
  /**
   * Optional content rendered between the field label and the filter editor —
   * intended for compact null-presence toggles ("is empty" / "has value").
   * Renders on the same row as the label only when the slot is non-empty.
   */
  headerActions?: React.ReactNode;
  /** Additional classes merged onto the outer card element. */
  className?: string;
  /** Filter editor content (status pills, date pickers, text inputs, etc.). */
  children?: React.ReactNode;
}

/**
 * Shell component for an active filter card in the organize palette.
 *
 * Layout:
 * ```
 * ┌──────────────────────────────────────────────┐
 * │  Field label              [null pills?]  [×]  │  ← header row
 * ├──────────────────────────────────────────────┤  ← separator (when children)
 * │  [filter editor — status chips / pickers]     │  ← body
 * └──────────────────────────────────────────────┘
 * ```
 *
 * The left border accent (2px, foreground/20) signals that this card
 * represents an active constraint on the current data set.
 */
export function ActiveFilterCard({
  label,
  onClear,
  headerActions,
  className,
  children,
}: ActiveFilterCardProps) {
  return (
    <div className={[ORGANIZE_FIELD_CARD_CLASS, className].filter(Boolean).join(" ")}>
      {/* Header row ── field name + optional null-check pills + dismiss */}
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p className={`${ORGANIZE_FIELD_LABEL_CLASS} min-w-0 truncate`}>{label}</p>
        <div className="flex shrink-0 items-center gap-1">
          {headerActions}
          <button
            type="button"
            aria-label={`Remove ${label} filter`}
            onClick={onClear}
            className={ORGANIZE_ICON_BUTTON_CLASS}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Body ── filter editor with visual separation from header */}
      {children != null && (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
