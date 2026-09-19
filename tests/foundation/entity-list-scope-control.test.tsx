import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ListScopeControl } from "../../packages/platform/entity/runtime/list-view/src/scope-control";

test("authorized-context popover dismisses on outside interaction and Escape", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div><button id='outside'>Outside</button>", { url: "https://neon.test" });
  const previous = ["window", "document", "HTMLElement", "MouseEvent", "KeyboardEvent", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, HTMLElement: { configurable: true, value: dom.window.HTMLElement }, MouseEvent: { configurable: true, value: dom.window.MouseEvent }, KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true } });
  const root = createRoot(dom.window.document.querySelector("#root")!);
  try {
    await act(async () => root.render(<ListScopeControl id="organization" label="Organization" value="operations" options={[{ value: "operations", label: "CATL · Operations" }]} status="ready" loadingLabel="Loading…" emptyLabel="None" selectLabel="Select" summaryLabel="Authorized organization" onChange={() => undefined}/>));
    const details = dom.window.document.querySelector("details")!;
    details.open = true;
    await act(async () => dom.window.document.querySelector("#outside")!.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(details.open, false);
    details.open = true;
    await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(details.open, false);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of previous) value ? Object.defineProperty(globalThis, key, value) : delete (globalThis as Record<string, unknown>)[key];
    dom.window.close();
  }
});
