"use client";

import { type ReactNode } from "react";
import { DrawerShell } from "../../primitives/DrawerShell";
import { useStackFrame } from "../stack";
import type { ControlledOpenProps, SlotNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// DrawerPeekShell — non-modal right-side panel for reading while the parent
// list stays interactive.
//
// Read-only by definition. No scrim — the parent grid stays clickable. Row
// selection on the parent swaps content in place via `onPrev` / `onNext`
// arrow-key handlers wired by the consumer.
//
// Entering Edit Mode from a peek surface should *swap* to a DrawerFormShell
// or navigate to the page route — the StackController owns that transition
// (Phase 3); the peek shell itself does not transform.
// ─────────────────────────────────────────────────────────────────────────────

export interface DrawerPeekShellProps extends ControlledOpenProps {
  /** Optional badge / context chip next to the title. */
  contextBadge?: SlotNode;
  /** Title — usually the focused row's name. */
  title?: SlotNode;
  /** Subtitle (status, lineage). */
  subtitle?: SlotNode;
  /** Read-only actions slot — typically "Expand" or "Edit" triggers. */
  actions?: SlotNode;
  /** Sub-header (e.g. tab strip). */
  subHeader?: SlotNode;
  /** Body content. */
  children: ReactNode;
  /** Optional width persist key. */
  widthKey?: string;
  /** px number or CSS string ("60vw"). Defaults to 460. */
  defaultWidth?: number | string;
  /** px number or CSS string. Defaults to 360. */
  minWidth?: number | string;
  /** px number or CSS string. Defaults to "60vw". */
  maxWidth?: number | string;
  /** When provided, peek can be expanded to this width on double-click. */
  expandedWidth?: number | string;
  /** Whether the user can resize via the drag handle. Defaults to true. */
  resizable?: boolean;
  /** Whether the peek can be expanded to `expandedWidth` on double-click. */
  expandable?: boolean;
}

export function DrawerPeekShell({
  open,
  onOpenChange,
  contextBadge,
  title,
  subtitle,
  actions,
  subHeader,
  children,
  widthKey,
  defaultWidth = 460,
  minWidth = 360,
  maxWidth = "60vw",
  expandedWidth,
  resizable = true,
  expandable,
}: DrawerPeekShellProps) {
  useStackFrame({ open, kind: "drawer-peek", source: "DrawerPeekShell" });

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={widthKey}
      defaultWidth={defaultWidth}
      minWidth={minWidth}
      maxWidth={maxWidth}
      expandedWidth={expandedWidth}
      resizable={resizable}
      expandable={expandable ?? expandedWidth !== undefined}
      badge={typeof contextBadge === "string" ? contextBadge : undefined}
      badgeDetail={typeof contextBadge === "string" ? undefined : contextBadge}
      title={title}
      subtitle={subtitle}
      headerRight={actions}
      headerBottom={subHeader}
    >
      <div data-interaction-surface="drawer-peek" data-surface-slot="body" className="contents">
        {children}
      </div>
    </DrawerShell>
  );
}
