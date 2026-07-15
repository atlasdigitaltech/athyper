"use client";

/**
 * DerivedChip — compact read-only chip for a derived field.
 *
 * Two visual states:
 *   locked       — padlock icon, value shown, no interaction
 *   overrideable — pencil icon when hovered, click triggers override mode
 *
 * Override mode: replaces the chip with an inline edit input.
 * When the user submits the override a small "overridden" badge appears.
 */

import { useState } from "react";
import { Pencil, Lock, Check, X, RotateCcw } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface DerivedChipProps {
  label: string;
  value: unknown;
  /** Human-readable label to show instead of the raw value (e.g. "Net 30 Days" for a UUID). */
  displayLabel?: string;
  derivationHint?: string;
  isOverrideable: boolean;
  canOverride: boolean;
  isOverridden: boolean;
  onOverride?: (value: unknown) => void;
  onReset?: () => void;
  className?: string;
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export function DerivedChip({
  label,
  value,
  displayLabel,
  derivationHint,
  isOverrideable,
  canOverride,
  isOverridden,
  onOverride,
  onReset,
  className,
}: DerivedChipProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function startEdit() {
    if (!isOverrideable || !canOverride || !onOverride) return;
    setEditValue(displayValue(value));
    setEditing(true);
  }

  function commitEdit() {
    onOverride?.(editValue);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          {label}
        </span>
        <input
          autoFocus
          className="h-6 w-24 rounded border border-border bg-background px-1.5 text-xs"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
        />
        <button
          type="button"
          onClick={commitEdit}
          className="rounded p-0.5 hover:bg-muted"
        >
          <Check className="h-3 w-3 text-success" />
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className="rounded p-0.5 hover:bg-muted"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1",
        "transition-colors",
        isOverrideable && canOverride && "cursor-pointer hover:bg-muted/70 hover:border-border/70",
        isOverridden && "border-warning/40 bg-warning/5",
        className,
      )}
      title={derivationHint}
      onClick={startEdit}
    >
      {/* Lock / pencil icon */}
      {isOverrideable && canOverride ? (
        <Pencil
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-muted-foreground transition-opacity",
            "opacity-0 group-hover:opacity-100",
            isOverridden && "opacity-100 text-warning",
          )}
        />
      ) : (
        <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
      )}

      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>

      <span className="text-xs font-medium text-foreground">
        {value !== null && value !== undefined ? (displayLabel ?? displayValue(value)) : (
          <span className="italic text-muted-foreground/60">deriving…</span>
        )}
      </span>

      {isOverridden && onReset && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReset(); }}
          className="ml-0.5 rounded p-0.5 hover:bg-muted"
          title="Reset to derived value"
        >
          <RotateCcw className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
