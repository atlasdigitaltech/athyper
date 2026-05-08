"use client";

/**
 * @athyper/shell — NavRail
 *
 * The 54px persistent icon rail that sits between the header and the main content.
 * Organized into four vertical zones (top → bottom):
 *
 *   1. Global   — Home · Inbox (badge) · Search
 *   2. Spaces   — one icon per workspace (from shared.workspace)
 *   3. Core     — ⚙ icon, accent tint, visible only when hasPlatform = true
 *   4. Utilities — Favourites · Recent · Settings (anchored at bottom)
 *
 * Active workspace is indicated by:
 *   - Tinted background on the icon
 *   - 3px left accent bar (matching sidebar-primary color)
 *
 * This is a pure presentation component. All data + callbacks come from AppNavRail.
 */

import { type LucideIcon, Home, Inbox, Search, Settings, Star, Clock, Server } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { NavBadge } from "./NavBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NavRailKey =
  | "home"
  | "inbox"
  | "search"
  | "core"
  | "favorites"
  | "recent"
  | "settings"
  | string; // workspace key

export interface NavRailWorkspace {
  key: string;
  label: string;
  icon: LucideIcon;
  /** When provided, right-click on this icon offers "Open in new tab". */
  href?: string;
}

export interface NavRailProps {
  workspaces: NavRailWorkspace[];
  hasPlatform?: boolean;
  /** Currently active item key. */
  activeKey: NavRailKey | null;
  /** Unread notification count shown on the Inbox icon. */
  inboxCount?: number;
  /**
   * Workbench accent CSS color.
   * Used for the active left-bar indicator. Falls back to `bg-sidebar-primary`.
   */
  accentColor?: string;
  onSelect: (key: NavRailKey) => void;
}

// ── Rail icon button ──────────────────────────────────────────────────────────

interface RailIconProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  /** Platform icon gets a distinct accent tint instead of the primary color. */
  isPlatform?: boolean;
  /** Workbench accent CSS color for the active left-bar indicator. */
  accentColor?: string;
  /** When provided, renders as <a> so the browser natively offers "Open in new tab" on right-click. */
  href?: string;
  onClick?: () => void;
}

function RailIcon({
  icon: Icon,
  label,
  active = false,
  badge,
  isPlatform = false,
  accentColor,
  href,
  onClick,
}: RailIconProps) {
  const className = cn(
    "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    isPlatform
      ? active
        ? "bg-accent/10 text-accent-foreground"
        : "bg-accent/5 text-accent-foreground/60 hover:bg-accent/10 hover:text-accent-foreground"
      : active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );

  const inner = (
    <>
      {/* Left accent bar for active non-platform items */}
      {active && !isPlatform && (
        <span
          aria-hidden
          className={cn(
            "absolute -left-px bottom-2 top-2 w-0.5 rounded-r-full",
            !accentColor && "bg-sidebar-primary",
          )}
          style={accentColor ? { backgroundColor: accentColor } : undefined}
        />
      )}

      <Icon className="h-4.5 w-4.5 shrink-0" />

      <NavBadge count={badge ?? 0} variant="overlay" />
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        title={label}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={className}
        onClick={(e) => {
          // Ctrl/Cmd/Shift+click → let browser open in new tab/window
          if (e.ctrlKey || e.metaKey || e.shiftKey) return;
          e.preventDefault();
          onClick?.();
        }}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={className}
    >
      {inner}
    </button>
  );
}

// ── Zone separator ────────────────────────────────────────────────────────────

function ZoneSep() {
  return <span className="mx-auto h-px w-5 shrink-0 bg-sidebar-border" />;
}

// ── NavRail ───────────────────────────────────────────────────────────────────

export function NavRail({
  workspaces,
  hasPlatform = false,
  activeKey,
  inboxCount = 0,
  accentColor,
  onSelect,
}: NavRailProps) {
  return (
    <div className="flex h-full flex-col items-center gap-0.5 py-2">
      {/* ── Zone 1: Global ─────────────────────────────────────── */}
      <RailIcon icon={Home}   label="Home"   href="/home"   active={activeKey === "home"}   accentColor={accentColor} onClick={() => onSelect("home")} />
      <RailIcon icon={Inbox}  label="Inbox"  href="/inbox"  active={activeKey === "inbox"}  accentColor={accentColor} badge={inboxCount} onClick={() => onSelect("inbox")} />
      <RailIcon icon={Search} label="Search" active={activeKey === "search"} accentColor={accentColor} onClick={() => onSelect("search")} />

      {/* ── Zone 2: Workspaces ─────────────────────────────────── */}
      {workspaces.length > 0 && (
        <>
          <ZoneSep />
          <span className="py-0.5 text-xs font-bold uppercase tracking-widest text-sidebar-foreground/30">
            Spaces
          </span>
          {workspaces.map((ws) => (
            <RailIcon
              key={ws.key}
              icon={ws.icon}
              label={ws.label}
              active={activeKey === ws.key}
              accentColor={accentColor}
              href={ws.href}
              onClick={() => onSelect(ws.key)}
            />
          ))}
        </>
      )}

      {/* ── Zone 3: Core ───────────────────────────────────────── */}
      {hasPlatform && (
        <>
          <ZoneSep />
          <RailIcon
            icon={Server}
            label="Core"
            active={activeKey === "core"}
            isPlatform
            onClick={() => onSelect("core")}
          />
        </>
      )}

      {/* ── Zone 4: Utilities (bottom) ─────────────────────────── */}
      <div className="mt-auto flex flex-col items-center gap-0.5">
        <ZoneSep />
        <RailIcon icon={Star}     label="Favourites" active={activeKey === "favorites"} onClick={() => onSelect("favorites")} />
        <RailIcon icon={Clock}    label="Recent"    active={activeKey === "recent"}    onClick={() => onSelect("recent")} />
        <RailIcon icon={Settings} label="Settings"  href="/settings" active={activeKey === "settings"}  onClick={() => onSelect("settings")} />
      </div>
    </div>
  );
}
