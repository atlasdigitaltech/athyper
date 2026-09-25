// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CollectionContinuation } from "../../../../platform/entity/runtime/form-detail/src/collection-continuation";

let root: Root, container: HTMLDivElement;
let intersect: IntersectionObserverCallback;
const disconnect = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const approach = async () => act(async () => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));

it("loads once per approached cursor, then continues for a new page", async () => {
  const load = vi.fn();
  await act(async () => root.render(<CollectionContinuation cursor="one" onLoadMore={load} />));
  expect(load).not.toHaveBeenCalled();
  await approach(); await approach(); expect(load).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<CollectionContinuation cursor="one" loading onLoadMore={load} />));
  expect(container.querySelector("button")?.disabled).toBe(true);
  await act(async () => root.render(<CollectionContinuation cursor="two" onLoadMore={load} />));
  await approach(); expect(load).toHaveBeenCalledTimes(2);
  expect(disconnect).toHaveBeenCalled();
});
it("does not automatically retry errors and provides an explicit retry", async () => {
  const load = vi.fn();
  await act(async () => root.render(<CollectionContinuation cursor="one" onLoadMore={load} />));
  await approach();
  await act(async () => root.render(<CollectionContinuation cursor="one" failed onLoadMore={load} />));
  expect(container.textContent).toContain("Your loaded records are still available");
  expect(container.querySelector("button")?.textContent).toBe("Try again");
  await act(async () => container.querySelector("button")!.click());
  expect(load).toHaveBeenCalledTimes(2);
});
it("retains a manual control without IntersectionObserver", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const load = vi.fn();
  await act(async () => root.render(<CollectionContinuation cursor="one" onLoadMore={load} />));
  await act(async () => container.querySelector("button")!.click());
  expect(load).toHaveBeenCalledTimes(1);
});
it("keeps collaboration pagination deliberate and styled", async () => {
  const load = vi.fn();
  await act(async () => root.render(<CollectionContinuation cursor="one" automatic={false} label="Load more comments" onLoadMore={load} />));
  expect(load).not.toHaveBeenCalled();
  expect(container.textContent).toContain("More records are available.");
  expect(container.querySelector("button")?.textContent).toBe("Load more comments");
  await act(async () => container.querySelector("button")!.click());
  expect(load).toHaveBeenCalledTimes(1);
});
