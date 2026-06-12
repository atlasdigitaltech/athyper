import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "../utils/renderHook";
import { useDocumentPageController } from "../../object-page/useDocumentPageController";
import { getSectionElementId } from "../../object-page/types";
import {
  installScrollIntoViewMock,
  installMatchMediaMock,
} from "../utils/mockBrowser";

const SECTION_IDS = ["__overview", "__lines", "__distributions"];

function mountSectionElements(): void {
  for (const id of SECTION_IDS) {
    const el = document.createElement("section");
    el.id = getSectionElementId(id);
    el.setAttribute("data-section-id", id);
    document.body.appendChild(el);
  }
}

describe("useDocumentPageController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("initial activeSectionId is the first sectionId when no URL hash is present", () => {
    const { result } = renderHook(() => useDocumentPageController({ sectionIds: SECTION_IDS }));
    expect(result.current.activeSectionId).toBe("__overview");
  });

  it("initial activeSectionId is resolved from the URL hash when present", () => {
    window.history.replaceState(null, "", "/page#__distributions");
    const { result } = renderHook(() => useDocumentPageController({ sectionIds: SECTION_IDS }));
    expect(result.current.activeSectionId).toBe("__distributions");
  });

  it("custom hashFor / idForHash overrides identity mapping for clean URLs", () => {
    window.history.replaceState(null, "", "/page#accounting");
    const hashFor: Record<string, string> = {
      __overview:      "details",
      __lines:         "lines",
      __distributions: "accounting",
    };
    const { result } = renderHook(() => useDocumentPageController({
      sectionIds: SECTION_IDS,
      hashFor:    (id) => hashFor[id] ?? id,
      idForHash:  (hash) => Object.entries(hashFor).find(([, h]) => h === hash)?.[0] ?? null,
    }));
    expect(result.current.activeSectionId).toBe("__distributions");
  });

  it("scrollToSection fires scrollIntoView, updates state, updates URL hash", () => {
    mountSectionElements();
    const scroll = installScrollIntoViewMock();
    const { result } = renderHook(() => useDocumentPageController({ sectionIds: SECTION_IDS }));

    act(() => result.current.scrollToSection("__lines", "tabClick"));

    expect(result.current.activeSectionId).toBe("__lines");
    expect(window.location.hash).toBe("#__lines");
    expect(scroll.calls).toHaveLength(1);
    expect(scroll.calls[0]!.options).toMatchObject({ block: "start" });
  });

  it("prefersReducedMotion=true causes scrollIntoView to use instant behavior", () => {
    mountSectionElements();
    const scroll = installScrollIntoViewMock();
    const mm = installMatchMediaMock();
    mm.setReducedMotion(true);

    const { result } = renderHook(() => useDocumentPageController({ sectionIds: SECTION_IDS }));
    act(() => result.current.scrollToSection("__lines", "tabClick"));

    expect(scroll.calls[0]!.options).toMatchObject({ behavior: "instant" });

    mm.setReducedMotion(false);
  });

  it("hashchange listener triggers scrollToSection for the new hash target", () => {
    mountSectionElements();
    const scroll = installScrollIntoViewMock();
    const { result } = renderHook(() => useDocumentPageController({ sectionIds: SECTION_IDS }));

    // Simulate browser back/forward landing on __distributions.
    act(() => {
      window.history.replaceState(null, "", "/page#__distributions");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(result.current.activeSectionId).toBe("__distributions");
    expect(scroll.calls.length).toBeGreaterThan(0);
  });

  it("scrollToSection on an unknown section ID is a no-op (no state change, no scroll)", () => {
    mountSectionElements();
    const scroll = installScrollIntoViewMock();
    const { result } = renderHook(() => useDocumentPageController({ sectionIds: SECTION_IDS }));

    act(() => result.current.scrollToSection("__unknown", "tabClick"));

    expect(result.current.activeSectionId).toBe("__overview");
    expect(scroll.calls).toHaveLength(0);
  });
});
