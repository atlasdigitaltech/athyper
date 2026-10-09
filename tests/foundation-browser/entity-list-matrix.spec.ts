import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// Real shared list runtime + real Neon CSS with a deterministic API fixture
// (Entity list Matrix blueprint, M1/M2 on synthetic fixtures). The fixture
// plays the server's part: it ranks every eligible participant per item and
// narrows the returned cells to `matrixColumns`, as `rankWithin` does.
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const cfg=window.matrixFixture??{};
    const uuid=(group,i)=>'6a1b2c3d-4e5f-4a6b-8c'+group+'-'+String(100000000000+i).slice(-12);
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:['eq','in'],sortable:true,groupable:false,aggregations:[],...extra});
    const page=(rows,q,extra={})=>{const start=q.cursor?Number(q.cursor):0,limit=Number(q.limit),slice=rows.slice(start,start+limit),more=start+limit<rows.length;
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:slice,
        pagination:{pageSize:slice.length,hasNext:more,...(more?{nextCursor:String(start+limit)}:{}),hasPrevious:false,...(q.countMode==='exact'?{total:rows.length}:{}),countMode:q.countMode==='exact'?'exact':'none'},...extra};};
    const filters=q=>(q.filter??[]).map(f=>JSON.parse(f));
    // 25 items under one event; 7 bids: B-3 declined, B-6 disqualified.
    const items=Array.from({length:25},(_,i)=>({id:uuid('7d',i),values:{code:'1.'+String(i+1).padStart(2,'0'),name:'Item '+(i+1),event:'ev1'}}));
    const statuses=['submitted','submitted','declined','submitted','submitted','disqualified','submitted'];
    const bids=statuses.map((status,i)=>({id:uuid('8d',i),values:{code:'B-'+(i+1),supplier:'Supplier '+(i+1),status,total:String(1000+i*10)+'.00',event:'ev1'}}));
    // B-1 skips the last item (a partial bid); B-3 declined quotes nothing.
    const facts=[];
    items.forEach((item,r)=>bids.forEach((bid,c)=>{
      if(bid.values.status==='declined'||(c===0&&r===24))return;
      const amount=c===5?'10.00':(100+((r*7+c*13)%40)).toFixed(2);
      facts.push({id:uuid('9d',r*10+c),values:{line_no:'L'+(r*10+c),event:'ev1',item:item.id,bid:bid.id,evaluated:amount,cur:'USD',lead:7+c}});
    }));
    const lineFields=[field('line_no','Line','string'),field('event','Event','reference'),field('item','Item','reference'),field('bid','Bid','reference',{groupable:true}),field('evaluated','Evaluated price','money'),field('cur','Currency','string'),field('lead','Lead days','integer')];
    const matrix={parentField:'event',parentLabel:'Event',
      rows:{field:'item',label:'Items',entity:'event_item',parentField:'event',identityField:'code',titleField:'name',searchable:true},
      columns:{field:'bid',label:'Bids',entity:'event_bid',parentField:'event',identityField:'code',titleField:'supplier',headerFields:[{key:'total',label:'Total',valueKind:'money'}],declined:{field:'status',values:['declined']},eligibility:{field:'status',values:['submitted']},order:[]},
      measures:[{key:'evaluated',label:'Evaluated price',valueKind:'money',rank:true,better:'lower',evaluation:true,currencyField:'cur'},{key:'lead',label:'Lead days',valueKind:'integer'}],
      absentLabel:'Not quoted',basisLabel:'normalized for unit and quantity',exactCounts:true};
    const descriptor={schemaVersion:1,plane:'neon',
      entity:{code:'bid_line',label:'Bid line',pluralLabel:'Bid lines',identityField:'line_no'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:'Bid lines',defaultState:{filters:[{field:'event',operator:'eq',value:'ev1'}],sort:[{field:'line_no',direction:'asc'}],columns:['line_no','evaluated'],density:'comfortable',mode:'matrix'},
        supportedModes:['table','matrix'],matrix,search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true}},
      fields:lineFields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:25,allowedPageSizes:[25,50],maxSortLevels:2,countMode:'exact'}};
    const bidFields=[field('code','Bid','string'),field('supplier','Supplier','string',{semanticRole:'title'}),field('status','Status','enum'),field('total','Total','money')];
    const bidDescriptor={...descriptor,entity:{code:'event_bid',label:'Bid',pluralLabel:'Bids',identityField:'code'},
      surface:{key:'list',title:'Bids',defaultState:{filters:[],sort:[{field:'code',direction:'asc'}],columns:['code'],density:'comfortable',mode:'table'},supportedModes:['table'],search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true},
        compare:{sections:[{key:'offer',label:'Offer',fields:[{key:'total',label:'Total',valueKind:'money'},{key:'status',label:'Status',valueKind:'enum'}]}],maxRecords:4}},
      fields:bidFields.map((f,i)=>({...f,defaultOrder:i}))};
    window.matrixRequests=[];
    const client={request:async(op,options)=>{
      const entity=options.params?.entityCode;
      if(op===entityListDescriptorOperation)return entity==='event_bid'?bidDescriptor:descriptor;
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.matrixRequests.push({entity,...q});
      if(entity==='event_item'){let rows=items;const term=q.search?.toLowerCase();if(term)rows=rows.filter(r=>r.values.name.toLowerCase().includes(term));return page(rows,q);}
      if(entity==='event_bid'){let rows=bids;if(q.recordIds)rows=rows.filter(r=>[].concat(q.recordIds).includes(r.id));return page(rows,q);}
      let rows=facts;
      for(const f of filters(q)){
        if(f.operator==='eq')rows=rows.filter(r=>r.values[f.field]===f.value);
        if(f.operator==='in')rows=rows.filter(r=>f.value.includes(r.values[f.field]));
      }
      if(q.groupsOnly){const counts=new Map();for(const r of rows)counts.set(r.values.bid,(counts.get(r.values.bid)??0)+1);
        return {...page([],{limit:1,countMode:'exact'}),pagination:{pageSize:0,hasNext:false,hasPrevious:false,total:rows.length,countMode:'exact'},groups:[...counts].map(([value,count])=>({value,label:value,count}))};}
      if(!q.rank)return page(rows,q);
      // The server's rank: every eligible participant per item, ties share a rank.
      const eligible=new Set(bids.filter(b=>b.values.status==='submitted').map(b=>b.id));
      const ranks={};
      const byItem=new Map();for(const r of rows)if(eligible.has(r.values.bid))byItem.set(r.values.item,[...(byItem.get(r.values.item)??[]),r]);
      for(const members of byItem.values()){const best=Math.min(...members.map(m=>Number(m.values.evaluated)));
        for(const m of members){const v=Number(m.values.evaluated),rank=1+members.filter(o=>Number(o.values.evaluated)<v).length;
          ranks[m.id]={rank,count:members.length,best:best.toFixed(2),...(v===best?{}:{difference:((v-best)*100/best).toFixed(1)})};}}
      const out=[].concat(q.matrixColumns??[]);
      const shown=rows.filter(r=>out.includes(r.values.bid));
      return page(shown,q,{ranks:Object.fromEntries(shown.filter(r=>ranks[r.id]).map(r=>[r.id,ranks[r.id]])),rankRevision:'e'.repeat(32)});
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode="bid_line"/>);
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
type Request = { entity: string; filter?: string[]; limit?: number | string; cursor?: string; rank?: string; matrixColumns?: string[]; groupsOnly?: string; recordIds?: string[] };

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
const requests = (page: Page) => page.evaluate(() => (window as unknown as { matrixRequests: Request[] }).matrixRequests);
const matrixSection = (page: Page) => page.getByRole("region", { name: "Matrix" });

test("one screen costs rows, columns, one cell request with ranks and one coverage count", async ({ page }) => {
  await mount(page, 1440);
  const grid = matrixSection(page).getByRole("table");
  await expect(grid).toBeVisible();
  await expect(grid.locator("tbody tr")).toHaveCount(20);
  await expect(grid.locator("thead th[scope=col]")).toHaveCount(6);
  const issued = await requests(page);
  const by = (entity: string) => issued.filter((request) => request.entity === entity);
  expect(by("event_item")).toHaveLength(1);
  expect(by("event_bid")).toHaveLength(1);
  const cells = by("bid_line").filter((request) => request.rank);
  expect(cells).toHaveLength(1);
  expect(by("bid_line").filter((request) => request.groupsOnly)).toHaveLength(1);
  // The cell request: the block as its limit, the page's columns as output
  // only, and no column filter, so the rank covers every participant.
  expect(Number(cells[0]!.limit)).toBe(100);
  expect(cells[0]!.rank).toBe("evaluated");
  expect([].concat(cells[0]!.matrixColumns as never)).toHaveLength(5);
  expect((cells[0]!.filter ?? []).map((item) => JSON.parse(item).field)).toEqual(["event", "item"]);
  const count = await matrixSection(page).getAttribute("data-matrix-requests");
  expect(Number(count)).toBe(4);
});

test("ranks, states and coverage read as text, and no identifier is drawn", async ({ page }) => {
  await mount(page, 1440);
  const region = matrixSection(page);
  await expect(region.getByRole("table")).toBeVisible();
  const text = await region.innerText();
  expect(text).toMatch(/Lowest/);
  expect(text).toMatch(/Rank \d of 5/);
  expect(text).toMatch(/Declined to participate/);
  expect(text).toMatch(/Not eligible/);
  expect(text).toMatch(/USD · normalized for unit and quantity/);
  expect(text).toMatch(/24 of 25 Items/);
  expect(text).toMatch(/Partial/);
  expect(text).toMatch(/Items 1–20 of 25/);
  expect(text).toMatch(/Bids 1–5 of 7/);
  // The declined column keeps its text in every cell for assistive technology.
  const declined = region.locator("td[data-declined]");
  await expect(declined).toHaveCount(20);
  await expect(declined.nth(7)).toHaveAttribute("aria-label", /Declined to participate/);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-matrix-wide.png", fullPage: true });
});

test("paging sideways reads only the next columns and their cells; ranks still count every participant", async ({ page }) => {
  await mount(page, 1440);
  const region = matrixSection(page);
  await expect(region.getByRole("table")).toBeVisible();
  const before = (await requests(page)).length;
  await region.getByRole("button", { name: "Next Bids" }).click();
  await expect(region).toContainText("Bids 6–7 of 7");
  await expect(region.locator("thead th[scope=col]")).toHaveCount(3);
  const after = (await requests(page)).slice(before);
  expect(after.map((request) => request.entity).sort()).toEqual(["bid_line", "event_bid"]);
  expect(after.find((request) => request.entity === "event_bid")!.cursor).toBe("5");
  // B-6 is disqualified: its cells show values but no rank, and the column says so.
  await expect(region).toContainText("Not ranked · not eligible");
  await expect(region).toContainText(/Rank \d of 5/);
  await expect(page).toHaveURL(/matrix\.cols=1/);
  // Paging down reads only the next rows and their cells.
  const mark = (await requests(page)).length;
  await region.getByRole("button", { name: "Next Items" }).click();
  await expect(region).toContainText("Items 21–25 of 25");
  const down = (await requests(page)).slice(mark);
  expect(down.map((request) => request.entity).sort()).toEqual(["bid_line", "event_item"]);
});

test("a shared link opens on its page, and pinned participants narrow the columns", async ({ page }) => {
  await mount(page, 1440, "?matrix.cols=1");
  const region = matrixSection(page);
  await expect(region).toContainText("Bids 6–7 of 7");
  await region.getByRole("button", { name: "Previous Bids" }).click();
  await expect(region).toContainText("Bids 1–5 of 7");
  await region.getByRole("checkbox", { name: "Select B-1" }).check();
  await region.getByRole("checkbox", { name: "Select B-2" }).check();
  await region.getByRole("button", { name: "Show only selected (2)" }).click();
  await expect(region.locator("thead th[scope=col]")).toHaveCount(3);
  const pinned = (await requests(page)).filter((request) => request.entity === "event_bid").at(-1)!;
  expect([].concat(pinned.recordIds as never)).toHaveLength(2);
  await expect(page).toHaveURL(/matrix\.columns=/);
});

test("Compare selected opens the column Entity's own comparison", async ({ page }) => {
  await mount(page, 1440);
  const region = matrixSection(page);
  await expect(region.getByRole("table")).toBeVisible();
  const compare = region.getByRole("button", { name: /Compare selected/ });
  await region.getByRole("checkbox", { name: "Select B-1" }).check();
  await region.getByRole("checkbox", { name: "Select B-2" }).check();
  await expect(compare).toBeEnabled();
  await compare.click();
  await expect(page.getByRole("heading", { name: /Comparing 2 Bids/ })).toBeVisible();
  const compared = (await requests(page)).filter((request) => request.entity === "event_bid" && request.recordIds).at(-1)!;
  expect([].concat(compared.recordIds as never)).toHaveLength(2);
});

test("phones show one row at a time as a list of participants", async ({ page }) => {
  await mount(page, 390);
  const region = matrixSection(page);
  await expect(region.locator(".a-entity-matrix__narrow > li")).toHaveCount(20);
  await expect(region.getByRole("table")).toHaveCount(0);
  const first = region.locator(".a-entity-matrix__narrow > li").first();
  await expect(first.getByRole("heading")).toContainText("1.01");
  await expect(first.locator("dt")).toHaveCount(5);
  // No horizontal page scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-matrix-phone.png", fullPage: true });
});
