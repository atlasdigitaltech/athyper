"use client";

/**
 * @athyper/shell — Topbar
 *
 * Full-width header bar. Four zones (left → right):
 *
 *   [Left]          Hamburger · Brand mark · Tenant chip
 *   [Center]        Workbench switcher pills · Delegation indicator
 *   [Stretch]       ← flex-1 spacer
 *   [Center-right]  Search / launcher trigger
 *   [Right]         Notifications · Avatar
 *
 * Scope chips (Co / FY / Book) are NOT in this bar.
 * They belong in the workbench context header, not the global top bar.
 *
 * All dynamic content is injected as ReactNode slots so this component stays
 * free of any session / routing logic — those live in AppTopbar.
 */

import { type ReactNode } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { Button } from "@athyper/platform-ui/primitives";
import { NavBadge } from "./nav-badge";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TopbarProps {
  // ── Left zone ──────────────────────────────────────────
  /** Called when the mobile hamburger is tapped. */
  onMenuToggle?: () => void;
  /** Brand mark slot: logo icon + "neon" wordmark. */
  brandSlot?: ReactNode;
  /** Tenant pill (e.g. "ATHQ · Athyper HQ"). */
  tenantSlot?: ReactNode;

  // ── Center ──────────────────────────────────────────────
  /** Workbench switcher pills (WorkbenchToggle). */
  workbenchToggle?: ReactNode;
  /** Delegation indicator pill. */
  delegationIndicator?: ReactNode;

  // ── Center-right ────────────────────────────────────────
  /** Called when the launcher trigger is clicked. Opens universal launcher. */
  onSearchClick?: () => void;
  /**
   * Optional assistant/utility control. Rendered after the launcher and before
   * notifications so keyboard and visual order remain predictable.
   */
  assistantSlot?: ReactNode;

  // ── Right zone ──────────────────────────────────────────
  /** Unread notification count. */
  notificationCount?: number;
  /** Whether the notifications destination is currently selected. */
  notificationActive?: boolean;
  onNotificationClick?: () => void;
  /** Avatar / user menu slot. */
  userSlot?: ReactNode;
}

// ── Separator ─────────────────────────────────────────────────────────────────

function VSep() {
  return <span className="h-5 w-px shrink-0 bg-border" aria-hidden />;
}

// ── Topbar ────────────────────────────────────────────────────────────────────

export function Topbar({
  onMenuToggle,
  brandSlot,
  tenantSlot,
  workbenchToggle,
  delegationIndicator,
  onSearchClick,
  assistantSlot,
  notificationCount = 0,
  notificationActive = false,
  onNotificationClick,
  userSlot,
}: TopbarProps) {
  return (
    <div className="flex w-full items-center gap-1.5 overflow-hidden">

      {/* ── Left zone ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-lg md:hidden"
          onClick={onMenuToggle}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>

        {/* Brand */}
        {brandSlot}

        {/* Tenant */}
        {tenantSlot && (
          <>
            {brandSlot && <VSep />}
            {tenantSlot}
          </>
        )}
      </div>

      {/* ── Center: workbench toggle ───────────────────────── */}
      {workbenchToggle && (
        <>
          <VSep />
          <div className="hidden items-center md:flex">{workbenchToggle}</div>
        </>
      )}

      {/* Delegation indicator (if any) */}
      {delegationIndicator && (
        <div className="hidden items-center md:flex">{delegationIndicator}</div>
      )}

      {/* ── Stretch ────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Center-right: launcher trigger ─────────────────── */}
      {onSearchClick && (
        <>
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Open launcher"
            className="hidden min-w-60 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 sm:flex"
          >
            <Search className="h-6 w-6 shrink-0" />
            <span className="flex-1 text-left">Search or do anything…</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 font-mono text-xs font-normal text-muted-foreground lg:flex">
              <span>⌘</span><span>K</span>
            </kbd>
          </button>
          {/* Mobile: icon-only launcher trigger */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg sm:hidden"
            onClick={onSearchClick}
            aria-label="Open launcher"
          >
            <Search className="h-6 w-6" />
          </Button>
        </>
      )}

      {assistantSlot ? (
        <div
          className="flex shrink-0 items-center"
          data-topbar-slot="assistant"
        >
          {assistantSlot}
        </div>
      ) : null}

      <VSep />

      {/* ── Right zone ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className={`relative h-10 w-10 rounded-lg ${notificationActive ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          onClick={onNotificationClick}
          aria-current={notificationActive ? "page" : undefined}
          aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} notifications unread)` : ""}`}
        >
          <Bell className="h-6 w-6" />
          <NavBadge count={notificationCount} variant="overlay" />
        </Button>

        {/* Avatar / user menu */}
        {userSlot}
      </div>
    </div>
  );
}
