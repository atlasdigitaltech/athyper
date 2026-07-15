/**
 * Object-page utilities. SSR-safe — every browser API access is guarded.
 */

/**
 * Read a CSS custom property from `document.documentElement` and return
 * its value parsed as pixels. Returns `0` when SSR or unparsable.
 *
 * @example
 * parseCssVarPx("--entity-header-offset"); // 120
 */
export function parseCssVarPx(varName: string): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Whether the user's OS-level `prefers-reduced-motion` setting is "reduce". */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Whether the browser exposes the `scrollend` event. Chromium 114+ and
 * Firefox 109+ support it; Safari does not as of 17.x.
 */
export function hasScrollEnd(): boolean {
  if (typeof window === "undefined") return false;
  return "onscrollend" in window;
}

/**
 * Compose multiple `registerSectionRef` callbacks into one. Use when more
 * than one consumer needs to track section elements (e.g. scrollspy +
 * lazy loader). `undefined` callbacks are skipped, making this safe to
 * use with optional props.
 *
 * The returned function is referentially stable across calls — assuming
 * the input callbacks are stable — so passing it through React props does
 * not retrigger child effects.
 */
export function composeRegisterSectionRef(
  ...registers: Array<((id: string, el: HTMLElement | null) => void) | undefined>
): (id: string, el: HTMLElement | null) => void {
  return (id, el) => {
    for (const r of registers) r?.(id, el);
  };
}
