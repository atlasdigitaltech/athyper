"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSectionDescriptor } from "./types";

export interface UseLazyDocumentSectionsOptions {
  /** Section descriptors. Order does not matter here — only `id` and `loadPolicy` are read. */
  sections: DocumentSectionDescriptor[];
  /**
   * When `false`, `shouldLoad(id)` always returns `true`. Use for classic-tabs
   * mode where every active panel mounts fully regardless of viewport.
   */
  enabled?: boolean;
  /** Prefetch distance below the viewport (px) for `nearViewport` sections. Default 600. */
  prefetchDistance?: number;
  /**
   * Sections to mark loaded on mount. `eager` sections are always pre-loaded;
   * pass URL-hash-pointed sections here so they don't flash a skeleton.
   */
  initialLoadedIds?: string[];
}

export interface UseLazyDocumentSectionsReturn {
  /** True if section data should be fetched / rendered now. */
  shouldLoad: (id: string) => boolean;
  /** Pass to each DocumentSection so the lazy observer tracks its element. */
  register: (id: string, el: HTMLElement | null) => void;
  /** Manually flag a section as loaded (e.g. on tab click for `onDemand` sections). */
  markLoaded: (id: string) => void;
}

/**
 * Lazy section loader — drives viewport-aware data fetching for document object pages.
 *
 * Policies:
 * - `eager`         — always loaded; observer ignored.
 * - `nearViewport`  — loaded when section enters a band 600px below the viewport
 *                     (one-directional prefetch; intent is to warm data before the
 *                     user reaches it, not to refire on backward scroll).
 * - `onDemand`      — loaded only when the section is actually intersecting the
 *                     viewport (or when `markLoaded(id)` is called explicitly,
 *                     e.g. from a tab click).
 *
 * Loaded state is one-way: once a section is marked loaded, it stays loaded for
 * the lifetime of the page. Sections never "un-load" on scroll-away.
 *
 * Reusable across neon / mesh / admin. No app-specific dependencies.
 *
 * @example
 * const lazy = useLazyDocumentSections({
 *   sections,
 *   enabled: isObjectPage,
 *   initialLoadedIds: [pageController.activeSectionId],
 * });
 *
 * const linesQuery = useQuery({
 *   ...,
 *   enabled: hasLinesSection && lazy.shouldLoad("lines"),
 * });
 */
export function useLazyDocumentSections(
  options: UseLazyDocumentSectionsOptions,
): UseLazyDocumentSectionsReturn {
  const {
    sections,
    enabled = true,
    prefetchDistance = 600,
    initialLoadedIds,
  } = options;

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const refsRef = useRef<Map<string, HTMLElement>>(new Map());

  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const s of sections) {
      if (s.loadPolicy === "eager") initial.add(s.id);
    }
    for (const id of initialLoadedIds ?? []) initial.add(id);
    return initial;
  });

  const markLoaded = useCallback((id: string) => {
    setLoadedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      refsRef.current.set(id, el);
    } else {
      refsRef.current.delete(id);
    }
  }, []);

  // Key derived from current sections so the effect re-runs when the section
  // list (or any section's policy) changes.
  const sectionsKey = sections.map((s) => `${s.id}|${s.loadPolicy}`).join(",");

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // Re-sync eager set in case sections list mutated after mount.
    setLoadedIds((prev) => {
      let next: Set<string> | null = null;
      for (const s of sectionsRef.current) {
        if (s.loadPolicy === "eager" && !prev.has(s.id)) {
          if (!next) next = new Set(prev);
          next.add(s.id);
        }
      }
      return next ?? prev;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-section-id");
          if (!id) continue;
          const descriptor = sectionsRef.current.find((s) => s.id === id);
          if (!descriptor) continue;

          if (descriptor.loadPolicy === "nearViewport") {
            markLoaded(id);
          } else if (descriptor.loadPolicy === "onDemand") {
            // Require actual viewport intersection, not just the prefetch band.
            const rect = entry.boundingClientRect;
            if (rect.top < window.innerHeight && rect.bottom > 0) {
              markLoaded(id);
            }
          }
        }
      },
      {
        rootMargin: `0px 0px ${prefetchDistance}px 0px`,
        threshold: 0,
      },
    );

    for (const el of refsRef.current.values()) observer.observe(el);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, prefetchDistance, sectionsKey, markLoaded]);

  const shouldLoad = useCallback(
    (id: string): boolean => {
      if (!enabled) return true;
      return loadedIds.has(id);
    },
    [enabled, loadedIds],
  );

  return { shouldLoad, register, markLoaded };
}
