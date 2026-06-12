import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../utils/renderHook";
import { useLazyDocumentSections } from "../../object-page/useLazyDocumentSections";
import {
  installInspectableIntersectionObserver,
  type InspectableIntersectionRegistry,
} from "../utils/mockObservers";
import type { DocumentSectionDescriptor } from "../../object-page/types";

const SECTIONS: DocumentSectionDescriptor[] = [
  { id: "__overview",      label: "Overview",   kind: "overview",      loadPolicy: "eager" },
  { id: "__lines",         label: "Lines",      kind: "lines",         loadPolicy: "nearViewport" },
  { id: "__distributions", label: "Accounting", kind: "distributions", loadPolicy: "onDemand" },
];

function makeEl(): HTMLElement {
  const el = document.createElement("section");
  document.body.appendChild(el);
  el.setAttribute("data-section-id", "__lines");
  return el;
}

describe("useLazyDocumentSections", () => {
  let observers: InspectableIntersectionRegistry;

  beforeEach(() => {
    document.body.innerHTML = "";
    observers = installInspectableIntersectionObserver();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });

  afterEach(() => {
    observers.cleanup();
  });

  it("enabled=false: shouldLoad always returns true (classic-tabs mode)", () => {
    const { result } = renderHook(() => useLazyDocumentSections({
      sections: SECTIONS,
      enabled:  false,
    }));
    expect(result.current.shouldLoad("__lines")).toBe(true);
    expect(result.current.shouldLoad("__distributions")).toBe(true);
  });

  it("eager sections are pre-loaded on mount; nearViewport / onDemand start as not loaded", () => {
    const { result } = renderHook(() => useLazyDocumentSections({
      sections: SECTIONS,
      enabled:  true,
    }));
    expect(result.current.shouldLoad("__overview")).toBe(true);
    expect(result.current.shouldLoad("__lines")).toBe(false);
    expect(result.current.shouldLoad("__distributions")).toBe(false);
  });

  it("nearViewport section: any intersection (including the prefetch band) marks it loaded", () => {
    const { result } = renderHook(() => useLazyDocumentSections({
      sections: SECTIONS,
      enabled:  true,
    }));
    const linesEl = makeEl();
    act(() => result.current.register("__lines", linesEl));

    act(() => {
      observers.fireAll([
        // boundingClientRect top below viewport (in prefetch band)
        { target: linesEl, isIntersecting: true, boundingClientRect: { top: 1200, bottom: 1400 } as DOMRectReadOnly },
      ]);
    });

    expect(result.current.shouldLoad("__lines")).toBe(true);
  });

  it("onDemand section: requires actual viewport intersection, not just the prefetch band", () => {
    const { result } = renderHook(() => useLazyDocumentSections({
      sections: SECTIONS,
      enabled:  true,
    }));
    const distEl = document.createElement("section");
    distEl.setAttribute("data-section-id", "__distributions");
    document.body.appendChild(distEl);
    act(() => result.current.register("__distributions", distEl));

    // Intersection fires with the element below the viewport (only in prefetch
    // band, not actually visible). onDemand should NOT mark it loaded.
    act(() => {
      observers.fireAll([
        { target: distEl, isIntersecting: true, boundingClientRect: { top: 900, bottom: 1000 } as DOMRectReadOnly },
      ]);
    });
    expect(result.current.shouldLoad("__distributions")).toBe(false);

    // Now intersection with the element in actual viewport.
    act(() => {
      observers.fireAll([
        { target: distEl, isIntersecting: true, boundingClientRect: { top: 300, bottom: 400 } as DOMRectReadOnly },
      ]);
    });
    expect(result.current.shouldLoad("__distributions")).toBe(true);
  });

  it("markLoaded forces a section into loaded state regardless of policy", () => {
    const { result } = renderHook(() => useLazyDocumentSections({
      sections: SECTIONS,
      enabled:  true,
    }));
    expect(result.current.shouldLoad("__distributions")).toBe(false);
    act(() => result.current.markLoaded("__distributions"));
    expect(result.current.shouldLoad("__distributions")).toBe(true);
  });

  it("initialLoadedIds seeds the loaded set (hash-pointed section won't flash a skeleton)", () => {
    const { result } = renderHook(() => useLazyDocumentSections({
      sections:           SECTIONS,
      enabled:            true,
      initialLoadedIds:   ["__lines"],
    }));
    expect(result.current.shouldLoad("__lines")).toBe(true);
    expect(result.current.shouldLoad("__distributions")).toBe(false);
  });
});
