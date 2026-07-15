import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  configurable: true,
  value: () => {},
});

if (typeof window.PointerEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
    }
  };
}

if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

// jsdom doesn't ship `window.matchMedia`; the runtime-list PaletteDrawer
// reads it on mount to decide between desktop / mobile presentation.
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
