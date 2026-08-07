/**
 * @athyper/shell — ShellLayout
 *
 * Root layout frame for the authenticated app (v2 — spec-aligned).
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐  ← full-width header (48px)
 *   ├──────┬──────────┬──────────────────────────┤
 *   │ Rail │  Panel   │  Main content            │
 *   │ 54px │ 252px    │  (flex-1)                │
 *   │ always│(toggleable)                        │
 *   └──────┴──────────┴──────────────────────────┘
 *
 * The header spans the full viewport width — it is NOT offset by the rail/panel.
 * This matches the spec where the brand mark, tenant chip, scope chips, workbench
 * toggle, search bar, create, notifications, and avatar all live in one global bar.
 *
 * On mobile (< md): rail and panel are hidden. Plane shells pair this frame
 * with the shared ResponsiveNavigationDrawer exported by @athyper/shell.
 */

import { type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface ShellLayoutProps {
  /** 54px persistent icon rail (NavRail). */
  rail: ReactNode;
  /** 252px collapsible context panel (ContextPanel). */
  panel: ReactNode;
  /** Whether the context panel is visible. Rail is always visible. */
  panelOpen?: boolean;
  /** Full-width topbar (Topbar). */
  topbar: ReactNode;
  /** Optional banners between topbar and body (e.g. delegation notice). */
  banner?: ReactNode;
  children: ReactNode;
}

export function ShellLayout({
  rail,
  panel,
  panelOpen = false,
  topbar,
  banner,
  children,
}: ShellLayoutProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* ── Full-width header ─────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-background px-2">
        {topbar}
      </header>

      {/* ── Optional banners (delegation, session error, etc.) ── */}
      {banner}

      {/* ── Body: rail + panel + content ─────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Rail — always 54px on md+ */}
        <nav
          aria-label="Workspace navigation"
          className="hidden w-nav-rail shrink-0 border-r border-sidebar-border bg-sidebar md:flex"
        >
          {rail}
        </nav>

        {/* Context panel — 252px, collapsible */}
        <aside
          aria-label="Module navigation"
          className={cn(
            "hidden shrink-0 border-r border-border bg-background md:flex md:flex-col",
            panelOpen ? "w-context-panel" : "w-0 overflow-hidden border-0",
            "transition-[width] duration-200",
          )}
        >
          {panelOpen && panel}
        </aside>

        {/* Main content */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* data-scroll-root marks this element as the page's scroll container.
              Page-level hooks (scrollspy, sticky-pin triggers) discover it via
              document.querySelector("[data-scroll-root]") without coupling to
              @athyper/shell. There must be at most one per shell tree. */}
          <div
            data-scroll-root
            className="min-h-0 flex-1 overflow-y-auto px-4 py-2 [scroll-padding-top:calc(var(--entity-header-offset,0px)+1rem)] lg:px-6 lg:py-3"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
