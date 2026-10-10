import assert from "node:assert/strict";
import * as React from "react";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ShellChrome } from "../../packages/platform/shell/shell/src/client";
import { ShellRouteProvider, useRecordBreadcrumb } from "../../packages/platform/shell/shell/src/route-state";
import { quickAccessStorageKey } from "../../packages/platform/shell/shell/src/quick-access";
import type { DerivedShellNavigation } from "../../packages/platform/shell/shell/src/core";

const route = Object.freeze({ id: "fixture.procurement", moduleCode: "buy", href: "/procurement" as const, label: "Purchase Invoices", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "primary" as const, workspaceCode: "operations", workspaceName: "Operations", moduleName: "Procurement", sortOrder: 1 });
const navigation: DerivedShellNavigation = Object.freeze({ workspaces: [Object.freeze({ code: "operations", name: "Operations", iconKey: "info", sortOrder: 1, routes: [route] })], routes: [route], landingHref: "/procurement", unknownActiveModules: [] });

let dom: JSDOM;
let root: Root;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://test.athyper.local/procurement/invoice/PI-1042" });
  // Asynchronous like a browser: a synchronous fake recurses forever when a frame schedules the next.
  const animationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator }, localStorage: { configurable: true, value: dom.window.localStorage },
    Element: { configurable: true, value: dom.window.Element }, HTMLElement: { configurable: true, value: dom.window.HTMLElement }, MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent }, requestAnimationFrame: { configurable: true, value: animationFrame },
    CustomEvent: { configurable: true, value: dom.window.CustomEvent },
    Node: { configurable: true, value: dom.window.Node },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
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

describe("shell quick access", () => {
  it("opens from the app bar on the right, promotes a deep record to favourites, and restores focus on Escape", async () => {
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" accountLoginId="user.one" navigation={navigation}><section><h1>Purchase invoice</h1></section></ShellChrome>));
    // The rail only navigates; Quick access lives with the other app bar panels.
    assert.ok(!host.querySelector(".athyper-shell__quick-actions"), "no .athyper-shell__quick-actions");
    const trigger = host.querySelector<HTMLButtonElement>('.athyper-shell__actions > button[data-slot="quick-access"]')!;
    assert.equal(trigger.getAttribute("aria-controls"), "athyper-quick-access");
    trigger.focus();
    await click(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    const panel = document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
    // The shared right-edge tool frame, not a bespoke flyout beside the rail.
    assert.ok(panel.classList.contains("a-tool-panel"));
    assert.equal(panel.getAttribute("role"), "dialog");
    // The Notifications anatomy: header, scope row with count, search, section chips, grouped list.
    assert.ok(!panel.querySelector(".a-panel-header small"), "no .a-panel-header small");
    assert.match(panel.querySelector(".a-panel-context")?.textContent ?? "", /Your saved and recent work.*1 recent/);
    assert.ok(!panel.querySelector('[role="tab"]'), "no tabs");
    const chip = (label: string) => [...panel.querySelectorAll<HTMLButtonElement>(".a-filter-chip")].find((button) => button.textContent?.startsWith(label))!;
    // Recent is the first section until the user chooses another.
    assert.equal(chip("Recent").getAttribute("aria-pressed"), "true");
    const content = () => panel.querySelector(".athyper-quick-access__content")?.textContent ?? "";
    assert.match(content(), /PI 1042/);
    assert.ok(panel.querySelector(".a-panel-list .a-panel-list__group > ul > li > .a-panel-row"));
    await click(panel.querySelector<HTMLButtonElement>('button[aria-label="Add PI 1042 to favourites"]')!);
    await click(chip("Favourites"));
    assert.match(content(), /PI 1042/);
    assert.match(panel.querySelector(".a-panel-context")?.textContent ?? "", /1 favourite$/);
    const stored = JSON.stringify(dom.window.localStorage);
    assert.doesNotMatch(stored, /User One|user\.one/);
    await act(async () => panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.ok(!document.body.querySelector("#athyper-quick-access"), "no #athyper-quick-access");
    assert.ok(document.activeElement === trigger, "focus on trigger");
    // It reopens on the section used last.
    await click(trigger);
    assert.equal(document.body.querySelector('#athyper-quick-access .a-filter-chip[aria-pressed="true"]')?.textContent?.startsWith("Favourites"), true);
  });

  it("filters supplied authoritative items without writing them to local storage", async () => {
    const favourite = { id: "bookmark-1", href: "/procurement/invoice/INV-1001", label: "Purchase Invoice", description: "INV-1001 · Northstar Supplies", group: "Purchase invoices", kind: "record" as const };
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation} quickAccess={{ favourites: [favourite], recent: [] }}><section><h1>Purchase invoice</h1></section></ShellChrome>));
    await act(async () => { dom.window.localStorage.clear(); dom.window.localStorage.setItem("athyper.shell.quick-access.tab", "favourites"); });
    await click(host.querySelector('button[data-slot="quick-access"]')!);
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="Search favourites"]')!;
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set; setter?.call(input, "northstar"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.match(document.body.querySelector(".athyper-quick-access__content")?.textContent ?? "", /Northstar Supplies/);
    // Only the non-sensitive section preference is stored; supplied items never are.
    assert.doesNotMatch(JSON.stringify(dom.window.localStorage), /Northstar|INV-1001/);
  });

  it("offers pin like Notifications, and a pinned panel stays open while you move between pages", async () => {
    // Wide enough to pin: only "from" queries (width >= …) match.
    Object.defineProperty(dom.window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: query.includes(">=") && !query.includes("<"), addEventListener() {}, removeEventListener() {} }) });
    const at = (pathname: string) => root.render(<ShellRouteProvider pathname={pathname}><ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation}><section><h1>Purchase invoice</h1></section></ShellChrome></ShellRouteProvider>);
    await act(async () => at("/procurement"));
    await click(host.querySelector('button[data-slot="quick-access"]')!);
    const panel = () => document.body.querySelector<HTMLElement>("#athyper-quick-access");
    await click(panel()!.querySelector('[data-panel-action="pin"]')!);
    assert.equal(panel()?.getAttribute("data-mode"), "pinned");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(async () => at("/procurement/invoice/PI-2001"));
    assert.ok(panel(), "a pinned panel survives navigation");
    await click(panel()!.querySelector('[data-panel-action="pin"]')!);
    assert.equal(panel()?.getAttribute("data-mode"), "drawer");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(async () => at("/procurement"));
    assert.equal(panel(), null, "an overlay closes on navigation as before");
  });

  it("shows record bookmarks through published read routes and links to the record page", async () => {
    const personId = "d1e630f3-7314-5ece-8a9b-bba6ed2cb9fe", countryId = "01a0d433-806b-7874-862d-49a9b955f6a1";
    // Entity pages live at /app/entity/<code>/manage; nothing ends in the entity code.
    const placed = { ...route, entities: [{ code: "person", name: "People" }] };
    const withEntities: DerivedShellNavigation = { ...navigation, routes: [placed], workspaces: [{ ...navigation.workspaces[0]!, routes: [placed] }], entityRoutes: [{ entityCode: "person", releaseId: "release-1", operation: "read" }, { entityCode: "person", releaseId: "release-1", operation: "list" }] };
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [
      { id: "b1", entityCode: "person", recordId: personId, label: "PERSON-DEMO-001", createdAt: "2026-10-03T08:09:32.349Z" },
      // No published read admission for country here: it stays hidden.
      { id: "b2", entityCode: "country", recordId: countryId, label: "AF", createdAt: "2026-10-01T04:46:21.565Z" },
    ] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      dom.window.localStorage.setItem("athyper.shell.quick-access.tab", "favourites");
      await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={withEntities}><section><h1>People</h1></section></ShellChrome>));
      await click(host.querySelector('button[data-slot="quick-access"]')!);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      const panel = document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
      const link = panel.querySelector<HTMLAnchorElement>(".a-panel-row a")!;
      assert.equal(link?.textContent, "PERSON-DEMO-001");
      assert.equal(link.getAttribute("href"), `/app/entity/person/${personId}`);
      assert.match(panel.querySelector(".a-panel-row p")?.textContent ?? "", /People · Purchase Invoices/);
      assert.doesNotMatch(panel.textContent ?? "", /\bAF\b/);
      assert.match(panel.querySelector(".a-panel-context")?.textContent ?? "", /1 favourite$/);
    } finally { globalThis.fetch = original; }
  });

  it("starring a record in Recent creates the same server bookmark as the list star", async () => {
    const personId = "d1e630f3-7314-5ece-8a9b-bba6ed2cb9fe", href = `/app/entity/person/${personId}`;
    const placed = { ...route, entities: [{ code: "person", name: "People" }] };
    const withEntities: DerivedShellNavigation = { ...navigation, routes: [placed], workspaces: [{ ...navigation.workspaces[0]!, routes: [placed] }], entityRoutes: [{ entityCode: "person", releaseId: "release-1", operation: "read" }] };
    dom.window.localStorage.setItem(quickAccessStorageKey("Neon", "tenant-alpha", "User One"), JSON.stringify({ favourites: [], recent: [{ id: href, href, label: "Maya Example (Demo)", description: "People", kind: "record", visitedAt: new Date().toISOString() }] }));
    dom.window.document.cookie = "athyper-csrf=token-1";
    const requests: { method: string; url: string; body?: unknown; key?: string | null }[] = [];
    let stored: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, url, body, key: new Headers(init?.headers).get("idempotency-key") });
      if (method === "PUT") stored = [{ id: "b1", entityCode: "person", recordId: personId, label: "Maya Example (Demo)", createdAt: new Date().toISOString() }];
      if (method === "DELETE") stored = [];
      return new Response(JSON.stringify(method === "GET" ? { items: stored } : { ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={withEntities}><section><h1>People</h1></section></ShellChrome>));
      await click(host.querySelector('button[data-slot="quick-access"]')!);
      const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      await settle();
      const panel = document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
      await click(panel.querySelector('button[aria-label="Add Maya Example (Demo) to favourites"]')!);
      await settle();
      const put = requests.find((request) => request.method === "PUT")!;
      assert.equal(put.url, "/api/relay/record-bookmarks/person");
      assert.deepEqual(put.body, { records: [{ id: personId, label: "Maya Example (Demo)" }] });
      assert.match(put.key ?? "", /^quick-access:add:/);
      // Not a browser-only favourite: nothing record-shaped is written locally.
      assert.doesNotMatch(dom.window.localStorage.getItem(quickAccessStorageKey("Neon", "tenant-alpha", "User One")) ?? "", /"favourites":\[\{/);
      const star = panel.querySelector<HTMLButtonElement>('button[aria-label="Remove Maya Example (Demo) from favourites"]')!;
      assert.equal(star.getAttribute("aria-pressed"), "true");
      await click(star);
      await settle();
      const remove = requests.find((request) => request.method === "DELETE")!;
      assert.equal(remove.url, "/api/relay/record-bookmarks/person");
      assert.deepEqual(remove.body, { records: [{ id: personId }] });
    } finally { globalThis.fetch = original; }
  });

  it("remembers opened entity records under their resolved title, and entity lists under the entity name", async () => {
    const personId = "d1e630f3-7314-5ece-8a9b-bba6ed2cb9fe";
    const placed = { ...route, entities: [{ code: "person", name: "People" }] };
    const withEntities: DerivedShellNavigation = { ...navigation, routes: [placed], workspaces: [{ ...navigation.workspaces[0]!, routes: [placed] }], entityRoutes: [{ entityCode: "person", releaseId: "release-1", operation: "read" }, { entityCode: "person", releaseId: "release-1", operation: "list" }] };
    // The record page registers its title for the breadcrumb, as entity detail pages do.
    const RecordPage = ({ title }: { readonly title?: string }) => { useRecordBreadcrumb(`${title} (PERSON-DEMO-001)`, undefined, { title, code: "PERSON-DEMO-001" }); return <section><h1>{title}</h1></section>; };
    const at = (pathname: string, title?: string) => root.render(<ShellRouteProvider pathname={pathname}><ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={withEntities}>{title ? <RecordPage title={title} /> : <section><h1>People</h1></section>}</ShellChrome></ShellRouteProvider>);
    const recent = () => JSON.parse(dom.window.localStorage.getItem(quickAccessStorageKey("Neon", "tenant-alpha", "User One")) ?? "{}").recent as { href: string; label: string; description?: string; kind: string; code?: string }[];
    await act(async () => at("/app/entity/person/manage"));
    await act(async () => at(`/app/entity/person/${personId}`, "Maya Example (Demo)"));
    const [record, list] = recent();
    // The title and code arrive separately, not as the breadcrumb's "Name (CODE)".
    assert.deepEqual([record!.href, record!.label, record!.code, record!.description, record!.kind], [`/app/entity/person/${personId}`, "Maya Example (Demo)", "PERSON-DEMO-001", "People · Purchase Invoices", "record"]);
    assert.deepEqual([list!.href, list!.label, list!.kind], ["/app/entity/person/manage", "People", "page"]);
    // Never under the technical id.
    assert.doesNotMatch(JSON.stringify(recent().map((item) => item.label)), /d1e630f3/);
  });

  it("view settings filter records and pages, group by type, collapse groups and scope clearing", async () => {
    const personId = "d1e630f3-7314-5ece-8a9b-bba6ed2cb9fe", href = `/app/entity/person/${personId}`, now = new Date().toISOString();
    const placed = { ...route, entities: [{ code: "person", name: "People" }] };
    const withEntities: DerivedShellNavigation = { ...navigation, routes: [placed], workspaces: [{ ...navigation.workspaces[0]!, routes: [placed] }], entityRoutes: [{ entityCode: "person", releaseId: "release-1", operation: "read" }] };
    const key = quickAccessStorageKey("Neon", "tenant-alpha", "User One");
    dom.window.localStorage.setItem(key, JSON.stringify({ favourites: [], recent: [
      { id: href, href, label: "Maya Example (Demo)", description: "People · Purchase Invoices", group: "People", kind: "record", visitedAt: now },
      { id: "/procurement", href: "/procurement", label: "Purchase Invoices", description: "Operations", group: "Purchase Invoices", kind: "page", visitedAt: now },
    ] }));
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={withEntities}><section><h1>People</h1></section></ShellChrome>));
    await click(host.querySelector('button[data-slot="quick-access"]')!);
    const panel = document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
    const labels = () => [...panel.querySelectorAll(".a-panel-row a")].map((link) => link.textContent);
    const radio = (name: string) => [...panel.querySelectorAll<HTMLButtonElement>('.a-settings-menu [role="radio"]')].find((button) => button.textContent === name)!;
    const menu = panel.querySelector<HTMLDetailsElement>(".a-settings-menu")!;
    // Defaults: Records, grouped by day, groups open; no dot while the defaults apply.
    assert.equal(radio("Records").getAttribute("aria-checked"), "true");
    assert.equal(radio("Day").getAttribute("aria-checked"), "true");
    assert.equal(menu.hasAttribute("data-indicator"), false);
    assert.deepEqual(labels().sort(), ["Maya Example (Demo)", "PI 1042"]);
    // All shows pages too, told apart by the type tile; the dot marks a changed view.
    menu.open = true;
    await click(radio("All"));
    assert.equal(menu.hasAttribute("data-indicator"), true);
    assert.deepEqual([...new Set([...panel.querySelectorAll(".a-panel-row__icon")].map((icon) => icon.getAttribute("data-kind")))].sort(), ["page", "record"]);
    await click(radio("Records"));
    assert.match(panel.querySelector(".a-panel-context")?.textContent ?? "", /2 of 3 recent/);
    // Compact: an icon and one word, with the scoped action as its name.
    const clear = panel.querySelector<HTMLButtonElement>('.athyper-quick-access__actions button[aria-label="Clear recent records"]')!;
    assert.equal(clear.textContent, "Clear");
    await click(radio("All"));
    // Group by Type: records under their entity, then pages.
    await click(radio("Type"));
    assert.deepEqual([...panel.querySelectorAll(".a-panel-list__group > header strong")].map((label) => label.textContent), ["Purchase Invoices", "People", "Pages"]);
    // Collapse one group from its header, then all from the menu.
    const people = [...panel.querySelectorAll<HTMLButtonElement>(".a-panel-list__toggle")].find((toggle) => toggle.textContent?.startsWith("People"))!;
    await click(people);
    assert.equal(people.getAttribute("aria-expanded"), "false");
    assert.equal(document.getElementById(people.getAttribute("aria-controls")!)!.hidden, true);
    const collapseAll = panel.querySelector<HTMLButtonElement>('.a-settings-menu [role="switch"]')!;
    await click(collapseAll);
    assert.equal(collapseAll.getAttribute("aria-checked"), "true");
    assert.ok([...panel.querySelectorAll<HTMLElement>(".a-panel-list__group ul")].every((list) => list.hidden));
    await click(collapseAll);
    // Escape closes only the settings menu, not the panel.
    menu.open = true;
    await act(async () => menu.querySelector("summary")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(menu.open, false);
    assert.ok(document.body.querySelector("#athyper-quick-access"));
    // Clearing while showing Pages removes only pages; settings persist for next time.
    menu.open = true;
    await click(radio("Pages"));
    await click(panel.querySelector('.athyper-quick-access__actions button[aria-label="Clear recent pages"]')!);
    // The confirmation replaces it in place, counts what will go, and starts on Cancel.
    assert.match(panel.querySelector(".athyper-quick-access__confirm")?.textContent ?? "", /^Clear 1\?$/);
    assert.equal(document.activeElement?.textContent, "Cancel");
    await click(panel.querySelector('.athyper-quick-access__actions button[aria-label="Clear recent pages: 1"]')!);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)!).recent.map((item: { label: string }) => item.label).sort(), ["Maya Example (Demo)", "PI 1042"]);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem("athyper.shell.quick-access.view.v2")!).show, "page");
  });

  it("shows one identity in Recent and Favourites: the title, then code · entity · module", async () => {
    const personId = "d1e630f3-7314-5ece-8a9b-bba6ed2cb9fe", href = `/app/entity/person/${personId}`;
    const placed = { ...route, entities: [{ code: "person", name: "People" }] };
    const withEntities: DerivedShellNavigation = { ...navigation, routes: [placed], workspaces: [{ ...navigation.workspaces[0]!, routes: [placed] }], entityRoutes: [{ entityCode: "person", releaseId: "release-1", operation: "read" }] };
    dom.window.localStorage.setItem(quickAccessStorageKey("Neon", "tenant-alpha", "User One"), JSON.stringify({ favourites: [], recent: [{ id: href, href, label: "Maya Example (Demo)", code: "PERSON-DEMO-001", description: "People · Purchase Invoices", kind: "record", visitedAt: new Date().toISOString() }] }));
    const original = globalThis.fetch;
    // The server now returns the current title as the label, with the code separately.
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ id: "b1", entityCode: "person", recordId: personId, label: "Maya Example (Demo)", code: "PERSON-DEMO-001", createdAt: "2026-10-03T08:09:32.349Z" }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={withEntities}><section><h1>People</h1></section></ShellChrome>));
      await click(host.querySelector('button[data-slot="quick-access"]')!);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      const panel = document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
      const identity = () => { const row = [...panel.querySelectorAll(".a-panel-row")].find((candidate) => candidate.querySelector("a")?.getAttribute("href") === href)!; return [row.querySelector("a")!.textContent, row.querySelector("p")!.textContent]; };
      const expected = ["Maya Example (Demo)", "PERSON-DEMO-001 · People · Purchase Invoices"];
      assert.deepEqual(identity(), expected);
      await click([...panel.querySelectorAll<HTMLButtonElement>(".a-filter-chip")].find((chip) => chip.textContent?.startsWith("Favourites"))!);
      assert.deepEqual(identity(), expected);
    } finally { globalThis.fetch = original; }
  });

  it("follows the app density until a density is chosen, and lays rows out for it", async () => {
    dom.window.document.documentElement.dataset.density = "spacious";
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation}><section><h1>Invoices</h1></section></ShellChrome>));
    await click(host.querySelector('button[data-slot="quick-access"]')!);
    const panel = () => document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
    const radio = (name: string) => [...panel().querySelectorAll<HTMLButtonElement>('.a-settings-menu [role="radio"]')].find((button) => button.textContent === name)!;
    assert.equal(panel().getAttribute("data-density"), "spacious");
    assert.equal(radio("Spacious").getAttribute("aria-checked"), "true");
    await click(radio("Compact"));
    assert.equal(panel().getAttribute("data-density"), "compact");
    assert.equal(dom.window.localStorage.getItem("athyper.shell.quick-access.density"), "compact");
    // Choosing the app's density again returns to following the app.
    await click(radio("Spacious"));
    assert.equal(panel().getAttribute("data-density"), "spacious");
    assert.equal(dom.window.localStorage.getItem("athyper.shell.quick-access.density"), null);
    delete dom.window.document.documentElement.dataset.density;
  });

  it("row ⋯ menu closes on an outside click, on Escape and after choosing an item", async () => {
    dom.window.localStorage.setItem("athyper.shell.quick-access.view.v2", JSON.stringify({ show: "all" }));
    await act(async () => root.render(<ShellChrome applicationName="Neon" tenantId="tenant-alpha" tenantLabel="Tenant Alpha" accountLabel="User One" navigation={navigation}><section><h1>Invoices</h1></section></ShellChrome>));
    await click(host.querySelector('button[data-slot="quick-access"]')!);
    const panel = document.body.querySelector<HTMLElement>("#athyper-quick-access")!;
    const menu = panel.querySelector<HTMLDetailsElement>(".a-panel-row__menu")!;
    menu.open = true;
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(menu.open, false);
    menu.open = true;
    await act(async () => menu.querySelector("summary")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(menu.open, false);
    assert.ok(document.body.querySelector("#athyper-quick-access"), "Escape closes the menu, not the panel");
    menu.open = true;
    await click(menu.querySelector("div > button")!);
    assert.equal(panel.querySelectorAll(".a-panel-row").length, 0);
  });
});
