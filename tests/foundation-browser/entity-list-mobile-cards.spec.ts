import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";

// Real shared runtime + real Neon CSS graph with a deterministic API fixture.
// Covers the responsive standard: width tiers, metadata card slots, i18n labels.
function neonStyles() {
  const layout = resolve("apps/neon/app/layout.tsx");
  const imports = [...readFileSync(layout, "utf8").matchAll(/import "([^"]+\.css)"/g)].map(m => m[1]!);
  const seen = new Set<string>();
  function load(name: string, parent: string): string {
    const path = name.startsWith(".") ? resolve(dirname(parent), name) : createRequire(parent).resolve(name);
    if (seen.has(path)) return "";
    seen.add(path);
    return readFileSync(path, "utf8").replace(/@import\s+["']([^"']+)["'];/g, (_, child) => load(child, path));
  }
  return imports.map(name => load(name, layout)).join("\n");
}

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
      actions:[],scope:{status:'ready',labels:[],fingerprint:'c'.repeat(64)},limits:{defaultPageSize:10,allowedPageSizes:[10,25],maxSortLevels:2,countMode:'none'}
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

test("an embedded list in a narrow host uses cards on a desktop viewport", async ({ page }) => {
  await mount(page, 1440, "width:360px");
  await expect(page.locator(".a-entity-list__table")).toHaveCount(0);
  await expect(page.locator(".a-entity-list__card")).toHaveCount(3);
});
