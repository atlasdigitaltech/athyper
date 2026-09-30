import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const bundle = build({
  stdin: {
    loader: "tsx",
    resolveDir: process.cwd(),
    contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{FileSearchResults}from'./packages/platform/entity/runtime/form-detail/src/file-search';
    import{ThumbnailRecordScope}from'./packages/platform/entity/runtime/form-detail/src/thumbnail-scope';
    const hits=Array.from({length:6},(_,index)=>({attachmentId:'file-'+index,fileName:'File '+index+'.png',contentType:'image/png',snippet:'match'}));
    function App(){const[shown,setShown]=useState(true),[record,setRecord]=useState('record-a'),[epoch,setEpoch]=useState(0);
      window.testEpoch=epoch;
      return <><button onClick={()=>setShown(!shown)}>Toggle results</button><button onClick={()=>setRecord('record-b')}>Change record</button><button onClick={()=>setEpoch(epoch+1)}>Change permissions</button>
        <ThumbnailRecordScope.Provider value={record}>{shown&&<FileSearchResults search={{hits,submitted:'match',busy:false,search:()=>{},setScope:()=>{}}} canPreview canDownload={false} onPreview={()=>{window.opened=true}} onDownload={()=>{}}/>}</ThumbnailRecordScope.Provider></>}
    createRoot(document.getElementById('root')).render(<App/>);
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
      name: "session-fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /^@athyper\/platform-shell-app-foundation$/ },
          () => ({ path: "session", namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          loader: "js",
          contents: `
      const client={request:async(op,input)=>{
        window.calls++;window.active++;window.peak=Math.max(window.peak,window.active);
        try{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,80);input.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('aborted'))},{once:true})});return{state:'ready',url:'https://objects.thumbnail.test/pixel.png',contentType:'image/png',expiresAt:new Date(Date.now()+120000).toISOString()}}finally{window.active--}
      }};
      export const useApiClient=()=>client;
      export const useSessionIdentity=()=>({state:'authenticated',scope:{tenantId:'tenant',principalId:'actor',authEpoch:1}});
      export const useExperienceRevision=()=>({state:'ready',revision:'release'});
      export const usePermissions=()=>['read-'+window.testEpoch];
    `,
        }));
      },
    },
  ],
}).then((result) => result.outputFiles[0]!.text);

test("search thumbnails are bounded, reused across remounts, and isolated by record and permissions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 1800 });
  await page.route("https://thumbnail.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.route("https://objects.thumbnail.test/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6WuAAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("https://thumbnail.test/");
  await page.evaluate(() =>
    Object.assign(window, { calls: 0, active: 0, peak: 0, testEpoch: 0 }),
  );
  await page.addScriptTag({ content: await bundle });
  await expect(page.locator(".a-attachment-thumbnail img")).toHaveCount(6);
  expect(await page.evaluate(() => (window as any).peak)).toBe(3);
  expect(await page.evaluate(() => (window as any).calls)).toBe(6);
  await page.getByRole("button", { name: "Toggle results" }).click();
  await expect(page.locator(".a-attachment-thumbnail img")).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle results" }).click();
  await expect(page.locator(".a-attachment-thumbnail img")).toHaveCount(6);
  expect(await page.evaluate(() => (window as any).calls)).toBe(6);
  await page.getByRole("button", { name: "Change record" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).calls)).toBe(12);
  await expect(page.locator(".a-attachment-thumbnail img")).toHaveCount(6);
  await page.getByRole("button", { name: "Change permissions" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).calls)).toBe(18);
  await expect(page.locator(".a-attachment-thumbnail img")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Preview File 0.png", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).opened)).toBe(true);
});
