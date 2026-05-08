"use client";

/**
 * RecentlyViewed — shows the last-visited entity records.
 *
 * Reads from localStorage (populated by trackRecentlyViewed() in detail pages).
 * Renders nothing when the list is empty.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { readItems, type RecentlyViewedItem } from "@/lib/recently-viewed";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    setItems(readItems().slice(0, 8));
  }, []);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">Recently Viewed</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/60",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium">{item.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-doc-field-label bg-muted px-1 py-0.5 rounded text-muted-foreground">
                  {item.entityCode}
                </span>
                <span className="text-doc-support text-muted-foreground/60">
                  {timeAgo(item.viewedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
