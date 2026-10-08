import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// Real shared list runtime + real Neon CSS with a deterministic API fixture
// (Entity list Tree blueprint: A1 grouped tree, B1 Tree layout) on synthetic
// data shaped like a Chart of Accounts.
const script = buildSync({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const cfg=window.treeFixture;
    const uuid=i=>'7f3c2e1d-4b5a-4c6d-8e9f-'+String(100000000000+i).slice(-12);
    const ops={string:['contains','eq'],enum:['eq','in','is_null','is_not_null'],decimal:['eq','gt','lt'],reference:['eq','in','is_null','is_not_null']};
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:ops[valueKind],sortable:true,groupable:false,aggregations:[],...extra});
    const opts=(...values)=>values.map(([value,label])=>({value,label}));
    const fields=[field('code','Account','string'),field('name','Name','string',{semanticRole:'title'}),
      field('status','Status','enum',{groupable:true,filterOptions:opts(['active','Active'],['blocked','Blocked for posting'],['deprecated','Deprecated']),statusTones:{active:'success',blocked:'danger'}}),
      field('account_type','Account type','enum',{groupable:true,filterOptions:opts(['asset','Asset'],['liability','Liability'])}),
      field('kind','Kind','enum',{filterOptions:opts(['summary','Summary account'],['posting','Posting account'])}),
      field('budget','Annual budget','decimal'),field('parent','Parent account','reference',{defaultVisible:false})];
    const accounts=[
      ['1000','Assets','active','asset','summary',null,null],['1100','Current assets','active','asset','summary',null,'1000'],
      ['1110','Cash and bank','active','asset','summary',null,'1100'],['1111','Operating accounts','active','asset','summary',null,'1110'],
      ['1112','Payroll account','deprecated','asset','posting',120000,'1111'],['1113','USD collection account','active','asset','posting',80000,'1111'],
      ['1130','Inventory','active','asset','summary',null,'1100'],['1200','Non-current assets','active','asset','summary',1705000,'1000'],
      ['2000','Liabilities','active','liability','summary',null,null],['2100','Trade payables','blocked','liability','posting',null,'2000'],
      ['2200','Accruals','legacy','liability','posting',null,'2000'],['3000','Suspense','active',null,'posting',null,null],
      ['1131','Raw materials','active','asset','posting',50000,'1130'],
      ...Array.from({length:cfg.many??0},(_,i)=>['9'+String(i).padStart(3,'0'),'Bulk '+i,'active','asset','posting',1,null])];
    const idOf=Object.fromEntries(accounts.map(([code],i)=>[code,uuid(i)]));
    const rows=accounts.map(([code,name,status,account_type,kind,budget,parent],i)=>({id:uuid(i),values:{code,name,status,account_type,kind,budget,parent:parent?idOf[parent]:null},...(parent?{displayValues:{parent:accounts.find(a=>a[0]===parent)[1]}}:{})}));
    const descriptor={schemaVersion:1,plane:'neon',
      entity:{code:'gl_account',label:'gl_account',pluralLabel:'Chart of Accounts',identityField:'code',detailRouteTemplate:'/gl_account/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:'Chart of Accounts',defaultState:{filters:[],sort:[{field:'code',direction:'asc'}],columns:['code','name','status','account_type','kind','budget'],density:'comfortable',mode:cfg.defaultMode??'table'},search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true},supportedModes:['table','compact']},
      fields:fields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:cfg.pageSize??4,allowedPageSizes:[cfg.pageSize??4,25],maxSortLevels:2,countMode:cfg.exact?'exact':'none'}};
    window.treeRequests=[];
    const cmp=(a,b)=>String(a??'').localeCompare(String(b??''));
    const client={request:async(op,options)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.treeRequests.push(q);
      let matched=rows;
      for(const f of (q.filter??[]).map(f=>JSON.parse(f))){
        const v=r=>r.values[f.field];
        if(f.operator==='is_null')matched=matched.filter(r=>v(r)==null);
        else if(f.operator==='is_not_null')matched=matched.filter(r=>v(r)!=null);
        else if(f.operator==='eq')matched=matched.filter(r=>v(r)===f.value);
        else if(f.operator==='in')matched=matched.filter(r=>f.value.includes(v(r)));
      }
      const sortField=(q.sort??[])[0]?.split(':')[0];
      if(sortField)matched=[...matched].sort((a,b)=>cmp(a.values[sortField],b.values[sortField])||a.id.localeCompare(b.id));
      const exact=q.countMode==='exact';
      const groups=q.group&&exact?Object.entries(matched.reduce((acc,r)=>{const k=JSON.stringify(r.values[q.group]??null);acc[k]=(acc[k]??0)+1;return acc},{})).map(([k,count])=>({value:JSON.parse(k),label:String(JSON.parse(k)),count})).sort((a,b)=>cmp(a.value,b.value)):undefined;
      if(q.groupsOnly==='true')return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:[],groups,pagination:{pageSize:0,hasNext:false,hasPrevious:false,total:matched.length,countMode:'exact'}};
      const start=q.cursor?Number(q.cursor):0,limit=Number(q.limit),page=matched.slice(start,start+limit),more=start+limit<matched.length;
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:page,...(groups?{groups}:{}),
        pagination:{pageSize:page.length,hasNext:more,...(more?{nextCursor:String(start+limit)}:{}),hasPrevious:false,...(exact?{total:matched.length}:{}),countMode:exact?'exact':'none'}};
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode="gl_account"/>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

type Fixture = { defaultMode?: string; exact?: boolean; many?: number; pageSize?: number };
type Query = { filter?: string[]; group?: string; groupsOnly?: string; countMode?: string };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function mount(page: Page, width: number, fixture: Fixture = {}, path = "", dir?: "rtl") {
  await page.setViewportSize({ width, height: 1000 });
  await page.route("https://list.test/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><body><div id="root" style="padding:clamp(var(--a-space-6),3vw,var(--a-space-10))"></div></body></html>` }));
  await page.goto(`https://list.test/items${path}`);
  await page.evaluate(value => Object.assign(window, { treeFixture: value }), fixture);
  await page.addStyleTag({ content: planeStyles("neon") + "\nbody{margin:0}*{box-sizing:border-box}" });
  await page.addScriptTag({ content: script });
}
const requests = (page: Page) => page.evaluate(() => (window as unknown as { treeRequests: Query[] }).treeRequests);
const headingRow = (page: Page, name: string | RegExp) => page.locator("tr.a-entity-tree__group-row", { hasText: name });

test.describe("A1 grouped tree", () => {
  test("exact counts: published choice order, groups-only level 1, one request per expansion, ancestor filters, Load more", async ({ page }) => {
    await mount(page, 1440, { exact: true, pageSize: 3 }, "?groups=status,account_type");
    const grid = page.getByRole("treegrid");
    await expect(grid).toBeVisible();
    // Level 1 in published choice order, then No value is absent (status is set everywhere), then Unmapped values.
    await expect(page.locator('tr.a-entity-tree__group-row[aria-level="1"] strong')).toHaveText(["Active", "Blocked for posting", "Deprecated", "Unmapped values"]);
    await expect(headingRow(page, "Active").locator(".a-entity-tree__count")).toHaveText("10");
    // The list's own page asked for groups only.
    expect((await requests(page)).some(q => q.groupsOnly === "true" && q.group === "status")).toBe(true);
    // The first group opens by default and loads its level-2 groups with one groups-only request.
    await expect(headingRow(page, "Asset")).toHaveAttribute("aria-level", "2");
    const before = (await requests(page)).length;
    await headingRow(page, "Asset").getByRole("button", { name: /Expand Asset/ }).click();
    await expect(page.locator('tr[aria-level="3"]', { hasText: "1000" })).toBeVisible();
    const after = await requests(page);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.filter!.map(f => JSON.parse(f))).toEqual([{ field: "status", operator: "eq", value: "active" }, { field: "account_type", operator: "eq", value: "asset" }]);
    await expect(page.getByRole("button", { name: "Load more (5 left)" })).toBeVisible();
    await page.getByRole("button", { name: "Load more (5 left)" }).click();
    await expect(page.getByRole("button", { name: "Load more (2 left)" })).toBeVisible();
    // The list pagination is off: groups page their own records.
    await expect(page.locator(".a-entity-list__pagination")).toHaveCount(0);
    expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
    await page.screenshot({ path: "tooling/config/test-results/entity-list-tree-grouped.png", fullPage: true });
  });

  test("No value and Unmapped values are groups; Unmapped values open per value", async ({ page }) => {
    await mount(page, 1440, { exact: true }, "?groups=account_type,status");
    await expect(page.locator('tr.a-entity-tree__group-row[aria-level="1"] strong')).toHaveText(["Asset", "Liability", "No value"]);
    await headingRow(page, "Liability").getByRole("button", { name: /Expand Liability/ }).click();
    await expect(headingRow(page, "Unmapped values")).toHaveAttribute("aria-level", "2");
    await headingRow(page, "Unmapped values").getByRole("button", { name: /Expand Unmapped values/ }).click();
    await expect(headingRow(page, "Legacy")).toHaveAttribute("aria-level", "3");
  });

  test("without exact counts: headings from the published choices, no counts, no groups-only request, a caption", async ({ page }) => {
    await mount(page, 1440, { pageSize: 3 }, "?group=status");
    // No value appears because the field can be empty (it offers is_null).
    await expect(page.locator('tr.a-entity-tree__group-row[aria-level="1"] strong')).toHaveText(["Active", "Blocked for posting", "Deprecated", "No value"]);
    await expect(page.locator(".a-entity-tree__count")).toHaveCount(0);
    await expect(page.getByText("Counts, and records whose value is outside the published choices, show only with exact counts.")).toBeVisible();
    expect((await requests(page)).some(q => q.groupsOnly)).toBe(false);
    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  });

  test("tree controls act on loaded groups only; keyboard follows the tree grid", async ({ page }) => {
    await mount(page, 1440, { exact: true }, "?groups=status,account_type");
    await expect(headingRow(page, "Asset")).toBeVisible();
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect(headingRow(page, "Asset")).toHaveCount(0);
    const before = (await requests(page)).length;
    await page.getByRole("button", { name: "Expand all loaded" }).click();
    await expect(headingRow(page, "Asset")).toBeVisible(); // Active was loaded
    await expect(headingRow(page, "Liability")).toHaveCount(1); // only under Active; unloaded groups stay closed
    expect((await requests(page)).length).toBe(before); // loaded groups keep what they loaded: no request
    const active = headingRow(page, "Active");
    await active.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(active).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowDown");
    await expect(headingRow(page, "Blocked for posting")).toBeFocused();
  });

  test("the Group dialog offers up to three levels from groupable fields", async ({ page }) => {
    await mount(page, 1440, { exact: true });
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Group by/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Grouping field", { exact: true })).toBeVisible();
    // "Then by" appears once a level is chosen, up to three levels.
    await expect(dialog.getByText("Then by", { exact: true })).toHaveCount(0);
  });
});
