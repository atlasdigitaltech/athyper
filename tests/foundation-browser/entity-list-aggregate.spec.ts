import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";
import { chooseOption } from "./fixtures/choice";

// Real shared list runtime + real Neon CSS with a deterministic API fixture
// (Entity list Aggregate blueprint, A1 on synthetic fixtures). The fixture
// plays the server's part for a Summary request: it groups the admitted
// records, computes each group and the parent total from base rows, withholds
// a semi-additive sum across its time field unless that field is grouped by
// value or pinned by an eq filter, and withholds an average below its floor.
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const uuid=(group,i)=>'6a1b2c3d-4e5f-4a6b-8c'+group+'-'+String(100000000000+i).slice(-12);
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:['eq','in','is_null','gte','lt'],sortable:true,groupable:true,aggregations:[],...extra});
    const accounts=[['1000','Cash'],['2000','Payables'],['3000','Revenue']].map(([code,name],i)=>({id:uuid('7d',i),label:code+' '+name}));
    const periods=['P01','P02','P03'];
    // One balance per account and period; account 3000 has only P03, with a
    // single preparer, so its salary average falls below the floor of 3.
    const facts=[];
    accounts.forEach((account,a)=>periods.forEach((period,p)=>{
      if(a===2&&p<2)return;
      const net=(a+1)*100+p*10;
      facts.push({id:uuid('9d',a*10+p),values:{code:'TB-'+(a*10+p),account:account.id,period,posted:'2026-0'+(p+1)+'-28',currency:'MYR',
        period_net:String(net)+'.00',closing_net:String(net*(p+1))+'.00',salary:String(1000+a*100+p*10)+'.00',preparer:['ana','ben','cy'][(a+p)%3]}});
    }));
    const lineFields=[field('code','Code','string',{groupable:false}),field('account','GL account','reference',{filterOptions:accounts.map(a=>({value:a.id,label:a.label}))}),
      field('period','Fiscal period','enum',{filterOptions:periods.map((value,i)=>({value,label:'Period '+(i+1)}))}),field('posted','Posted on','date'),
      field('currency','Currency','string',{groupable:false}),field('period_net','Period net','money',{groupable:false,aggregations:['count','sum']}),field('closing_net','Closing net','money',{groupable:false,aggregations:['count','sum'],sumWithin:[{key:'period',label:'Fiscal period'}]}),
      field('salary','Salary','decimal',{groupable:false}),field('preparer','Preparer','string',{groupable:false})];
    const aggregate={
      dimensions:[{field:'account',label:'GL account'},{field:'period',label:'Fiscal period'},{field:'posted',label:'Posted on',buckets:['month','quarter']}],
      measures:[{key:'count',aggregate:'count'},
        {key:'period_net:sum',aggregate:'sum',field:'period_net',label:'Period net',valueKind:'money',currencyField:'currency'},
        {key:'closing_net:sum',aggregate:'sum',field:'closing_net',label:'Closing net',valueKind:'money',currencyField:'currency',timeFields:[{key:'period',label:'Fiscal period'}]},
        {key:'salary:average',aggregate:'average',field:'salary',label:'Salary',valueKind:'decimal',minimumGroupSize:3},
        {key:'preparer:countDistinct',aggregate:'countDistinct',field:'preparer',label:'Preparer',valueKind:'string'}],
      defaults:{rows:['account','period'],measures:['count','period_net:sum','closing_net:sum','salary:average']}};
    const descriptor={schemaVersion:1,plane:'neon',
      entity:{code:'trial_balance',label:'Trial balance line',pluralLabel:'Trial balance lines',identityField:'code'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:'Trial balance',defaultState:{filters:[],sort:[{field:'code',direction:'asc'}],columns:['code','period','period_net','closing_net'],density:'comfortable',mode:'aggregate'},
        supportedModes:['table','aggregate'],aggregate,search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true}},
      fields:lineFields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:25,allowedPageSizes:[25,50],maxSortLevels:2,countMode:'exact'}};
    const envelope=(extra)=>({schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:[],...extra});
    const filters=q=>[].concat(q.filter??[]).map(f=>JSON.parse(f));
    const decimal=n=>n.toFixed(2);
    // The server's totals, from base rows.
    const totals=(rows,measures,pinned,grouped)=>{
      const out={count:rows.length,aggregates:{},aggregateCurrencies:{},states:{}};
      for(const key of measures){const [f,fn]=key.split(':');
        if(fn==='countDistinct'){out.aggregates[key]=new Set(rows.map(r=>r.values[f])).size;continue;}
        if(key==='closing_net:sum'&&!(pinned.has('period')||grouped==='period')){out.states[key]='notSummable';continue;}
        if(key==='salary:average'&&rows.length<3){out.states[key]='suppressed';continue;}
        const values=rows.map(r=>Number(r.values[f]));const sum=values.reduce((a,b)=>a+b,0);
        out.aggregates[key]=fn==='sum'?Number(decimal(sum)):Number(decimal(sum/values.length));
        if(f!=='salary')out.aggregateCurrencies[key]='MYR';}
      for(const k of ['aggregates','aggregateCurrencies','states'])if(!Object.keys(out[k]).length)delete out[k];
      return out;};
    window.summaryRequests=[];
    const client={request:async(op,options)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.summaryRequests.push(q);
      let rows=facts;const applied=filters(q);
      for(const f of applied){
        if(f.operator==='eq')rows=rows.filter(r=>r.values[f.field]===f.value);
        if(f.operator==='is_null')rows=rows.filter(r=>r.values[f.field]==null);
        if(f.operator==='gte')rows=rows.filter(r=>r.values[f.field]>=f.value);
        if(f.operator==='lt')rows=rows.filter(r=>r.values[f.field]<f.value);
      }
      if(q.groupsOnly&&q.totals){
        const [group,unit]=q.group.split(':');const measures=[].concat(q.aggregate??[]);
        const pinned=new Set(applied.filter(f=>f.operator==='eq').map(f=>f.field));
        const keyOf=r=>unit?r.values[group].slice(0,7):r.values[group];
        const buckets=new Map();for(const r of rows)buckets.set(keyOf(r),[...(buckets.get(keyOf(r))??[]),r]);
        const label=v=>accounts.find(a=>a.id===v)?.label??v;
        return envelope({groups:[...buckets].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([value,members])=>({value,label:label(value),...totals(members,measures,pinned,unit?undefined:group)})),
          parentGroup:totals(rows,measures,pinned,undefined),pagination:{pageSize:0,hasNext:false,hasPrevious:false,total:rows.length,countMode:'exact'}});}
      // Grouped Table: the same server rule for its sums (decision 8).
      if(q.groupsOnly){
        const group=q.group;const measures=[].concat(q.aggregate??[]);
        const pinned=new Set(applied.filter(f=>f.operator==='eq').map(f=>f.field));
        const buckets=new Map();for(const r of rows)buckets.set(r.values[group],[...(buckets.get(r.values[group])??[]),r]);
        const label=v=>accounts.find(a=>a.id===v)?.label??v;
        return envelope({groups:[...buckets].map(([value,members])=>({value,label:label(value),...totals(members,measures,pinned,group)})),
          pagination:{pageSize:0,hasNext:false,hasPrevious:false,total:rows.length,countMode:'exact'}});}
      const start=q.cursor?Number(q.cursor):0,limit=Number(q.limit),slice=rows.slice(start,start+limit),more=start+limit<rows.length;
      return envelope({rows:slice,pagination:{pageSize:slice.length,hasNext:more,...(more?{nextCursor:String(start+limit)}:{}),hasPrevious:false,total:rows.length,countMode:'exact'}});
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode="trial_balance"/>);
  `,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
type Request = { filter?: string[] | string; limit?: number | string; group?: string; groupsOnly?: string; totals?: string; aggregate?: string[] | string };

async function mount(page: Page, width: number, path = "") {
  await page.setViewportSize({ width, height: 1000 });
  await page.route("https://list.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body><div id="root" style="padding:clamp(var(--a-space-6),3vw,var(--a-space-10))"></div></body></html>`,
    }),
  );
  await page.goto(`https://list.test/lines${path}`);
  await page.addStyleTag({ content: planeStyles("neon") + "\nbody{margin:0}*{box-sizing:border-box}" });
  await page.addScriptTag({ content: script });
}
const requests = (page: Page) => page.evaluate(() => (window as unknown as { summaryRequests: Request[] }).summaryRequests);
const summaries = async (page: Page) => (await requests(page)).filter((request) => request.totals === "true");
const region = (page: Page) => page.getByRole("region", { name: "Summary" });
const parsedFilters = (request: Request) => [].concat((request.filter ?? []) as never).map((item: string) => JSON.parse(item));

test("opening costs one Summary request and shows the total first, with withheld values as text", async ({ page }) => {
  await mount(page, 1440);
  const grid = region(page).getByRole("treegrid");
  await expect(grid).toBeVisible();
  await expect(grid.locator("tbody tr[aria-level='1']")).toHaveCount(3);
  const issued = await summaries(page);
  expect(issued).toHaveLength(1);
  expect(issued[0]!.group).toBe("account");
  expect(issued[0]!.groupsOnly).toBe("true");
  // The record count is every group's own; only the other measures are asked for.
  expect([].concat(issued[0]!.aggregate as never)).toEqual(["period_net:sum", "closing_net:sum", "salary:average"]);
  // The list's own page query stays at its smallest, to keep its authority check.
  expect((await requests(page)).filter((request) => request.totals !== "true").every((request) => Number(request.limit) === 1)).toBe(true);
  await expect(grid.locator("tbody tr").first()).toContainText("Total");
  const text = await region(page).innerText();
  expect(text).toMatch(/1000 Cash/);
  expect(text).toMatch(/Not summed across Fiscal period/);
  expect(text).toMatch(/Too few records/);
  expect(Number(await region(page).getAttribute("data-aggregate-requests"))).toBe(1);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-wide.png", fullPage: true });
});

test("expanding sends one request with the ancestor's value; the keyboard moves and expands rows", async ({ page }) => {
  await mount(page, 1440);
  const grid = region(page).getByRole("treegrid");
  const first = grid.locator("tbody tr[aria-level='1']").first();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  const children = grid.locator("tbody tr[aria-level='2']");
  await expect(children).toHaveCount(3);
  // Grouped by the time field, each period's balance sums.
  await expect(children.first()).toContainText("Period 1");
  await expect(children.first()).not.toContainText("Not summed");
  const issued = await summaries(page);
  expect(issued).toHaveLength(2);
  expect(issued[1]!.group).toBe("period");
  expect(parsedFilters(issued[1]!).map((filter) => filter.field)).toEqual(["account"]);
  await page.keyboard.press("ArrowDown");
  await expect(children.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(first).toBeFocused();
});

test("a row drills down to Table with exactly its filters, and Back returns to the Summary", async ({ page }) => {
  await mount(page, 1440);
  const grid = region(page).getByRole("treegrid");
  await grid.getByRole("button", { name: /Show the 3 records in 1000 Cash/ }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.locator(".a-entity-list table tbody tr")).toHaveCount(3);
  await page.goBack();
  await expect(region(page).getByRole("treegrid")).toBeVisible();
});

test("measures and row levels change through the pickers and travel in the URL", async ({ page }) => {
  await mount(page, 1440);
  await expect(region(page).getByRole("treegrid")).toBeVisible();
  await region(page).getByRole("checkbox", { name: "Distinct Preparer" }).check();
  await expect(page).toHaveURL(/aggregate\.measures=/);
  await expect(region(page).getByRole("treegrid").locator("thead th")).toHaveCount(6);
  await chooseOption(region(page).getByRole("combobox", { name: "Level 1" }), "posted:month");
  await expect(page).toHaveURL(/aggregate\.rows=posted%3Amonth/);
  await expect(region(page).getByRole("treegrid")).toContainText("February 2026");
  const last = (await summaries(page)).at(-1)!;
  expect(last.group).toBe("posted:month");
});

test("phones list one group per row with the total, and no horizontal scroll", async ({ page }) => {
  await mount(page, 390);
  const items = region(page).locator(".a-entity-aggregate__item");
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText("Total");
  await expect(region(page).locator("table")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-phone.png", fullPage: true });
});

test("grouped Table withholds a semi-additive total across its time field, in the Summary's words (decision 8)", async ({ page }) => {
  await mount(page, 1440, "?view=table&groups=account");
  const heading = page.locator(".a-entity-tree__group-row").first();
  await expect(heading).toContainText("1000 Cash");
  await expect(heading).toContainText("Closing net total Not summed across Fiscal period");
  // The additive measure keeps its number.
  await expect(heading).toContainText(/Period net total\s*330/);
  // Grouped by the time field, each period's balance is a number again.
  await page.goto("about:blank");
  await mount(page, 1440, "?view=table&groups=period");
  await expect(page.locator(".a-entity-tree__group-row").first()).not.toContainText("Not summed");
});
