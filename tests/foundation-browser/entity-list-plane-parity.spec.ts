import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "@playwright/test";

// Real shared runtime + real application CSS graphs. The API is a deterministic
// fixture: these tests do not claim live authorization/publication acceptance.
function applicationStyles(plane: string, foundationsLast = false) {
  const layout = resolve(`apps/${plane}/app/layout.tsx`);
  const imports = [...readFileSync(layout, "utf8").matchAll(/import "([^"]+\.css)"/g)].map(m => m[1]!);
  const list = "@athyper/platform-entity-list-view/styles.css";
  expect(imports.indexOf(list)).toBeGreaterThan(imports.indexOf(`@athyper/product-${plane}-shell/styles.css`));
  expect(imports.indexOf(list)).toBeGreaterThan(imports.indexOf("@athyper/platform-iam-identity-gate/styles.css"));
  if (foundationsLast) imports.splice(0, 0, ...imports.splice(imports.indexOf(list), 1));
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
    const descriptor = {
      schemaVersion:1, plane:window.testPlane,
      entity:{code:'test_record',label:'Record',pluralLabel:'Records',identityField:'code',detailRouteTemplate:'/records/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'default_list',title:'Records',defaultState:{filters:[],sort:[{field:'name',direction:'asc'}],columns:['code','name'],density:'comfortable',mode:'table'},supportedModes:['table','compact'],search:{minimumQueryLength:1},filterPresentation:{quickFields:[{field:'name',defaultOperator:'contains'}],source:'metadata',allowUserPinning:true}},
      fields:['code','name'].map((key,i)=>({key,label:i?'Name':'Code',valueKind:'string',semanticRole:i?'title':'identity',defaultVisible:true,defaultOrder:i,filterOperators:['contains','eq'],sortable:true,groupable:false,aggregations:[]})),
      actions:[],scope:{status:'ready',labels:[],fingerprint:'scope'},limits:{defaultPageSize:10,allowedPageSizes:[10,25],maxSortLevels:2,countMode:'none'}
    };
    window.listQueries=[];
    const client={request:async(op,input)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op===entityListOperation){window.listQueries.push(input.query);return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'scope',queryHash:'d'.repeat(64),rows:[{id:'record-1',values:{code:'A1',name:'Alpha'}}],pagination:{pageSize:10,hasNext:false,hasPrevious:false,countMode:'none'}};}
      throw Error('Unexpected fixture operation');
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode="test_record"/>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".css": "empty" }, // Application styles are loaded separately below.
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

for (const plane of ["studio", "neon", "mesh"]) {
  for (const [width, reversed] of [[1440, false], [390, false], [1440, true]] as const) {
    test(`${plane}: generic list ${width}px, foundations-last=${reversed}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("https://list.test/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
      await page.goto("https://list.test/records");
      await page.addStyleTag({ content: applicationStyles(plane, reversed) + "\nbody{margin:0}*{box-sizing:border-box}" });
      await page.evaluate(p => { (window as any).testPlane = p; }, plane);
      await page.addScriptTag({ content: script });
      await expect(page.getByText("Alpha", { exact: true }).first()).toBeVisible();
      const toolbar = page.locator(".a-entity-list__query-row");
      await expect(toolbar.locator(".a-entity-list__sort-action")).toBeHidden();
      await expect(toolbar.locator(".a-entity-list__columns-action")).toBeHidden();
      const search = page.getByRole("searchbox");
      await expect(search).toBeVisible();
      await expect(toolbar.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
      await expect(toolbar.getByRole("button", { name: "Controls", exact: true })).toBeVisible();
      for (const item of [toolbar, search, toolbar.locator(".a-entity-list__toolbar-actions")]) {
        const box = (await item.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      if (width > 1000) {
        const boxes = await Promise.all([search, toolbar.locator(".a-entity-list__view-trigger"), toolbar.getByRole("button", {name:"Controls",exact:true})].map(x => x.boundingBox()));
        const centers = boxes.map(b => b!.y + b!.height / 2);
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2);
      }
      await search.fill("Alpha");
      await search.press("Enter");
      await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).listQueries.at(-1)))).toContain("Alpha");
      await toolbar.getByRole("button", { name: "Filters", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByLabel(/^Value for Name filter/).fill("Beta");
      await page.getByRole("dialog").getByRole("button", { name: /Apply filters|Show results/ }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).listQueries.at(-1)))).toContain("Beta");
      await toolbar.getByRole("button", { name: "Controls", exact: true }).click();
      await page.getByRole("menuitem", { name: /^Sort/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByLabel("Direction for sort 1").selectOption("desc");
      await page.getByRole("button", { name: "Apply sort", exact: true }).click();
      await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).listQueries.at(-1)))).toContain("desc");
      await toolbar.getByRole("button", { name: "Controls", exact: true }).click();
      await page.getByRole("menuitem", { name: /^Columns/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      if (width > 1000) {
        await page.getByRole("columnheader", { name: /^Name/ }).getByRole("button", { name: /^Name, sorted/ }).click();
        // Header sorting cycles ascending -> descending -> unsorted.
        await expect.poll(() => page.evaluate(() => (window as any).listQueries.at(-1).sort)).toBeUndefined();
      }
    });
  }
}
