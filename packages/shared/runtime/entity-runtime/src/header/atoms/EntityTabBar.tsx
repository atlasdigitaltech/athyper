"use client";

import { cn } from "@athyper/theme/utils";
import type { HeaderTab } from "../types";

export interface EntityTabBarProps {
  tabs: HeaderTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
}

export function EntityTabBar({ tabs, activeTab, onTabChange, className }: EntityTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className={cn(
      "border-t border-border bg-muted/50 px-4 flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5 lg:px-[22px]",
      className,
    )}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onTabChange?.(tab.id)}
          className={cn(
            "relative py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
            activeTab === tab.id
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
      ))}
    </div>
  );
}
