import type { ReactNode } from "react";
import type { InteractionSurfaceKind } from "@athyper/runtime-contracts";

/**
 * Mobile transform per shell. Most surfaces collapse to a full-screen sheet;
 * `dialog-confirm` keeps its centered form (small confirmation has no benefit
 * from full-screen), and `page` / `overlay` are already full-viewport.
 */
export type ShellMobileMode = "identical" | "sheet" | "centered";

/** Default mobile transform per kind. Phase 2 wires this; Phase 3 lets the
 *  StackController override per stack frame if needed. */
export const SHELL_DEFAULT_MOBILE_MODE: Record<InteractionSurfaceKind, ShellMobileMode> = {
  page: "identical",
  overlay: "identical",
  "drawer-form": "sheet",
  "drawer-peek": "sheet",
  "modal-select": "sheet",
  "dialog-confirm": "centered",
};

/** Width tokens recognized by drawer-form / modal-select shells. */
export type ShellWidth = "compact" | "default" | "wide" | "grid" | "full";

/** Common open/dismiss contract — every floating shell takes the same shape. */
export interface ControlledOpenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Slot prop shape — required slots throw at the type level when omitted. */
export type SlotNode = ReactNode;
