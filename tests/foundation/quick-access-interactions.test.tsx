import assert from "node:assert/strict";
import * as React from "react";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ShellChrome } from "../../packages/platform/shell/shell/src/client";
import type { DerivedShellNavigation } from "../../packages/platform/shell/shell/src/core";

const route = Object.freeze({ id: "fixture.procurement", moduleCode: "buy", href: "/procurement" as const, label: "Purchase Invoices", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "primary" as const, workspaceCode: "operations", workspaceName: "Operations", moduleName: "Procurement", sortOrder: 1 });
const navigation: DerivedShellNavigation = Object.freeze({ workspaces: [Object.freeze({ code: "operations", name: "Operations", iconKey: "info", sortOrder: 1, routes: [route] })], routes: [route], landingHref: "/procurement", unknownActiveModules: [] });

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://test.athyper.local/procurement/invoice/PI-1042" });
  const animationFrame = (callback: FrameRequestCallback) => { callback(0); return 1; };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator }, localStorage: { configurable: true, value: dom.window.localStorage },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement }, MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent }, requestAnimationFrame: { configurable: true, value: animationFrame },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperty(dom.window, "requestAnimationFrame", { configurable: true, value: animationFrame });
  Object.defineProperty(dom.window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Object.defineProperties(dom.window.HTMLElement.prototype, { attachEvent: { configurable: true, value() {} }, detachEvent: { configurable: true, value() {} } });
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });

const click = async (element: Element) => act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("shell quick access", () => {
  it("tracks a deep record, promotes it to favourites, and restores focus on Escape", async () => {
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" accountLoginId="user.one" navigation={navigation}><section><h1>Purchase invoice</h1></section></ShellChrome>));
    const recent = host.querySelector<HTMLButtonElement>('button[aria-label="Open recent items"]')!;
    recent.focus();
    await click(recent);
    assert.ok(host.querySelector('[role="dialog"][aria-labelledby="athyper-quick-access-title"]'));
    assert.match(host.querySelector('[role="tabpanel"]')?.textContent ?? "", /PI 1042/);
    const add = host.querySelector<HTMLButtonElement>('button[aria-label="Add PI 1042 to favourites"]')!;
    await click(add);
    const favouritesTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent?.includes("Favourites"))!;
    await click(favouritesTab);
    assert.match(host.querySelector('[role="tabpanel"]')?.textContent ?? "", /PI 1042/);
    const stored = JSON.stringify(dom.window.localStorage);
    assert.doesNotMatch(stored, /User One|user\.one/);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(host.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, recent);
  });

  it("filters supplied authoritative items without writing them to local storage", async () => {
    const favourite = { id: "bookmark-1", href: "/procurement/invoice/INV-1001", label: "Purchase Invoice", description: "INV-1001 · Northstar Supplies", group: "Purchase invoices", kind: "record" as const };
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation} quickAccess={{ favourites: [favourite], recent: [] }}><section><h1>Purchase invoice</h1></section></ShellChrome>));
    await click(host.querySelector('button[aria-label="Open favourites"]')!);
    const input = host.querySelector<HTMLInputElement>('input[placeholder="Search favourites"]')!;
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set; setter?.call(input, "northstar"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.match(host.querySelector('[role="tabpanel"]')?.textContent ?? "", /Northstar Supplies/);
    assert.equal(dom.window.localStorage.length, 0);
  });
});
