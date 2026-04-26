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
import { Button } from "@athyper/ui/primitives";
import { NavBadge } from "./NavBadge";

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

  // ── Right zone ──────────────────────────────────────────
  /** Unread notification count. */
  notificationCount?: number;
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
  notificationCount = 0,
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
          className="h-8 w-8 shrink-0 md:hidden"
          onClick={onMenuToggle}
        >
          <Menu className="h-4 w-4" />
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
      <button
        onClick={onSearchClick}
        aria-label="Open launcher"
        className="hidden min-w-60 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 sm:flex"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Search or do anything…</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1 py-0.5 font-mono text-xs text-muted-foreground lg:flex">
          <span>⌘</span><span>K</span>
        </kbd>
      </button>
      {/* Mobile: icon-only launcher trigger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 sm:hidden"
        onClick={onSearchClick}
        aria-label="Open launcher"
      >
        <Search className="h-4 w-4" />
      </Button>

      <VSep />

      {/* ── Right zone ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          onClick={onNotificationClick}
          aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} unread)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          <NavBadge count={notificationCount} variant="overlay" />
        </Button>

        {/* Avatar / user menu */}
        {userSlot}
      </div>
    </div>
  );
}
