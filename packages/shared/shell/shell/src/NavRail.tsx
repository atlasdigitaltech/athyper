"use client";

/**
 * @athyper/shell — NavRail
 *
 * The 54px persistent icon rail that sits between the header and the main content.
 * Organized into four vertical zones (top → bottom):
 *
 *   1. Global   — Home · Inbox (badge) · Search
 *   2. Spaces   — one icon per workspace (from shared.workspace)
 *   3. Core — ⚙ icon, purple tint, visible only when hasPlatform = true
 *   4. Utilities — Favorites · Recent · Settings (anchored at bottom)
 *
 * Active workspace is indicated by:
 *   - Tinted background on the icon
 *   - 3px left accent bar (matching sidebar-primary color)
 *
 * This is a pure presentation component. All data + callbacks come from AppNavRail.
 */

import { type LucideIcon, Home, Inbox, Search, Settings, Star, Clock, Server } from "lucide-react";
import { cn } from "@athyper/theme/utils";

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
}

export interface NavRailProps {
  workspaces: NavRailWorkspace[];
  hasPlatform?: boolean;
  /** Currently active item key. */
  activeKey: NavRailKey | null;
  /** Unread notification count shown on the Inbox icon. */
  inboxCount?: number;
  /**
   * Workbench accent hex (e.g. "#0d9668").
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
  /** Platform icon gets a distinct violet tint instead of the primary color. */
  isPlatform?: boolean;
  /** Workbench accent hex for the active left-bar indicator. */
  accentColor?: string;
  onClick?: () => void;
}

function RailIcon({
  icon: Icon,
  label,
  active = false,
  badge,
  isPlatform = false,
  accentColor,
  onClick,
}: RailIconProps) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        isPlatform
          ? active
            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            : "bg-violet-50 text-violet-500 hover:bg-violet-100 hover:text-violet-700 dark:bg-transparent dark:text-violet-400 dark:hover:bg-violet-900/30"
          : active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      {/* Left accent bar for active non-platform items */}
      {active && !isPlatform && (
        <span
          aria-hidden
          className={cn(
            "absolute -left-px top-2 bottom-2 w-0.5 rounded-r-full",
            !accentColor && "bg-sidebar-primary",
          )}
          style={accentColor ? { backgroundColor: accentColor } : undefined}
        />
      )}

      <Icon className="h-[18px] w-[18px] shrink-0" />

      {/* Badge */}
      {badge != null && badge > 0 && (
        <span
          aria-label={`${badge} unread`}
          className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
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
      <RailIcon icon={Home}   label="Home"   active={activeKey === "home"}   accentColor={accentColor} onClick={() => onSelect("home")} />
      <RailIcon icon={Inbox}  label="Inbox"  active={activeKey === "inbox"}  accentColor={accentColor} badge={inboxCount} onClick={() => onSelect("inbox")} />
      <RailIcon icon={Search} label="Search" active={activeKey === "search"} accentColor={accentColor} onClick={() => onSelect("search")} />

      {/* ── Zone 2: Workspaces ─────────────────────────────────── */}
      {workspaces.length > 0 && (
        <>
          <ZoneSep />
          <span className="py-0.5 text-[8px] font-bold uppercase tracking-[0.8px] text-sidebar-foreground/30">
            Spaces
          </span>
          {workspaces.map((ws) => (
            <RailIcon
              key={ws.key}
              icon={ws.icon}
              label={ws.label}
              active={activeKey === ws.key}
              accentColor={accentColor}
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
        <RailIcon icon={Star}     label="Favorites" active={activeKey === "favorites"} onClick={() => onSelect("favorites")} />
        <RailIcon icon={Clock}    label="Recent"    active={activeKey === "recent"}    onClick={() => onSelect("recent")} />
        <RailIcon icon={Settings} label="Settings"  active={activeKey === "settings"}  onClick={() => onSelect("settings")} />
      </div>
    </div>
  );
}
