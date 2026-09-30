import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";

const styles = ["packages/platform/foundation/theme/src/styles.css", "packages/platform/shell/shell/src/styles.css"]
  .map(path => readFileSync(path, "utf8").replace(/@import[^;]+;/g, "")).join("\n");
const bundle = buildSync({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PageWorkspace, PageLayout} from './packages/platform/shell/shell/src/page-workspace';
import {PageHeader} from './packages/platform/shell/shell/src/page-foundation';
import {EntityPageLayout, useRecordPage} from './packages/platform/shell/shell/src/entity-page-layout';
function Record() {
  useRecordPage();
  const [ready,setReady]=useState(false), [refresh,setRefresh]=useState(false), [variant,setVariant]=useState('sections-content-overview');
  window.refreshPage=()=>setRefresh(value=>!value);
  const sections=<nav aria-label="Sections"><a href="#details">Details</a></nav>;
  return <PageWorkspace width="wide" header={{level:'collection',title:ready?'Record':'Loading record'}}
    navigation={<nav aria-label="Page"><button onClick={()=>setReady(true)}>Load record</button></nav>}
    status={refresh?<p role="status">Refreshing</p>:null}
    toolbar={<select aria-label="Layout" value={variant} onChange={e=>setVariant(e.target.value)}><option>content</option><option>sections-content</option><option>sections-content-overview</option></select>}
    actions={<button onClick={()=>setRefresh(true)}>Save</button>}
    actionOutcome={refresh?<p role="alert">Save failed; draft retained</p>:null}>
    {ready?<PageLayout variant={variant} sectionNavigation={sections} overview={<aside aria-label="Overview">Overview</aside>}>
      <label>Draft<input /></label><section id="details" style={{minHeight:1200}}><h2>Details</h2></section>
    </PageLayout>:<p role="status">Loading</p>}
  </PageWorkspace>;
}
function SharedTask(){const [failed,setFailed]=useState(false);return <PageWorkspace contentOnly status={failed?<p role="alert">Task action failed</p>:null} actions={<button onClick={()=>setFailed(true)}>Run task</button>}><label>Task draft<input/></label></PageWorkspace>}
function App(){ const [record,setRecord]=useState(true),[task,setTask]=useState(false); return <><button onClick={()=>setRecord(v=>!v)}>Toggle record</button><button onClick={()=>setTask(v=>!v)}>Toggle shared task</button><main id="main-content" tabIndex={-1}><EntityPageLayout collectionHeader={<PageHeader level="collection" title="Collection"/>} collectionNavigation={<nav aria-label="Collection">Collection navigation</nav>}>{task?<SharedTask/>:record?<Record/>:<p>Collection rows</p>}</EntityPageLayout></main></>; }
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' }, tsconfig: resolve("tooling/config/tsconfig-react.json"), logLevel: "silent",
}).outputFiles[0]!.text;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await page.setContent(`<style>${styles}body{margin:0;padding:16px}*{box-sizing:border-box}</style><div id="root"></div>`);
  await page.addScriptTag({content:bundle});
});

test("record loading owns the header; status and action updates retain draft, focus and scroll", async ({page}) => {
  // Existing useRecordPage ownership registers in an effect after mount.
  await expect(page.getByRole("heading", {level:1})).toHaveCount(1);
  await expect(page.getByRole("heading", {level:1})).toHaveText("Loading record");
  await expect(page.getByRole("navigation", {name:"Collection",exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"Load record"}).click();
  const input=page.getByRole("textbox", {name:"Draft"});
  await input.fill("Unsaved changes");
  await input.evaluate(element => { (element as HTMLElement).dataset.original="true"; });
  await page.evaluate(() => { window.scrollTo(0,100); (window as unknown as {refreshPage:()=>void}).refreshPage(); });
  await expect(page.getByRole("alert")).toHaveText("Save failed; draft retained");
  await expect(input).toHaveValue("Unsaved changes");
  await expect(input).toHaveAttribute("data-original","true");
  await expect(input).toBeFocused();
  expect(await page.evaluate(()=>window.scrollY)).toBe(100);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", {level:1})).toHaveText("Record");
  await page.getByRole("button", {name:"Toggle record"}).click();
  await expect(page.getByRole("heading", {level:1})).toHaveText("Collection");
  await expect(page.getByRole("navigation", {name:"Collection",exact:true})).toBeVisible();
});

test("three layouts collapse without horizontal overflow or another scroll root", async ({page}) => {
  await page.getByRole("button", {name:"Load record"}).click();
  const content=page.locator('[data-slot="page-content"]'), nav=page.locator('[data-slot="section-navigation"]'), overview=page.locator('[data-slot="overview-panel"]');
  expect((await content.boundingBox())!.x).toBeGreaterThan((await nav.boundingBox())!.x);
  expect((await overview.boundingBox())!.x).toBeGreaterThan((await content.boundingBox())!.x);
  for(const width of [1000,390]){
    await page.setViewportSize({width,height:844});
    expect((await overview.boundingBox())!.y).toBeGreaterThan((await content.boundingBox())!.y);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  for(const variant of ['sections-content','content']){
    await page.getByRole('combobox',{name:'Layout'}).selectOption(variant);
    await expect(overview).toHaveCount(0);
    await expect(nav).toHaveCount(variant==='content'?0:1);
  }
  expect(await page.locator('.athyper-page-workspace, .athyper-page-workspace *').evaluateAll(elements=>elements.some(element=>['auto','scroll'].includes(getComputedStyle(element).overflowY)))).toBe(false);
});

test("content-only workspace retains the ancestor header and still supplies state and actions", async ({page}) => {
  await page.getByRole("button", {name:"Toggle shared task"}).click();
  await expect(page.getByRole("heading", {level:1})).toHaveText("Collection");
  await expect(page.getByRole("heading", {level:1})).toHaveCount(1);
  await expect(page.locator(".athyper-page-workspace")).toHaveCount(1);
  await expect(page.locator(".athyper-page-frame")).toHaveCount(0);
  const input=page.getByRole("textbox", {name:"Task draft"});
  await input.fill("Retained task input");
  await input.evaluate(element => { (element as HTMLElement).dataset.original="true"; });
  await page.getByRole("button", {name:"Run task"}).click();
  await expect(page.getByRole("alert")).toHaveText("Task action failed");
  await expect(input).toHaveValue("Retained task input");
  await expect(input).toHaveAttribute("data-original", "true");
});
