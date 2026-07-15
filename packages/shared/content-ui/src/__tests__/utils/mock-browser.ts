/**
 * Browser API mocks not provided by jsdom.
 *
 * Each install function is safe to call multiple times — later calls
 * replace the prior implementation. Tests can swap in custom variants
 * by calling install* with their own arguments.
 */

// ── matchMedia ─────────────────────────────────────────────────────────────────

export interface MatchMediaControl {
  /** Set the current value `prefers-reduced-motion` resolves to. */
  setReducedMotion(value: boolean): void;
}

export function installMatchMediaMock(): MatchMediaControl {
  let reducedMotion = false;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: query.includes("prefers-reduced-motion: reduce") ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  return {
    setReducedMotion(value: boolean) {
      reducedMotion = value;
    },
  };
}

// ── scrollIntoView ─────────────────────────────────────────────────────────────

export interface ScrollIntoViewControl {
  /** Read every call (target element + options) since install. */
  readonly calls: ReadonlyArray<{ target: Element; options?: ScrollIntoViewOptions | boolean }>;
  /** Reset the call log. */
  reset(): void;
}

export function installScrollIntoViewMock(): ScrollIntoViewControl {
  const calls: Array<{ target: Element; options?: ScrollIntoViewOptions | boolean }> = [];

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    writable: true,
    configurable: true,
    value(this: HTMLElement, options?: ScrollIntoViewOptions | boolean) {
      calls.push({ target: this, options });
    },
  });

  return {
    get calls(): ReadonlyArray<{ target: Element; options?: ScrollIntoViewOptions | boolean }> {
      return calls;
    },
    reset() {
      calls.length = 0;
    },
  };
}

// ── requestAnimationFrame ──────────────────────────────────────────────────────
// jsdom provides RAF but tests benefit from a synchronous flush helper.

export interface RafControl {
  /** Run all pending RAF callbacks synchronously. Returns the number flushed. */
  flush(): number;
}

export function installRequestAnimationFrameMock(): RafControl {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    pending.delete(id);
  };

  return {
    flush(): number {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const cb of callbacks) {
        try { cb(performance.now()); } catch { /* swallow — test will fail elsewhere */ }
      }
      return callbacks.length;
    },
  };
}

// ── Window scroll state ────────────────────────────────────────────────────────

export interface ScrollStateControl {
  setScrollY(value: number): void;
  setInnerHeight(value: number): void;
  setDocumentScrollHeight(value: number): void;
  /** Fire `scroll` on `window` with current values. */
  dispatchScroll(): void;
}

export function installScrollStateControl(): ScrollStateControl {
  let scrollY = 0;
  let innerHeight = 768;
  let scrollHeight = 1000;

  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => innerHeight });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });

  return {
    setScrollY(value) { scrollY = value; },
    setInnerHeight(value) { innerHeight = value; },
    setDocumentScrollHeight(value) { scrollHeight = value; },
    dispatchScroll() {
      window.dispatchEvent(new Event("scroll"));
    },
  };
}

// ── CSS custom property ────────────────────────────────────────────────────────

/**
 * Set a CSS custom property on `document.documentElement` and have
 * `getComputedStyle().getPropertyValue()` return it. jsdom's
 * getComputedStyle is limited; this shim handles the read path.
 */
export function setRootCssVar(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value);
}
