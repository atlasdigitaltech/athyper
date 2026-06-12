"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@athyper/ui/primitives";
import type { HeaderTab, HeaderTabBadge } from "../types";
import {
  headerTabBarClass,
  headerTabButtonClass,
  headerTabCountBadgeClass,
  headerTabMoreButtonClass,
  headerIconButtonActiveClass,
  platformIconButtonClass,
} from "./headerChrome";

// Width reserved for the "More ▾" button + gap before it
const MORE_BTN_W = 112;
// gap-5 = 20px between flex children
const GAP_PX = 20;
// Total horizontal padding of the container (px-4 both sides = 32px; lg bumps to ~44px)
const H_PAD = 44;
// Width reserved per platform icon (button 32px + gap 4px)
const PLATFORM_ICON_W = 36;
// Left separator padding for platform icons cluster
const PLATFORM_ICONS_PAD = 16;

// ── Platform panel icon ────────────────────────────────────────────────────────

/** An icon button in the platform-panel cluster on the right of the tab bar. */
export interface PlatformPanelIcon {
  id: string;
  /** Lucide icon element or any ReactNode. */
  icon: ReactNode;
  /** Tooltip / aria-label. */
  label: string;
  /** Count used for tooltip / screen-reader labels. The icon button stays visually stable. */
  count?: number;
  /** True while the count query is in-flight. */
  countPending?: boolean;
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface EntityTabBarProps {
  tabs: HeaderTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Platform context panel icons (Comments, Attachments, Activity) shown on the right. */
  platformIcons?: PlatformPanelIcon[];
  /** Called when a platform icon is clicked. */
  onPlatformIconClick?: (id: string) => void;
  /** ID of the currently open platform panel (drives active indicator). */
  activePlatformIcon?: string;
  className?: string;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EntityTabBar({
  tabs,
  activeTab,
  onTabChange,
  platformIcons = [],
  onPlatformIconClick,
  activePlatformIcon,
  className,
}: EntityTabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ghost div is position:fixed off-screen; children measure their natural widths
  const ghostRef     = useRef<HTMLDivElement>(null);
  const [cutoff, setCutoff] = useState(tabs.length);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    const ghost     = ghostRef.current;
    if (!container || !ghost) return;

    const piReserved = platformIcons.length > 0
      ? platformIcons.length * PLATFORM_ICON_W + PLATFORM_ICONS_PAD
      : 0;
    const available = container.clientWidth - H_PAD - MORE_BTN_W - piReserved;
    const children  = Array.from(ghost.children) as HTMLElement[];

    let acc = 0;
    let n   = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) break;
      const w = child.offsetWidth + (i > 0 ? GAP_PX : 0);
      if (acc + w > available) break;
      acc += w;
      n++;
    }
    // If all tabs fit without overflow, show all (no More button needed)
    const allFit = n >= children.length;
    setCutoff(allFit ? tabs.length : Math.max(1, n));
  }, [tabs.length, platformIcons.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(recalculate);
    ro.observe(el);
    recalculate();
    return () => ro.disconnect();
  }, [recalculate]);

  // Re-measure when tab labels or counts change
  useEffect(() => { recalculate(); }, [tabs, recalculate]);

  if (tabs.length === 0 && platformIcons.length === 0) return null;

  // Promote active tab to visible row when it falls in overflow
  let ordered = tabs;
  if (cutoff < tabs.length) {
    const activeIdx = tabs.findIndex((t) => t.id === activeTab);
    if (activeIdx >= cutoff) {
      ordered = [...tabs];
      const last    = ordered[cutoff - 1]!;
      const active  = ordered[activeIdx]!;
      ordered[cutoff - 1] = active;
      ordered[activeIdx]  = last;
    }
  }

  const visibleTabs  = ordered.slice(0, cutoff);
  const overflowTabs = ordered.slice(cutoff);
  const showMore     = overflowTabs.length > 0;
  const moreActive   = overflowTabs.some((t) => t.id === activeTab);
  const showRight    = showMore || platformIcons.length > 0;

  // Phase 11 #8: mobile tab strip. Below `md` (768px), the horizontal-scroll
  // tabs collapse into a single trigger button that opens a bottom sheet
  // listing all sections + badges. Keeps platform-icon cluster visible at
  // the right edge.
  const activeTabObj = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <>
      {/* Ghost row — fixed off-screen, measures natural tab widths */}
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none invisible flex items-center gap-5"
        style={{ position: "fixed", top: "-9999px", left: "-9999px" }}
      >
        {tabs.map((tab) => (
          <span key={tab.id} className="inline-flex h-11 shrink-0 items-center whitespace-nowrap text-sm font-medium">
            {tab.label}
            {tab.count != null && (
              <span className="ml-1.5 rounded px-1 py-0.5 text-sm font-medium tabular-nums">
                {tab.count}
              </span>
            )}
            <TabEditBadge badge={tab.badge} />
          </span>
        ))}
      </div>

      {/* Phase 11 #8: mobile tab strip (below md). Single trigger + bottom sheet. */}
      <MobileTabBar
        tabs={tabs}
        activeTab={activeTab}
        activeTabObj={activeTabObj}
        onTabChange={onTabChange}
        platformIcons={platformIcons}
        onPlatformIconClick={onPlatformIconClick}
        activePlatformIcon={activePlatformIcon}
        className={className}
      />

      {/* Desktop tab strip (md and above). Unchanged from pre-Phase-11. */}
      <div
        ref={containerRef}
        className={cn("hidden md:flex", headerTabBarClass, className)}
      >
        {visibleTabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onTabChange={onTabChange}
          />
        ))}

        {/* Right cluster: More dropdown + platform icons */}
        {showRight && (
          <div className="ml-auto shrink-0 flex items-center gap-1">
            {showMore && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      headerTabMoreButtonClass,
                      moreActive
                        ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-foreground after:content-['']"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    More
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  {overflowTabs.map((tab) => (
                    <DropdownMenuItem
                      key={tab.id}
                      disabled={tab.disabled}
                      onSelect={() => !tab.disabled && onTabChange?.(tab.id)}
                      className={cn(
                        "gap-2 cursor-pointer",
                        activeTab === tab.id && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="flex-1">{tab.label}</span>
                      {tab.count != null && (
                        <span className="rounded bg-muted px-1 py-0.5 text-sm font-medium tabular-nums text-muted-foreground">
                          {tab.count}
                        </span>
                      )}
                      <TabEditBadge badge={tab.badge} />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {platformIcons.length > 0 && (
              <div
                className={cn(
                  "flex items-center gap-1",
                  showMore && "ml-1 pl-2 border-l border-border/50",
                )}
              >
                {platformIcons.map((pi) => (
                  <PlatformIconButton
                    key={pi.id}
                    icon={pi}
                    active={activePlatformIcon === pi.id}
                    onClick={onPlatformIconClick}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────────

interface TabButtonProps {
  tab: HeaderTab;
  active: boolean;
  onTabChange?: (id: string) => void;
}

function TabButton({ tab, active, onTabChange }: TabButtonProps) {
  return (
    <button
      type="button"
      disabled={tab.disabled}
      onClick={() => !tab.disabled && onTabChange?.(tab.id)}
      className={cn(
        headerTabButtonClass,
        active
          ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-foreground after:content-['']"
          : "text-muted-foreground hover:text-foreground",
        tab.disabled && "pointer-events-none opacity-50",
      )}
    >
      {tab.label}
      {tab.countPending && !tab.count && (
        <span className="ml-1.5 inline-block h-3.5 w-6 rounded bg-muted animate-pulse" />
      )}
      {tab.count != null && (
        <span className={headerTabCountBadgeClass}>
          {tab.count}
        </span>
      )}
      <TabEditBadge badge={tab.badge} />
    </button>
  );
}

// ── Mobile tab bar (Phase 11 #8) ──────────────────────────────────────────────

interface MobileTabBarProps {
  tabs: HeaderTab[];
  activeTab?: string;
  activeTabObj?: HeaderTab;
  onTabChange?: (id: string) => void;
  platformIcons?: PlatformPanelIcon[];
  onPlatformIconClick?: (id: string) => void;
  activePlatformIcon?: string;
  className?: string;
}

/**
 * Mobile tab strip — shown below the `md` breakpoint.
 *
 * Replaces the horizontal-scroll tabs with a single trigger button that
 * opens a bottom sheet listing every section. Platform-icon cluster
 * (comments / attachments / activity) stays visible inline.
 *
 * Phase 11 #8 design tradeoff: at very narrow widths a horizontal-scroll
 * tab strip becomes tap-hostile. The sheet pattern matches iOS/Android
 * conventions and keeps section dirty/error badges visible at a glance.
 */
function MobileTabBar({
  tabs,
  activeTab,
  activeTabObj,
  onTabChange,
  platformIcons = [],
  onPlatformIconClick,
  activePlatformIcon,
  className,
}: MobileTabBarProps) {
  const [open, setOpen] = useState(false);
  if (tabs.length === 0 && platformIcons.length === 0) return null;

  return (
    <div className={cn("flex h-12 items-center gap-1 border-b border-border px-3 md:hidden", className)}>
      {tabs.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex h-10 flex-1 min-w-0 items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-muted/40"
              aria-label="Open section menu"
            >
              <span className="min-w-0 flex-1 truncate">
                {activeTabObj?.label ?? "Sections"}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
            <SheetHeader className="pb-2">
              <SheetTitle>Sections</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 pb-4">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={tab.disabled}
                    onClick={() => {
                      if (tab.disabled) return;
                      onTabChange?.(tab.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-md px-4 text-sm transition-colors",
                      isActive ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted/40",
                      tab.disabled && "pointer-events-none opacity-40",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                      {tab.label}
                      <TabEditBadge badge={tab.badge} />
                    </span>
                    {tab.count != null && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {tab.count}
                      </span>
                    )}
                    {isActive && (
                      <ChevronRight className="size-4 opacity-60" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      )}
      {platformIcons.length > 0 && (
        <div className={cn("flex items-center gap-1", tabs.length > 0 && "ml-1 pl-2 border-l border-border/50")}>
          {platformIcons.map((pi) => (
            <PlatformIconButton
              key={pi.id}
              icon={pi}
              active={activePlatformIcon === pi.id}
              onClick={onPlatformIconClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Edit-state badge ───────────────────────────────────────────────────────────

interface TabEditBadgeProps {
  badge?: HeaderTabBadge;
}

/**
 * Renders the edit-state badge on a tab.
 *
 * Error takes precedence over dirty (an erroring section is necessarily dirty;
 * showing both creates noise). The dirty dot uses primary; the error pill uses
 * destructive. Both are right-aligned next to the label.
 */
function TabEditBadge({ badge }: TabEditBadgeProps) {
  if (!badge) return null;
  if (badge.type === "error") {
    return (
      <span
        className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground tabular-nums"
        aria-label={badge.count ? `${badge.count} validation error${badge.count > 1 ? "s" : ""}` : "validation error"}
      >
        {badge.count != null && badge.count > 0 ? badge.count : "!"}
      </span>
    );
  }
  // dirty
  return (
    <span
      className="ml-1.5 inline-block size-2 rounded-full bg-primary"
      aria-label="unsaved changes"
    />
  );
}

// ── Platform icon button ───────────────────────────────────────────────────────

interface PlatformIconButtonProps {
  icon: PlatformPanelIcon;
  active: boolean;
  onClick?: (id: string) => void;
}

function PlatformIconButton({ icon, active, onClick }: PlatformIconButtonProps) {
  const label = icon.count && icon.count > 0 ? `${icon.label}: ${icon.count}` : icon.label;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onClick?.(icon.id)}
      className={cn(
        platformIconButtonClass,
        active && headerIconButtonActiveClass,
      )}
    >
      {icon.icon}
    </button>
  );
}
