import assert from "node:assert/strict";
import * as React from "react";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { Checkbox, Dialog, DialogContent, DialogTrigger, Menu, MenuContent, MenuItem, MenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "../../packages/platform/foundation/ui/src/index";

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://test.athyper.local" });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent }, KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  host = document.querySelector("#root") as HTMLElement; root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });

const click = async (element: Element) => act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("primitive interactions", () => {
  it("supports uncontrolled tabs and keyboard arrow selection", async () => {
    await act(async () => root.render(<Tabs defaultValue="one"><TabsList><TabsTrigger value="one">One</TabsTrigger><TabsTrigger value="two">Two</TabsTrigger></TabsList><TabsContent value="one">First</TabsContent><TabsContent value="two">Second</TabsContent></Tabs>));
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]'); await click(tabs[1]!);
    assert.equal(tabs[1]?.getAttribute("aria-selected"), "true");
    tabs[1]?.focus(); await act(async () => tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(tabs[0]?.getAttribute("aria-selected"), "true"); assert.equal(document.activeElement, tabs[0]);
  });

  it("reports controlled tab changes without mutating the supplied value", async () => {
    let requested = "";
    await act(async () => root.render(<Tabs value="one" onValueChange={(value) => { requested = value; }}><TabsList><TabsTrigger value="one">One</TabsTrigger><TabsTrigger value="two">Two</TabsTrigger></TabsList></Tabs>));
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]'); await click(tabs[1]!);
    assert.equal(requested, "two"); assert.equal(tabs[0]?.getAttribute("aria-selected"), "true");
  });

  it("supports uncontrolled menus and reports controlled open requests", async () => {
    await act(async () => root.render(<Menu><MenuTrigger>Actions</MenuTrigger><MenuContent><MenuItem>Archive</MenuItem></MenuContent></Menu>));
    const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!; await click(trigger); assert.ok(host.querySelector('[role="menu"]'));
    await click(host.querySelector('[role="menuitem"]')!); assert.equal(host.querySelector('[role="menu"]'), null);
    let requested = false;
    await act(async () => root.render(<Menu open={false} onOpenChange={(open) => { requested = open; }}><MenuTrigger>Controlled</MenuTrigger><MenuContent>Items</MenuContent></Menu>));
    await click(host.querySelector('[aria-haspopup="menu"]')!); assert.equal(requested, true); assert.equal(host.querySelector('[role="menu"]'), null);
  });

  it("uses native checkbox state and closes dialogs with Escape while restoring focus", async () => {
    await act(async () => root.render(<><Checkbox aria-label="Remember" /><Dialog><DialogTrigger>Open</DialogTrigger><DialogContent title="Review"><button type="button">Inside</button></DialogContent></Dialog></>));
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; await click(checkbox); assert.equal(checkbox.checked, true);
    const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!; trigger.focus(); await click(trigger);
    assert.equal(document.activeElement?.textContent, "Inside");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(host.querySelector('[role="dialog"]'), null); assert.equal(document.activeElement, trigger);
  });
});
