import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
// Compile in the repository's ESM loader; Playwright's CJS transform cannot
// directly load the server workspace's mixed ESM package graph.
let localizedDescriptor: unknown;
const referenceDetail = async () => localizedDescriptor ??= JSON.parse(execFileSync(process.execPath,["--import","tsx","-e","require('./tooling/scripts/verification/localized-reference-fixture.ts').referenceDetail().then(value=>console.log(JSON.stringify(value)));"],{encoding:"utf8"}));

const bundle = build({
  stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {DetailCollaboration} from './packages/platform/entity/runtime/form-detail/src/detail-collaboration';
    import {MetadataDetailWorkspace} from './packages/platform/entity/runtime/form-detail/src/detail-workspace';
    import {parseEntityRecordPresentation} from './packages/contracts/platform/entity-runtime/src/record-presentation';
    import {IntlProvider} from './packages/platform/foundation/i18n/src/react';
    import {createEffectiveLocalization} from './packages/platform/foundation/i18n/src/index';
    function App(){const [tenant,setTenant]=useState('tenant-a');return <><button onClick={()=>{window.testTenant='tenant-b';setTenant('tenant-b')}}>Switch tenant</button><DetailCollaboration key={tenant} entityCode="fixture_record" recordId="record-1" kinds={window.kinds}/></>}
    const presentation=parseEntityRecordPresentation({schemaVersion:1,titleField:'name',sections:[{key:'identity',label:'Identity',fields:['name']},{key:'audit',label:'Audit',fields:['name']}],navigation:{mode:'scroll',tabs:[{key:'overview',label:'Overview',sectionKeys:['identity','audit']}]}});
    function Root(){const [locale,setLocale]=useState(window.testLocale??'en');window.changeLocale=setLocale;return <IntlProvider localization={createEffectiveLocalization({uiLocale:locale,formatLocale:locale,timeZone:'Asia/Kuala_Lumpur'})} messages={{}}>{window.recordPage ? <MetadataDetailWorkspace descriptor={window.localizedDescriptor ? {...window.localizedDescriptor,collaboration:window.kinds} : {schemaVersion:1,pageKind:'detail',entity:{code:'fixture_record',label:'Fixture'},revision:{release:'release'},titleField:'name',fields:[{key:'name',label:'Name',kind:'string'}],actions:[],collaboration:window.kinds,presentation}} record={{id:'record-1',values:{name:'Example',code:'AF',official_name:'Afghanistan',region:'Asia',has_postal_codes:true}}} entityCode={window.localizedDescriptor?'country':'fixture_record'} preferenceKey='test.full-view'/> : <App/>}</IntlProvider>}
    createRoot(document.getElementById('root')).render(<Root/>);
  ` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"), define: { "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "session-fixture", setup(builder) {
    builder.onResolve({ filter: /^@athyper\/platform-shell-app-foundation$/ }, () => ({ path: "session", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      const client={request:async(op,input)=>{const path=typeof op.path==='function'?op.path(input?.params??{}):op.path;window.requests.push(path);if(window.denied)throw Error('Forbidden');const kind=path.endsWith('/attachments')?'attachments':'comments';return {releaseId:'release',releaseHash:'a'.repeat(64),revision:'1',sectionKey:kind,presentation:{rendererKey:'platform.'+kind+'.v1',fields:[],childCollections:[]},capability:{schemaVersion:1,layouts:['drawer','content'],actions:(window.writable?['read','create','finalize']:['read']).map(key=>({key,concurrency:'none',idempotency:key==='read'?'none':'required'})),maxTextLength:5000,maxAttachments:3,maxFileBytes:5242880,maxBatchCount:3,allowedContentTypes:['text/plain'],maxDepth:0,allowedAudiences:['private'],defaultAudience:'private'},data:{items:window.commentItems??[],totalCount:window.commentItems?.length??0}}}};
      export const useApiClient=()=>client;
      export const useSessionIdentity=()=>({scope:{tenantId:window.testTenant,principalId:'actor',authEpoch:1}});
      export const useToasts=()=>({push:()=>{}});
      export const useOptionalAppearanceProfile=()=>undefined;
      export const readBrowserCsrfToken=()=>undefined;
    `, loader: "js" }));
  } }],
}).then(r => r.outputFiles[0]!.text);
const styles = ["packages/platform/foundation/theme/src/styles.css", "packages/platform/foundation/ui/src/styles.css", "packages/platform/shell/shell/src/styles.css", "packages/platform/entity/runtime/form-detail/src/detail-workspace.css", "packages/platform/entity/runtime/form-detail/src/styles.css", "packages/platform/entity/runtime/form-detail/src/record/record.css", "packages/platform/entity/runtime/form-detail/src/record/record-collaboration.css"].map(p => readFileSync(p, "utf8").replace(/@import[^;]+;/g, "")).join("\n");
async function mount(page: import("@playwright/test").Page, kinds = ["comments", "attachments"], recordPage = false, initialUnpinned = false, locale?: string) {
  await page.route("https://collaboration.test/**", route => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto("https://collaboration.test/");
  await page.setContent('<!doctype html><div id="root"></div>');
  await page.addStyleTag({ content: styles });
  await page.evaluate(kinds => Object.assign(window, { kinds, requests: [], testTenant: "tenant-a", denied: false }), kinds);
  await page.evaluate(value => { (window as any).recordPage = value; }, recordPage);
  if(locale) await page.evaluate(({locale,descriptor})=>Object.assign(window,{testLocale:locale,localizedDescriptor:descriptor}),{locale,descriptor:await referenceDetail()});
  if (initialUnpinned) await page.evaluate(() => {
    localStorage.setItem("athyper.collaboration.panel", JSON.stringify({pinned:false,width:540}));
    history.replaceState({},"","?panel=collaboration&collaborationSection=comments");
    (window as any).paintModes=[];
    let frames=0;
    const inspect=()=>{const mode=document.querySelector('[data-mode]')?.getAttribute('data-mode');if(mode)(window as any).paintModes.push(mode);if(++frames<20)requestAnimationFrame(inspect);};
    requestAnimationFrame(inspect);
  });
  await page.addScriptTag({ content: await bundle });
}
for (const [locale, name, comments, files] of [["en","Name","Comments","Files"],["ms","Nama","Komen","Fail"],["ar","الاسم","التعليقات","الملفات"]]) test(`localized Country renders compiled labels and shared collaboration in ${locale}`,async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:900});
  await mount(page,["comments","attachments"],true,false,locale);
  await expect(page.locator("html")).toHaveAttribute("lang",locale!);
  await expect(page.locator("html")).toHaveAttribute("dir",locale==="ar"?"rtl":"ltr");
  await expect(page.locator("dt").filter({hasText:new RegExp(`^${name}$`)})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Example",exact:true})).toBeVisible();
  await expect(page.locator("dd").filter({hasText:new RegExp(locale==="ar"?"^نعم$":locale==="ms"?"^Ya$":"^Yes$")})).toBeVisible();
  await expect(page.locator('[role="tablist"] [role="menu"]')).toHaveCount(0);
  const controls=page.locator(".a-entity-record__collaboration-control");
  await expect(controls.nth(0)).toContainText(comments!);await expect(controls.nth(1)).toContainText(files!);
  await controls.nth(0).click();await expect(page.locator("#collaboration-section-comments")).toBeVisible();await expect(page.locator(".a-collaboration-panel__header")).toHaveCount(0);
  await controls.nth(1).click();
  await expect(page.locator(".a-files-empty-state:visible")).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if(locale==="ar") {
    await page.locator("[data-panel-action=fullView]").click();
    const resize=page.getByRole("separator");await resize.focus();await resize.press("Home");
    const width=Number(await resize.getAttribute("aria-valuenow"));await resize.press("ArrowRight");
    await expect(resize).toHaveAttribute("aria-valuenow",String(width+20));
    await resize.press("ArrowLeft");await expect(resize).toHaveAttribute("aria-valuenow",String(width));
    const bounds=(await resize.boundingBox())!;await page.mouse.move(bounds.x+bounds.width/2,bounds.y+40);await page.mouse.down();await page.mouse.move(bounds.x+53,bounds.y+40);await page.mouse.up();
    await expect.poll(async()=>Number(await resize.getAttribute("aria-valuenow"))).toBeGreaterThan(width+40);
    await page.screenshot({path:"/tmp/entity-localization-ar.png"});
  }
  expect(errors).toEqual([]);
});
test("switching Country locale preserves the active collaboration draft and record values",async({page})=>{
  await mount(page,["comments","attachments"],true,false,"en");
  await page.evaluate(()=>{(window as any).writable=true});
  await page.getByRole("button",{name:"Open Comments",exact:true}).click();
  await page.locator("[data-action-dock-trigger]:visible").click();
  const editor=page.locator('[contenteditable="true"]').first();await editor.fill("Keep my draft افغانستان");
  await page.evaluate(()=>(window as any).changeLocale("ar"));
  await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  await expect(editor).toHaveText("Keep my draft افغانستان");
  await expect(page.locator("#collaboration-section-comments")).toBeVisible();
  await page.evaluate(()=>(window as any).changeLocale("ms"));
  await expect(page.locator("html")).toHaveAttribute("dir","ltr");
  await expect(editor).toHaveText("Keep my draft افغانستان");
  await expect(page.locator("#collaboration-section-comments")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Example",exact:true})).toBeVisible();
});
test("old unpinned preferences open full view without an overlay", async ({page}) => {
 await page.setViewportSize({width:1440,height:900});await mount(page,["comments","attachments"],true,true);
 await expect(page.locator('.a-collaboration-panel')).toHaveAttribute('data-mode','content');
 await expect(page.locator('.a-collaboration-backdrop')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/[Uu]npin collaboration|Pin collaboration/})).toHaveCount(0);
});
test("authorized capability controls load lazily and reset on tenant switch", async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await mount(page);
  expect(await page.evaluate(() => (window as any).requests)).toEqual([]);
  await page.getByRole("navigation", { name: "Record collaboration" }).getByRole("button", {name:"Comments"}).click();
  await expect.poll(() => page.evaluate(() => (window as any).requests)).toContain("/entity-runtime/fixture_record/records/record-1/collaboration/comments");
  await expect(page.getByText("Loading collaboration…")).toHaveCount(0);
  await page.getByRole("navigation",{name:"Record collaboration"}).getByRole("button",{name:"Files",exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).requests)).toContain("/entity-runtime/fixture_record/records/record-1/collaboration/attachments");
  await page.getByRole("button",{name:"Open Collaboration in side view",exact:true}).click();
  await page.getByRole("region", {name:"Collaboration",exact:true}).getByRole("button", {name:"Close collaboration",exact:true}).click();
  const count = await page.evaluate(() => (window as any).requests.length);
  await page.getByRole("button", {name:"Switch tenant"}).click();
  await expect(page.locator(".a-collaboration-host")).toHaveCount(1);
  await expect(page.getByText("Loading collaboration…")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(count);
});
test("direct-link close restores record navigation and keeps section menus outside tablists",async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await mount(page,["comments","attachments"],true,true);
 await page.locator("[data-panel-action=fullView]").first().click();
 await page.locator(".a-collaboration-panel").press("Escape");
 await expect(page.getByRole("tab",{name:"Overview",exact:true})).toBeFocused();
 await expect(page.locator('[role="tablist"] [role="menu"]')).toHaveCount(0);
});

test("desktop side view docks, closes with Escape, and reopens in full view",async({page})=>{
 await page.setViewportSize({width:1440,height:900});await mount(page);
 const opener=page.getByRole('navigation',{name:'Record collaboration'}).getByRole('button',{name:'Comments',exact:true});
 await opener.click();const panel=page.locator('.a-collaboration-panel');await expect(panel).toHaveAttribute('data-mode','content');
 await page.getByRole('button',{name:'Open Collaboration in side view',exact:true}).click();
 await expect(panel).toHaveAttribute('data-mode','pinned');await expect(panel).toBeFocused();
 await expect(page.locator('.a-collaboration-backdrop')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/[Uu]npin collaboration|Pin collaboration/})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(opener).toBeFocused();
 await opener.click();await expect(panel).toHaveAttribute('data-mode','content');
});
test("full collaboration has exclusive navigation selection and restores record/history without losing a draft", async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await mount(page, ["comments","attachments"], true);
  await page.evaluate(() => { (window as any).writable = true; });
  const overview = page.getByRole("tab", {name:"Overview",exact:true});
  const comments = page.getByRole("button", {name:"Open Comments",exact:true});
  const files = page.getByRole("button", {name:"Open Files",exact:true});
  const body = page.locator('.a-metadata-detail__layout');
  await comments.click();
  await page.locator("[data-action-dock-trigger]:visible").click();
  const composer = page.locator('[contenteditable="true"]').first();
  await composer.fill("Preserve my full-view draft");
  await expect(overview).toHaveAttribute("aria-selected","false");
  await expect(comments).toHaveAttribute("aria-current","page");
  await expect(body).toBeHidden();
  await files.click();
  await expect(files).toHaveAttribute("aria-current","page");
  await expect(comments).not.toHaveAttribute("aria-current","page");
  await page.locator('summary[aria-label="Overview sections"]').click();
  await expect(page.getByRole('menu', {name:'Overview sections'}).locator('[aria-current="page"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await overview.click();
  await expect(body).toBeVisible();
  await expect(overview).toHaveAttribute("aria-selected","true");
  await expect(files).not.toHaveAttribute("aria-current","page");
  await page.goBack();
  await expect(body).toBeHidden();
  await expect(files).toHaveAttribute("aria-current","page");
  await page.goForward();
  await expect(body).toBeVisible();
  await comments.click();
  await expect(composer).toContainText("Preserve my full-view draft");
  await page.locator('summary[aria-label="Overview sections"]').click();
  await page.getByRole('menuitem', {name:'Audit',exact:true}).click();
  await expect(body).toBeVisible();
  await expect(page).toHaveURL(/section=audit/);
  await expect(page.locator('[data-detail-section="audit"]')).toBeFocused();
});
test("side width persists and compact screens stay in full view",async({page})=>{
 await page.setViewportSize({width:1440,height:900});await mount(page);
 await page.getByRole('button',{name:'Comments',exact:true}).click();
 const side=page.getByRole('button',{name:'Open Collaboration in side view',exact:true});await side.click();
 const resize=page.getByRole('separator',{name:'Resize collaboration'});await expect(resize).toHaveAttribute('aria-valuenow','560');
 await resize.focus();await resize.press('ArrowRight');await expect(resize).toHaveAttribute('aria-valuenow','540');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.a-collaboration-panel')).toHaveAttribute('data-mode','content');await expect(side).toHaveCount(0);
 await page.setViewportSize({width:1440,height:900});await expect(page.locator('.a-collaboration-panel')).toHaveAttribute('data-mode','content');await side.click();await expect(resize).toHaveAttribute('aria-valuenow','540');
});
for (const width of [1920, 1024, 390]) test(`full-view Comments and Files share content and control edges (${width}px)`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await mount(page, ["comments", "attachments"], true);
  const overviewBounds=await page.locator(".a-record-detail-content").first().boundingBox();
  await page.evaluate(() => { (window as any).writable=true; });
  const opener=page;
  await opener.getByRole('button',{name:'Open Comments',exact:true}).click();
  const panel=page.locator('.a-collaboration-panel[data-mode="content"]');
  const bounds=await panel.boundingBox();
  expect(Math.abs(bounds!.x-overviewBounds!.x)).toBeLessThan(1);
  expect(Math.abs(bounds!.width-overviewBounds!.width)).toBeLessThan(1);
  const mountBounds=await page.locator('.a-collaboration-mount').boundingBox();
  expect(Math.abs(bounds!.x-mountBounds!.x)).toBeLessThan(1);
  expect(Math.abs(bounds!.width-mountBounds!.width)).toBeLessThan(1);
  await expect(panel.locator('.a-collaboration-panel__header')).toHaveCount(0);
  await expect(panel.locator('[data-panel-action=close]')).toBeVisible();
  const contentBounds=await panel.locator('.a-collaboration-comments').boundingBox();
  expect(Math.abs(contentBounds!.x-bounds!.x)).toBeLessThan(1);
  const aligned=async (selector:string) => {
    const box=await panel.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x-contentBounds!.x)).toBeLessThan(1);
    expect(Math.abs(box!.width-contentBounds!.width)).toBeLessThan(1);
  };
  await aligned('.a-collaboration-comments');
  await aligned('.a-comment-filters');
  await panel.locator("[data-action-dock-trigger]:visible").click();
  await aligned('.a-comment-composer-card');
  const controlsRight=async()=>{const box=await panel.locator('.a-panel-header__actions').boundingBox();return box!.x+box!.width;};
  const commentsRight=await controlsRight();
  await opener.getByRole('button',{name:'Open Files',exact:true}).click();
  await expect(panel.locator('.a-attachment-workspace')).toBeVisible();
  await aligned('.a-attachment-workspace');
  await panel.locator('[data-action-dock-trigger]:visible').click();
  await aligned('.a-attachment-uploader');
  await aligned('.a-files-discovery-controls');
  await expect(panel.locator('.a-collaboration-panel__header')).toHaveCount(0);
  expect(Math.abs(await controlsRight()-commentsRight)).toBeLessThan(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("view switches preserve focus and do not open replacement tooltips",async({page})=>{
 await page.setViewportSize({width:1440,height:900});await mount(page);await page.getByRole('button',{name:'Comments',exact:true}).click();
 const panel=page.locator('.a-collaboration-panel');await page.getByRole('button',{name:'Open Collaboration in side view',exact:true}).click();await expect(panel).toBeFocused();
 await page.getByRole('button',{name:'Open collaboration in full view',exact:true}).click();await expect(panel).toBeFocused();await expect(page.getByRole('tooltip')).toHaveCount(0);
});
test("missing capabilities expose no buttons or reads", async ({ page }) => {
  await mount(page, []);
  await expect(page.getByRole("navigation", { name: "Record collaboration" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).requests)).toEqual([]);
});
test("revoked capability displays denial without a composer or upload action", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { (window as any).denied = true; });
  await page.getByRole("button", {name:"Comments",exact:true}).click();
  await expect(page.getByText("This collaboration capability is unavailable.")).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("authorized writes use the existing composer and upload components", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { (window as any).writable = true; });
  await page.getByRole("button", {name:"Comments",exact:true}).click();
  await page.locator("[data-action-dock-trigger]:visible").click();
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  await page.getByRole("navigation",{name:"Record collaboration"}).getByRole("button",{name:"Files",exact:true}).click();
  await expect(page.locator('input[type="file"]').first()).toBeAttached();
});

test("one composer and draft survive full/side switches and browser Back",async({page})=>{
 await page.setViewportSize({width:1440,height:900});await mount(page);await page.evaluate(()=>{(window as any).writable=true;});
 await page.getByRole('button',{name:'Comments',exact:true}).click();await page.locator("[data-action-dock-trigger]:visible").click();
 const editor=page.locator('[contenteditable="true"]');await editor.fill('Keep this unsent draft');
 await page.getByRole('button',{name:'Open Collaboration in side view',exact:true}).click();await expect(page).toHaveURL(/collaborationMode=side/);
 await page.getByRole('button',{name:'Open collaboration in full view',exact:true}).click();await expect(page).toHaveURL(/collaborationMode=content/);
 await page.goBack();await expect(page.locator('.a-collaboration-panel')).toHaveAttribute('data-mode','pinned');await expect(editor).toHaveCount(1);await expect(editor).toHaveText('Keep this unsent draft');
});

for (const width of [1440, 390]) test(`full discussion scrolls with the page and keeps its creation dock visible (${width}px)`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await mount(page, ["comments", "attachments"], true);
  await page.evaluate(() => {
    (window as any).writable=true;
    (window as any).commentItems=Array.from({length:30},(_,i)=>({id:`comment-${i}`,text:`Conversation entry ${i}`,authorDisplayName:'Test Author',createdAt:'2026-09-28T01:00:00Z',visibility:'private'}));
  });
  await page.getByRole('button',{name:'Open Comments',exact:true}).click();
  await expect(page.locator('.a-record-header')).toBeVisible();
  const headerBefore=await page.locator('.a-record-header').boundingBox();
  const pageBefore=await page.evaluate(()=>window.scrollY);
  await page.getByRole('button',{name:'Open Files',exact:true}).click();
  await expect(page.locator('.a-record-header')).toBeVisible();
  expect(await page.locator('.a-record-header').boundingBox()).toEqual(headerBefore);
  expect(await page.evaluate(()=>window.scrollY)).toBe(pageBefore);
  await page.getByRole('button',{name:'Open Comments',exact:true}).click();
  await expect(page.locator('.a-record-header')).toBeVisible();
  expect(await page.locator('.a-record-header').boundingBox()).toEqual(headerBefore);
  expect(await page.evaluate(()=>window.scrollY)).toBe(pageBefore);
  await page.locator("[data-action-dock-trigger]:visible").click();
  const composer=page.locator('.a-comment-composer-card');
  const feed=page.locator('.a-comment-feed');
  await expect(composer).toBeInViewport({ratio:1});
  const before=await composer.boundingBox();
  await expect(feed).toHaveCSS("overflow-y","visible");
  await page.evaluate(()=>window.scrollTo(0,700));
  await expect(composer).toBeInViewport({ratio:1});
  await expect(page.locator('.a-comment-filters')).not.toBeInViewport();
  expect(Math.abs((await composer.boundingBox())!.y-before!.y)).toBeLessThan(1);
  await composer.locator('[contenteditable=true]').fill(Array(80).fill('Long draft line').join('\n'));
  const editor=composer.locator('[contenteditable=true]');
  expect(await editor.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await expect(composer.getByRole('button',{name:'Send',exact:true})).toBeInViewport({ratio:1});
  await page.getByRole('button',{name:'Minimize composer',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const last=(await page.locator('.a-comment-thread').last().boundingBox())!;
  const dock=(await page.locator('.a-comment-compose-dock').boundingBox())!;
  expect(last.y+last.height).toBeLessThanOrEqual(dock.y);
  await expect(page.locator('.a-comment-compose-dock')).toBeInViewport();
  await page.screenshot({path:`/tmp/comments-page-scroll-${width}.png`});
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await expect(page.locator('.a-record-header')).toBeVisible();
});

test("reading mode starts compact in side and full view",async({page})=>{
  await mount(page);
  await page.evaluate(()=>{(window as any).writable=true;});
  await page.getByRole('button',{name:'Comments',exact:true}).click();
  const add=page.locator('[data-action-dock-trigger]:visible');
  await expect(add).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Comment',exact:true})).toBeVisible();
  await expect(add).toBeVisible();
  await page.getByRole('navigation',{name:'Record collaboration'}).getByRole('button',{name:'Files',exact:true}).click();
  await expect(page.locator('[data-action-dock-trigger]:visible')).toBeVisible();
  await expect(page.getByText('Drag and drop files here',{exact:true})).toBeHidden();
  await page.locator('[data-action-dock-trigger]:visible').click();
  await expect(page.getByText('Drag and drop files here',{exact:true})).toBeVisible();
});

test("docked section switches preserve the selected view and comment reading state",async({page})=>{
 await page.setViewportSize({width:1440,height:900});await mount(page,["comments","attachments"],true);
 await page.evaluate(()=>{(window as any).commentItems=Array.from({length:30},(_,i)=>({id:`comment-${i}`,text:`Comment ${i}`,authorDisplayName:'Author',createdAt:'2026-09-28T01:00:00Z',visibility:'private'}));});
 await page.getByRole('button',{name:'Open Comments',exact:true}).click();
 const group=page.getByRole('combobox',{name:'Group comments by'});await group.selectOption('user');
 const feed=page.locator('.a-comment-feed');await feed.evaluate(el=>{window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top+200);window.dispatchEvent(new Event('scroll'));});
 await page.getByRole('button',{name:'Open Collaboration in side view',exact:true}).click();
 await expect(group).toHaveValue('user');await expect.poll(()=>feed.evaluate(el=>el.scrollTop)).toBe(200);
 await page.getByRole('button',{name:'Open Files',exact:true}).click();await expect(page.locator('.a-collaboration-panel')).toHaveAttribute('data-mode','pinned');
 await page.getByRole('button',{name:'Open Comments',exact:true}).click();await expect(group).toHaveValue('user');
 await page.getByRole('button',{name:'Open collaboration in full view',exact:true}).click();await expect.poll(()=>feed.evaluate(el=>Math.round(-el.getBoundingClientRect().top))).toBe(200);
});

for (const width of [1440, 390]) test(`returning from Files to the first Overview section reveals the header (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await mount(page, ["comments", "attachments"], true);
  // Ensure both navigation destinations have enough page content to scroll.
  await page.addStyleTag({ content: '[data-detail-section] { min-height: 900px; } .a-collaboration-panel { min-height: 1200px; }' });
  await page.getByRole('button', { name: 'Open Files', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.locator('summary[aria-label="Overview sections"]').click();
  await page.getByRole('menuitem', { name: 'Identity', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('[data-detail-section="identity"]')).toBeFocused();
  await page.getByRole('button', { name: 'Open Files', exact: true }).click();
  await page.locator('summary[aria-label="Overview sections"]').click();
  await page.getByRole('menuitem', { name: 'Audit', exact: true }).click();
  await expect(page.locator('[data-detail-section="audit"]')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
});

test('Files side panel scrolls discovery with results and keeps the dock fixed',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await mount(page,['comments','attachments'],true);
 await page.evaluate(()=>{(window as any).writable=true;(window as any).commentItems=Array.from({length:25},(_,i)=>({id:`file-${i}`,fileName:`Document ${i}.txt`,displayName:`Document ${i}.txt`,contentType:'text/plain',sizeBytes:64,status:'active',createdAt:'2026-09-28T00:00:00Z'}));});
 await page.getByRole('button',{name:'Open Files',exact:true}).click();await page.getByRole('button',{name:'Open Collaboration in side view',exact:true}).click();
 const results=page.locator('.a-files-scroll-area'),dock=page.locator('.a-files-action-dock');await expect(dock).toBeInViewport();
 const filterBefore=(await page.locator('.a-files-discovery-controls').boundingBox())!;
 const before=await dock.boundingBox();await results.evaluate(n=>{n.scrollTop=300;});expect(await results.evaluate(n=>n.scrollTop)).toBeGreaterThan(0);
 const after=await dock.boundingBox();expect(Math.abs(before!.y-after!.y)).toBeLessThan(1);
 expect((await page.locator('.a-files-discovery-controls').boundingBox())!.y).toBeLessThan(filterBefore.y-100);
 await expect(results).toHaveCSS('scrollbar-width','thin');
});

for (const width of [390, 768, 1440]) for (const theme of ['light','dark']) test(`toolbar-first record tools avoid repeated chrome at ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});await mount(page,['comments','attachments'],true);
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;(window as any).writable=true;},theme);
 await page.getByRole('button',{name:'Open Comments',exact:true}).click();
 const panel=page.locator('.a-collaboration-panel');
 await expect(panel).toHaveAttribute('data-toolbar-first','true');
 await expect(panel.locator('.a-panel-header,.a-panel-context')).toHaveCount(0);
 await expect(panel.locator('.a-comment-filters [data-panel-action=new]')).toHaveCount(0);
 await expect(panel.locator('.a-comment-compose-dock')).toBeVisible();
 await expect(panel.locator('.a-comment-compose-dock').getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 const dockBox=(await panel.locator('.a-comment-compose-dock').boundingBox())!;
 expect(dockBox.y+dockBox.height).toBeGreaterThan(820);

 const scopes=await panel.locator('.a-comment-filters > [role=group] > button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));
 expect(Math.max(...scopes)-Math.min(...scopes)).toBeLessThan(1);
 if(width>1100){
   const sorting=(await panel.locator('.a-comment-view-options').boundingBox())!;
   const commands=(await panel.locator('.a-comment-view-controls').boundingBox())!;
   expect(commands.x-(sorting.x+sorting.width)).toBeLessThanOrEqual(20);
 }
 await page.screenshot({path:`/tmp/comment-toolbar-${width}-${theme}.png`});

 await panel.locator('[data-action-dock-trigger]:visible').click();
 await page.getByRole('button',{name:'Minimize composer',exact:true}).click();
 await expect(panel.locator('.a-comment-compose-dock')).toBeFocused();
 await panel.locator('[data-action-dock-trigger]:visible').click();
 await page.locator('[contenteditable=true]').first().fill('Keep this draft');
 await page.getByRole('button',{name:'Minimize composer',exact:true}).click();
 await expect(page.locator('[contenteditable=true]').first()).toHaveText('Keep this draft');
 await page.getByRole('button',{name:'Open Files',exact:true}).click();
 await expect(panel.locator('.a-panel-header,.a-panel-context')).toHaveCount(0);
 await expect(panel.locator('[data-action-dock-trigger]:visible')).toHaveCount(1);
 await expect(panel.locator('.a-files-action-dock')).toBeVisible();
 if(width>1100){
   await panel.locator('[data-panel-action=fullView]').click();
   await expect(panel.locator('.a-panel-header')).toHaveCount(1);
   await expect(panel.locator('.a-panel-context')).toHaveCount(1);
   await expect(panel.locator('.a-collaboration-panel__tabs')).toBeHidden();
   await expect(panel.locator('[data-action-dock-trigger]:visible')).toHaveCount(1);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/record-tools-${width}-${theme}.png`});
});
