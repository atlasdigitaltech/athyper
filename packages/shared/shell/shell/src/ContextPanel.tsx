"use client";

/**
 * @athyper/shell — ContextPanel
 *
 * The 252px collapsible panel that opens next to the NavRail when a workspace
 * (or Platform) is selected.
 *
 * Layout (workspace mode):
 *   ┌─ Header ─────────────────────────────┐
 *   │ Workspace name · workbench · count   │
 *   ├─ Filter ─────────────────────────────┤
 *   │ Search input (client-side)           │
 *   ├─ Pinned ──────────────────────────────┤
 *   │ My queue (badge) · Approvals          │
 *   ├─ Modules (accordion) ─────────────────┤
 *   │ Module A                             │
 *   │ Module B  ← active                   │
 *   │   · Page 1                           │
 *   │   · Page 2  ← current pathname       │
 *   │ Module C                             │
 *   └──────────────────────────────────────┘
 *
 * For Platform workspace, `isPlatform=true` and `platformGroups` render grouped
 * modules without page sub-links.
 *
 * Pure presentation component — all data / routing callbacks come from AppContextPanel.
 */

import { useState, type ReactNode } from "react";
import { type LucideIcon, X, Search } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { NavBadge } from "./NavBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PanelModule {
  code: string;
  label: string;
  icon: LucideIcon;
}

export interface PanelPinnedItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  onClick: () => void;
}

export interface PanelPage {
  key: string;
  label: string;
  href: string;
  count?: number;
  /** True when this page matches the current pathname. */
  active?: boolean;
}

export interface PlatformGroup {
  label: string;
  modules: PanelModule[];
}

export interface ContextPanelProps {
  title: string;
  subtitle?: string;
  pinnedItems?: PanelPinnedItem[];
  /** Flat module list (workspace mode). */
  modules?: PanelModule[];
  /** Grouped modules (platform mode). */
  platformGroups?: PlatformGroup[];
  /** Page links shown inline below the active module. */
  pages?: PanelPage[];
  activeModuleCode?: string | null;
  /** True when showing Platform modules (accent tint). */
  isPlatform?: boolean;
  /**
   * Workbench accent CSS color.
   * Drives the active-module left bar and page active dot.
   */
  accentColor?: string;
  onModuleSelect: (code: string) => void;
  onClose?: () => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="section-label px-2 pb-1 pt-2">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="mx-3 my-1.5 h-px bg-border/60" />;
}

interface ModuleItemProps {
  mod: PanelModule;
  active: boolean;
  pages: PanelPage[];
  onClick: () => void;
  isPlatform?: boolean;
  accentColor?: string;
}

function tintColor(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`;
}

function ModuleItem({
  mod,
  active,
  pages,
  onClick,
  isPlatform = false,
  accentColor,
}: ModuleItemProps) {
  return (
    <div>
      <button
        onClick={onClick}
        className={cn(
          "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          active && !isPlatform && "font-semibold",
          active && isPlatform && "bg-accent/10 font-semibold text-accent-foreground",
          !active && "text-foreground/70 hover:bg-accent hover:text-foreground",
        )}
        style={
          active && !isPlatform && accentColor
            ? { backgroundColor: tintColor(accentColor, 10), color: accentColor }
            : undefined
        }
      >
        {/* Active left bar */}
        {active && !isPlatform && (
          <span
            aria-hidden
            className={cn(
              "absolute bottom-0.5 left-0 top-0.5 w-0.5 rounded-r-full",
              !accentColor && "bg-sidebar-primary",
            )}
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          />
        )}
        <mod.icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">{mod.label}</span>
      </button>

      {/* Inline page sub-links when this module is active */}
      {active && !isPlatform && pages.length > 0 && (
        <div className="mb-0.5 ml-4 border-l border-border/50 pl-2">
          {pages.map((page) => (
            <a
              key={page.key}
              href={page.href}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                page.active
                  ? "font-medium"
                  : "text-foreground/50 hover:bg-accent hover:text-foreground",
              )}
              style={page.active && accentColor ? { color: accentColor } : undefined}
            >
              <span
                className={cn(
                  "h-1 w-1 shrink-0 rounded-full",
                  page.active ? "opacity-100" : "bg-current opacity-30",
                )}
                style={page.active && accentColor ? { backgroundColor: accentColor } : undefined}
              />
              <span className="flex-1 truncate">{page.label}</span>
              {page.count != null && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {page.count}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground">{message}</p>
  );
}

// ── ContextPanel ──────────────────────────────────────────────────────────────

export function ContextPanel({
  title,
  subtitle,
  pinnedItems = [],
  modules = [],
  platformGroups,
  pages = [],
  activeModuleCode,
  isPlatform = false,
  accentColor,
  onModuleSelect,
  onClose,
}: ContextPanelProps) {
  const [filter, setFilter] = useState("");

  const filteredModules = filter
    ? modules.filter((m) =>
        m.label.toLowerCase().includes(filter.toLowerCase()),
      )
    : modules;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-sm">
      {/* ── Header ───────────────────────────────────────── */}
      <div
        className={cn(
          "flex shrink-0 items-start justify-between border-b px-3.5 py-3",
          isPlatform ? "border-accent/20" : "border-border",
        )}
        style={
          !isPlatform && accentColor
            ? { borderBottomColor: tintColor(accentColor, 18) }
            : undefined
        }
      >
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              isPlatform && "text-accent-foreground",
            )}
            style={!isPlatform && accentColor ? { color: accentColor } : undefined}
          >
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Filter ───────────────────────────────────────── */}
      <div className="mx-3 my-2 flex shrink-0 items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          maxLength={60}
          autoComplete="off"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* ── Scrollable body ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Pinned items */}
        {pinnedItems.length > 0 && (
          <section className="px-2">
            <SectionLabel>Pinned</SectionLabel>
            {pinnedItems.map((item) => (
              <button
                key={item.key}
                onClick={item.onClick}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                <item.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                <NavBadge count={item.badge ?? 0} variant="inline" />
              </button>
            ))}
            <Divider />
          </section>
        )}

        {/* Platform: grouped modules (no inline pages) */}
        {isPlatform && platformGroups
          ? platformGroups.map((group) => {
              const visible = filter
                ? group.modules.filter((m) =>
                    m.label.toLowerCase().includes(filter.toLowerCase()),
                  )
                : group.modules;
              if (visible.length === 0) return null;
              return (
                <section key={group.label} className="px-2">
                  <SectionLabel>{group.label}</SectionLabel>
                  {visible.map((mod) => (
                    <ModuleItem
                      key={mod.code}
                      mod={mod}
                      active={activeModuleCode === mod.code}
                      pages={[]}
                      isPlatform
                      onClick={() => onModuleSelect(mod.code)}
                    />
                  ))}
                  <Divider />
                </section>
              );
            })
          : /* Workspace: accordion module list with inline pages */
            filteredModules.length > 0
            ? (
              <section className="relative px-2">
                <SectionLabel>Modules</SectionLabel>
                {filteredModules.map((mod) => (
                  <ModuleItem
                    key={mod.code}
                    mod={mod}
                    active={activeModuleCode === mod.code}
                    pages={activeModuleCode === mod.code ? pages : []}
                    accentColor={accentColor}
                    onClick={() => onModuleSelect(mod.code)}
                  />
                ))}
              </section>
            )
            : filter
              ? <EmptyState message={`No modules match "${filter}"`} />
              : modules.length === 0
                ? <EmptyState message="No modules available" />
                : null}
      </div>
    </div>
  );
}
