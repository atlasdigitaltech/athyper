import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AtlasPromptComposer } from "../../packages/platform/shell/shell/src/home";

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://test.athyper.local", pretendToBeVisual: true });
  Object.defineProperties(globalThis, {
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
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

test("Atlas composer opens the prompt library and applies a selected prompt", async () => {
  let value="";
  await act(async () => root.render(<AtlasPromptComposer
    draftKey="atlas-composer-interaction-test"
    value=""
    onChange={(next) => { value=next; }}
    onSubmit={() => undefined}
    onCancel={() => undefined}
    busy={false}
    onAgentChange={() => undefined}
    prompts={[{label:"Review my priorities",prompt:"Show my highest-priority work"}]}
  />));

  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Prompt library"]')!;
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(trigger.getAttribute("title"), "Prompt library");

  await act(async () => trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const prompt = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
  assert.match(prompt.textContent??"",/Review my priorities/);

  await act(async () => prompt.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(value,"Show my highest-priority work");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
});

test("Atlas composer exposes a rounded stop control while generating", async () => {
  let cancelled=0;
  await act(async () => root.render(<AtlasPromptComposer
    draftKey="atlas-composer-stop-test"
    value="Summarize this account"
    onChange={() => undefined}
    onSubmit={() => undefined}
    onCancel={() => { cancelled+=1; }}
    busy
    onAgentChange={() => undefined}
  />));

  const stop = host.querySelector<HTMLButtonElement>('button[aria-label="Stop generating"]')!;
  assert.equal(stop.disabled,false);
  assert.ok(stop.querySelector(".athyper-home__composer-stop-icon"));
  await act(async () => stop.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(cancelled,1);
});
