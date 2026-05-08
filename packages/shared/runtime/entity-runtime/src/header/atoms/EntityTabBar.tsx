"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import type { HeaderTab } from "../types";
import { headerIconButtonActiveClass, headerIconButtonClass } from "./headerChrome";

// Width reserved for the "More ▾" button + gap before it
const MORE_BTN_W = 96;
// gap-5 = 20px between flex children
const GAP_PX = 20;
// Total horizontal padding of the container (px-4 both sides = 32px; lg bumps to ~44px)
const H_PAD = 44;
// Width reserved per platform icon (button 28px + gap 4px)
const PLATFORM_ICON_W = 32;
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
          <span key={tab.id} className="py-2.5 text-sm font-medium whitespace-nowrap shrink-0">
            {tab.label}
            {tab.count != null && (
              <span className="ml-1.5 text-2xs px-1 py-0.5 rounded tabular-nums">
                {tab.count}
              </span>
            )}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        className={cn(
          "border-t border-border bg-muted/50 px-4 flex items-center gap-5 overflow-hidden sm:px-5 lg:px-[22px]",
          className,
        )}
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
                      "relative py-2.5 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1",
                      moreActive
                        ? "text-foreground after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-foreground after:content-['']"
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
                        <span className="text-2xs px-1 py-0.5 rounded bg-muted text-muted-foreground font-semibold tabular-nums">
                          {tab.count}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {platformIcons.length > 0 && (
              <div
                className={cn(
                  "flex items-center gap-0.5",
                  showMore && "ml-1 pl-3 border-l border-border/50",
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
        "relative py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
        active
          ? "text-foreground after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-foreground after:content-['']"
          : "text-muted-foreground hover:text-foreground",
        tab.disabled && "pointer-events-none opacity-50",
      )}
    >
      {tab.label}
      {tab.countPending && !tab.count && (
        <span className="ml-1.5 inline-block h-3.5 w-6 rounded bg-muted animate-pulse" />
      )}
      {tab.count != null && (
        <span className="ml-1.5 text-2xs px-1 py-0.5 rounded bg-muted text-muted-foreground font-semibold tabular-nums">
          {tab.count}
        </span>
      )}
    </button>
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
        headerIconButtonClass,
        active && headerIconButtonActiveClass,
      )}
    >
      {icon.icon}
    </button>
  );
}
