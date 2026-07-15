"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "athyper.recent.v1";
const MAX_ITEMS = 50;
const UPDATE_EVENT = "athyper:recent-updated";

export interface RecentItem {
  href: string;
  label: string;
  entityCode?: string;
  entityLabel?: string;
  recordCode?: string;
  recordName?: string;
  moduleCode?: string;
  visitedAt: string;
}

function readItems(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function writeItems(items: RecentItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  } catch {}
}

/** Call this from entity detail pages when a record is opened. */
export function recordRecentVisit(item: Omit<RecentItem, "visitedAt">): void {
  const items = readItems().filter((existing) => existing.href !== item.href);
  writeItems([{ ...item, visitedAt: new Date().toISOString() }, ...items]);
}

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>(() => {
    if (typeof window === "undefined") return [];
    return readItems();
  });

  const syncItems = useCallback(() => {
    setItems(readItems());
  }, []);

  useEffect(() => {
    window.addEventListener(UPDATE_EVENT, syncItems);
    window.addEventListener("focus", syncItems);
    return () => {
      window.removeEventListener(UPDATE_EVENT, syncItems);
      window.removeEventListener("focus", syncItems);
    };
  }, [syncItems]);

  const dismiss = useCallback((href: string) => {
    writeItems(readItems().filter((item) => item.href !== href));
    setItems(readItems());
  }, []);

  return { items, dismiss };
}
