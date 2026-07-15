"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { EditGuardModalProps } from "@athyper/runtime-shared";
import { DialogConfirmShell } from "@athyper/ui/surfaces/shells";

// ─────────────────────────────────────────────────────────────────────────────
// RuntimeEditGuardDialog — Phase 3 migration of the unsaved-changes guard
// dialog onto the typed `DialogConfirmShell`. Drop-in replacement for the
// legacy `EditGuardModal` (matches its props verbatim) so EntityWorkspaceShell
// can swap it in via `renderGuardDialog` without changing any caller signature.
//
// Architectural wins over the legacy AlertDialog:
//   • Auto-registers as a `dialog-confirm` frame with the SurfaceStackController
//     (via DialogConfirmShell's internal useStackFrame call).
//   • `intent="destructive"` disables backdrop/Esc dismissal so an accidental
//     click can't lose unsaved work.
//   • `consequence` is type-required, ensuring the dialog always names the
//     concrete outcome of leaving (per surface standard §3 dialog-confirm).
// ─────────────────────────────────────────────────────────────────────────────

export function RuntimeEditGuardDialog({
  open,
  editState,
  onStay,
  onLeave,
  pendingNavFn,
}: EditGuardModalProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleStay = () => {
    setSaveError(null);
    onStay();
  };

  const handleDiscard = () => {
    editState?.discard();
    onLeave();
    pendingNavFn?.();
  };

  const handleSaveAndLeave = async () => {
    if (!editState) return;
    setSaveError(null);
    setSaving(true);
    try {
      const result = await editState.save();
      if (result.ok) {
        onLeave();
        pendingNavFn?.();
      } else {
        setSaveError(result.globalError ?? "Save failed. Please try again.");
      }
    } catch {
      setSaveError("An unexpected error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogConfirmShell
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleStay();
      }}
      intent="destructive"
      title="Unsaved changes"
      consequence="You have unsaved changes on this record. Save before leaving, or discard them."
      cancel={
        <button
          type="button"
          onClick={handleStay}
          disabled={saving}
          className={buttonClassName()}
        >
          Stay
        </button>
      }
      confirm={
        <>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={saving}
            className={buttonClassName()}
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAndLeave()}
            disabled={saving}
            aria-busy={saving}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
              "hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save and leave
          </button>
          {saveError ? (
            <span
              role="alert"
              className="ml-2 text-xs text-destructive"
            >
              {saveError}
            </span>
          ) : null}
        </>
      }
    />
  );
}

function buttonClassName(): string {
  return cn(
    "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium",
    "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
  );
}

