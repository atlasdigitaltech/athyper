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
import type { HeaderTab, PlatformPanelIcon } from "./types";
import {
  headerIconButtonActiveClass,
  headerTabBarClass,
  headerTabButtonClass,
  headerTabCountBadgeClass,
  headerTabMoreButtonClass,
  platformIconButtonClass,
} from "./header-chrome";

const MORE_BTN_W = 112;
const GAP_PX = 20;
const H_PAD = 44;
const PLATFORM_ICON_W = 36;
const PLATFORM_ICONS_PAD = 16;

export interface RuntimeEntityTabBarProps {
  tabs: HeaderTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  platformIcons?: PlatformPanelIcon[];
  onPlatformIconClick?: (id: string) => void;
  activePlatformIcon?: string;
  className?: string;
}

export function RuntimeEntityTabBar({
  tabs,
  activeTab,
  onTabChange,
  platformIcons = [],
  onPlatformIconClick,
  activePlatformIcon,
  className,
}: RuntimeEntityTabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [cutoff, setCutoff] = useState(tabs.length);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    const ghost = ghostRef.current;
    if (!container || !ghost) return;

    const piReserved = platformIcons.length > 0
      ? platformIcons.length * PLATFORM_ICON_W + PLATFORM_ICONS_PAD
      : 0;
    const available = container.clientWidth - H_PAD - MORE_BTN_W - piReserved;
    const children = Array.from(ghost.children) as HTMLElement[];

    let acc = 0;
    let n = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) break;
      const w = child.offsetWidth + (i > 0 ? GAP_PX : 0);
      if (acc + w > available) break;
      acc += w;
      n++;
    }
    setCutoff(n >= children.length ? tabs.length : Math.max(1, n));
  }, [tabs.length, platformIcons.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(recalculate);
    ro.observe(el);
    recalculate();
    return () => ro.disconnect();
  }, [recalculate]);

  useEffect(() => {
    recalculate();
  }, [tabs, recalculate]);

  if (tabs.length === 0 && platformIcons.length === 0) return null;

  let ordered = tabs;
  if (cutoff < tabs.length) {
    const activeIdx = tabs.findIndex((tab) => tab.id === activeTab);
    if (activeIdx >= cutoff) {
      ordered = [...tabs];
      const last = ordered[cutoff - 1]!;
      const active = ordered[activeIdx]!;
      ordered[cutoff - 1] = active;
      ordered[activeIdx] = last;
    }
  }

  const visibleTabs = ordered.slice(0, cutoff);
  const overflowTabs = ordered.slice(cutoff);
  const showMore = overflowTabs.length > 0;
  const moreActive = overflowTabs.some((tab) => tab.id === activeTab);
  const showRight = showMore || platformIcons.length > 0;

  return (
    <>
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none invisible flex items-center gap-5"
        style={{ position: "fixed", top: "-9999px", left: "-9999px" }}
      >
        {tabs.map((tab) => (
          <span key={tab.id} className="inline-flex h-11 shrink-0 items-center whitespace-nowrap text-sm font-medium">
            {tab.label}
            {tab.count != null && <span className="ml-1.5 rounded px-1 py-0.5 text-sm font-medium tabular-nums">{tab.count}</span>}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        className={cn(
          headerTabBarClass,
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

        {showRight && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
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
                      className={cn("cursor-pointer gap-2", activeTab === tab.id && "bg-accent text-accent-foreground")}
                    >
                      <span className="flex-1">{tab.label}</span>
                      {tab.count != null && (
                        <span className="rounded bg-muted px-1 py-0.5 text-sm font-medium tabular-nums text-muted-foreground">
                          {tab.count}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {platformIcons.length > 0 && (
              <div className={cn("flex items-center gap-1", (tabs.length > 0 || showMore) && "ml-1 border-l border-border/50 pl-3")}>
                {platformIcons.map((icon) => (
                  <PlatformIconButton
                    key={icon.id}
                    icon={icon}
                    active={activePlatformIcon === icon.id}
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

function TabButton({
  tab,
  active,
  onTabChange,
}: {
  tab: HeaderTab;
  active: boolean;
  onTabChange?: (id: string) => void;
}) {
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
      {tab.countPending && !tab.count && <span className="ml-1.5 inline-block h-3.5 w-6 animate-pulse rounded bg-muted" />}
      {tab.count != null && (
        <span className={headerTabCountBadgeClass}>
          {tab.count}
        </span>
      )}
    </button>
  );
}

function PlatformIconButton({
  icon,
  active,
  onClick,
}: {
  icon: PlatformPanelIcon;
  active: boolean;
  onClick?: (id: string) => void;
}) {
  const label = icon.count && icon.count > 0 ? `${icon.label}: ${icon.count}` : icon.label;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onClick?.(icon.id)}
      className={cn(platformIconButtonClass, active && headerIconButtonActiveClass)}
    >
      {icon.icon as ReactNode}
    </button>
  );
}
