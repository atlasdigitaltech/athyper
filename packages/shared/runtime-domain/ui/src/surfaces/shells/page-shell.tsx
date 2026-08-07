"use client";

import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import type { SlotNode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// PageShell — routed destination layout primitive.
//
// Page is the "page" interaction surface kind: a real route, bookmarkable,
// hosts its own dirty/leave guard. The shell itself is layout-only — it does
// not own routing, history, or leave-guard behavior. Those live on the
// consuming page component (Next.js route segment) which composes PageShell.
//
// Slots: header / toolbar / sidepanel / children (body).
// ─────────────────────────────────────────────────────────────────────────────

export interface PageShellProps {
  /** Page-level header (title, breadcrumbs, actions). Spans full content width. */
  header?: SlotNode;
  /** Sticky toolbar below the header — filters, view switcher, search. */
  toolbar?: SlotNode;
  /** Side panel rendered to the right of the body on ≥md viewports. */
  sidepanel?: SlotNode;
  /** Body content. */
  children: ReactNode;
  className?: string;
  /**
   * Test/runtime hook for the StackController to discover live page shells.
   * Defaults to "page" — features should not override.
   */
  "data-interaction-surface"?: string;
}

export function PageShell({
  header,
  toolbar,
  sidepanel,
  children,
  className,
  "data-interaction-surface": dataKind = "page",
}: PageShellProps) {
  return (
    <div
      data-interaction-surface={dataKind}
      className={cn("flex flex-col min-h-screen w-full bg-background", className)}
    >
      {header && (
        <div data-surface-slot="header" className="shrink-0 border-b border-border">
          {header}
        </div>
      )}
      {toolbar && (
        <div
          data-surface-slot="toolbar"
          className="shrink-0 sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur"
        >
          {toolbar}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <div data-surface-slot="body" className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </div>
        {sidepanel && (
          <aside
            data-surface-slot="sidepanel"
            className="hidden md:flex shrink-0 w-80 border-l border-border bg-muted/20 overflow-y-auto"
          >
            {sidepanel}
          </aside>
        )}
      </div>
    </div>
  );
}
