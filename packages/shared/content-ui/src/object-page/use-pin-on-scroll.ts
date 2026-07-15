"use client";

import { useEffect, useState } from "react";

export interface UsePinOnScrollOptions {
  /**
   * Explicit scroll container. When omitted, the hook looks for
   * `[data-scroll-root]` in the document and falls back to the window
   * when none is found.
   */
  scrollRoot?: HTMLElement | null;
  /**
   * Pixel offset past the top of the scroll container at which to engage
   * pinned mode. Defaults to 64. Hysteresis is applied automatically so
   * the boundary doesn't oscillate when the user scrolls slowly across it.
   */
  threshold?: number;
}

/**
 * Returns `true` once the scroll container has been scrolled `threshold` px
 * past its top, and `false` again once it scrolls back above
 * `threshold * 0.5` (hysteresis). Designed to drive `EntityHeader`'s
 * expanded → pinned transition without flicker at the boundary.
 *
 * Resolution order for the scroll container:
 *   1. `options.scrollRoot` if provided.
 *   2. `[data-scroll-root]` in the DOM (set by `@athyper/shell`).
 *   3. `window` fallback.
 *
 * Safe under SSR: returns `false` until the first effect runs.
 */
export function usePinOnScroll(options: UsePinOnScrollOptions = {}): boolean {
  const { scrollRoot, threshold = 64 } = options;
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root: HTMLElement | null =
      scrollRoot !== undefined
        ? scrollRoot
        : document.querySelector<HTMLElement>("[data-scroll-root]");
    const target: EventTarget = root ?? window;
    const read = (): number => (root ? root.scrollTop : window.scrollY);

    const onScroll = () => {
      const y = read();
      setPinned((prev) => (prev ? y > threshold * 0.5 : y > threshold));
    };

    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollRoot, threshold]);

  return pinned;
}
