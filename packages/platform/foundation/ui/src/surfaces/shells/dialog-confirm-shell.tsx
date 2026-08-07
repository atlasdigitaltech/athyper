"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@athyper/platform-theme/utils";
import { overlayScrimVariants } from "../../primitives/overlay";
import { useStackFrame } from "../stack";
import type { ControlledOpenProps, SlotNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// DialogConfirmShell — small centered dialog for irreversible or destructive
// confirmation.
//
// The `consequence` prop is REQUIRED at the type level. Authors must name
// the specific outcome ("5 lines will be removed"), never a generic "Are you
// sure?". The schema (Rule 3) enforces the same at descriptor validation.
//
// For `intent: "destructive"` the backdrop does not dismiss — only an
// explicit cancel click closes the dialog.
// ─────────────────────────────────────────────────────────────────────────────

export interface DialogConfirmShellProps extends ControlledOpenProps {
  /** Short headline above the consequence. */
  title?: SlotNode;
  /**
   * REQUIRED. The specific outcome of confirming. Must be non-empty — the
   * type only accepts string here so the lint signal is unambiguous.
   * Use the descriptor-level `consequence` (interactionOptions.consequence)
   * as the source where possible.
   */
  consequence: string;
  intent?: "neutral" | "destructive";
  /** Required cancel control. Closes the dialog. */
  cancel: SlotNode;
  /** Required confirm control. Caller's onClick runs the destructive action. */
  confirm: SlotNode;
  className?: string;
}

export function DialogConfirmShell({
  open,
  onOpenChange,
  title,
  consequence,
  intent = "neutral",
  cancel,
  confirm,
  className,
}: DialogConfirmShellProps) {
  // Register with the SurfaceStackController (no-op if no provider mounted).
  useStackFrame({ open, kind: "dialog-confirm", source: "dialog-confirm-shell" });

  // Destructive dialogs: ignore overlay click + Esc → click-outside dismissal
  // (Esc still works via Radix unless we also intercept onEscapeKeyDown; for
  // destructive flows we intercept both to force an explicit choice).
  const guardProps =
    intent === "destructive"
      ? {
          onPointerDownOutside: (e: Event) => e.preventDefault(),
          onEscapeKeyDown: (e: Event) => e.preventDefault(),
        }
      : {};

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-modal",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
            overlayScrimVariants({ tone: "modal" }),
          )}
        />
        <DialogPrimitive.Content
          data-interaction-surface="dialog-confirm"
          data-intent={intent}
          {...guardProps}
          className={cn(
            "fixed left-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md rounded-lg border bg-background p-5 shadow-lg",
            "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out",
            className,
          )}
        >
          {title && (
            <DialogPrimitive.Title className="text-base font-medium leading-tight text-foreground">
              {title}
            </DialogPrimitive.Title>
          )}
          <DialogPrimitive.Description
            data-surface-slot="consequence"
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              title ? "mt-2" : "mt-0",
            )}
          >
            {consequence}
          </DialogPrimitive.Description>
          <div
            data-surface-slot="footer"
            className="mt-5 flex items-center justify-end gap-2"
          >
            {cancel}
            {confirm}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
