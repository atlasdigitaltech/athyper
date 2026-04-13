/**
 * Recent Items — cross-surface work memory layer.
 *
 * Consumed by:
 *   - CommandPalette (Recent tab)
 *   - useRecentTracker (route-visit pushes)
 *
 * Storage: localStorage key "athyper:recent-items" (v2 — replaces "athyper:recent-pages").
 */

export type RecordFamily = "master" | "document" | "ledger" | "page" | "module";

export interface RecentItem {
  /** Route href. Used as unique key. */
  href: string;
  /** Human-readable label — page title, record name, or refCode. */
  label: string;
  /** Document/record code if applicable — e.g. "PO-8812", "JE-10455". */
  refCode?: string;
  /** Module code — e.g. "ACC", "BUY", "SRM". */
  moduleCode?: string;
  /** High-level classification for icon/secondary-line display. */
  recordFamily?: RecordFamily;
  /** ISO timestamp of last visit. */
  visitedAt: string;
  /** User has pinned this item — floats to top of Recent list. */
  pinned?: boolean;
}

const STORAGE_KEY = "athyper:recent-items";
const MAX_ITEMS = 20;

function readStorage(): RecentItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as RecentItem[];
  } catch {
    return [];
  }
}

function writeStorage(items: RecentItem[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full / unavailable
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all recent items, pinned first, then newest-first. */
export function getRecentItems(): RecentItem[] {
  const items = readStorage();
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned).sort(
    (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
  );
  return [...pinned, ...rest];
}

/** Push (or update) a visit. Moves item to front of unpinned list. */
export function pushRecentItem(item: Omit<RecentItem, "visitedAt">) {
  const existing = readStorage();
  // Preserve pinned status if already pinned
  const prev = existing.find((i) => i.href === item.href);
  const updated: RecentItem = {
    ...item,
    visitedAt: new Date().toISOString(),
    pinned: prev?.pinned ?? false,
  };
  const filtered = existing.filter((i) => i.href !== item.href);
  writeStorage([updated, ...filtered].slice(0, MAX_ITEMS));
}

/** Toggle pinned state for an item. Returns the new pinned value. */
export function togglePinItem(href: string): boolean {
  const items = readStorage();
  const idx = items.findIndex((i) => i.href === href);
  if (idx === -1) return false;
  items[idx] = { ...items[idx]!, pinned: !items[idx]!.pinned };
  writeStorage(items);
  return items[idx]!.pinned ?? false;
}

/** Remove a single item from recent history. */
export function removeRecentItem(href: string) {
  writeStorage(readStorage().filter((i) => i.href !== href));
}

/** Clear all unpinned recent items. */
export function clearRecentItems() {
  writeStorage(readStorage().filter((i) => i.pinned));
}

// ── Time formatting ───────────────────────────────────────────────────────────

export function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
