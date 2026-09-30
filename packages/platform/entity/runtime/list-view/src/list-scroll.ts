"use client";
import { useEffect } from "react";

/** Upward scroll distance that brings a hidden toolbar back. Framework policy. */
export const QUICK_RETURN_REVEAL_PX = 24;

const chromeOf = (panel: HTMLElement) =>
  panel.querySelector<HTMLElement>(":scope > .a-entity-list__chrome");

/** Quick-return toolbar for narrow lists: the list chrome slides away while
 * the reader scrolls down and returns after a short upward scroll. It stays
 * visible at the list start, while it holds focus, and while one of its menus
 * is open. The state is a `data-toolbar` attribute on the panel; styles.css
 * owns the geometry, so nothing re-renders per scroll event. */
export function useQuickReturnToolbar(panel: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    const view = panel?.ownerDocument.defaultView;
    if (!panel || !view || !enabled) return;
    const ownerDocument = panel.ownerDocument;
    // Baselines per scroll root, so even a single fling registers a direction.
    const positions = new WeakMap<object, number>([[ownerDocument, ownerDocument.scrollingElement?.scrollTop ?? view.scrollY]]);
    let upward = 0;
    let hidden = false;
    const show = (next: boolean) => {
      if (next === !hidden) return;
      hidden = !next;
      if (hidden) panel.setAttribute("data-toolbar", "hidden");
      else panel.removeAttribute("data-toolbar");
    };
    const pinned = (chrome: HTMLElement) =>
      chrome.contains(ownerDocument.activeElement) ||
      Boolean(chrome.querySelector('[aria-expanded="true"]'));
    const onScroll = (event: Event) => {
      // Resolved per event: the chrome mounts after the list's first load.
      const chrome = chromeOf(panel);
      if (!chrome) return;
      const target = event.target;
      // Only the page's scroll root moves the list; ignore inner scrollers.
      if (target instanceof Element && !target.contains(panel)) return;
      const root = target instanceof Element ? target : ownerDocument;
      const top =
        target instanceof Element
          ? target.scrollTop
          : (ownerDocument.scrollingElement?.scrollTop ?? view.scrollY);
      const previous = positions.get(root);
      const delta = previous === undefined ? 0 : top - previous;
      positions.set(root, top);
      const dock = Number.parseFloat(view.getComputedStyle(chrome).top) || 0;
      if (panel.getBoundingClientRect().top >= dock || pinned(chrome)) {
        upward = 0;
        show(true);
      } else if (delta > 0) {
        upward = 0;
        show(false);
      } else if (delta < 0) {
        upward -= delta;
        if (upward >= QUICK_RETURN_REVEAL_PX) show(true);
      }
    };
    const reveal = (event: FocusEvent) => {
      if (event.target instanceof Node && chromeOf(panel)?.contains(event.target)) show(true);
    };
    view.addEventListener("scroll", onScroll, { passive: true, capture: true });
    panel.addEventListener("focusin", reveal);
    return () => {
      view.removeEventListener("scroll", onScroll, true);
      panel.removeEventListener("focusin", reveal);
      panel.removeAttribute("data-toolbar");
    };
  }, [panel, enabled]);
}

/** After a new result set loads, bring the first result into view when the
 * reader had scrolled past the list start. Focus is not moved. */
export function revealListStart(panel: HTMLElement) {
  const view = panel.ownerDocument.defaultView;
  const margin = view
    ? Number.parseFloat(view.getComputedStyle(panel).scrollMarginBlockStart) || 0
    : 0;
  if (panel.getBoundingClientRect().top >= margin) return;
  const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}
