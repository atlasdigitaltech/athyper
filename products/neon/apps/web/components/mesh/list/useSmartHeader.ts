"use client";

// components/mesh/list/useSmartHeader.ts
//
// Scroll-responsive header collapse hook.
// Collapses the filter/chip area when scrolling down to maximize data area,
// expands when scrolling up to give access to controls.
//
// Behavior rules:
//   - At top of scroll (scrollY ≤ threshold): always expanded
//   - Scrolling down: collapse after dead-zone delta
//   - Scrolling up: expand after dead-zone delta
//   - Fast scroll up: immediate expand
//   - Focus exception: don't collapse while user interacts with header
//   - Transition lock: ignore scroll events for 300ms after a toggle
//     to prevent feedback loops from layout-shift-induced scroll events

import { useCallback, useEffect, useRef, useState } from "react";

/** Pixels of accumulated scroll delta before triggering a toggle */
const DEAD_ZONE = 20;
/** ScrollTop below which header is always expanded */
const TOP_THRESHOLD = 48;
/** Absolute single-frame delta that triggers immediate expand on scroll-up */
const FAST_UP_THRESHOLD = 60;
/** Cooldown (ms) after each toggle — prevents layout-shift feedback loops */
const TRANSITION_LOCK_MS = 300;

/**
 * Tracks scroll direction on a container and returns whether the header
 * children (filter bar, chips) should be collapsed.
 *
 * Uses a transition lock to prevent feedback loops: when the header
 * collapses/expands, the scroll container resizes, which fires new
 * scroll events. The lock ignores these events during the CSS transition.
 *
 * @param scrollRef  Ref to the scrollable container (ListScrollContainer)
 * @param headerRef  Ref to the header element (for focus-within tracking)
 * @returns `true` when the header children should be collapsed
 */
export function useSmartHeader(
  scrollRef: React.RefObject<HTMLElement | null>,
  headerRef: React.RefObject<HTMLElement | null>,
): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const lastScrollY = useRef(0);
  const accumulatedDelta = useRef(0);
  const hasFocusWithin = useRef(false);
  const lockUntilRef = useRef(0);

  // State setter that only fires when the value actually changes,
  // and applies a transition lock to prevent feedback loops.
  const setCollapsedWithLock = useCallback((value: boolean) => {
    if (collapsedRef.current === value) return;
    collapsedRef.current = value;
    lockUntilRef.current = performance.now() + TRANSITION_LOCK_MS;
    setCollapsed(value);
  }, []);

  // Focus tracking: don't auto-collapse while user interacts with header controls
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const onFocusIn = () => {
      hasFocusWithin.current = true;
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node)) {
        hasFocusWithin.current = false;
      }
    };

    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [headerRef]);

  // Scroll direction detection with dead zone + transition lock
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollY = container.scrollTop;
      const delta = scrollY - lastScrollY.current;
      lastScrollY.current = scrollY;

      // During transition lock: track position but don't toggle
      if (performance.now() < lockUntilRef.current) {
        accumulatedDelta.current = 0;
        return;
      }

      // At top → always expanded
      if (scrollY <= TOP_THRESHOLD) {
        accumulatedDelta.current = 0;
        setCollapsedWithLock(false);
        return;
      }

      // Focus exception: don't collapse while interacting with header
      if (hasFocusWithin.current && delta > 0) return;

      // Reset accumulator when direction changes
      if (
        (delta > 0 && accumulatedDelta.current < 0) ||
        (delta < 0 && accumulatedDelta.current > 0)
      ) {
        accumulatedDelta.current = 0;
      }
      accumulatedDelta.current += delta;

      // Fast scroll up → immediate expand
      if (delta < -FAST_UP_THRESHOLD) {
        accumulatedDelta.current = 0;
        setCollapsedWithLock(false);
        return;
      }

      // Dead zone check: only toggle after accumulating enough delta
      if (accumulatedDelta.current > DEAD_ZONE) {
        accumulatedDelta.current = 0;
        setCollapsedWithLock(true);
      } else if (accumulatedDelta.current < -DEAD_ZONE) {
        accumulatedDelta.current = 0;
        setCollapsedWithLock(false);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollRef, setCollapsedWithLock]);

  return collapsed;
}
