"use client";

import { type ReactNode } from "react";
import { DrawerShell } from "../../primitives/drawer-shell";
import { useStackFrame } from "../stack";
import type { ControlledOpenProps, ShellWidth, SlotNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// DrawerFormShell — right-side overlay for create/edit of a subordinate object.
//
// Sits on top of the existing `DrawerShell` primitive with the
// "transactional" intent (strong blur scrim). Adds typed slot names that
// match the surface standard (contextBadge / title / subtitle / prevNext /
// liveStatus / secondaryAction / primaryAction).
//
// The shell itself does NOT own the dirty guard — Phase 3's
// SurfaceStackController will handle Esc/backdrop dismiss + dirty guard
// composition. Today the shell only signals via `onDismissAttempt`.
// ─────────────────────────────────────────────────────────────────────────────

const WIDTH_PRESETS: Record<ShellWidth, { default: number | string; min?: number | string; expanded?: number | string }> = {
  compact: { default: 420, min: 360 },
  default: { default: 520, min: 380 },
  wide: { default: 680, min: 480, expanded: "80vw" },
  grid: { default: 820, min: 560, expanded: "85vw" },
  full: { default: "85vw", min: 480 },
};

export interface DrawerFormShellProps extends ControlledOpenProps {
  /** Width preset — maps to width: enum in the operation contract. */
  width?: ShellWidth;
  /** Optional exact initial width for domain drawer families (for example 70vw). */
  defaultWidth?: number | string;
  /** Small chip rendered next to the title — e.g. "INVOICE LINE". */
  contextBadge?: SlotNode;
  /** Primary title (live summary). */
  title?: SlotNode;
  /** Subtitle below the title. */
  subtitle?: SlotNode;
  /** Slot for prev/next navigation between sibling items. */
  prevNext?: SlotNode;
  /** Optional sub-header strip below the title row (e.g. tab bar). */
  subHeader?: SlotNode;
  /** Live status string — totals, validation hint, etc. */
  liveStatus?: SlotNode;
  /** Secondary action button (cancel / save-draft). */
  secondaryAction?: SlotNode;
  /** Primary action button (commit). */
  primaryAction?: SlotNode;
  /** Drawer body. */
  children: ReactNode;
  /**
   * Whether the expand affordance is shown (promotes to expand_route in Phase
   * 3). Has no effect today — the shell just exposes the chrome.
   */
  expandable?: boolean;
  /** Optional persist key for user-resized widths. */
  widthKey?: string;
}

export function DrawerFormShell({
  open,
  onOpenChange,
  width = "default",
  defaultWidth,
  contextBadge,
  title,
  subtitle,
  prevNext,
  subHeader,
  liveStatus,
  secondaryAction,
  primaryAction,
  children,
  expandable = false,
  widthKey,
}: DrawerFormShellProps) {
  useStackFrame({ open, kind: "drawer-form", source: "drawer-form-shell" });

  const preset = WIDTH_PRESETS[width];
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="transactional"
      widthKey={widthKey}
      defaultWidth={defaultWidth ?? preset.default}
      minWidth={preset.min}
      expandedWidth={preset.expanded}
      expandable={expandable}
      badge={typeof contextBadge === "string" ? contextBadge : undefined}
      badgeDetail={typeof contextBadge === "string" ? undefined : contextBadge}
      title={title}
      subtitle={subtitle}
      headerRight={prevNext}
      headerBottom={subHeader}
      footerStart={liveStatus}
      footerClassName="px-7 py-2.5"
      footerEnd={
        secondaryAction || primaryAction ? (
          <>
            {secondaryAction}
            {primaryAction}
          </>
        ) : undefined
      }
      className="data-[interaction-surface=drawer-form]:contents"
    >
      <div data-interaction-surface="drawer-form" data-surface-slot="body" className="contents">
        {children}
      </div>
    </DrawerShell>
  );
}

