"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

import type { EntityClass } from "@/lib/schema-manager/types";

import { isTabEnabled } from "@/lib/schema-manager/capability-flags";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface TabItem {
  label: string;
  segment: string;
}

// ─── Tab order (flat, in user-specified priority) ───────────
// The order here defines the display order; capability filtering
// removes tabs that don't apply to the entity class.

const ALL_TABS: TabItem[] = [
  { label: "Overview", segment: "overview" },
  { label: "Fields", segment: "fields" },
  { label: "Controls", segment: "controls" },
  { label: "Forms", segment: "forms" },
  { label: "Views", segment: "views" },
  { label: "Lifecycle", segment: "lifecycle" },
  { label: "Workflows", segment: "workflows" },
  { label: "Policies", segment: "policies" },
  { label: "Operations", segment: "operations" },
  { label: "Integrations", segment: "integrations" },
  { label: "Overlays", segment: "overlays" },
  { label: "Relations", segment: "relations" },
  { label: "Diagram", segment: "diagram" },
  { label: "Indexes", segment: "indexes" },
  { label: "Compiled", segment: "compiled" },
  { label: "Versions", segment: "versions" },
];

/** How many tabs to show inline before collapsing into "More" */
const MAX_VISIBLE = 10;

// ─── Component ──────────────────────────────────────────────

interface EntityTabNavProps {
  basePath: string;
  entityClass?: EntityClass;
}

export function EntityTabNav({ basePath, entityClass }: EntityTabNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Filter tabs by entity capabilities
  const tabs = useMemo(() => {
    if (!entityClass) return ALL_TABS;
    return ALL_TABS.filter((tab) => isTabEnabled(tab.segment, entityClass));
  }, [entityClass]);

  // Find which tab is active
  const activeSegment = useMemo(() => {
    for (const tab of tabs) {
      if (pathname.startsWith(`${basePath}/${tab.segment}`)) return tab.segment;
    }
    return null;
  }, [tabs, pathname, basePath]);

  // Split into visible and overflow
  const { visible, overflow } = useMemo(() => {
    // If active tab is in overflow, swap it into visible range
    let ordered = [...tabs];
    const activeIdx = ordered.findIndex((t) => t.segment === activeSegment);

    if (activeIdx >= MAX_VISIBLE) {
      // Move active tab to last visible position
      const [activeTab] = ordered.splice(activeIdx, 1);
      ordered.splice(MAX_VISIBLE - 1, 0, activeTab);
    }

    return {
      visible: ordered.slice(0, MAX_VISIBLE),
      overflow: ordered.slice(MAX_VISIBLE),
    };
  }, [tabs, activeSegment]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const handleMoreClick = useCallback(() => {
    setMoreOpen((prev) => !prev);
  }, []);

  const isOverflowActive = overflow.some((t) => t.segment === activeSegment);

  return (
    <nav
      className="flex items-center border-b"
      role="tablist"
      aria-label="Entity configuration tabs"
    >
      {/* Visible tabs */}
      {visible.map((tab) => {
        const href = `${basePath}/${tab.segment}`;
        const isActive = tab.segment === activeSegment;

        return (
          <Link
            key={tab.segment}
            href={href}
            role="tab"
            aria-selected={isActive}
            aria-label={`${tab.label} tab`}
            className={cn(
              "relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
            )}
          </Link>
        );
      })}

      {/* "More" dropdown for overflow tabs */}
      {overflow.length > 0 && (
        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={handleMoreClick}
            className={cn(
              "relative inline-flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              isOverflowActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-haspopup="true"
            aria-expanded={moreOpen}
          >
            More
            <ChevronDown className={cn("size-3.5 transition-transform", moreOpen && "rotate-180")} />
            {isOverflowActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
            )}
          </button>

          {moreOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
              {overflow.map((tab) => {
                const href = `${basePath}/${tab.segment}`;
                const isActive = tab.segment === activeSegment;

                return (
                  <Link
                    key={tab.segment}
                    href={href}
                    role="tab"
                    aria-selected={isActive}
                    className={cn(
                      "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    onClick={() => setMoreOpen(false)}
                  >
                    {isActive && <Check className="size-3.5" />}
                    <span className={isActive ? "" : "pl-5"}>{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
