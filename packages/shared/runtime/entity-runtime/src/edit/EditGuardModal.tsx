"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@athyper/ui/primitives";
import type { EntityEditState } from "./types";

export interface EditGuardModalProps {
  open: boolean;
  editState: EntityEditState | undefined;
  /** Called when the user picks "Stay" or the modal closes without action. */
  onStay: () => void;
  /** Called after discard+nav or save+nav completes successfully. */
  onLeave: () => void;
  /** The navigation function to run after discard or successful save. */
  pendingNavFn: (() => void) | null;
}

/**
 * Navigation-guard confirmation dialog.
 *
 * Three choices:
 *   Stay            → close modal, remain on page
 *   Discard changes → run editState.discard(), then navigate
 *   Save and leave  → await editState.save(); navigate on success,
 *                     show inline error on failure
 */
export function EditGuardModal({
  open,
  editState,
  onStay,
  onLeave,
  pendingNavFn,
}: EditGuardModalProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleStay = () => {
    setSaveError(null);
    onStay();
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleStay(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Do you want to save before leaving, or
            discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {saveError && (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {saveError}
          </p>
        )}

        <AlertDialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:justify-between">
          {/* Stay — left-aligned on desktop */}
          <button
            type="button"
            onClick={handleStay}
            disabled={saving}
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium",
              "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            Stay
          </button>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            {/* Discard */}
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              className={cn(
                "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium",
                "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              Discard changes
            </button>

            {/* Save and leave */}
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
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save and leave
            </button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
