// ─────────────────────────────────────────────────────────────────────────────
// Interaction surface shells — six typed hosts mapping 1:1 to
// `InteractionSurfaceKind` from @athyper/runtime-contracts.
//
// Shells are dumb hosts: they own chrome, slot composition, and the
// per-kind dismiss policy. Features supply content via typed slot props.
// SurfaceStackController (sibling ./stack) auto-tracks frames via the
// `useStackFrame` hook each shell calls internally.
// ─────────────────────────────────────────────────────────────────────────────

export { PageShell, type PageShellProps } from "./page-shell";
export { OverlayShell, type OverlayShellProps } from "./overlay-shell";
export { DrawerFormShell, type DrawerFormShellProps } from "./drawer-form-shell";
export { DrawerPeekShell, type DrawerPeekShellProps } from "./drawer-peek-shell";
export { ModalSelectShell, type ModalSelectShellProps } from "./modal-select-shell";
export { DialogConfirmShell, type DialogConfirmShellProps } from "./dialog-confirm-shell";

export {
  SHELL_DEFAULT_MOBILE_MODE,
  type ControlledOpenProps,
  type ShellMobileMode,
  type ShellWidth,
  type SlotNode,
} from "./types";

