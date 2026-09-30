import assert from "node:assert/strict";
import * as React from "react";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ShellChrome } from "../../packages/platform/shell/shell/src/client";
import type { DerivedShellNavigation } from "../../packages/platform/shell/shell/src/core";

const route = Object.freeze({ id: "fixture.home", moduleCode: "fin", href: "/" as const, label: "Core Accounting", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" as const, workspaceCode: "finance", workspaceName: "Finance", moduleName: "Core Accounting", sortOrder: 1 });
const navigation: DerivedShellNavigation = Object.freeze({ workspaces: [Object.freeze({ code: "finance", name: "Finance", iconKey: "home", sortOrder: 1, routes: [route] })], routes: [route], landingHref: "/", unknownActiveModules: [] });

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://neon.test/" });
  const animationFrame = (callback: FrameRequestCallback) => { callback(0); return 1; };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator }, localStorage: { configurable: true, value: dom.window.localStorage },
    Element: { configurable: true, value: dom.window.Element }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent }, KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    requestAnimationFrame: { configurable: true, value: animationFrame }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperty(dom.window, "requestAnimationFrame", { configurable: true, value: animationFrame });
  Object.defineProperty(dom.window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Object.defineProperties(dom.window.HTMLElement.prototype, { attachEvent: { configurable: true, value() {} }, detachEvent: { configurable: true, value() {} } });
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });
const click = async (element: Element) => act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("shell activity center", () => {
  it("opens through a body portal, switches tabs, and restores trigger focus", async () => {
    let enabled=0;
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation} activity={{
      notifications: [{ id: "notification-1", title: "Invoice approved", timestamp: "2026-08-25T08:00:00Z", timestampLabel: "Just now", unread: true }],
      inbox: [{ id: "inbox-1", title: "Review purchase order", priority: "high" }],
      pushEnrollmentStatus: "prompt",
      onEnableBrowserPush: ()=>{enabled+=1;},
    }}><section><h1>Dashboard</h1></section></ShellChrome>));

    const recent = host.querySelector<HTMLButtonElement>('button[aria-label="Open recent items"]')!;
    await click(recent);
    assert.ok(host.querySelector('#athyper-quick-access'));

    const notifications = host.querySelector<HTMLButtonElement>('button[data-slot="notifications"]')!;
    notifications.focus();
    await click(notifications);

    const drawer = document.body.querySelector<HTMLElement>('#athyper-activity-center')!;
    assert.ok(drawer);
    assert.equal(host.querySelector('#athyper-quick-access'), null);
    assert.equal(host.querySelector('#athyper-activity-center'), null);
    assert.match(drawer.textContent ?? "", /Invoice approved/);
    const enableAlerts=Array.from(drawer.querySelectorAll("button")).find((button)=>button.textContent?.includes("Enable alerts"))!;
    await click(enableAlerts);
    assert.equal(enabled,1);
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Close activity center");

    await click(drawer.querySelector<HTMLButtonElement>('#athyper-activity-tab-inbox')!);
    assert.match(drawer.textContent ?? "", /Review purchase order/);

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.body.querySelector('#athyper-activity-center'), null);
    assert.equal(document.activeElement, notifications);
  });

  it("uses contextual recent counts and makes clearing recoverable", async () => {
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation}><section><h1>Dashboard</h1></section></ShellChrome>));

    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Open recent items"]')!);
    const panel = host.querySelector<HTMLElement>('#athyper-quick-access')!;
    assert.match(panel.textContent ?? "", /0 records/);

    await click(Array.from(panel.querySelectorAll("button")).find((button) => button.textContent?.includes("Show recent pages"))!);
    assert.match(panel.textContent ?? "", /1 page/);

    await click(Array.from(panel.querySelectorAll("button")).find((button) => button.textContent === "Clear all recent")!);
    assert.ok(Array.from(panel.querySelectorAll("button")).some((button) => button.textContent === "Cancel"));
    await click(Array.from(panel.querySelectorAll("button")).find((button) => button.textContent === "Clear all")!);
    assert.match(panel.textContent ?? "", /Recent history cleared/);

    await click(Array.from(panel.querySelectorAll("button")).find((button) => button.textContent === "Undo")!);
    assert.match(panel.textContent ?? "", /1 page/);
  });
});
