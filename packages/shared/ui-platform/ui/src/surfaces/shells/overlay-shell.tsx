"use client";

import { type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { useStackFrame } from "../stack";
import type { ControlledOpenProps, SlotNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// OverlayShell — full-viewport surface over a mounted parent.
//
// Page-sized body, drawer-style lifecycle. Parent stays mounted underneath.
// Required: a `bindingBar` slot that names the parent context, so the user
// always knows what document/draft they're operating against. Without it the
// overlay is indistinguishable from a page and the binding intent is lost.
//
// No backdrop scrim — the overlay covers the full viewport, so a scrim adds
// no contrast.
// ─────────────────────────────────────────────────────────────────────────────

export interface OverlayShellProps extends ControlledOpenProps {
  /**
   * Required. Names the parent the overlay is bound to ("Invoice INV-0042 ·
   * Edit Mode"). Type-enforced as required so authors can't ship a binding-
   * less overlay.
   */
  bindingBar: SlotNode;
  /** Optional footer for actions / live status. */
  footer?: SlotNode;
  /** Overlay body. */
  children: ReactNode;
  className?: string;
  /** Aria label for the overlay surface (announced by screen readers). */
  ariaLabel?: string;
}

export function OverlayShell({
  open,
  onOpenChange,
  bindingBar,
  footer,
  children,
  className,
  ariaLabel,
}: OverlayShellProps) {
  useStackFrame({ open, kind: "overlay", source: "overlay-shell" });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-label={ariaLabel}
          data-interaction-surface="overlay"
          className={cn(
            "fixed inset-0 z-modal flex flex-col bg-background",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
            className,
          )}
        >
          {/* Radix requires a DialogTitle for screen readers. The visible
              context already lives in the bindingBar; this sr-only title
              mirrors `ariaLabel` so the a11y tree is complete without
              adding a second visible heading. */}
          <DialogPrimitive.Title className="sr-only">
            {ariaLabel ?? "Overlay"}
          </DialogPrimitive.Title>
          <div
            data-surface-slot="bindingBar"
            className="shrink-0 flex min-h-12 items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2"
          >
            <div className="flex-1 min-w-0">{bindingBar}</div>
            <DialogPrimitive.Close
              aria-label="Close overlay"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div data-surface-slot="body" className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </div>
          {footer && (
            <div
              data-surface-slot="footer"
              className="shrink-0 flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-3"
            >
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
