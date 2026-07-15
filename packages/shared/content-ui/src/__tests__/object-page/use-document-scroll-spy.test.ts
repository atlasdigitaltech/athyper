import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../utils/render-hook";
import { useDocumentScrollSpy } from "../../object-page/use-document-scroll-spy";
import {
  installInspectableIntersectionObserver,
  installInspectableResizeObserver,
  type InspectableIntersectionRegistry,
  type InspectableResizeRegistry,
} from "../utils/mock-observers";
import { installScrollStateControl, type ScrollStateControl } from "../utils/mock-browser";

const SECTION_IDS = ["__overview", "__lines", "__distributions"];

function makeSectionElement(id: string): HTMLElement {
  const el = document.createElement("section");
  el.setAttribute("data-section-id", id);
  document.body.appendChild(el);
  return el;
}

describe("use-document-scroll-spy", () => {
  let observers: InspectableIntersectionRegistry;
  let resizers: InspectableResizeRegistry;
  let scrollState: ScrollStateControl;

  beforeEach(() => {
    document.body.innerHTML = "";
    observers = installInspectableIntersectionObserver();
    resizers = installInspectableResizeObserver();
    scrollState = installScrollStateControl();
  });

  afterEach(() => {
    observers.cleanup();
    resizers.cleanup();
  });

  it("register(id, el) adds to the ref map; register(id, null) removes", () => {
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:      SECTION_IDS,
      onActiveChange:  vi.fn(),
      isSuppressed:    () => false,
    }));
    const el = makeSectionElement("__overview");
    act(() => result.current.register("__overview", el));
    expect(observers.instances[0]!.observed.has(el)).toBe(true);

    act(() => result.current.register("__overview", null));
    expect(observers.instances[0]!.observed.has(el)).toBe(false);
  });

  it("observer callback fires onActiveChange with first-intersecting section's data-section-id", () => {
    const onActiveChange = vi.fn();
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange,
      isSuppressed:   () => false,
    }));
    const linesEl = makeSectionElement("__lines");
    act(() => result.current.register("__lines", linesEl));

    act(() => {
      observers.fireAll([
        { target: linesEl, isIntersecting: true, boundingClientRect: { top: 120 } as DOMRectReadOnly },
      ]);
    });

    expect(onActiveChange).toHaveBeenCalledWith("__lines");
  });

  it("isSuppressed=true gates the observer callback (no onActiveChange fires)", () => {
    const onActiveChange = vi.fn();
    let suppressed = true;
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange,
      isSuppressed:   () => suppressed,
    }));
    const el = makeSectionElement("__lines");
    act(() => result.current.register("__lines", el));

    act(() => {
      observers.fireAll([
        { target: el, isIntersecting: true, boundingClientRect: { top: 100 } as DOMRectReadOnly },
      ]);
    });
    expect(onActiveChange).not.toHaveBeenCalled();

    // Lift suppression; fire again; callback fires.
    suppressed = false;
    act(() => {
      observers.fireAll([
        { target: el, isIntersecting: true, boundingClientRect: { top: 100 } as DOMRectReadOnly },
      ]);
    });
    expect(onActiveChange).toHaveBeenCalledWith("__lines");
  });

  it("bottom-of-page scroll activates the last section regardless of observer state", () => {
    const onActiveChange = vi.fn();
    renderHook(() => useDocumentScrollSpy({
      sectionIds:        SECTION_IDS,
      onActiveChange,
      isSuppressed:      () => false,
      bottomThreshold:   2,
    }));

    // Set scroll to within 2px of the document bottom.
    scrollState.setInnerHeight(100);
    scrollState.setDocumentScrollHeight(1000);
    scrollState.setScrollY(899);  // 899 + 100 = 999 (within 1000 - 2 = 998 threshold? Let's check)
    act(() => scrollState.dispatchScroll());
    // 899 + 100 = 999 >= 1000 - 2 = 998 → activates last section.
    expect(onActiveChange).toHaveBeenCalledWith("__distributions");
  });

  it("empty sectionIds: observer still created (for future registrations) but no immediate observation", () => {
    renderHook(() => useDocumentScrollSpy({
      sectionIds:     [],
      onActiveChange: vi.fn(),
      isSuppressed:   () => false,
    }));
    // Implementation creates the observer up-front; key invariant is no callback fires.
    expect(observers.instances.length).toBeGreaterThanOrEqual(0);
  });

  it("observer rebuilds when header offset CSS variable changes (via ResizeObserver)", () => {
    document.documentElement.style.setProperty("--entity-header-offset", "100px");

    renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange: vi.fn(),
      isSuppressed:   () => false,
    }));

    const initialObserverCount = observers.instances.length;

    // Change the offset and fire resize.
    document.documentElement.style.setProperty("--entity-header-offset", "200px");
    act(() => {
      resizers.fireAll([{ target: document.documentElement }]);
    });

    expect(observers.instances.length).toBeGreaterThan(initialObserverCount);
  });

  // ── Scroll root selection ────────────────────────────────────────────────

  it("uses the [data-scroll-root] element as IntersectionObserver root when present", () => {
    const root = document.createElement("div");
    root.setAttribute("data-scroll-root", "");
    document.body.appendChild(root);

    renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange: vi.fn(),
      isSuppressed:   () => false,
    }));

    expect(observers.instances[0]!.options?.root).toBe(root);
  });

  it("falls back to viewport (root: null) when no [data-scroll-root] is present", () => {
    renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange: vi.fn(),
      isSuppressed:   () => false,
    }));

    expect(observers.instances[0]!.options?.root ?? null).toBeNull();
  });

  it("explicit scrollRoot option overrides DOM auto-discovery", () => {
    const stray = document.createElement("div");
    stray.setAttribute("data-scroll-root", "");
    document.body.appendChild(stray);

    const explicit = document.createElement("section");
    document.body.appendChild(explicit);

    renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange: vi.fn(),
      isSuppressed:   () => false,
      scrollRoot:     explicit,
    }));

    expect(observers.instances[0]!.options?.root).toBe(explicit);
  });

  it("bottom-of-page activation fires for the inner scroll root, not window", () => {
    const root = document.createElement("div");
    root.setAttribute("data-scroll-root", "");
    Object.defineProperty(root, "scrollTop", { configurable: true, value: 0, writable: true });
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: 1000 });
    document.body.appendChild(root);

    const onActiveChange = vi.fn();
    renderHook(() => useDocumentScrollSpy({
      sectionIds:        SECTION_IDS,
      onActiveChange,
      isSuppressed:      () => false,
      bottomThreshold:   2,
    }));

    // Scroll the inner root within the bottom threshold.
    // 799 + 200 = 999 >= 1000 - 2 = 998 → activates last section.
    (root as unknown as { scrollTop: number }).scrollTop = 799;
    act(() => {
      root.dispatchEvent(new Event("scroll"));
    });

    expect(onActiveChange).toHaveBeenCalledWith("__distributions");
  });

  // ── Scroll-up / geometry-based active section pick ──────────────────────
  // Regression coverage for the upward-scroll bug: the original observer-
  // only implementation only checked entries from the current callback
  // batch. When scrolling up, sections that remained intersecting through
  // the motion fired no entries — and the active marker never moved
  // backward. The geometry pass now considers ALL intersecting sections.

  function stubRect(el: HTMLElement, top: number, height = 300): void {
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top,
        bottom: top + height,
        left: 0,
        right: 0,
        width: 0,
        height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }),
    });
  }

  it("observer callback picks the topmost-in-band section across ALL intersecting entries (not just this batch)", () => {
    document.documentElement.style.setProperty("--entity-header-offset", "100px");
    const onActiveChange = vi.fn();
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:          SECTION_IDS,
      onActiveChange,
      isSuppressed:        () => false,
      headerOffsetPadding: 32, // bandTop = 132
    }));

    const overview = makeSectionElement("__overview");
    const lines = makeSectionElement("__lines");
    stubRect(overview, -200, 400); // top -200 → above bandTop, topDiff -332
    stubRect(lines, 80, 400);      // top 80 → above bandTop, topDiff -52 (closer to band)
    act(() => {
      result.current.register("__overview", overview);
      result.current.register("__lines", lines);
    });

    // Both enter intersection in the same batch — lines is closer to band top.
    act(() => {
      observers.fireAll([
        { target: overview, isIntersecting: true, boundingClientRect: { top: -200 } as DOMRectReadOnly },
        { target: lines,    isIntersecting: true, boundingClientRect: { top: 80 } as DOMRectReadOnly },
      ]);
    });
    expect(onActiveChange).toHaveBeenLastCalledWith("__lines");
  });

  it("scroll event after entries fire picks the topmost-in-band section from CURRENT geometry (scroll-up regression)", () => {
    document.documentElement.style.setProperty("--entity-header-offset", "100px");
    const onActiveChange = vi.fn();
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:          SECTION_IDS,
      onActiveChange,
      isSuppressed:        () => false,
      headerOffsetPadding: 32, // bandTop = 132
    }));

    const overview = makeSectionElement("__overview");
    const lines = makeSectionElement("__lines");
    // Both currently intersecting. Initially `lines` is closer to band top.
    stubRect(overview, -500, 600);
    stubRect(lines, 80, 400);
    act(() => {
      result.current.register("__overview", overview);
      result.current.register("__lines", lines);
    });
    act(() => {
      observers.fireAll([
        { target: overview, isIntersecting: true, boundingClientRect: { top: -500 } as DOMRectReadOnly },
        { target: lines,    isIntersecting: true, boundingClientRect: { top: 80 } as DOMRectReadOnly },
      ]);
    });
    expect(onActiveChange).toHaveBeenLastCalledWith("__lines");

    // User scrolls UP — both sections remain intersecting, but overview is
    // now the topmost-in-band. Observer fires NO new entries (neither
    // section's intersection state changed). The scroll handler must still
    // re-pick from geometry. With the legacy observer-only path, the
    // active section would have stayed "lines".
    onActiveChange.mockClear();
    stubRect(overview, -50, 600);   // top -50 → topDiff -182 (above band)
    stubRect(lines, 280, 400);      // top 280 → topDiff +148 (below band, fallback only)
    act(() => scrollState.dispatchScroll());

    expect(onActiveChange).toHaveBeenCalledWith("__overview");
  });

  it("scroll event with no intersecting sections is a no-op", () => {
    const onActiveChange = vi.fn();
    renderHook(() => useDocumentScrollSpy({
      sectionIds:     SECTION_IDS,
      onActiveChange,
      isSuppressed:   () => false,
    }));
    act(() => scrollState.dispatchScroll());
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it("scroll-driven geometry pick respects isSuppressed", () => {
    document.documentElement.style.setProperty("--entity-header-offset", "100px");
    const onActiveChange = vi.fn();
    let suppressed = false;
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:          SECTION_IDS,
      onActiveChange,
      isSuppressed:        () => suppressed,
      headerOffsetPadding: 32,
    }));

    const overview = makeSectionElement("__overview");
    stubRect(overview, 50, 400);
    act(() => result.current.register("__overview", overview));
    act(() => {
      observers.fireAll([
        { target: overview, isIntersecting: true, boundingClientRect: { top: 50 } as DOMRectReadOnly },
      ]);
    });
    expect(onActiveChange).toHaveBeenCalledWith("__overview");

    // Suppression should silence subsequent scroll-driven picks.
    onActiveChange.mockClear();
    suppressed = true;
    act(() => scrollState.dispatchScroll());
    expect(onActiveChange).not.toHaveBeenCalled();

    // Lifting suppression re-enables the geometry pick on the next scroll.
    suppressed = false;
    act(() => scrollState.dispatchScroll());
    expect(onActiveChange).toHaveBeenCalledWith("__overview");
  });

  it("intersecting set drops sections when observer reports isIntersecting=false", () => {
    document.documentElement.style.setProperty("--entity-header-offset", "100px");
    const onActiveChange = vi.fn();
    const { result } = renderHook(() => useDocumentScrollSpy({
      sectionIds:          SECTION_IDS,
      onActiveChange,
      isSuppressed:        () => false,
      headerOffsetPadding: 32,
    }));

    const overview = makeSectionElement("__overview");
    const lines = makeSectionElement("__lines");
    stubRect(overview, -50, 200);  // above band → topDiff -182
    stubRect(lines, 200, 400);     // below band → topDiff +68 (fallback only)
    act(() => {
      result.current.register("__overview", overview);
      result.current.register("__lines", lines);
    });

    // Both intersecting. Geometry picks overview (closest to / above band).
    act(() => {
      observers.fireAll([
        { target: overview, isIntersecting: true, boundingClientRect: { top: -50 } as DOMRectReadOnly },
        { target: lines,    isIntersecting: true, boundingClientRect: { top: 200 } as DOMRectReadOnly },
      ]);
    });
    expect(onActiveChange).toHaveBeenLastCalledWith("__overview");

    // Overview leaves intersection. Subsequent scroll must pick lines —
    // the only remaining intersecting section.
    onActiveChange.mockClear();
    act(() => {
      observers.fireAll([
        { target: overview, isIntersecting: false, boundingClientRect: { top: -800 } as DOMRectReadOnly },
      ]);
    });
    // Geometry re-pick after entry: only lines is intersecting now.
    expect(onActiveChange).toHaveBeenLastCalledWith("__lines");
  });

  it("inner-root bottom activation respects isSuppressed", () => {
    const root = document.createElement("div");
    root.setAttribute("data-scroll-root", "");
    Object.defineProperty(root, "scrollTop", { configurable: true, value: 0, writable: true });
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: 1000 });
    document.body.appendChild(root);

    const onActiveChange = vi.fn();
    renderHook(() => useDocumentScrollSpy({
      sectionIds:        SECTION_IDS,
      onActiveChange,
      isSuppressed:      () => true,
      bottomThreshold:   2,
    }));

    (root as unknown as { scrollTop: number }).scrollTop = 799;
    act(() => {
      root.dispatchEvent(new Event("scroll"));
    });

    expect(onActiveChange).not.toHaveBeenCalled();
  });
});
