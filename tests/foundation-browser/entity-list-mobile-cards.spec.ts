import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// Real shared runtime + real Neon CSS graph with a deterministic API fixture.
// Covers the responsive standard: width tiers, metadata card slots, i18n labels.
const neonStyles = () => planeStyles("neon");

const script = buildSync({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const columns=['code','name','code3','region','subregion','calling_code','status','official_name','numeric3'];
    const meta={code:['ISO alpha-2'],name:['Name',{semanticRole:'title'}],code3:['ISO alpha-3'],region:['Region'],subregion:['Subregion',{cardPriority:'primary'}],
      calling_code:['Calling code'],status:['Status',{semanticRole:'status',statusTones:{active:'success'}}],official_name:['Official name',{cardPriority:'hidden'}],numeric3:['Numeric code']};
    const descriptor={
      schemaVersion:1, plane:'neon',
      entity:{code:'country',label:'Country',pluralLabel:'Countries',identityField:'code',detailRouteTemplate:'/countries/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:'Countries',defaultState:{filters:[],sort:[{field:'name',direction:'asc'}],columns,density:'comfortable',mode:'table'},supportedModes:['table','compact'],search:{minimumQueryLength:1},filterPresentation:{quickFields:[{field:'name',defaultOperator:'contains'}],source:'metadata',allowUserPinning:true}},
      fields:columns.map((key,i)=>({key,label:meta[key][0],...(meta[key][1]??{}),valueKind:'string',defaultVisible:true,defaultOrder:i,filterOperators:['contains','eq'],sortable:true,groupable:false,aggregations:[]})),
      actions:[],scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},limits:{defaultPageSize:10,allowedPageSizes:[10,25],maxSortLevels:2,countMode:'none'}
    };
    const rows=[['AF','Afghanistan','AFG','Asia','Southern Asia','93'],['AX','Åland Islands','ALA','Europe','Northern Europe','358'],['AL','Albania','ALB','Europe','Southern Europe','355']]
      .concat(Array.from({length:Math.max(0,(window.fixtureRowCount??3)-3)},(_,i)=>['Z'+i,'Country '+i,'Z'+i+'X','Europe','Western Europe',String(400+i)]))
      .map(([code,name,code3,region,subregion,calling_code],i)=>({id:'country-'+i,values:{code,name,code3,region,subregion,calling_code,status:'active',official_name:'Official '+name,numeric3:String(100+i)}}));
    const client={request:async(op)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op===entityListOperation)return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows,pagination:{pageSize:25,hasNext:Boolean(window.fixtureHasNext),...(window.fixtureHasNext?{nextCursor:'next'}:{}),hasPrevious:false,countMode:'none'}};
      throw Error('Unexpected fixture operation');
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode="country"/>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

const europeView = { id: "europe", name: "Europe", state: { filters: [{ field: "region", operator: "eq", value: "Europe" }], sort: [{ field: "name", direction: "asc" }], columns: ["code", "name", "code3", "region", "subregion", "calling_code", "status"], density: "comfortable", mode: "table" } };

async function mount(page: Page, width: number, hostStyle = "", options: { readonly path?: string; readonly views?: readonly unknown[]; readonly rows?: number; readonly hasNext?: boolean } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.route("https://list.test/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><div id="root" style="${hostStyle}"></div></body></html>` }));
  await page.goto(`https://list.test/countries${options.path ?? ""}`);
  if (options.views) await page.evaluate(views => localStorage.setItem("athyper.entity-list.views.neon.country", JSON.stringify(views)), options.views);
  await page.evaluate(({ rows, hasNext }) => Object.assign(window, { fixtureRowCount: rows, fixtureHasNext: hasNext }), { rows: options.rows ?? 3, hasNext: options.hasNext ?? false });
  await page.addStyleTag({ content: neonStyles() + "\nbody{margin:0}*{box-sizing:border-box}" });
  await page.addScriptTag({ content: script });
  await expect(page.getByText("Afghanistan", { exact: true }).first()).toBeVisible();
}

test("phones render metadata-driven record cards instead of a restyled table", async ({ page }) => {
  // The shell main padding hosts the header rule that bleeds into it.
  await mount(page, 390, "padding:clamp(var(--a-space-6),3vw,var(--a-space-10))");
  await expect(page.locator(".a-entity-list__table")).toHaveCount(0);
  const cards = page.locator(".a-entity-list__card");
  await expect(cards).toHaveCount(3);
  const first = cards.first();
  await expect(first.getByRole("heading", { name: "AF" }).getByRole("link")).toBeVisible();
  await expect(first.locator(".a-entity-list__card-title")).toHaveText("Afghanistan");
  await expect(first.locator(".a-entity-list__card-status")).toContainText("active");
  // Primary priority leads the body; hidden priority never appears; overflow is disclosed.
  await expect(first.locator(":scope > dl dt")).toHaveText(["Subregion", "ISO alpha-3", "Region", "Calling code"]);
  await expect(first.getByText("Official Afghanistan")).toHaveCount(0);
  await expect(first.locator(".a-entity-list__card-more > summary")).toHaveText("1 more field");
  await first.locator(".a-entity-list__card-more > summary").click();
  await expect(first.locator(".a-entity-list__card-more dt")).toHaveText(["Numeric code"]);
  await expect(first.getByRole("checkbox", { name: "Select AF" })).toBeVisible();
  await expect(first.getByRole("button", { name: /^(Add AF to|Remove AF from) favourites$/ })).toBeVisible();
  await expect(first.getByRole("button", { name: "Actions for AF" })).toBeVisible();
  await first.getByRole("checkbox", { name: "Select AF" }).check();
  await expect(first).toHaveAttribute("data-selected", "true");
  const boxes = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  for (let index = 1; index < boxes.length; index++) expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // One toolbar row: search, Filters, Controls. Views are reached from Controls.
  const toolbar = page.locator(".a-entity-list__query-row");
  await expect(toolbar.locator(".a-entity-list__view-trigger")).toBeHidden();
  await expect(toolbar.locator(".a-entity-list__view-status")).toHaveCount(0);
  const searchbox = page.getByRole("searchbox");
  const search = (await searchbox.boundingBox())!, actions = (await toolbar.locator(".a-entity-list__toolbar-actions").boundingBox())!;
  expect(Math.abs((search.y + search.height / 2) - (actions.y + actions.height / 2))).toBeLessThan(4);
  expect(search.x + search.width).toBeLessThanOrEqual(actions.x);
  await expect(searchbox).toHaveAttribute("placeholder", "Search Countries");
  await expect(searchbox).toHaveAccessibleDescription(/^Search by /);
  await toolbar.getByRole("button", { name: "Controls", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^Manage views/ })).toContainText("System default");
});

test("phones announce a non-default view and can open or clear it", async ({ page }) => {
  await mount(page, 390, "padding:clamp(var(--a-space-6),3vw,var(--a-space-10))", { path: "?vid=europe", views: [europeView] });
  const status = page.locator(".a-entity-list__view-status");
  await expect(status).toBeVisible();
  await expect(status).toHaveText("View: Europe");
  await status.getByRole("button", { name: "Change view. Current view: Europe" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await status.getByRole("button", { name: "Return to System default" }).click();
  await expect(status).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("vid")).not.toBe("europe");
});

test("wide lists keep the table, and the tier follows the list width, not the viewport", async ({ page }) => {
  await mount(page, 1440);
  await expect(page.locator(".a-entity-list__table")).toBeVisible();
  await expect(page.locator(".a-entity-list__card")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Favourite" })).toBeAttached();
  await expect(page.getByRole("columnheader", { name: "Actions" })).toBeAttached();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator(".a-entity-list__card")).toHaveCount(3);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".a-entity-list__table")).toBeVisible();
});

test("desktop keeps the labelled view selector and never shows the phone view status", async ({ page }) => {
  await mount(page, 1440, "", { path: "?vid=europe", views: [europeView] });
  await expect(page.locator(".a-entity-list__view-trigger")).toHaveText(/View: Europe/);
  await expect(page.locator(".a-entity-list__view-status")).toBeHidden();
  await expect(page.getByRole("searchbox")).toHaveAttribute("placeholder", /^Search by /);
});

const shell = "padding:clamp(var(--a-space-6),3vw,var(--a-space-10))";
const panelTop = (page: Page) => page.locator(".a-entity-list__panel").evaluate(element => Math.round(element.getBoundingClientRect().top) + 0);
const chromeBox = (page: Page) => page.locator(".a-entity-list__panel > .a-entity-list__chrome").evaluate(element => { const box = element.getBoundingClientRect(); return { top: Math.round(box.top), bottom: Math.round(box.bottom) }; });

test("phones hide the list toolbar while reading down and bring it back on a short scroll up", async ({ page }) => {
  await mount(page, 390, shell, { rows: 25 });
  const panel = page.locator(".a-entity-list__panel");
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 1600);
  await expect(panel).toHaveAttribute("data-toolbar", "hidden");
  await expect.poll(async () => (await chromeBox(page)).bottom).toBeLessThanOrEqual(0);
  await page.mouse.wheel(0, -60);
  await expect(panel).not.toHaveAttribute("data-toolbar", "hidden");
  await expect.poll(async () => (await chromeBox(page)).top).toBe(0);
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeInViewport();
  // A focused toolbar never stays hidden.
  await page.mouse.wheel(0, 400);
  await expect(panel).toHaveAttribute("data-toolbar", "hidden");
  await page.getByRole("searchbox").focus();
  await expect(panel).not.toHaveAttribute("data-toolbar", "hidden");
  // At the list start the toolbar is always shown.
  await page.getByRole("searchbox").blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(panel).not.toHaveAttribute("data-toolbar", "hidden");
});

test("filtering from the returned toolbar lands on the first result", async ({ page }) => {
  await mount(page, 390, shell, { rows: 25 });
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 2000);
  await page.mouse.wheel(0, -60);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("dialog").getByLabel(/^Value for Name filter/).fill("Country");
  await page.getByRole("dialog").getByRole("button", { name: /Apply filters|Show results/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(() => panelTop(page)).toBe(0);
  await expect(page.locator(".a-entity-list__card").first()).toBeInViewport();
});

for (const width of [390, 1440])
  test(`Next at the end of a ${width}px page opens the new page at its first result`, async ({ page }) => {
    await mount(page, width, shell, { rows: 25, hasNext: true });
    const next = page.getByRole("button", { name: "Next", exact: true });
    await next.scrollIntoViewIfNeeded();
    expect(await panelTop(page)).toBeLessThan(0);
    await next.click();
    await expect.poll(() => panelTop(page)).toBe(0);
  });

test("sorting from a header while scrolled lands on the first result", async ({ page }) => {
  await mount(page, 1440, "", { rows: 25 });
  await page.evaluate(() => window.scrollTo(0, 700));
  expect(await panelTop(page)).toBeLessThan(0);
  await page.getByRole("columnheader", { name: /^Region/ }).getByRole("button", { name: /^Region/ }).click();
  await expect.poll(() => panelTop(page)).toBe(0);
});

test("desktop list controls dock at the right edge, pin beside the list and remember the pin", async ({ page }) => {
  await mount(page, 1440, "", { rows: 25 });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "Countries list controls" });
  await expect(overlay).toBeVisible();
  // Measured after the short slide-in settles.
  await expect.poll(async () => { const box = (await overlay.boundingBox())!; return Math.round(box.x + box.width); }).toBe(1440);
  expect(Math.round((await overlay.boundingBox())!.width)).toBe(560);
  await expect(page.locator(".a-tool-panel-backdrop")).toBeVisible();
  await expect(overlay.getByRole("heading", { name: "Filters" })).toBeVisible();
  await overlay.getByRole("tab", { name: "Sort", exact: true }).click();
  await expect(overlay.getByRole("heading", { name: "Sort" })).toBeVisible();
  await overlay.getByRole("button", { name: "Pin panel to the side" }).click();
  const pinned = page.getByRole("region", { name: "Countries list controls" });
  await expect(pinned).toHaveAttribute("data-mode", "pinned");
  await expect(page.locator(".a-tool-panel-backdrop")).toHaveCount(0);
  // Pinned is not modal: the list stays usable, and applying keeps the panel open.
  await page.getByRole("columnheader", { name: /^Region/ }).getByRole("button", { name: /^Region/ }).click();
  await pinned.getByRole("radiogroup", { name: "Direction for sort 1" }).getByRole("radio", { name: "Descending" }).click();
  await pinned.getByRole("button", { name: "Apply sort", exact: true }).click();
  await expect(pinned).toBeVisible();
  // Keyboard resize within the shared 360-560px range.
  const separator = pinned.getByRole("separator", { name: "Resize panel" });
  await separator.focus();
  await page.keyboard.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "360");
  await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "380");
  await pinned.getByRole("button", { name: "Close list controls" }).click();
  await expect(pinned).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("region", { name: "Countries list controls" })).toHaveAttribute("data-mode", "pinned");
  expect(Math.round((await page.locator(".a-tool-panel").boundingBox())!.width)).toBe(380);
});

for (const width of [1440, 390])
  test(`every list control section fits the ${width === 1440 ? "narrowest docked" : "phone"} panel without horizontal overflow`, async ({ page }) => {
    await mount(page, width, width === 390 ? shell : "", { rows: 5 });
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Sort/ }).click();
    const panel = page.getByRole("dialog", { name: "Countries list controls" });
    await expect(panel).toBeVisible();
    if (width === 1440) {
      await panel.getByRole("separator", { name: "Resize panel" }).focus();
      await page.keyboard.press("Home");
    }
    const overflow = () => panel.evaluate(element => {
      const edge = element.getBoundingClientRect().right + 1;
      return [...element.querySelectorAll<HTMLElement>("*")]
        .filter(item => item.offsetParent !== null && item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().right > edge && !item.closest(".a-panel-tabs"))
        .slice(0, 5).map(item => `${item.tagName}.${item.className}`.slice(0, 80));
    });
    for (const tab of ["Filters", "Sort", "Columns", "Display", "Views"]) {
      await panel.getByRole("tab", { name: tab, exact: true }).click();
      await page.waitForTimeout(250);
      expect(await overflow(), `${tab} at ${width}px`).toEqual([]);
    }
    await panel.getByRole("tab", { name: "Filters", exact: true }).click();
    await panel.getByRole("tab", { name: "All filters", exact: true }).click();
    expect(await overflow(), `All filters at ${width}px`).toEqual([]);
    // Segment labels are never truncated, even in the narrowest panel.
    await panel.getByRole("tab", { name: "Sort", exact: true }).click();
    for (const radio of await panel.getByRole("radio").all())
      expect(await radio.locator(":scope > span").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });

test("list controls state the list once: one context row, draft-only footer, filter count on the tab", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  const context = panel.locator(".a-panel-context");
  await expect(context).toHaveCount(1);
  await expect(context.locator(".a-panel-context__label")).toHaveText("Countries");
  await expect(context.locator(".a-panel-context__detail")).toHaveText("5 records");
  for (const tab of ["Filters", "Sort", "Columns", "Display", "Views"]) {
    await panel.getByRole("tab", { name: tab, exact: true }).click();
    await expect(context).toHaveText("Countries5 records");
    await expect(panel.locator(".a-drawer__metric")).toHaveCount(0);
  }
  await panel.getByRole("tab", { name: "Filters", exact: true }).click();
  const section = panel.locator('[data-list-drawer="filters"]');
  await expect(section.locator(".a-drawer__footer-summary")).toHaveCount(0);
  await section.getByLabel(/^Value for Name filter/).fill("Country");
  await expect(section.locator(".a-drawer__footer-summary")).toHaveText("1 filter ready to apply");
  await section.getByRole("button", { name: /Apply filters|Show results/ }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: /active filter/ }).click();
  await expect(page.getByRole("dialog", { name: "Countries list controls" }).getByRole("tab", { name: /^Filters/ })).toContainText("1");
});

test("sort levels are one compact row with type-aware direction and a single actions menu", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Sort/ }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  // The tenant-wide fallback scope label is not repeated in the context row.
  await expect(panel.locator(".a-panel-context__label")).toHaveText("Countries");
  const row = panel.locator(".a-entity-list__sort-list > div").first();
  const field = (await row.locator(".a-entity-list__sort-field").boundingBox())!, direction = (await row.locator(".a-entity-list__sort-direction").boundingBox())!;
  expect(Math.abs((field.y + field.height / 2) - (direction.y + direction.height / 2))).toBeLessThan(6);
  expect((await row.boundingBox())!.height).toBeLessThan(80);
  await expect(row.getByRole("radio", { name: "Ascending" })).toContainText("A→Z");
  await expect(row.getByRole("button", { name: /^Move|^Remove/ })).toHaveCount(0);
  await row.getByRole("button", { name: "Actions for sort 1" }).click();
  await expect(page.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Move down" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: /^Add sort level · 1 of/ }).click();
  const picker = panel.locator(".a-entity-list__field-catalogue");
  // Same selection model as Columns: a checkbox shows whether the field is used.
  await expect(picker.getByRole("checkbox", { name: "Sort by Name" })).toBeChecked();
  await expect(picker).not.toContainText("String");
  await picker.getByRole("checkbox", { name: "Sort by Region" }).check();
  await expect(panel.locator(".a-entity-list__sort-list > div")).toHaveCount(2);
  // The fixture allows two levels: unticked fields are disabled at the limit, like the Columns maximum.
  await expect(picker.getByRole("checkbox", { name: "Sort by Subregion" })).toBeDisabled();
  await picker.getByRole("checkbox", { name: "Sort by Region" }).uncheck();
  await expect(panel.locator(".a-entity-list__sort-list > div")).toHaveCount(1);
  await expect(picker.getByRole("checkbox", { name: "Sort by Subregion" })).toBeEnabled();
});

for (const width of [1440, 390])
  test(`compact sort rows at ${width}px: one line, full-width picker rows, menu inside the viewport`, async ({ page }) => {
    await mount(page, width, width === 390 ? shell : "", { rows: 5 });
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Sort/ }).click();
    const panel = page.getByRole("dialog", { name: "Countries list controls" });
    await panel.getByRole("button", { name: /^Add sort level · 1 of/ }).click();
    const picker = panel.locator(".a-entity-list__field-catalogue");
    const list = (await picker.locator(".a-entity-list__field-options").boundingBox())!;
    for (const option of (await picker.locator("[data-field-option]").all()).slice(0, 3))
      expect((await option.boundingBox())!.width).toBeGreaterThan(list.width - 4);
    await picker.getByRole("checkbox", { name: "Sort by Region" }).check();
    const rows = panel.locator(".a-entity-list__sort-list > div");
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      const field = (await row.locator(".a-entity-list__sort-field").boundingBox())!, menu = (await row.getByRole("button", { name: /^Actions for/ }).boundingBox())!;
      expect(Math.abs((field.y + field.height / 2) - (menu.y + menu.height / 2)), "one line per level").toBeLessThan(6);
    }
    // Field names are readable, never squeezed to an ellipsis.
    for (const input of await rows.locator("input[role=combobox]").all())
      expect(await input.evaluate(element => (element as HTMLInputElement).scrollWidth <= (element as HTMLInputElement).clientWidth + 1)).toBe(true);
    await rows.nth(1).getByRole("button", { name: "Actions for sort 2" }).click();
    const menu = page.locator(".a-entity-list__reorder-menu");
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect(rows.first().locator("input[role=combobox]")).toHaveValue("Region");
  });

for (const width of [1440, 390])
  test(`filter cards match across Quick and All filters and the operator menu stays on screen at ${width}px`, async ({ page }) => {
    await mount(page, width, width === 390 ? shell : "", { rows: 5 });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Countries list controls" });
    const quick = panel.locator(".a-entity-list__filter-row").first();
    await quick.getByRole("button", { name: /^Operator for quick Name filter/ }).click();
    const menu = page.locator(".a-filter-operator__menu");
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(900 + 1);
    await page.getByRole("menuitem", { name: "Equals" }).click();
    await expect(quick.getByRole("button", { name: /^Operator for quick Name filter/ })).toContainText("Equals");
    await panel.getByRole("tab", { name: "All filters", exact: true }).click();
    await panel.getByRole("button", { name: "Add filter", exact: true }).click();
    const filterPicker = panel.locator(".a-entity-list__field-catalogue");
    await filterPicker.getByRole("checkbox", { name: "Filter by ISO alpha-2" }).check();
    await expect(filterPicker.getByRole("checkbox", { name: "Filter by ISO alpha-2" })).toBeChecked();
    const row = panel.locator('[data-list-drawer="filters"] .a-entity-list__advanced-filters .a-entity-list__filter-row').first();
    // The chosen field reads in full beside the operator chip, even on phones.
    expect(await row.locator("input[role=combobox]").evaluate(element => (element as HTMLInputElement).scrollWidth <= (element as HTMLInputElement).clientWidth + 1)).toBe(true);
    const centre = async (locator: import("@playwright/test").Locator) => { const b = (await locator.boundingBox())!; return b.y + b.height / 2; };
    const field = await centre(row.locator(".a-entity-list__filter-control").first()), operator = await centre(row.locator(".a-entity-list__filter-operator-control")), remove = await centre(row.locator(".a-entity-list__filter-remove"));
    expect(Math.abs(field - operator)).toBeLessThan(8);
    expect(Math.abs(field - remove)).toBeLessThan(8);
    expect(await centre(row.getByRole("textbox").or(row.getByRole("group")).first())).toBeGreaterThan(field + 12);
    // Unticking the field in the picker removes its filter card.
    await filterPicker.getByRole("checkbox", { name: "Filter by ISO alpha-2" }).uncheck();
    await expect(panel.locator('[data-list-drawer="filters"] .a-entity-list__advanced-filters .a-entity-list__filter-row')).toHaveCount(0);
  });

test("the sort picker and columns share one field list look", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Sort/ }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  await panel.getByRole("button", { name: /^Add sort level/ }).click();
  const picker = panel.locator(".a-entity-list__field-catalogue");
  await expect(picker.locator(".a-entity-list__column-group > h4").first()).toContainText(/Recommended fields\s*\d+/);
  await expect(picker).not.toContainText("Showing the first");
  const metrics = (element: Element) => { const name = getComputedStyle(element.querySelector("strong")!); return { height: Math.round(element.getBoundingClientRect().height), weight: name.fontWeight, size: name.fontSize }; };
  const sortRow = await picker.locator("[data-field-option]").nth(2).evaluate(metrics);
  const option = picker.locator("[data-field-option]").nth(1);
  const name = (await option.locator("strong").boundingBox())!, code = (await option.locator("small").boundingBox())!;
  expect(code.x).toBeGreaterThan(name.x + name.width - 1);
  expect(Math.abs((name.y + name.height) - (code.y + code.height))).toBeLessThan(6);
  await panel.getByRole("tab", { name: "Columns", exact: true }).click();
  const columns = panel.locator('[data-list-drawer="columns"]');
  await columns.getByRole("button", { name: "Actions for Region" }).click();
  await page.getByRole("menuitem", { name: "Hide column" }).click();
  // The same group heading element and one-line rows as the sort picker.
  await expect(columns.locator(".a-entity-list__column-group > h4").first()).toContainText(/\d+/);
  const row = columns.locator(".a-entity-list__column-list--available > label").first();
  // Both field lists use the same row height and name weight.
  expect(await row.evaluate(metrics)).toEqual(sortRow);
  const rowName = (await row.locator("strong").boundingBox())!, rowCode = (await row.locator("small").boundingBox())!;
  expect(Math.abs((rowName.y + rowName.height) - (rowCode.y + rowCode.height))).toBeLessThan(6);
});

test("display settings stack one per row and views mark the current view in the list", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Display settings/ }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  const groups = panel.locator('[data-list-drawer="display"] [role="radiogroup"]');
  await expect(groups).toHaveCount(3);
  const boxes = await groups.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom);
    expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThan(2);
  }
  for (const radio of await groups.getByRole("radio").all())
    expect(await radio.locator(":scope > span").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await panel.getByRole("tab", { name: "Views", exact: true }).click();
  const views = panel.locator('[data-list-drawer="views"]');
  const current = views.locator(".a-entity-list__saved-view-row[data-current]");
  await expect(current).toHaveCount(1);
  await expect(current.locator(".a-entity-list__view-current")).toHaveText("Current");
  await expect(current.getByRole("button", { name: /^System default/ })).toHaveAttribute("aria-current", "true");
  await expect(views.locator(".a-drawer__footer-summary")).toHaveCount(0);
  // A lone Reset keeps the footer's leading edge.
  const reset = (await views.getByRole("button", { name: "Reset to system default" }).boundingBox())!, footer = (await views.locator(".a-drawer__footer").boundingBox())!;
  expect(reset.x - footer.x).toBeLessThan(40);
});

test("list control sections share one heading style and one search placeholder", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  const type = (locator: import("@playwright/test").Locator) => locator.evaluate(element => { const style = getComputedStyle(element); return `${style.fontSize} ${style.fontWeight}`; });
  await panel.getByRole("tab", { name: "All filters", exact: true }).click();
  await panel.getByRole("button", { name: "Add filter", exact: true }).click();
  const filterPicker = panel.locator('[data-list-drawer="filters"] .a-entity-list__field-catalogue');
  const headings = [await type(filterPicker.locator("h3"))];
  const placeholders = [await filterPicker.getByRole("searchbox").getAttribute("placeholder")];
  const close = filterPicker.getByRole("button", { name: "Close", exact: true });
  expect(await close.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(await filterPicker.locator("h3").evaluate(element => parseFloat(getComputedStyle(element).fontSize)));
  await panel.getByRole("tab", { name: "Sort", exact: true }).click();
  await panel.getByRole("button", { name: /^Add sort level/ }).click();
  const sortPicker = panel.locator('[data-list-drawer="sort"] .a-entity-list__field-catalogue');
  headings.push(await type(sortPicker.locator("h3")));
  placeholders.push(await sortPicker.getByRole("searchbox").getAttribute("placeholder"));
  await panel.getByRole("tab", { name: "Columns", exact: true }).click();
  const columns = panel.locator('[data-list-drawer="columns"]');
  headings.push(await type(columns.locator(".a-entity-list__column-section-heading h3").first()));
  placeholders.push(await columns.getByRole("searchbox").getAttribute("placeholder"));
  await panel.getByRole("tab", { name: "Views", exact: true }).click();
  headings.push(await type(panel.locator('[data-list-drawer="views"] .a-entity-list__view-dialog h3').first()));
  expect(new Set(headings).size, headings.join(" | ")).toBe(1);
  expect(placeholders).toEqual(["Search fields…", "Search fields…", "Search fields…"]);
});

for (const [density, row, header, font, button] of [["compact", 32, 32, "14px", 24], ["comfortable", 44, 40, "15px", 32], ["spacious", 56, 48, "16px", 36]] as const)
  test(`${density} density sets exact row rhythm from the density tokens`, async ({ page }) => {
    await mount(page, 1440, "", { rows: 5, path: `?density=${density}` });
    // A non-default ?density= is a list override; the default follows the app density.
    if (density === "comfortable") await expect(page.locator(".a-entity-list")).not.toHaveAttribute("data-density", /.*/);
    else await expect(page.locator(".a-entity-list")).toHaveAttribute("data-density", density);
    const metrics = await page.evaluate(() => {
      const first = document.querySelector(".a-entity-list__table tbody tr")!;
      const size = (selector: string) => Math.round(first.querySelector(selector)!.getBoundingClientRect().height);
      return {
        rows: [...document.querySelectorAll(".a-entity-list__table tbody tr")].map(row => Math.round(row.getBoundingClientRect().height)),
        header: Math.round(document.querySelector(".a-entity-list__table thead tr")!.getBoundingClientRect().height),
        font: getComputedStyle(first.children[1]!).fontSize,
        menu: size(".a-entity-list__row-actions [aria-haspopup=menu]"),
        star: size(".a-entity-list__bookmark"),
      };
    });
    expect(new Set(metrics.rows)).toEqual(new Set([row]));
    expect(metrics.header).toBe(header);
    expect(metrics.font).toBe(font);
    expect(metrics.menu).toBe(button);
    expect(metrics.star).toBe(button);
    // Icon cells clip instead of drawing a text ellipsis beside the button.
    expect(await page.locator(".a-entity-list__table td.a-entity-list__bookmark-cell").first().evaluate(element => getComputedStyle(element).textOverflow)).toBe("clip");
  });

test.describe("touch screens", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("compact rows and row buttons keep a 44px touch floor", async ({ page }) => {
    await mount(page, 1024, "", { rows: 5, path: "?density=compact" });
    const metrics = await page.evaluate(() => {
      const first = document.querySelector(".a-entity-list__table tbody tr")!;
      return { coarse: matchMedia("(pointer: coarse)").matches, row: Math.round(first.getBoundingClientRect().height), menu: Math.round(first.querySelector(".a-entity-list__row-actions [aria-haspopup=menu]")!.getBoundingClientRect().height) };
    });
    expect(metrics.coarse).toBe(true);
    expect(metrics.row).toBeGreaterThanOrEqual(44);
    expect(metrics.menu).toBeGreaterThanOrEqual(44);
  });
});

test("lists follow the app density unless the person overrides it for the list", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  const list = page.locator(".a-entity-list");
  const rowHeight = () => page.locator(".a-entity-list__table tbody tr").first().evaluate(row => Math.round(row.getBoundingClientRect().height));
  await expect(list).not.toHaveAttribute("data-density", /.*/);
  expect(await rowHeight()).toBe(44);
  // Utilities sets the app density on the page root; the list follows immediately.
  await page.evaluate(() => { document.documentElement.dataset.density = "compact"; });
  await expect.poll(rowHeight).toBe(32);
  await page.evaluate(() => { document.documentElement.dataset.density = "spacious"; });
  await expect.poll(rowHeight).toBe(56);
  await page.evaluate(() => { document.documentElement.dataset.density = "compact"; });
  // Override for this list in Display settings.
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Display settings/ }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  const follow = panel.getByRole("checkbox", { name: /Use app density \(Compact\)/ });
  await expect(follow).toBeChecked();
  await expect(panel.getByRole("radiogroup", { name: "Density" })).toHaveAttribute("aria-disabled", "true");
  await follow.uncheck();
  await panel.getByRole("radiogroup", { name: "Density" }).getByRole("radio", { name: "Spacious" }).click();
  await panel.getByRole("button", { name: "Save settings" }).click();
  await expect(list).toHaveAttribute("data-density", "spacious");
  await expect.poll(rowHeight).toBe(56);
  // Density is a display preference, not view data.
  await expect(page.locator(".a-entity-list__view-trigger")).toHaveText(/View: System default$/);
  // Following the app again removes the override and the URL parameter.
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Display settings/ }).click();
  await page.getByRole("dialog", { name: "Countries list controls" }).getByRole("checkbox", { name: /Use app density/ }).check();
  await page.getByRole("dialog", { name: "Countries list controls" }).getByRole("button", { name: "Save settings" }).click();
  await expect(list).not.toHaveAttribute("data-density", /.*/);
  await expect.poll(rowHeight).toBe(32);
  expect(new URL(page.url()).searchParams.get("density")).toBeNull();
});

test("columns lock the identity field and move actions into one menu", async ({ page }) => {
  await mount(page, 1440, "", { rows: 5 });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Columns/ }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  const visible = panel.locator(".a-entity-list__column-list--visible > div");
  await expect(visible.first()).toContainText("Always shown");
  await expect(visible.first().locator(".a-entity-list__column-lock")).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: "Show ISO alpha-2" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^Move .* (up|down)$/ })).toHaveCount(0);
  await visible.nth(1).getByRole("button", { name: "Actions for Name" }).click();
  await page.getByRole("menuitem", { name: "Hide column" }).click();
  await expect(panel.getByRole("checkbox", { name: "Show Name" })).not.toBeChecked();
});

test("a narrowed list keeps its toolbar on one row with compact actions", async ({ page }) => {
  // A pinned panel leaves the list in the medium tier.
  await mount(page, 1440, "width:860px");
  const toolbar = page.locator(".a-entity-list__query-row");
  const view = (await toolbar.locator(".a-entity-list__view-trigger").boundingBox())!, search = (await page.getByRole("searchbox").boundingBox())!, actions = (await toolbar.locator(".a-entity-list__toolbar-actions").boundingBox())!;
  const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(centre(view) - centre(actions))).toBeLessThan(4);
  expect(Math.abs(centre(search) - centre(actions))).toBeLessThan(4);
  await expect(toolbar.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
});

test("phone list controls fill the width under the app bar, cannot pin, and close after apply", async ({ page }) => {
  await mount(page, 390, shell, { rows: 25 });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Sort/ }).click();
  const panel = page.getByRole("dialog", { name: "Countries list controls" });
  await expect(panel).toBeVisible();
  expect(Math.round((await panel.boundingBox())!.width)).toBe(390);
  await expect(panel.getByRole("button", { name: "Pin panel to the side" })).toHaveCount(0);
  await expect(panel.getByRole("separator")).toBeHidden();
  await panel.getByRole("tab", { name: "Views", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Manage views" })).toBeVisible();
  await panel.getByRole("tab", { name: "Sort", exact: true }).click();
  await panel.getByRole("radiogroup", { name: "Direction for sort 1" }).getByRole("radio", { name: "Descending" }).click();
  await panel.getByRole("button", { name: "Apply sort", exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test("an embedded list in a narrow host uses cards on a desktop viewport", async ({ page }) => {
  await mount(page, 1440, "width:360px");
  await expect(page.locator(".a-entity-list__table")).toHaveCount(0);
  await expect(page.locator(".a-entity-list__card")).toHaveCount(3);
});
