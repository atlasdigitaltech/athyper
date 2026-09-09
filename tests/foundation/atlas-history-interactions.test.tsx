import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AtlasWorkspace } from "../../packages/platform/shell/shell/src/atlas-workspace";
import { AtlasAnswerProvider } from "../../packages/platform/ai/agent-ui/src/index";
import type { AtlasAnswerClient } from "../../packages/platform/ai/agent-runtime/src/index";
import { ShellPersonalizationScopeProvider } from "../../packages/platform/shell/shell/src/personalization-scope";

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://test.athyper.local", pretendToBeVisual: true });
  Object.defineProperties(globalThis, {
    React: { configurable: true, value: React },
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    requestAnimationFrame: { configurable: true, value: dom.window.requestAnimationFrame.bind(dom.window) },
    cancelAnimationFrame: { configurable: true, value: dom.window.cancelAnimationFrame.bind(dom.window) },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

for (const mode of ["dock", "fullscreen"] as const) {
  test(`Atlas ${mode} history dismisses outside and with Escape before closing the workspace`, async () => {
    let closed = 0;
    const client = { experience: async () => null, threads: async () => ({ items: [] }) } as unknown as AtlasAnswerClient;
    await act(async () => root.render(
      <AtlasAnswerProvider options={{ client }}>
        <ShellPersonalizationScopeProvider plane="neon" tenantId="tenant" principalId="user">
          <AtlasWorkspace mode={mode} planeName="Neon" onClose={() => { closed += 1; }} />
        </ShellPersonalizationScopeProvider>
      </AtlasAnswerProvider>
    ));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Conversation history"]')!;
    const panel = () => host.querySelector(".athyper-atlas-workspace__history");
    const toggle = async () => act(async () => { trigger.click(); });
    if (!panel()) await toggle();
    await act(async () => { panel()!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })); });
    assert.ok(panel(), "clicking inside keeps history open");
    await act(async () => { host.querySelector(".athyper-atlas-workspace__conversation")!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })); });
    assert.equal(panel(), null);
    assert.equal(closed, 0);
    await toggle();
    await act(async () => { document.body.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(panel(), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(closed, 0);
    await toggle();
    await toggle();
    assert.equal(panel(), null, "history trigger still toggles closed");
    await act(async () => { trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(closed, 1, "Escape closes the workspace once history is closed");
  });
}
