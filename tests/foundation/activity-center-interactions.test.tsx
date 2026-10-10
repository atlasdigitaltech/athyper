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
  // Asynchronous like a browser: a synchronous fake recurses forever when a frame schedules the next.
  const animationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator }, localStorage: { configurable: true, value: dom.window.localStorage },
    Element: { configurable: true, value: dom.window.Element }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent }, KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    requestAnimationFrame: { configurable: true, value: animationFrame }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    // Some shell sources compile with the classic JSX runtime here.
    React: { configurable: true, value: React },
  });
  Object.defineProperty(dom.window, "requestAnimationFrame", { configurable: true, value: animationFrame });
  Object.defineProperty(dom.window, "cancelAnimationFrame", { configurable: true, value: (id: number) => clearTimeout(id) });
  Object.defineProperty(dom.window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Object.defineProperties(dom.window.HTMLElement.prototype, { attachEvent: { configurable: true, value() {} }, detachEvent: { configurable: true, value() {} } });
  host = document.querySelector("#root") as HTMLElement;
  root = createRoot(host);
});

afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });
const click = async (element: Element) => act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("shell activity center", () => {
  it("opens through a body portal, switches sections from the app bar, and restores focus", async () => {
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation} activity={{
      notifications: [{ id: "notification-1", title: "Invoice approved", timestamp: "2026-08-25T08:00:00Z", timestampLabel: "Just now", unread: true }],
      inbox: [{ id: "inbox-1", title: "Review purchase order", priority: "high" }],
    }}><section><h1>Dashboard</h1></section></ShellChrome>));

    await click(host.querySelector<HTMLButtonElement>('button[data-slot="quick-access"]')!);
    assert.ok(document.body.querySelector('#athyper-quick-access'));

    const notifications = host.querySelector<HTMLButtonElement>('button[data-slot="notifications"]')!;
    notifications.focus();
    await click(notifications);

    const drawer = document.body.querySelector<HTMLElement>('#athyper-activity-center')!;
    assert.ok(drawer);
    // Both are app bar panels in the one right-edge slot: Notifications replaces Quick access.
    assert.ok(!document.body.querySelector('#athyper-quick-access'), "no #athyper-quick-access");
    assert.ok(!host.querySelector('#athyper-activity-center'), "no #athyper-activity-center");
    assert.match(drawer.textContent ?? "", /Invoice approved/);
    // Browser alerts live in Notification preferences, not the panel.
    assert.doesNotMatch(drawer.textContent ?? "", /Enable alerts/);
    // No section tabs: the app bar's Inbox switches the open panel to its section.
    assert.ok(!drawer.querySelector('[role="tab"][id^="athyper-activity-tab-"]'), "no activity tabs");
    const inbox = host.querySelector<HTMLButtonElement>('button[data-slot="inbox"]')!;
    inbox.focus();
    await click(inbox);
    const switched = document.body.querySelector<HTMLElement>('#athyper-activity-center')!;
    assert.match(switched.textContent ?? "", /Review purchase order/);

    // Escape and focus return are covered in a real browser (shared-shell,
    // activity-header-switch); here the panel closes through its close button.
    await click(switched.querySelector<HTMLButtonElement>('button[aria-label="Close activity center"]')!);
    assert.ok(!document.body.querySelector('#athyper-activity-center'), "no #athyper-activity-center");
    // Focus returns to the app bar control used last.
    assert.ok(document.activeElement === inbox, "focus on inbox");
  });

  it("counts recent work in the scope row and makes clearing recoverable", async () => {
    // Show all: the recent item here is a workspace page (Records is the default).
    dom.window.localStorage.setItem("athyper.shell.quick-access.view.v2", JSON.stringify({ show: "all" }));
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation}><section><h1>Dashboard</h1></section></ShellChrome>));

    await click(host.querySelector<HTMLButtonElement>('button[data-slot="quick-access"]')!);
    const panel = document.body.querySelector<HTMLElement>('#athyper-quick-access')!;
    // Records and pages share one Recent list; the count is in the scope row, as in Notifications.
    assert.match(panel.querySelector(".a-panel-context")?.textContent ?? "", /1 recent/);
    assert.match(panel.textContent ?? "", /Core Accounting/);

    await click(panel.querySelector('button[aria-label="Clear all recent"]')!);
    assert.ok(Array.from(panel.querySelectorAll("button")).some((button) => button.textContent === "Cancel"));
    await click(panel.querySelector('button[aria-label^="Clear all recent: "]')!);
    assert.match(panel.textContent ?? "", /Recent history cleared/);

    await click(Array.from(panel.querySelectorAll("button")).find((button) => button.textContent === "Undo")!);
    assert.match(panel.querySelector(".a-panel-context")?.textContent ?? "", /1 recent/);
    assert.match(panel.textContent ?? "", /Core Accounting/);
  });
});
