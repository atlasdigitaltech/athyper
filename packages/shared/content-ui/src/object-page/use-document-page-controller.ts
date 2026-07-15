"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollIntent } from "./use-scroll-intent";
import { useDocumentScrollSpy } from "./use-document-scroll-spy";
import { getSectionElementId } from "./types";
import { prefersReducedMotion } from "./utils";
import type { ScrollIntentSource } from "./types";

export interface UseDocumentPageControllerOptions {
  /** Ordered section IDs. The first is the initial active section unless `initialId` or a URL hash overrides. */
  sectionIds: string[];
  /** Default active section on mount when no URL hash is present. */
  initialId?: string;
  /**
   * Map a section ID to its URL hash. Defaults to identity (`id => id`).
   * Use to expose friendlier slugs (e.g. internal `"__overview"` → `"details"`).
   */
  hashFor?: (id: string) => string;
  /**
   * Inverse of `hashFor`. Return `null` for unknown hashes. Defaults to identity
   * when the hash matches a section ID.
   */
  idForHash?: (hash: string) => string | null;
  /**
   * Update URL hash during natural scroll (via `replaceState`, no history entry).
   * Disabled by default to avoid noisy history mutations during long scrolls.
   * Click-to-section and back/forward navigation always sync the hash.
   */
  syncHashOnScroll?: boolean;
  /**
   * Override the scroll container the spy observes. When omitted, the spy
   * auto-discovers `[data-scroll-root]` from the DOM and falls back to the
   * window. Provided primarily for tests and storybook contexts where the
   * shell isn't present.
   */
  scrollRoot?: HTMLElement | null;
}

export interface UseDocumentPageControllerReturn {
  /** Currently active section, driven by scrollspy + explicit scroll-to. */
  activeSectionId: string;
  /**
   * Scroll to the section programmatically. Triggers scroll-intent
   * suppression for `source` (default `"tabClick"`), updates state, and
   * updates URL hash via `replaceState`.
   */
  scrollToSection: (id: string, source?: ScrollIntentSource) => void;
  /** Pass to each `<DocumentSection>` so scrollspy observes it. */
  registerSectionRef: (id: string, el: HTMLElement | null) => void;
}

/**
 * High-level convenience hook for document object pages.
 *
 * Wires together {@link useScrollIntent} and {@link useDocumentScrollSpy},
 * adds URL-hash sync, and exposes a small imperative API the consumer
 * threads into `EntityHeader` (for `activeTab` / `onTabChange`) and into
 * `DocumentObjectPage` (for `registerSectionRef`).
 *
 * Reusable across neon / mesh / admin — no app-specific dependencies.
 *
 * @example
 * const sections: DocumentSectionDescriptor[] = [
 *   { id: "overview", label: "Details", kind: "overview", loadPolicy: "eager" },
 *   { id: "lines", label: "Line Items", kind: "lines", loadPolicy: "nearViewport" },
 *   ...
 * ];
 *
 * const controller = useDocumentPageController({
 *   sectionIds: sections.map(s => s.id),
 * });
 *
 * return (
 *   <>
 *     <EntityHeader
 *       activeTab={controller.activeSectionId}
 *       onTabChange={(id) => controller.scrollToSection(id, "tabClick")}
 *       ...
 *     />
 *     <DocumentObjectPage
 *       sections={sections}
 *       registerSectionRef={controller.registerSectionRef}
 *       renderSection={(s) => <SectionContent descriptor={s} />}
 *     />
 *   </>
 * );
 */
export function useDocumentPageController(
  options: UseDocumentPageControllerOptions,
): UseDocumentPageControllerReturn {
  const { sectionIds, initialId, hashFor, idForHash, syncHashOnScroll = false, scrollRoot } = options;

  const resolveHashId = useCallback(
    (hash: string): string | null => {
      if (!hash) return null;
      if (idForHash) return idForHash(hash);
      return sectionIds.includes(hash) ? hash : null;
    },
    [idForHash, sectionIds],
  );

  const hashFromId = useCallback(
    (id: string): string => (hashFor ? hashFor(id) : id),
    [hashFor],
  );

  // Initial state must be deterministic across server render and hydration.
  // URL hashes are only available in the browser, so they are applied after
  // mount by the effect below.
  const [activeSectionId, setActiveSectionIdState] = useState<string>(
    initialId ?? sectionIds[0] ?? "",
  );

  const intent = useScrollIntent();

  const writeHash = useCallback(
    (id: string) => {
      if (typeof window === "undefined") return;
      const next = hashFromId(id);
      if (window.location.hash.slice(1) === next) return;
      window.history.replaceState(null, "", `#${next}`);
    },
    [hashFromId],
  );

  const scrollToSection = useCallback(
    (id: string, source: ScrollIntentSource = "tabClick") => {
      if (typeof window === "undefined") return;
      const el = document.getElementById(getSectionElementId(id));
      if (!el) return;

      intent.begin(source);
      const reduced = prefersReducedMotion();
      el.scrollIntoView({
        behavior: reduced ? "instant" : "smooth",
        block: "start",
      });
      setActiveSectionIdState(id);
      writeHash(id);
    },
    [intent, writeHash],
  );

  // Track latest scrollToSection for hashchange listener without re-binding.
  const scrollToSectionRef = useRef(scrollToSection);
  scrollToSectionRef.current = scrollToSection;

  // Scrollspy — updates state during natural scroll.
  const handleSpyChange = useCallback(
    (id: string) => {
      setActiveSectionIdState(id);
      if (syncHashOnScroll) writeHash(id);
    },
    [syncHashOnScroll, writeHash],
  );

  const { register: registerSectionRef } = useDocumentScrollSpy({
    sectionIds,
    onActiveChange: handleSpyChange,
    isSuppressed: intent.isSuppressed,
    scrollRoot,
  });

  // Honour initial hash on mount: scroll to it after sections register.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    const targetId = resolveHashId(hash);
    if (!targetId) return;
    setActiveSectionIdState(targetId);
    // Defer to next frame so DocumentSection refs have registered.
    const raf = window.requestAnimationFrame(() => {
      scrollToSectionRef.current(targetId, "tabClick");
    });
    return () => window.cancelAnimationFrame(raf);
    // Mount-only — re-running on options changes would re-scroll mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward through hashes — programmatic scroll to the target.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      const targetId = resolveHashId(hash);
      if (targetId && targetId !== activeSectionId) {
        scrollToSectionRef.current(targetId, "tabClick");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [activeSectionId, resolveHashId]);

  return {
    activeSectionId,
    scrollToSection,
    registerSectionRef,
  };
}
