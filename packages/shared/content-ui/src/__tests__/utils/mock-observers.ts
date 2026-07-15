/**
 * Mock implementations of IntersectionObserver and ResizeObserver for jsdom.
 *
 * Two install variants:
 *   - `installInert*` — installed globally in `setup.ts`. Implements the
 *     full API surface but never fires callbacks. Lets hooks that *create*
 *     observers (but never need to drive them) run without errors.
 *   - `installInspectable*` — opt-in per test. Tracks every instance
 *     created during the test and exposes a `.fire(entries)` method so
 *     tests can drive callbacks deterministically.
 *
 * Tests using the inspectable variant should call the returned `cleanup()`
 * (or rely on `afterEach` to restore the inert defaults) so subsequent
 * tests start clean.
 */

// ── IntersectionObserver ───────────────────────────────────────────────────────

export interface InspectableIntersectionObserver extends IntersectionObserver {
  /** Test-only: synthetically fire the callback with the given entries. */
  fire(entries: Array<Partial<IntersectionObserverEntry>>): void;
  /** Test-only: read the elements currently observed. */
  readonly observed: ReadonlySet<Element>;
  /** Test-only: read the constructor options. */
  readonly options: IntersectionObserverInit | undefined;
}

export interface InspectableIntersectionRegistry {
  /** All instances created since install. */
  readonly instances: ReadonlyArray<InspectableIntersectionObserver>;
  /** Fire entries on every active instance — convenient when there's only one. */
  fireAll(entries: Array<Partial<IntersectionObserverEntry>>): void;
  /** Restore the inert observer. Call after the test if cleanup matters. */
  cleanup(): void;
}

export function installInertIntersectionObserver(): void {
  // Minimal class so `new IntersectionObserver(...)` works in jsdom.
  class InertIntersectionObserver implements IntersectionObserver {
    root: Element | Document | null = null;
    rootMargin = "";
    // `scrollMargin` is in the modern TS lib's IntersectionObserver interface.
    scrollMargin = "";
    thresholds: readonly number[] = [];
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {
      void _cb;
      void _opts;
    }
    observe(_el: Element): void { void _el; }
    unobserve(_el: Element): void { void _el; }
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    InertIntersectionObserver as unknown as typeof IntersectionObserver;
}

export function installInspectableIntersectionObserver(): InspectableIntersectionRegistry {
  const instances: InspectableIntersectionObserver[] = [];

  class TestIntersectionObserver implements InspectableIntersectionObserver {
    root: Element | Document | null = null;
    rootMargin: string;
    scrollMargin = "";
    thresholds: readonly number[] = [];
    options: IntersectionObserverInit | undefined;
    private callback: IntersectionObserverCallback;
    private elements = new Set<Element>();

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      this.options = options;
      this.rootMargin = options?.rootMargin ?? "";
      this.thresholds = options?.threshold !== undefined
        ? (Array.isArray(options.threshold) ? options.threshold : [options.threshold])
        : [0];
      instances.push(this);
    }
    observe(el: Element): void { this.elements.add(el); }
    unobserve(el: Element): void { this.elements.delete(el); }
    disconnect(): void { this.elements.clear(); }
    takeRecords(): IntersectionObserverEntry[] { return []; }
    get observed(): ReadonlySet<Element> { return this.elements; }
    fire(entries: Array<Partial<IntersectionObserverEntry>>): void {
      const filled = entries.map((e) => ({
        isIntersecting: false,
        intersectionRatio: 0,
        boundingClientRect: { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRectReadOnly,
        intersectionRect: { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRectReadOnly,
        rootBounds: null,
        target: document.createElement("div"),
        time: performance.now(),
        ...e,
      })) as IntersectionObserverEntry[];
      this.callback(filled, this as unknown as IntersectionObserver);
    }
  }

  (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    TestIntersectionObserver as unknown as typeof IntersectionObserver;

  return {
    get instances(): ReadonlyArray<InspectableIntersectionObserver> { return instances; },
    fireAll(entries) {
      for (const inst of instances) inst.fire(entries);
    },
    cleanup() {
      instances.length = 0;
      installInertIntersectionObserver();
    },
  };
}

// ── ResizeObserver ─────────────────────────────────────────────────────────────

export interface InspectableResizeObserver extends ResizeObserver {
  fire(entries: Array<Partial<ResizeObserverEntry>>): void;
  readonly observed: ReadonlySet<Element>;
}

export interface InspectableResizeRegistry {
  readonly instances: ReadonlyArray<InspectableResizeObserver>;
  fireAll(entries: Array<Partial<ResizeObserverEntry>>): void;
  cleanup(): void;
}

export function installInertResizeObserver(): void {
  class InertResizeObserver implements ResizeObserver {
    constructor(_cb: ResizeObserverCallback) { void _cb; }
    observe(_el: Element): void { void _el; }
    unobserve(_el: Element): void { void _el; }
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    InertResizeObserver as unknown as typeof ResizeObserver;
}

export function installInspectableResizeObserver(): InspectableResizeRegistry {
  const instances: InspectableResizeObserver[] = [];

  class TestResizeObserver implements InspectableResizeObserver {
    private callback: ResizeObserverCallback;
    private elements = new Set<Element>();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      instances.push(this);
    }
    observe(el: Element): void { this.elements.add(el); }
    unobserve(el: Element): void { this.elements.delete(el); }
    disconnect(): void { this.elements.clear(); }
    get observed(): ReadonlySet<Element> { return this.elements; }
    fire(entries: Array<Partial<ResizeObserverEntry>>): void {
      const filled = entries.map((e) => ({
        target: document.createElement("div"),
        contentRect: { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
        ...e,
      })) as ResizeObserverEntry[];
      this.callback(filled, this as unknown as ResizeObserver);
    }
  }

  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    TestResizeObserver as unknown as typeof ResizeObserver;

  return {
    get instances(): ReadonlyArray<InspectableResizeObserver> { return instances; },
    fireAll(entries) {
      for (const inst of instances) inst.fire(entries);
    },
    cleanup() {
      instances.length = 0;
      installInertResizeObserver();
    },
  };
}
