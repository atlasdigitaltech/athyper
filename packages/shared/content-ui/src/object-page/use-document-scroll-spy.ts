"use client";

import { useCallback, useEffect, useRef } from "react";
import { parseCssVarPx } from "./utils";
import { getSectionElementId } from "./types";

export interface UseDocumentScrollSpyOptions {
  /** Ordered list of section IDs to observe. Order defines bottom-of-page activation target. */
  sectionIds: string[];
  /** Called when the active section changes due to natural scroll. */
  onActiveChange: (id: string) => void;
  /** Returns true when programmatic scroll is in flight; observer updates are ignored while true. */
  isSuppressed: () => boolean;
  /**
   * CSS custom property whose computed pixel value is added to the IntersectionObserver
   * top rootMargin. Defaults to `--entity-header-offset` (published by EntityHeader's
   * pinned mode via `usePublishHeaderOffset`).
   */
  headerOffsetVar?: string;
  /** Extra space below the sticky header before a section counts as "active". Defaults to 32px. */
  headerOffsetPadding?: number;
  /** Bottom-of-page activation threshold in px. Defaults to 2. */
  bottomThreshold?: number;
  /**
   * Explicit scroll container. When omitted, the hook looks for
   * `[data-scroll-root]` in the document and falls back to the window
   * when none is found. Tests inject this to drive a custom container.
   */
  scrollRoot?: HTMLElement | null;
}

export interface UseDocumentScrollSpyReturn {
  /** Pass to each DocumentSection so the observer tracks its element. */
  register: (id: string, el: HTMLElement | null) => void;
}

/**
 * Scrollspy for document object pages.
 *
 * Wraps an IntersectionObserver with a viewport-band rootMargin that
 * accounts for the sticky EntityHeader. The top edge of the observation
 * band sits just below the header; the bottom edge sits at 40% of the
 * viewport. The first intersecting section inside that band is "active".
 *
 * Bottom-of-page special case: when the user has scrolled within
 * `bottomThreshold` px of the document bottom, the last section becomes
 * active regardless of the observer (otherwise short trailing sections
 * never reach the band).
 *
 * Observer updates are short-circuited while `isSuppressed()` returns true.
 * That's how `useScrollIntent` prevents programmatic scrolls from firing
 * active-tab cascades.
 */
export function useDocumentScrollSpy(options: UseDocumentScrollSpyOptions): UseDocumentScrollSpyReturn {
  const refsRef = useRef<Map<string, HTMLElement>>(new Map());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // The active observer is stored in a ref so `register` can attach
  // late-mounting section elements (e.g. lazy-loaded sections, sections
  // gated behind a conditional render) without waiting for the next
  // sectionKey-triggered rebuild. Without this, registration would only
  // be observed during effect setup — which depends on child-before-parent
  // effect ordering and breaks for dynamic mounts.
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Maintained from observer entries; used by the scroll listener to pick
  // the topmost-in-band section on every scroll tick. Without this, the
  // observer-only path missed scroll-up cases where the previous section
  // never lost its intersection state (it remained partially in band
  // throughout the upward motion, so no entries fired).
  const intersectingRef = useRef<Set<Element>>(new Set());

  const register = useCallback((id: string, el: HTMLElement | null) => {
    const prev = refsRef.current.get(id);
    if (prev && prev !== el) {
      observerRef.current?.unobserve(prev);
      intersectingRef.current.delete(prev);
    }
    if (el) {
      refsRef.current.set(id, el);
      observerRef.current?.observe(el);
    } else {
      refsRef.current.delete(id);
    }
  }, []);

  const sectionKey = options.sectionIds.join("|");
  // Resolving the root inside the effect ensures the shell has mounted; we
  // re-key the effect on whether an explicit scroll root was passed so the
  // observer rebuilds if a test swaps containers.
  const scrollRootKey = options.scrollRoot === undefined ? "auto" : "explicit";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const headerOffsetVar = optionsRef.current.headerOffsetVar ?? "--entity-header-offset";
    const padding = optionsRef.current.headerOffsetPadding ?? 32;
    const bottomThreshold = optionsRef.current.bottomThreshold ?? 2;

    // Resolution order: explicit option > [data-scroll-root] in DOM > window.
    const scrollRoot: HTMLElement | null =
      optionsRef.current.scrollRoot !== undefined
        ? optionsRef.current.scrollRoot
        : document.querySelector<HTMLElement>("[data-scroll-root]");
    const scrollTarget: EventTarget = scrollRoot ?? window;

    /**
     * Compute the band-relative position of an element's top edge.
     * Negative = element starts above the band's top (likely the active
     * section we are reading). Positive = element starts below the band top.
     * We pick the section with the largest non-positive `topDiff` — the one
     * whose top is just above (or at) the band top edge.
     */
    const scoreElement = (el: Element, bandTop: number, viewportTop: number): number => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      // Translate to scrollRoot-relative coords when a custom root is used.
      const top = scrollRoot
        ? rect.top - (scrollRoot.getBoundingClientRect().top)
        : rect.top;
      return top - bandTop + viewportTop * 0;
      // (viewportTop kept in the formula to keep the parameter referenced for
      // future use without changing the comparison; it has no effect today.)
    };

    /**
     * Geometry-based active-section pick. Runs on every scroll tick (RAF-
     * throttled) and on every observer update. Independent of intersection
     * state changes — handles scroll-up cases where the previously-active
     * section remained intersecting throughout the motion.
     */
    const pickActiveFromGeometry = (): string | null => {
      if (intersectingRef.current.size === 0) return null;
      const bandTop = parseCssVarPx(headerOffsetVar) + padding;
      const viewportTop = 0; // unused; documented in scoreElement
      let best: { id: string; topDiff: number } | null = null;
      let firstBelow: { id: string; topDiff: number } | null = null;
      for (const el of intersectingRef.current) {
        const id = el.getAttribute("data-section-id");
        if (!id) continue;
        const topDiff = scoreElement(el, bandTop, viewportTop);
        if (topDiff <= 0) {
          // Section's top is at or above the band top. Prefer the section
          // CLOSEST to band top from above (largest topDiff that is ≤ 0).
          if (!best || topDiff > best.topDiff) best = { id, topDiff };
        } else if (!firstBelow || topDiff < firstBelow.topDiff) {
          // Fallback: no section has crossed the band top yet. Pick the
          // topmost (smallest positive topDiff) so we still surface
          // something reasonable above the band.
          firstBelow = { id, topDiff };
        }
      }
      return (best ?? firstBelow)?.id ?? null;
    };

    // Synchronous on-scroll handler: bottom-of-page snap first, then
    // geometry-based active-section pick. Section counts are bounded
    // (<~12 typically), so an O(N) sweep per scroll event is cheap. Keeps
    // the test surface predictable — no animation-frame indirection.
    const handleScroll = () => {
      if (optionsRef.current.isSuppressed()) return;

      // Bottom-of-page: snap to the last section.
      const docHeight = scrollRoot
        ? scrollRoot.scrollHeight
        : document.documentElement.scrollHeight;
      const viewBottom = scrollRoot
        ? scrollRoot.scrollTop + scrollRoot.clientHeight
        : window.scrollY + window.innerHeight;
      if (viewBottom >= docHeight - bottomThreshold) {
        const last = optionsRef.current.sectionIds[optionsRef.current.sectionIds.length - 1];
        if (last) {
          optionsRef.current.onActiveChange(last);
          return;
        }
      }

      const id = pickActiveFromGeometry();
      if (id) optionsRef.current.onActiveChange(id);
    };

    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    const buildObserver = (): IntersectionObserver => {
      const headerOffset = parseCssVarPx(headerOffsetVar);
      return new IntersectionObserver(
        (entries) => {
          // Always update the intersecting set so the scroll listener has
          // accurate geometry, even when suppressed. We only skip the
          // *callback fire* during suppression.
          for (const e of entries) {
            if (e.isIntersecting) intersectingRef.current.add(e.target);
            else intersectingRef.current.delete(e.target);
          }
          if (optionsRef.current.isSuppressed()) return;
          // Re-pick from geometry across ALL intersecting sections, not
          // just the entries in this batch. This is what unbreaks scroll-up:
          // when only a section's *exit* fires (new top section had no
          // state change because it was already intersecting), the
          // geometry pass still surfaces the correct active section.
          const id = pickActiveFromGeometry();
          if (id) optionsRef.current.onActiveChange(id);
        },
        {
          root: scrollRoot,
          rootMargin: `-${headerOffset + padding}px 0px -40% 0px`,
          threshold: 0,
        },
      );
    };

    observerRef.current = buildObserver();
    intersectingRef.current.clear();
    for (const el of refsRef.current.values()) observerRef.current.observe(el);

    // Re-observe when the header offset changes (e.g. responsive layout collapse).
    // We watch the CSS variable indirectly by observing the documentElement's
    // size and rebuilding the observer when the offset value materially changes.
    let lastOffset = parseCssVarPx(headerOffsetVar);
    const ro = new ResizeObserver(() => {
      const next = parseCssVarPx(headerOffsetVar);
      if (Math.abs(next - lastOffset) >= 1) {
        lastOffset = next;
        observerRef.current?.disconnect();
        observerRef.current = buildObserver();
        intersectingRef.current.clear();
        for (const el of refsRef.current.values()) observerRef.current.observe(el);
      }
    });
    ro.observe(document.documentElement);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      intersectingRef.current.clear();
      ro.disconnect();
      scrollTarget.removeEventListener("scroll", handleScroll);
    };
    // sectionKey re-runs the effect when the ordered section list changes
    // (sections added/removed); observer needs rebuilding then.
    // scrollRootKey re-runs if the consumer toggles between auto-discovery
    // and explicit override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, scrollRootKey]);

  return { register };
}

/** Re-exported so consumers building custom DocumentSection wrappers can compute element IDs. */
export { getSectionElementId };
