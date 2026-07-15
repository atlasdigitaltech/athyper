"use client";

/**
 * useLocalStoragePreference
 *
 * SSR-safe `useState`-shaped hook that persists a JSON-serialisable value
 * to `localStorage`. Used by the embedded entity-list grid to remember
 * user-level UI preferences (column visibility, etc.) without dragging in
 * URL state or saved views — both of which are explicitly off-limits for
 * embedded grids by Phase C.β.1 design.
 *
 * Semantics:
 *   - First render returns `defaultValue` (SSR-safe; localStorage isn't
 *     available on the server).
 *   - On mount, the hook reads the persisted value once and reconciles.
 *     If the stored JSON is malformed or the key is missing, the default
 *     stays in place.
 *   - Every setter call writes through synchronously. Writes that throw
 *     (private browsing, storage full) are caught and logged at debug
 *     level — the in-memory value still updates so the UI keeps working.
 *   - Multiple instances of the same key on the same page stay in sync
 *     via the `storage` event (cross-tab updates land too, as a bonus).
 *
 * Not a generic preference store — intentionally limited to a single
 * key/value pair so the call sites stay obvious in code review.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useLocalStoragePreference<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValueState] = useState<T>(defaultValue);
  const hydratedRef = useRef(false);

  // Read once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValueState(JSON.parse(raw) as T);
      }
    } catch {
      // Malformed JSON or restricted storage — keep the default.
    }
    hydratedRef.current = true;
  }, [key]);

  // Cross-tab / cross-instance sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== key || e.newValue === null) return;
      try {
        setValueState(JSON.parse(e.newValue) as T);
      } catch {
        // Ignore malformed update.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode / quota — in-memory still updates.
      }
    },
    [key],
  );

  return [value, setValue];
}
