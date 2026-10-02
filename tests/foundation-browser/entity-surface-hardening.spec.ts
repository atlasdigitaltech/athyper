import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { withSessionDefaults } from "./fixtures/session-stub";
const bundle = build({
  stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {CompiledEntitySectionContent} from './packages/platform/entity/runtime/form-detail/src/compiled-section-content';
    import {SurfaceErrorBoundary} from './packages/platform/foundation/ui/src/surface-error-boundary';
    import {readBrowserStorage,writeBrowserStorage,removeBrowserStorage} from './packages/platform/foundation/ui/src/browser-storage';
    import {attachmentCapabilityUrl} from './packages/platform/communications/collaboration-ui/src/index';
    window.storageCheck=()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw Error('storage denied')}});writeBrowserStorage('key','value');removeBrowserStorage('key');return readBrowserStorage('key');};
    window.validatePreview=url=>attachmentCapabilityUrl(url,{isolatedFromOrigin:location.origin}).href;
    function Child(){if(window.crash)throw Error('SECRET INTERNAL DETAILS');return <p>Healthy content</p>}
    function App(){const [revision,setRevision]=useState(0);return <><button onClick={()=>{window.crash=false;setRevision(revision+1)}}>Change record</button><SurfaceErrorBoundary resetKey={String(revision)} message='Content unavailable' retryLabel='Retry'><Child/></SurfaceErrorBoundary><p>Healthy sibling</p><CompiledEntitySectionContent resource={{sectionKey:'test',presentation:{rendererKey:'platform.'+window.kind+'.v1',fields:[],childCollections:[]},data:window.data}}/></>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  loader: { ".css": "empty" }, tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "session", setup(builder) {
    builder.onResolve({filter:/^@athyper\/platform-shell-app-foundation$/},()=>({path:"session",namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents: withSessionDefaults(`export const useApiClient=()=>({request:async()=>({})});export const useSessionIdentity=()=>({scope:{tenantId:'tenant',principalId:'actor',authEpoch:1}});export const useToasts=()=>({push:()=>{}});export const useOptionalAppearanceProfile=()=>undefined;export const readBrowserCsrfToken=()=>undefined;export const ErrorSurface=()=>null;`)}));
  }}],
}).then(result=>result.outputFiles[0]!.text);
async function mount(page:import("@playwright/test").Page,kind:string,data:unknown,crash=false){
  await page.route("https://surface.test/**",route=>route.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));
  await page.goto("https://surface.test/");
  await page.evaluate(value=>Object.assign(window,value),{kind,data,crash});
  await page.addScriptTag({content:await bundle});
}
for(const kind of ["comments","attachments"]) {
  test(`${kind}: isolates malformed rows and keeps valid content`,async({page})=>{
    await mount(page,kind,{items:[null,{id:"bad",text:42,fileName:42},{id:"valid",text:"Valid comment",fileName:"valid-document.pdf"}]});
    await expect(page.getByRole("status")).toContainText("could not be displayed");
    await expect(page.getByText(kind==="comments"?"Valid comment":"valid-document.pdf",{exact:true})).toBeVisible();
  });
  test(`${kind}: rejects malformed envelope instead of treating it as empty`,async({page})=>{
    await mount(page,kind,{items:{id:"invalid"}});
    await expect(page.getByText("Healthy sibling")).toBeVisible();
    await expect(page.getByText("collaboration.invalidResponseTitle")).toHaveCount(0);
    await expect(page.getByText("Content could not be displayed",{exact:true})).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });
}
test("surface failure is contained, safe and reset when record changes",async({page})=>{
  await mount(page,"comments",{items:[]},true);
  await expect(page.getByRole("alert")).toContainText("Content unavailable");
  await expect(page.getByText("Healthy sibling")).toBeVisible();
  await expect(page.getByText("SECRET INTERNAL DETAILS")).toHaveCount(0);
  await page.getByRole("button",{name:"Change record"}).click();
  await expect(page.getByText("Healthy content")).toBeVisible();
});
test("storage failure is harmless and preview URL is canonical and isolated",async({page})=>{
  await mount(page,"comments",{items:[]});
  expect(await page.evaluate(()=>(window as any).storageCheck())).toBeNull();
  expect(await page.evaluate(()=>(window as any).validatePreview("https://FILES.test:443/a.pdf"))).toBe("https://files.test/a.pdf");
  for(const url of ["javascript:alert(1)","http://files.test/a.pdf","https://surface.test/a.pdf"]){
    expect(await page.evaluate(url=>{try{(window as any).validatePreview(url);return false;}catch{return true;}},url)).toBe(true);
  }
});
