"use client";

import { Loader2 } from "lucide-react";

/**
 * Inline skeleton banner shown while the document workspace is being
 * resolved after the user landed on `/edit` (or clicked an Edit affordance
 * with `autoEnterEdit`). Without this, the page briefly renders view-mode
 * chrome + fields before the editing chip + sticky Save/Discard actions
 * appear once `useDocumentEditDraft.enterEdit()` resolves.
 *
 * Mounted ABOVE the chrome so the visual focus immediately signals
 * "intentional state transition in progress" rather than letting the user
 * see a flash of view mode.
 *
 * Hidden when:
 *   - `isEditing === true`   (transition completed)
 *   - `contextError != null` (transition failed — the page surfaces the
 *     error via its own error path; the skeleton would stack noise)
 */
export interface EnteringEditSkeletonProps {
  visible: boolean;
  className?: string;
}

export function EnteringEditSkeleton({ visible, className }: EnteringEditSkeletonProps) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "flex items-center gap-2 rounded-md border border-border bg-muted/40",
        "px-3 py-2 text-xs text-muted-foreground",
        className ?? "",
      ].filter(Boolean).join(" ")}
    >
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      <span>Entering edit mode…</span>
    </div>
  );
}
