/**
 * Vitest setup — DOM polyfills + matcher extensions for the @athyper/ui
 * test suite. Both surface-shell render tests (jsdom) and module-shape
 * tests (Node-style) run under jsdom now; the polyfills below are inert
 * for tests that don't need them.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom omits window.scrollTo; suppress its noisy "Not implemented" log.
Object.defineProperty(window, "scrollTo", {
  writable: true,
  configurable: true,
  value: () => {},
});

// Radix Dialog uses PointerEvent during outside-click detection; jsdom
// doesn't ship it.
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

// Element pointer-capture stubs — Radix calls them when mounting dialogs.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
