import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "../utils/render-hook";
import { usePinOnScroll } from "../../object-page/use-pin-on-scroll";
import { installScrollStateControl, type ScrollStateControl } from "../utils/mock-browser";

describe("use-pin-on-scroll", () => {
  let scrollState: ScrollStateControl;

  beforeEach(() => {
    document.body.innerHTML = "";
    scrollState = installScrollStateControl();
  });

  it("returns false at rest and true once scrolled past threshold (window fallback)", () => {
    const { result } = renderHook(() => usePinOnScroll({ threshold: 100 }));
    expect(result.current).toBe(false);

    scrollState.setScrollY(150);
    act(() => scrollState.dispatchScroll());
    expect(result.current).toBe(true);
  });

  it("applies hysteresis — does not unpin until back below threshold/2", () => {
    const { result } = renderHook(() => usePinOnScroll({ threshold: 100 }));

    scrollState.setScrollY(150);
    act(() => scrollState.dispatchScroll());
    expect(result.current).toBe(true);

    // Above hysteresis floor (50) → stays pinned.
    scrollState.setScrollY(80);
    act(() => scrollState.dispatchScroll());
    expect(result.current).toBe(true);

    // Below floor → unpins.
    scrollState.setScrollY(40);
    act(() => scrollState.dispatchScroll());
    expect(result.current).toBe(false);
  });

  it("watches an inner [data-scroll-root] element when present", () => {
    const root = document.createElement("div");
    root.setAttribute("data-scroll-root", "");
    Object.defineProperty(root, "scrollTop", { configurable: true, value: 0, writable: true });
    document.body.appendChild(root);

    const { result } = renderHook(() => usePinOnScroll({ threshold: 50 }));
    expect(result.current).toBe(false);

    (root as unknown as { scrollTop: number }).scrollTop = 80;
    act(() => {
      root.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(true);
  });

  it("explicit scrollRoot overrides DOM auto-discovery", () => {
    const stray = document.createElement("div");
    stray.setAttribute("data-scroll-root", "");
    Object.defineProperty(stray, "scrollTop", { configurable: true, value: 0, writable: true });
    document.body.appendChild(stray);

    const explicit = document.createElement("section");
    Object.defineProperty(explicit, "scrollTop", { configurable: true, value: 0, writable: true });
    document.body.appendChild(explicit);

    const { result } = renderHook(() => usePinOnScroll({ threshold: 50, scrollRoot: explicit }));

    // Scrolling the stray root should not pin.
    (stray as unknown as { scrollTop: number }).scrollTop = 200;
    act(() => stray.dispatchEvent(new Event("scroll")));
    expect(result.current).toBe(false);

    // Scrolling the explicit root pins.
    (explicit as unknown as { scrollTop: number }).scrollTop = 80;
    act(() => explicit.dispatchEvent(new Event("scroll")));
    expect(result.current).toBe(true);
  });
});
