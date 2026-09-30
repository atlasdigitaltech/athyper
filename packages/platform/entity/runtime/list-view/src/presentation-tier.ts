"use client";
import { useCallback, useLayoutEffect, useState } from "react";

/** List width tiers in rem. `styles.css` mirrors these values in its
 * `@container entity-list` rules; the breakpoint governance check keeps the
 * two in step. Tiers are framework policy, never entity metadata. */
export const LIST_NARROW_MAX_REM = 40;
export const LIST_WIDE_MIN_REM = 64;

export type ListWidthTier = "narrow" | "medium" | "wide";

export function listWidthTier(inlineSize: number, remPixels: number): ListWidthTier {
  const rem = inlineSize / (remPixels || 16);
  return rem < LIST_NARROW_MAX_REM ? "narrow" : rem < LIST_WIDE_MIN_REM ? "medium" : "wide";
}

/** Measures the list's own inline size, so an embedded list in a narrow host
 * adapts exactly like a full page list on a phone. Before measurement the
 * tier is undefined and callers keep the table presentation. */
export function useListWidthTier(): readonly [(element: HTMLElement | null) => void, ListWidthTier | undefined, HTMLElement | null] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [tier, setTier] = useState<ListWidthTier>();
  const ref = useCallback((next: HTMLElement | null) => setElement(next), []);
  useLayoutEffect(() => {
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      // Zero width means not laid out (hidden host, no layout engine), not a phone.
      if (!width) return setTier(undefined);
      const remPixels = view ? Number.parseFloat(view.getComputedStyle(element.ownerDocument.documentElement).fontSize) : 16;
      setTier(listWidthTier(width, remPixels));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [ref, tier, element] as const;
}
