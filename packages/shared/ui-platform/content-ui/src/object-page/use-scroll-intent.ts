"use client";

import { useCallback, useEffect, useRef } from "react";
import { hasScrollEnd } from "./utils";
import type { ScrollIntentSource } from "./types";

/**
 * Suppression duration in ms per source. Used as a fallback when the
 * `scrollend` event is unavailable (e.g. Safari).
 */
const SUPPRESS_MS: Record<Exclude<ScrollIntentSource, "focus">, number> = {
  tabClick: 1000,
  jumpToError: 1000,
  modeToggle: 500,
};

interface ScrollIntentState {
  isProgrammatic: boolean;
  source: ScrollIntentSource | null;
}

/**
 * The scroll-intent arbiter — single source of truth for "is this scroll
 * happening because the user dragged, or because we triggered it?"
 *
 * Why one arbiter: tab clicks, jump-to-error, and mode-toggle re-anchoring
 * all need to suppress scrollspy temporarily so the IntersectionObserver
 * does not fire spurious active-tab changes mid-animation. Focus-driven
 * scroll is the exception — tab-follows-focus is desired UX.
 *
 * Usage: call `begin(source)` immediately before triggering scroll, then
 * `isSuppressed()` from scrollspy to gate observer callbacks. Suppression
 * lifts on `scrollend` (where supported) or after a per-source timeout.
 *
 * @example
 * const intent = useScrollIntent();
 * intent.begin("tabClick");
 * el.scrollIntoView({ behavior: "smooth", block: "start" });
 * // ...elsewhere:
 * if (intent.isSuppressed()) return;
 */
export function useScrollIntent() {
  const stateRef = useRef<ScrollIntentState>({ isProgrammatic: false, source: null });
  const timerRef = useRef<number | null>(null);
  const scrollEndHandlerRef = useRef<(() => void) | null>(null);

  const clear = useCallback(() => {
    stateRef.current = { isProgrammatic: false, source: null };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (scrollEndHandlerRef.current) {
      window.removeEventListener("scrollend", scrollEndHandlerRef.current);
      scrollEndHandlerRef.current = null;
    }
  }, []);

  const begin = useCallback(
    (source: ScrollIntentSource) => {
      if (typeof window === "undefined") return;
      if (source === "focus") return; // focus does not suppress

      clear();
      stateRef.current = { isProgrammatic: true, source };

      const finish = () => clear();

      if (hasScrollEnd()) {
        scrollEndHandlerRef.current = finish;
        window.addEventListener("scrollend", finish, { once: true });
      }
      timerRef.current = window.setTimeout(finish, SUPPRESS_MS[source]);
    },
    [clear],
  );

  const isSuppressed = useCallback(() => stateRef.current.isProgrammatic, []);

  useEffect(() => {
    return clear;
  }, [clear]);

  return { begin, isSuppressed };
}

export type UseScrollIntentReturn = ReturnType<typeof useScrollIntent>;
