/**
 * Recently viewed — localStorage-backed record history.
 *
 * Usage (call from entity detail pages to register a view):
 *   import { trackRecentlyViewed } from "@/lib/recently-viewed";
 *   trackRecentlyViewed({ entityCode, entityLabel, id, title, href });
 */

export interface RecentlyViewedItem {
  entityCode: string;
  entityLabel: string;
  id: string;
  title: string;
  href: string;
  viewedAt: string; // ISO timestamp
}

const KEY = "neon:recently-viewed";
const MAX = 12;
let maxItems = MAX;

export function setRecentlyViewedLimit(limit: number): void {
  if (!Number.isFinite(limit) || limit < 1) return;
  maxItems = Math.floor(limit);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(readItems().slice(0, maxItems)));
  } catch {
    // Storage unavailable — ignore
  }
}

export function trackRecentlyViewed(
  item: Omit<RecentlyViewedItem, "viewedAt">,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const existing = readItems();
    // Remove duplicate (same href)
    const filtered = existing.filter((r) => r.href !== item.href);
    const updated: RecentlyViewedItem[] = [
      { ...item, viewedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, maxItems);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // Storage unavailable — ignore
  }
}

export function readItems(): RecentlyViewedItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentlyViewedItem[];
  } catch {
    return [];
  }
}
