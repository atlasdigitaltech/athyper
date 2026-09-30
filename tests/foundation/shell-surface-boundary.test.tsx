import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ShellSurfaceBoundary } from "../../packages/platform/shell/shell/src/shell-surface-boundary";

test("surface recovery keeps page input mounted and redacts the render error", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const previous = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const root = createRoot(dom.window.document.getElementById("root")!, { onCaughtError: () => {} });
  let fail = true, closed = 0;
  function Surface() { if (fail) throw new Error("private diagnostic"); return <p>Recovered surface</p>; }
  try {
    await act(async () => root.render(<><input aria-label="Page draft" defaultValue="Unsaved draft" /><ShellSurfaceBoundary label="Panel recovery" onClose={() => { closed++; }}><Surface /></ShellSurfaceBoundary></>));
    const input = dom.window.document.querySelector("input")!;
    assert.equal(input.value, "Unsaved draft");
    assert.doesNotMatch(dom.window.document.body.textContent!, /private diagnostic/);
    await act(async () => (dom.window.document.querySelectorAll("button")[1] as HTMLButtonElement).click());
    assert.equal(closed, 1);
    fail = false;
    await act(async () => dom.window.document.querySelector("button")!.click());
    assert.match(dom.window.document.body.textContent!, /Recovered surface/);
    assert.equal(dom.window.document.querySelector("input"), input);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key];
    dom.window.close();
  }
});
