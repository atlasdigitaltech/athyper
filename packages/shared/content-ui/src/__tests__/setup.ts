/**
 * Vitest setup — installs DOM polyfills + extends matchers.
 *
 * Runs once before any test file via `vitest.config.ts setupFiles`.
 * Each test file gets a fresh jsdom document, but the polyfilled
 * classes (IntersectionObserver, ResizeObserver) persist on `globalThis`.
 *
 * Tests that need to *drive* the polyfills (fire intersection entries,
 * trigger resize callbacks) use `installIntersectionObserverMock()` /
 * `installResizeObserverMock()` from `./utils/mockObservers.ts`. The
 * defaults installed here are inert — they implement the API but
 * never fire so tests that don't care can ignore them.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

import { installInertIntersectionObserver } from "./utils/mockObservers";
import { installInertResizeObserver } from "./utils/mockObservers";
import { installMatchMediaMock } from "./utils/mockBrowser";
import { installScrollIntoViewMock } from "./utils/mockBrowser";
import { installRequestAnimationFrameMock } from "./utils/mockBrowser";

installInertIntersectionObserver();
installInertResizeObserver();
installMatchMediaMock();
installScrollIntoViewMock();
installRequestAnimationFrameMock();

// React Testing Library cleanup between tests so component DOM doesn't leak.
afterEach(() => {
  cleanup();
});

// Stub window.scrollTo — jsdom doesn't implement it and logs a noisy
// "Not implemented" error otherwise. Tests that need to assert scroll
// behavior use installScrollStateControl from utils/mockBrowser.
Object.defineProperty(window, "scrollTo", {
  writable: true,
  configurable: true,
  value: () => {},
});

// Reset URL / hash between tests so hash-driven hooks see a clean slate.
beforeEach(() => {
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", "/");
  }
});
