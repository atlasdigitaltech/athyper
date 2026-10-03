import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { test, expect } from "@playwright/test";

import { withSessionDefaults } from "./fixtures/session-stub";
import { chooseOption } from "./fixtures/choice";
const bundle = build({
  stdin: {
    loader: "tsx",
    resolveDir: process.cwd(),
    contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {MetadataDetailWorkspace} from './packages/platform/entity/runtime/form-detail/src/detail-workspace';
import {parseEntityRecordPresentation} from './packages/contracts/platform/entity-runtime/src/record-presentation';
const sections=window.fixture?.sections??[{key:'identity',label:'Identity',fields:['name']},{key:'contacts',label:'Contacts',fields:['contact']},{key:'audit',label:'Audit',fields:['created']}];
const navigation=window.fixture?.navigation??(window.mode?{mode:window.mode,tabs:[{key:'details',label:'Details',sectionKeys:['identity','contacts']},{key:'history',label:'History',sectionKeys:['audit']}]}:undefined);
const presentation=parseEntityRecordPresentation({schemaVersion:1,titleField:'name',sections,...(navigation?{navigation}:{}),...(window.fixture?.summaryView?{summaryView:window.fixture.summaryView}:{})});
const descriptor={schemaVersion:1,pageKind:'detail',entity:{code:'fixture',label:'Fixture',pluralLabel:'Fixtures'},titleField:'name',revision:{release:'release'},fields:[...new Set(sections.flatMap(section=>section.fields))].map(key=>({key,label:key,kind:'string'})),actions:[],collaboration:window.fixture?.collaboration??[],presentation};
createRoot(document.getElementById('root')).render(<MetadataDetailWorkspace descriptor={descriptor} record={{id:'record',values:{name:'Example',contact:'Example contact',created:'Yesterday'}}} entityCode='fixture' preferenceKey='test.detail'/>);
`,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "session",
      setup(builder) {
        builder.onResolve(
          { filter: /^@athyper\/platform-shell-app-foundation$/ },
          () => ({ path: "session", namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: withSessionDefaults(`const http={request:async(_operation,input)=>{window.summaryReads=(window.summaryReads??0)+1; input?.signal?.addEventListener('abort',()=>window.summaryAborts=(window.summaryAborts??0)+1); return {releaseId:'release',releaseHash:'sha256:'+'a'.repeat(64),revision:'record',cards:[{key:'identity',state:'ready',data:{name:'Authorized summary'}}]};}};export const useApiClient=()=>http;export const useSessionIdentity=()=>({scope:{tenantId:'tenant',principalId:'actor',authEpoch:1}});export const useToasts=()=>({push:()=>{}});export const useOptionalAppearanceProfile=()=>undefined;export const readBrowserCsrfToken=()=>undefined;`),
          loader: "js",
        }));
      },
    },
  ],
}).then((result) => result.outputFiles[0]!.text);
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/record/record.css",
  "packages/platform/entity/runtime/form-detail/src/detail-workspace.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
async function mount(
  page: import("@playwright/test").Page,
  mode?: string,
  query = "",
  fixture?: unknown,
) {
  await page.route("https://detail.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto(`https://detail.test/${query}`);
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({
    content: styles + "\n[data-detail-section]{min-height:700px}body{margin:0}",
  });
  await page.evaluate((mode) => {
    (window as any).mode = mode;
  }, mode);
  await page.evaluate(fixture => { (window as any).fixture = fixture; }, fixture);
  await page.addScriptTag({ content: await bundle });
}
const countrySource = JSON.parse(readFileSync("metadata/products/shared/entities/country/definition.json", "utf8")).definition;
// This fixture exercises navigation, not compilation. Lower source localized text
// to the presentation's compatible string label; the compiled path has its own tests.
const country = {...countrySource,sections:countrySource.sections.map((section:{label:string|{defaultText:string}})=>({...section,label:typeof section.label==="string"?section.label:section.label.defaultText}))};
test("provider Summary is lazy, supplementary, and aborts when disabled", async ({page}) => {
  await mount(page, undefined, "", {...country, summaryView: {schemaVersion:1,cards:[{key:"identity",label:"Identity summary",provider:"platform.record.identity.v1",rendererKey:"platform.record.identity.v1"}]}});
  expect(await page.evaluate(() => (window as any).summaryReads ?? 0)).toBe(0);
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("button", {name:"Summary view"}).click();
  await expect(page.getByLabel("Record summary", {exact:true})).toContainText("Authorized summary");
  await expect(page.locator('[data-detail-section="overview"]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).summaryReads)).toBe(1);
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("button", {name:"Section view"}).click();
  expect(await page.evaluate(() => (window as any).summaryReads)).toBe(1);
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("button", {name:"Summary view"}).click();
  await expect(page.getByLabel("Record summary", {exact:true})).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).summaryAborts)).toBe(1);
});
test("an entity without authorized summary cards has no Summary setting", async ({page}) => {
  await mount(page, undefined, "", country);
  await page.locator('summary[aria-label="View settings"]').click();
  await expect(page.getByRole("button", {name:"Summary view"})).toHaveCount(0);
});
test("record navigation fills the available shell width, including docking and mobile", async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await mount(page, undefined, "", {...country, collaboration:["comments","attachments"]});
  await page.evaluate(() => {
    const root=document.getElementById("root")!;
    const shell=document.createElement("div");shell.className="athyper-shell";
    shell.style.setProperty("--workspace-panel-width","420px");
    const body=document.createElement("div");body.className="athyper-shell__body";
    body.style.transition="none";
    const main=document.createElement("main");main.className="athyper-shell__main";
    root.before(shell);shell.append(body);body.append(main);main.append(root);
  });
  for (const [width,pinned] of [[1440,false],[1440,true],[390,false]] as const) {
    await page.setViewportSize({width,height:900});
    await page.locator('.athyper-shell').evaluate((node,pinned)=>node.setAttribute('data-workspace-panel-pinned',String(pinned)),pinned);
    await expect.poll(async () => page.evaluate(() => {
      const body=document.querySelector('.athyper-shell__body')!.getBoundingClientRect();
      const band=document.querySelector('[data-slot="page-navigation"]')!.getBoundingClientRect();
      return Math.max(Math.abs(body.left-band.left),Math.abs(body.right-band.right));
    })).toBeLessThan(1);
    const band=await page.locator('[data-slot="page-navigation"]').boundingBox();
    expect(Math.round(band!.x+band!.width)).toBe(width-(pinned?420:0));
    const settings=await page.locator('summary[aria-label="View settings"]').boundingBox();
    expect(band!.x+band!.width-settings!.x-settings!.width).toBeLessThan(32);
    expect(settings!.x).toBeGreaterThan(band!.x);
    const card=await page.locator('[data-detail-section]').first().boundingBox();
    expect(card!.x).toBeGreaterThan(band!.x);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test("navigation typography is identical for tabs, collaboration and selected/unselected menu items", async ({page}) => {
  await mount(page, undefined, "", {...country, collaboration:["comments","attachments"]});
  const tab=page.getByRole("tab",{name:"Overview",exact:true});
  await page.locator('summary[aria-label="Overview sections"]').click();
  const font = (locator: import("@playwright/test").Locator) => locator.evaluate(node => {
    const css=getComputedStyle(node); return {family:css.fontFamily,size:css.fontSize,weight:css.fontWeight,line:css.lineHeight};
  });
  const expected=await font(tab);
  const tokens=await tab.evaluate(node => {
    const probe=document.createElement("span");probe.style.fontSize="var(--a-font-size-body)";probe.style.fontWeight="var(--a-font-weight-regular)";node.appendChild(probe);
    const css=getComputedStyle(probe),result={size:css.fontSize,weight:css.fontWeight};probe.remove();return result;
  });
  expect(expected.size).toBe(tokens.size); expect(expected.weight).toBe(tokens.weight);
  for (const item of [page.getByRole("button",{name:"Open Comments"}),page.getByRole("button",{name:"Open Files"}),page.getByRole("menuitem",{name:"Country",exact:true}),page.getByRole("menuitem",{name:"Phone",exact:true})]) expect(await font(item)).toEqual(expected);
  await page.getByRole("menuitem",{name:"Phone",exact:true}).click();
  await page.locator('summary[aria-label="Overview sections"]').click();
  expect(await font(page.getByRole("menuitem",{name:"Phone",exact:true}))).toEqual(expected);
});
test("record tabs follow the page navigation bar: icon gap, shared height, chevron joined to its tab", async ({page}, testInfo) => {
  await mount(page, undefined, "", {...country, collaboration:["comments","attachments"]});
  const tab = page.getByRole("tab", {name:"Overview", exact:true});
  const geometry = await tab.evaluate(node => {
    const icon = node.querySelector("svg")!.getBoundingClientRect(), label = node.querySelector("span")!.getBoundingClientRect();
    const probe = document.createElement("div"); probe.style.height = "calc(var(--a-control-height) + var(--a-space-2))"; document.body.appendChild(probe);
    const bar = probe.getBoundingClientRect().height; probe.remove();
    const summary = document.querySelector<HTMLElement>('summary[aria-label="Overview sections"]')!;
    const tabBox = node.getBoundingClientRect(), summaryBox = summary.getBoundingClientRect();
    return {
      gap: Math.round(label.left - icon.right), iconSize: Math.round(icon.width),
      iconCentre: Math.round(icon.top + icon.height / 2), labelCentre: Math.round(label.top + label.height / 2),
      height: Math.round(tabBox.height), bar: Math.round(bar),
      joinGap: Math.round(summaryBox.left - tabBox.right),
      tabRule: getComputedStyle(node).borderBottomColor, summaryRule: getComputedStyle(summary).borderBottomColor,
    };
  });
  expect(geometry.gap).toBe(8);
  expect(geometry.iconSize).toBe(18);
  expect(Math.abs(geometry.iconCentre - geometry.labelCentre)).toBeLessThanOrEqual(1);
  expect(geometry.height).toBe(geometry.bar);
  // The section chevron sits flush against the current tab and shares its underline.
  await expect(page.locator(".a-metadata-detail__navigation")).toHaveAttribute("data-section-menu", "joined");
  expect(Math.abs(geometry.joinGap)).toBeLessThanOrEqual(1);
  expect(geometry.summaryRule).toBe(geometry.tabRule);
  await page.locator(".a-metadata-detail__navigation").screenshot({ path: testInfo.outputPath("record-navigation-bar.png") });
});
test("record values, labels and section headings use the density text roles", async ({page}) => {
  await mount(page, undefined, "", country);
  const check = await page.evaluate(() => {
    const probe = (size: string, height: string) => { const element = document.createElement("span"); element.style.fontSize = size; element.style.lineHeight = height; document.querySelector(".a-record-detail-content")!.appendChild(element); const css = getComputedStyle(element), result = `${css.fontSize}/${css.lineHeight}`; element.remove(); return result; };
    const font = (selector: string) => { const css = getComputedStyle(document.querySelector(selector)!); return `${css.fontSize}/${css.lineHeight}`; };
    return {
      value: [font(".a-record-detail-fields dd"), probe("var(--a-density-data-font-size)", "var(--a-density-data-line-height)")],
      label: [font(".a-record-detail-fields dt"), probe("var(--a-density-label-font-size)", "var(--a-density-label-line-height)")],
      section: [font(".a-record-detail-content > h2"), probe("var(--a-density-section-font-size)", "var(--a-density-section-line-height)")],
    };
  });
  for (const [actual, expected] of Object.values(check)) expect(actual).toBe(expected);
});
test("on phones the record section menu opens as the shared bottom sheet", async ({page}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mount(page, undefined, "", {...country, collaboration:["comments","attachments"]});
  await page.setViewportSize({ width: 390, height: 800 });
  await page.locator('summary[aria-label="Overview sections"]').click();
  const menu = page.getByRole("menu", { name: "Overview sections" });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(await menu.evaluate((node) => getComputedStyle(node).position)).toBe("fixed");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(Math.round(800 - (box.y + box.height))).toBeLessThanOrEqual(16);
  for (const item of await menu.getByRole("menuitem").all()) expect(Math.round((await item.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
});
for (const theme of ["light", "dark"]) test(`short sections land below shell and navigation; token-based menu (${theme})`, async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await mount(page, undefined, "", country);
  await page.evaluate(theme => document.documentElement.setAttribute("data-theme", theme), theme);
  await page.addStyleTag({content: `
    body{padding-top:92px;--a-page-sticky-top:92px}
    body::before{content:'';position:fixed;top:0;left:0;right:0;height:92px;z-index:100;background:var(--a-surface)}
    [data-detail-section]{min-height:0!important}
  `});
  const trigger = page.locator('summary[aria-label="Overview sections"]');
  for (const [key, label] of [["phone","Phone"],["audit","Audit"],["overview","Country"],["address","Postal and address"]]) {
    await trigger.click();
    const menu = page.getByRole("menu", {name:"Overview sections"});
    const unselected = menu.locator('button:not([aria-current="page"])').first();
    await expect(unselected).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await menu.getByRole("menuitem", {name:label,exact:true}).click();
    await expect(page.locator(`[data-detail-section="${key}"]`)).toBeFocused();
    await expect.poll(async () => page.evaluate(key => {
      const section = document.querySelector(`[data-detail-section="${key}"]`)!;
      const band = document.querySelector('[data-slot="page-navigation"]')!;
      return Math.round(section.getBoundingClientRect().top-band.getBoundingClientRect().bottom);
    }, key)).toBe(16);
    await expect(page).toHaveURL(new RegExp(`section=${key}`));
  }
  const before = await page.evaluate(()=>history.length);
  await page.mouse.move(900,500); await page.mouse.wheel(0,600);
  await expect(page).toHaveURL(/section=audit/);
  expect(await page.evaluate(()=>history.length)).toBe(before);
});
test("navigation tab section menu supports keyboard, scrolling, dismissal and cross-tab selection", async ({ page }) => {
  await mount(page, "scroll");
  const trigger = page.locator('summary[aria-label="Details sections"]');
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", {name: "Identity", exact: true})).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", {name: "Contacts", exact: true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu", {name: "Details sections"})).toBeHidden();
  await trigger.click();
  await page.getByRole("menuitem", {name: "Contacts", exact: true}).click();
  await expect(page.locator('[data-detail-section="contacts"]')).toBeFocused();
  await expect(page).toHaveURL(/section=contacts/);
  await trigger.click();
  await expect(page.getByRole("menuitem", {name: "Contacts", exact: true})).toHaveAttribute("aria-current", "page");
  await page.getByRole("heading", {name: "Example", exact: true}).click();
  await expect(page.getByRole("menu", {name: "Details sections"})).toBeHidden();
  await page.getByRole("tab", {name: "History", exact: true}).click();
  await expect(trigger).toHaveCount(0);
  await page.getByRole("tab", {name: "Details", exact: true}).click();
  await trigger.click();
  await page.getByRole("menuitem", {name: "Contacts", exact: true}).click();
  await expect(page.getByRole("tab", {name: "Details", exact: true})).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-detail-section="contacts"]')).toBeFocused();
  await page.setViewportSize({width: 390, height: 800});
  await trigger.click();
  await expect(page.getByRole("menuitem", {name: "Identity", exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("in tab mode a tab switch keeps the record header in view", async ({page}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await mount(page,"switch");
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  await expect(page.getByRole("heading", { level: 1, name: "Example" })).toBeInViewport();
});
test("a section selection writes history once and restores through Back and Forward", async ({page}) => {
  await mount(page,"switch");
  await page.evaluate(()=>{
    (window as any).historyWrites=[];
    for(const method of ["pushState","replaceState"] as const){
      const original=history[method].bind(history);
      history[method]=(...args)=>{(window as any).historyWrites.push(method);original(...args);};
    }
  });
  await page.locator('summary[aria-label="Details sections"]').click();
  await page.getByRole("menuitem",{name:"Contacts",exact:true}).click();
  await expect(page).toHaveURL(/section=contacts/);
  expect(await page.evaluate(()=>(window as any).historyWrites)).toEqual(["pushState"]);
  await page.goBack();await expect(page.locator('[data-detail-section="identity"]')).toBeVisible();
  await page.goForward();await expect(page.locator('[data-detail-section="contacts"]')).toBeVisible();
});
test("navigation remains usable in forced colors and RTL",async({page})=>{
  await page.emulateMedia({forcedColors:"active"});
  await mount(page,"switch");
  await page.evaluate(()=>document.documentElement.dir="rtl");
  await page.locator('summary[aria-label="Details sections"]').click();
  await page.getByRole("menuitem",{name:"Contacts",exact:true}).click();
  await expect(page.locator('[data-detail-section="contacts"]')).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("explicit single Overview contains every Country section and keeps scrolling independent of rail visibility", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await mount(page, undefined, "?tab=overview&section=phone", country);
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.locator("[data-detail-section]")).toHaveCount(4);
  await expect(page.locator('[data-detail-section="phone"]')).toBeInViewport();
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("button", { name: "Section view" }).click();
  const rail = page.getByRole("navigation", { name: "Record sections", exact: true });
  await rail.getByRole("button", { name: "Audit", exact: true }).click();
  await expect(page.locator('[data-detail-section="audit"]')).toBeFocused();
  await expect(rail.getByRole("button", { name: "Audit", exact: true })).toHaveAttribute("aria-current", "location");
  const entries = await page.evaluate(() => history.length);
  await page.mouse.move(900, 500); await page.mouse.wheel(0, -500);
  await expect(rail.getByRole("button", { name: "Postal and address", exact: true })).toHaveAttribute("aria-current", "location");
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await expect(page.locator('[data-detail-section="audit"]')).toBeFocused();
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("button", { name: "Section view" }).click();
  await expect(page.locator("[data-detail-section]")).toHaveCount(4);
  await expect(page.getByRole("combobox", { name: "Record sections" })).toHaveCount(0);
  await page.locator('summary[aria-label="Overview sections"]').click();
  await expect(page.getByRole("menuitem", {name: "Phone", exact: true})).toBeVisible();
});
test("a single declared tab obeys metadata order and selected mode remains explicit", async ({ page }) => {
  const sections = [{ key: "first", label: "First", fields: ["name"] }, { key: "last", label: "Last", fields: ["other"] }];
  await mount(page, undefined, "", { sections, navigation: { mode: "scroll", tabs: [{ key: "overview", label: "Overview", sectionKeys: ["last", "first"] }] } });
  await expect(page.locator("[data-detail-section]")).toHaveCount(2);
  expect(await page.locator("[data-detail-section]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-detail-section")))).toEqual(["last", "first"]);
  await expect(page.locator('.a-entity-record__group [role="menuitem"][aria-current="page"]')).toHaveText("Last");
  await mount(page, undefined, "", { sections, navigation: { mode: "switch", tabs: [{ key: "overview", label: "Overview", sectionKeys: ["last", "first"] }] } });
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.locator("[data-detail-section]")).toHaveCount(1);
});
test("legacy selected sections do not silently become continuous", async ({
  page,
}) => {
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "Identity", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-detail-section]")).toHaveCount(1);
  await chooseOption(page.getByRole("combobox", { name: "Record sections" }), "contacts");
  await expect(page.locator('[data-detail-section="contacts"]')).toBeFocused();
  await expect(page).toHaveURL(/section=contacts/);
  await page.goBack();
  await expect(page.locator('[data-detail-section="identity"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Summary view" }),
  ).toHaveCount(0);
});
test("metadata modes use manual keyboard activation without section-scroll feedback", async ({
  page,
}) => {
  await mount(page, "scroll");
  await expect(page.locator("[data-detail-section]")).toHaveCount(2);
  const details = page.getByRole("tab", { name: "Details", exact: true });
  const history = page.getByRole("tab", { name: "History", exact: true });
  await details.focus();
  await page.keyboard.press("ArrowRight");
  await expect(history).toBeFocused();
  await expect(details).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(history).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-detail-section="audit"]')).toBeVisible();
  await details.click();
  await page.locator('summary[aria-label="Details sections"]').click();
  await page.getByRole("menuitem", {name: "Contacts", exact: true}).click();
  await expect(page.locator('[data-detail-section="contacts"]')).toBeFocused();
  const length = await page.evaluate(() => history.length);
  await page.mouse.move(650, 450);
  await page.mouse.wheel(0, -1200);
  await expect(page).toHaveURL(/section=identity/);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await expect(page.locator('[data-detail-section="contacts"]')).toBeFocused();
});
test("deep links restore the final section and view settings do not change navigation semantics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await mount(page, "scroll", "?tab=details&section=contacts");
  await expect(page.locator('.a-entity-record__group [role="menuitem"][aria-current="page"]')).toHaveText("Contacts");
  await expect(
    page.locator('[data-detail-section="contacts"]'),
  ).toBeInViewport();
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("button", { name: "Section view" }).click();
  await expect(page.locator('[data-rail="true"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(
    page.getByRole("combobox", { name: "Record sections" }),
  ).toHaveCount(0);
  await page.locator('summary[aria-label="Details sections"]').click();
  await expect(page.getByRole("menuitem", {name: "Contacts", exact: true})).toBeVisible();
  await expect(page.locator("[data-detail-section]")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});


test("a declared Overview section receives shared navigation and a singular heading without redundant selectors", async ({page}) => {
  await mount(page,undefined,"",{sections:[{key:"overview",label:"Fixtures",fields:["name"]},{key:"audit",label:"Audit",fields:["created"]}]});
  await expect(page.getByRole("tab",{name:"Overview",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Fixture",exact:true})).toBeVisible();
  await expect(page.locator("[data-detail-section]")).toHaveCount(2);
  await expect(page.getByRole("combobox",{name:"Record sections"})).toHaveCount(0);
  await mount(page,undefined,"",{sections:[{key:"overview",label:"Fixtures",fields:["name"]}]});
  await expect(page.getByRole("tab",{name:"Overview",exact:true})).toBeVisible();
  await expect(page.locator('summary[aria-label="Overview sections"]')).toHaveCount(0);
  await expect(page.getByRole("navigation",{name:"Record sections"})).toHaveCount(0);
});
test("record header to navigation bar uses the same gap as workspace and module pages", async ({page}) => {
  await mount(page, undefined, "", country);
  const gap = await page.evaluate(() => {
    const header = document.querySelector(".athyper-page-header")!.getBoundingClientRect();
    const nav = document.querySelector(".a-metadata-detail__navigation")!.getBoundingClientRect();
    const probe = document.createElement("div"); probe.style.height = "var(--a-space-5)"; document.body.appendChild(probe);
    const token = probe.getBoundingClientRect().height; probe.remove();
    return { gap: Math.round(nav.top - header.bottom), token: Math.round(token) };
  });
  expect(gap.gap).toBe(gap.token);
});
