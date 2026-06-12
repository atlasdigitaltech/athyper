"use client";

import { useEffect, useRef } from "react";

/**
 * Publishes the pinned EntityHeader's height to a global CSS custom property
 * `--entity-header-offset` on `document.documentElement`.
 *
 * Consumers (scrollspy, scroll-margin-top on document sections) read the
 * variable instead of independently measuring header height. Keeps the
 * sticky offset coordinated across the page without coupling the header
 * to its consumers.
 *
 * The variable is set only while the header is pinned; reset to "0px"
 * otherwise so non-pinned states do not leak stale offsets.
 */
export function usePublishHeaderOffset(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root) return;

    if (!enabled) {
      root.style.setProperty("--entity-header-offset", "0px");
      return () => {
        root.style.setProperty("--entity-header-offset", "0px");
      };
    }

    const el = ref.current;
    if (!el) return;

    const publish = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      root.style.setProperty("--entity-header-offset", `${h}px`);
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);

    return () => {
      ro.disconnect();
      root.style.setProperty("--entity-header-offset", "0px");
    };
  }, [enabled]);

  return ref;
}
