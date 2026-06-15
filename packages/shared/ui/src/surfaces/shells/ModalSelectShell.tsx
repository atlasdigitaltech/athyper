"use client";

import { type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { overlayScrimVariants } from "../../primitives/overlay";
import { useStackFrame } from "../stack";
import type { ControlledOpenProps, ShellWidth, SlotNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// ModalSelectShell — centered wide modal for transient multi-row selection.
//
// Selection grids need columns; default width is "wide" and `width: "grid"`
// promotes to a near-full-width selection table. The shell does not own
// selection state — the consumer renders a grid into the `grid` slot and
// reports the count via the footer `summary` slot.
//
// Esc/backdrop cancels — selection is cheap to redo, no dirty guard.
// ─────────────────────────────────────────────────────────────────────────────

const MODAL_WIDTH_CSS: Record<ShellWidth, string> = {
  compact: "max-w-md",
  default: "max-w-2xl",
  wide: "max-w-4xl",
  grid: "max-w-6xl",
  full: "max-w-[92vw]",
};

export interface ModalSelectShellProps extends ControlledOpenProps {
  width?: ShellWidth;
  /** Required modal title — selection grids must declare their purpose. */
  title: SlotNode;
  /** Optional sub-title. */
  description?: SlotNode;
  /** Filter strip rendered above the grid. */
  filters?: SlotNode;
  /** Required — the selection grid itself. */
  grid: SlotNode;
  /** Selection summary slot — typically "{N} selected" or remaining-budget hints. */
  summary?: SlotNode;
  /** Required — primary confirm action (returns selection to caller). */
  confirm: SlotNode;
  /** Cancel action. */
  cancel?: SlotNode;
  className?: string;
}

export function ModalSelectShell({
  open,
  onOpenChange,
  width = "wide",
  title,
  description,
  filters,
  grid,
  summary,
  confirm,
  cancel,
  className,
}: ModalSelectShellProps) {
  useStackFrame({ open, kind: "modal-select", source: "ModalSelectShell" });

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
          data-interaction-surface="modal-select"
          className={cn(
            "fixed left-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[88vh] w-[92vw] flex-col rounded-lg border bg-background shadow-lg",
            MODAL_WIDTH_CSS[width],
            "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out",
            className,
          )}
        >
          <div
            data-surface-slot="header"
            className="shrink-0 flex items-start justify-between gap-3 border-b border-border px-5 py-3"
          >
            <div className="flex-1 min-w-0">
              <DialogPrimitive.Title className="text-base font-medium leading-tight text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {filters && (
            <div
              data-surface-slot="filters"
              className="shrink-0 border-b border-border bg-muted/30 px-5 py-2"
            >
              {filters}
            </div>
          )}
          <div data-surface-slot="grid" className="flex-1 min-h-0 overflow-auto">
            {grid}
          </div>
          <div
            data-surface-slot="footer"
            className="shrink-0 flex items-center justify-between gap-3 border-t border-border px-5 py-3"
          >
            <div data-surface-slot="summary" className="text-xs text-muted-foreground">
              {summary}
            </div>
            <div className="flex items-center gap-2">
              {cancel}
              {confirm}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
