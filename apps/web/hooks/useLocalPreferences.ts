"use client";

/**
 * useLocalPreferences — localStorage-backed user preferences
 *
 * Stores recently visited records and pinned records per entity.
 * Keys follow the neon: prefix convention established in SessionProvider.
 *
 * No server round-trips. SSR-safe (reads after mount only).
 */

import { useCallback, useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────

export interface RecentRecord {
  entityCode: string;
  id: string;
  title: string;
  visitedAt: string; // ISO datetime
}

export interface PinnedRecord {
  entityCode: string;
  id: string;
  title: string;
}

interface LocalPreferences {
  recentHistory: RecentRecord[];
  pinnedRecords: PinnedRecord[];
}

// ── Constants ────────────────────────────────────────────────────

const KEYS = {
  recentHistory: "neon:recentHistory",
  pinnedRecords: "neon:pinnedRecords",
} as const;

const MAX_RECENTS = 20;

// ── Helpers ──────────────────────────────────────────────────────

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────

export function useLocalPreferences() {
  const [prefs, setPrefs] = useState<LocalPreferences>({
    recentHistory: [],
    pinnedRecords: [],
  });

  // Read from localStorage after mount (SSR-safe)
  useEffect(() => {
    setPrefs({
      recentHistory: readStorage<RecentRecord[]>(KEYS.recentHistory, []),
      pinnedRecords: readStorage<PinnedRecord[]>(KEYS.pinnedRecords, []),
    });
  }, []);

  // ── Recent history ────────────────────────────────────────────

  const pushRecent = useCallback((record: Omit<RecentRecord, "visitedAt">) => {
    setPrefs((prev) => {
      const filtered = prev.recentHistory.filter(
        (r) => !(r.entityCode === record.entityCode && r.id === record.id),
      );
      const next: RecentRecord[] = [
        { ...record, visitedAt: new Date().toISOString() },
        ...filtered,
      ].slice(0, MAX_RECENTS);
      writeStorage(KEYS.recentHistory, next);
      return { ...prev, recentHistory: next };
    });
  }, []);

  const clearRecents = useCallback(() => {
    writeStorage(KEYS.recentHistory, []);
    setPrefs((prev) => ({ ...prev, recentHistory: [] }));
  }, []);

  // ── Pinned records ────────────────────────────────────────────

  const pinRecord = useCallback((record: PinnedRecord) => {
    setPrefs((prev) => {
      const alreadyPinned = prev.pinnedRecords.some(
        (r) => r.entityCode === record.entityCode && r.id === record.id,
      );
      if (alreadyPinned) return prev;
      const next = [...prev.pinnedRecords, record];
      writeStorage(KEYS.pinnedRecords, next);
      return { ...prev, pinnedRecords: next };
    });
  }, []);

  const unpinRecord = useCallback((entityCode: string, id: string) => {
    setPrefs((prev) => {
      const next = prev.pinnedRecords.filter(
        (r) => !(r.entityCode === entityCode && r.id === id),
      );
      writeStorage(KEYS.pinnedRecords, next);
      return { ...prev, pinnedRecords: next };
    });
  }, []);

  const isPinned = useCallback(
    (entityCode: string, id: string) =>
      prefs.pinnedRecords.some((r) => r.entityCode === entityCode && r.id === id),
    [prefs.pinnedRecords],
  );

  return {
    recentHistory: prefs.recentHistory,
    pinnedRecords: prefs.pinnedRecords,
    pushRecent,
    clearRecents,
    pinRecord,
    unpinRecord,
    isPinned,
  };
}
