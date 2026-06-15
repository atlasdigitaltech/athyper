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
import type { HeaderTab, HeaderTabBadge, PlatformPanelIcon } from "./types";
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

  // Phase 11 #8: at narrow widths the horizontal-scroll desktop strip is
  // tap-hostile. Render a Sheet-driven mobile strip below `md` and gate the
  // desktop strip with `hidden md:flex`.
  const activeTabObj = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

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
            <TabEditBadge badge={tab.badge} />
          </span>
        ))}
      </div>

      {/* Phase 11 #8 — mobile tab strip (below md). Single trigger + bottom sheet. */}
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

      <div
        ref={containerRef}
        className={cn(
          headerTabBarClass,
          "hidden md:flex",
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
                      <TabEditBadge badge={tab.badge} />
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
      <TabEditBadge badge={tab.badge} />
    </button>
  );
}

// ── Edit-state badge ────────────────────────────────────────────────────────
//
// Error takes precedence over dirty (an erroring section is necessarily dirty;
// showing both creates noise). Dirty uses the primary accent; error uses the
// destructive pill with an optional count.

interface TabEditBadgeProps {
  badge?: HeaderTabBadge;
}

function TabEditBadge({ badge }: TabEditBadgeProps) {
  if (!badge) return null;
  if (badge.type === "error") {
    return (
      <span
        className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground tabular-nums"
        aria-label={
          badge.count
            ? `${badge.count} validation error${badge.count > 1 ? "s" : ""}`
            : "validation error"
        }
      >
        {badge.count != null && badge.count > 0 ? badge.count : "!"}
      </span>
    );
  }
  return (
    <span
      className="ml-1.5 inline-block size-2 rounded-full bg-primary"
      aria-label="unsaved changes"
    />
  );
}

// ── Mobile tab bar (Phase 11 #8) ────────────────────────────────────────────
//
// Replaces the horizontal-scroll desktop tabs at narrow widths with a single
// trigger button that opens a bottom sheet listing every section. Keeps the
// platform-icon cluster (comments / attachments / activity) inline so users
// don't lose access to context panels on mobile.

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
    <div
      className={cn(
        "flex h-12 items-center gap-1 border-b border-border px-3 md:hidden",
        className,
      )}
    >
      {tabs.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-muted/40"
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
        <div
          className={cn(
            "flex items-center gap-1",
            tabs.length > 0 && "ml-1 border-l border-border/50 pl-2",
          )}
        >
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
