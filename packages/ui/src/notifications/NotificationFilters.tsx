/**
 * NotificationFilters Component
 *
 * Filter controls for notification list (unread only, category).
 */

"use client";

import { Filter } from "lucide-react";

import { cn } from "../lib/utils";

export interface NotificationFiltersProps {
    unreadOnly: boolean;
    onUnreadOnlyChange: (value: boolean) => void;
    category?: string;
    onCategoryChange?: (value: string | undefined) => void;
    categories?: string[];
    className?: string;
}

export function NotificationFilters({
    unreadOnly,
    onUnreadOnlyChange,
    category,
    onCategoryChange,
    categories = [],
    className,
}: NotificationFiltersProps) {
    return (
        <div
            data-slot="notification-filters"
            className={cn("flex items-center gap-3 px-4 py-2 border-b border-border", className)}
        >
            <Filter className="size-4 text-muted-foreground" />

            {/* Unread Only Toggle */}
            <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(e) => onUnreadOnlyChange(e.target.checked)}
                    className="size-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-foreground">Unread only</span>
            </label>

            {/* Category Filter (if categories provided) */}
            {categories.length > 0 && onCategoryChange && (
                <select
                    value={category ?? ""}
                    onChange={(e) => onCategoryChange(e.target.value || undefined)}
                    className={cn(
                        "ml-auto px-2 py-1 text-sm border border-border rounded-xs",
                        "bg-background text-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-ring"
                    )}
                >
                    <option value="">All categories</option>
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>
                            {cat}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}
