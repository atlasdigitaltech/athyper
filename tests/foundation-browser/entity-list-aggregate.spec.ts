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
    // The ranked tests opt into a larger fixture (window.summaryFixture), as
    // the Gantt spec does, so the shared three accounts stay as every other
    // test asserts them: 40 more one-record accounts and one No value record.
    const extended=Boolean(window.summaryFixture&&window.summaryFixture.extended);
    const accounts=[['1000','Cash'],['2000','Payables'],['3000','Revenue'],...(extended?Array.from({length:40},(_,i)=>[String(4000+i*10),'Sundry '+(i+1)]):[])].map(([code,name],i)=>({id:uuid('7d',i),label:code+' '+name}));
    const periods=['P01','P02','P03'];
    // One balance per account and period; account 3000 has only P03, with a
    // single preparer, so its salary average falls below the floor of 3.
    const facts=[];
    accounts.forEach((account,a)=>periods.forEach((period,p)=>{
      if(a===2&&p<2)return;
      if(a>2&&p>0)return;
      const net=a>2?100+(a-3)*5:(a+1)*100+p*10;
      facts.push({id:uuid('9d',a*10+p),values:{code:'TB-'+(a*10+p),account:account.id,period,posted:'2026-0'+(p+1)+'-28',currency:'MYR',
        period_net:String(net)+'.00',closing_net:String(net*(p+1))+'.00',salary:String(1000+a*100+p*10)+'.00',preparer:['ana','ben','cy'][(a+p)%3]}});
    }));
    if(extended)facts.push({id:uuid('9d',999),values:{code:'TB-NONE',account:null,period:'P01',posted:'2026-01-28',currency:'MYR',period_net:'5.00',closing_net:'5.00',salary:'900.00',preparer:'ana'}});
    const lineFields=[field('code','Code','string',{groupable:false}),field('account','GL account','reference',{filterOptions:accounts.map(a=>({value:a.id,label:a.label}))}),
      field('period','Fiscal period','enum',{filterOptions:periods.map((value,i)=>({value,label:'Period '+(i+1)}))}),field('posted','Posted on','date'),
      field('currency','Currency','string',{groupable:false}),field('period_net','Period net','money',{groupable:false,aggregations:['count','sum']}),field('closing_net','Closing net','money',{groupable:false,aggregations:['count','sum'],sumWithin:[{key:'period',label:'Fiscal period'}]}),
      field('salary','Salary','decimal',{groupable:false}),field('preparer','Preparer','string',{groupable:false})];
    const aggregate={
      dimensions:[{field:'account',label:'GL account'},{field:'period',label:'Fiscal period',column:true},{field:'posted',label:'Posted on',buckets:['month','quarter']}],
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
        if(key==='closing_net:sum'&&!(pinned.has('period')||[].concat(grouped).includes('period'))){out.states[key]='notSummable';continue;}
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
        const label=v=>v==null?'—':accounts.find(a=>a.id===v)?.label??v;
        // The column dimension (A2): kept values, or the first 12 in order.
        const pivot=q.pivot,given=[].concat(q.pivotValue??[]).map(v=>JSON.parse(v));
        const columns=pivot?(given.length?given:[...new Set(rows.map(r=>r.values[pivot]))].sort().slice(0,12)):undefined;
        const cellsOf=(members,groupedBy)=>columns.map(c=>{const list=members.filter(r=>r.values[pivot]===c);return list.length?totals(list,measures,pinned,[...groupedBy,pivot]):null;});
        let entries=[...buckets].sort(([a],[b])=>String(a).localeCompare(String(b)));
        // Top / Bottom N (A6), as the server ranks: the floor first (salary's
        // average needs 3 records), then the measure, then the key; No value kept.
        let ranking={};
        if(q.groupOrder){
          const at=q.groupOrder.lastIndexOf(':'),key=q.groupOrder.slice(0,at),dir=q.groupOrder.slice(at+1),limit=Number(q.groupLimit),floor=key==='salary:average'?3:0;
          const valueOf=members=>key==='count'?members.length:totals(members,[key],pinned,unit?undefined:group).aggregates?.[key]??null;
          const named=entries.filter(([value])=>value!=null),none=entries.filter(([value])=>value==null);
          const ranked=named.filter(([,members])=>members.length>=floor).map(entry=>[...entry,valueOf(entry[1])])
            .sort((a,b)=>a[2]===null?1:b[2]===null?-1:(dir==='asc'?a[2]-b[2]:b[2]-a[2])||String(a[0]).localeCompare(String(b[0])));
          entries=[...ranked.slice(0,limit).map(([value,members])=>[value,members]),...none];
          ranking={groupOrder:{key,direction:dir,limit},groupCount:ranked.length,groupsUnranked:named.length-ranked.length,...(ranked.length>limit?{groupsTruncated:true}:{}),...(ranked[limit]&&ranked[limit][2]===ranked[limit-1][2]?{groupOrderTieAtCut:true}:{})};
        }
        return envelope({groups:entries.map(([value,members])=>({value,label:label(value),...totals(members,measures,pinned,unit?undefined:group),...(columns?{cells:cellsOf(members,unit?[]:[group])}:{})})),
          parentGroup:{...totals(rows,measures,pinned,undefined),...(columns?{cells:cellsOf(rows,[])}:{})},
          ...(columns?{pivotColumns:columns.map(value=>({value,label:value}))}:{}),
          ...ranking,
          pagination:{pageSize:0,hasNext:false,hasPrevious:false,total:rows.length,countMode:'exact'}});}
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

async function mount(page: Page, width: number, path = "", dir?: "rtl", fixture?: { extended: true }) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route("https://list.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><body><div id="root" style="padding:clamp(var(--a-space-6),3vw,var(--a-space-10))"></div></body></html>`,
    }),
  );
  await page.goto(`https://list.test/lines${path}`);
  if (fixture) await page.evaluate((value) => Object.assign(window, { summaryFixture: value }), fixture);
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

test("a column dimension (A2): one request draws each period as a column with server column totals, and a cell drills down", async ({ page }) => {
  await mount(page, 1440, "?aggregate.rows=account&aggregate.column=period");
  const grid = region(page).getByRole("treegrid");
  await expect(grid.locator("thead")).toContainText("Period 1");
  await expect(grid.locator("thead")).toContainText("Period 3");
  const issued = await summaries(page);
  expect(issued).toHaveLength(1);
  expect((issued[0] as Request & { pivot?: string }).pivot).toBe("period");
  // Within a period the balance sums; across periods (the row total) it does not.
  const cash = grid.locator("tbody tr[aria-level='1']").first();
  await expect(cash).toContainText("1000 Cash");
  await expect(cash).toContainText("Not summed across Fiscal period");
  await expect(cash.locator("td").nth(2)).not.toHaveAttribute("data-state", /./);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-pivot.png", fullPage: true });
  await cash.getByRole("button", { name: /Show the 1 records in 1000 Cash, Period 1/ }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.locator(".a-entity-list table tbody tr")).toHaveCount(1);
});

test("a pivoted Summary on a phone lists each column inside its group, with no horizontal scroll", async ({ page }) => {
  await mount(page, 390, "?aggregate.rows=account&aggregate.column=period");
  const first = region(page).locator(".a-entity-aggregate__item").nth(1);
  await expect(first.locator(".a-entity-aggregate__column-block")).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
});

// ---- A5.3: Summary's chart (blueprint 13.6), on the same fixture.
const point = (page: Page, name: RegExp) => page.getByRole("img", { name });

test("Chart draws the opening response with no further request, and a point drills down to Table", async ({ page }) => {
  await mount(page, 1440, "?aggregate.view=chart");
  const chart = page.getByRole("group", { name: "Records by GL account" });
  await expect(chart).toBeVisible();
  expect(await summaries(page)).toHaveLength(1);
  await expect(point(page, /^1000 Cash, Records: 3/)).toBeVisible();
  await expect(point(page, /^3000 Revenue, Records: 1/)).toBeVisible();
  // The table's toolbar keeps its pickers; the chart adds its own, with reasons for unavailable types.
  await expect(page.locator(".a-entity-aggregate__reasons").filter({ hasText: "Line chart" })).toContainText("Line chart: A line needs a sequence");
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-chart.png" });
  await point(page, /^2000 Payables,/).click();
  await expect(page).toHaveURL(/view=table/);
  const last = (await requests(page)).at(-1)!;
  expect(parsedFilters(last)).toEqual([{ field: "account", operator: "eq", value: expect.stringMatching(UUID) }]);
});

test("the chart keyboard: one tab stop, arrows move, Enter drills down", async ({ page }) => {
  await mount(page, 1440, "?aggregate.view=chart");
  await point(page, /^1000 Cash,/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(point(page, /^2000 Payables,/)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=table/);
});

test("a phone draws the chart at full width with no horizontal scroll", async ({ page }) => {
  await mount(page, 390, "?aggregate.view=chart");
  await expect(page.getByRole("group", { name: "Records by GL account" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-chart-phone.png" });
});

test("right to left: a categorical column chart starts on the right; a month line runs earliest on the left (decision 15)", async ({ page }) => {
  await mount(page, 1440, "?aggregate.view=chart", "rtl");
  const first = await point(page, /^1000 Cash,/).boundingBox();
  const last = await point(page, /^3000 Revenue,/).boundingBox();
  expect(first!.x).toBeGreaterThan(last!.x);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-chart-rtl.png" });
  await mount(page, 1440, "?aggregate.view=chart&aggregate.rows=posted:month&aggregate.chartType=line", "rtl");
  const january = await point(page, /^January 2026,/).boundingBox();
  const march = await point(page, /^March 2026,/).boundingBox();
  expect(january!.x).toBeLessThan(march!.x);
});

// ---- A6: Top / Bottom N (blueprint 7.5), on the same fixture: account 1000
// nets 330 over three periods, 2000 nets 630, and 3000 nets 320 in one period.
const level1 = (page: Page) => region(page).locator("tbody tr[aria-level='1'] [data-tree-open]");

test("ordering rows by a measure ranks every group on the server, says All 3 … highest first, and travels in the URL", async ({ page }) => {
  await mount(page, 1440);
  await expect(region(page).getByRole("treegrid")).toBeVisible();
  // Closing net is a balance across fiscal periods: it cannot order accounts, and says why.
  await expect(region(page).locator(".a-entity-aggregate__reasons")).toContainText("Closing net total cannot order rows: it is not summed across Fiscal period");
  await chooseOption(region(page).getByRole("combobox", { name: "Order rows" }), "period_net:sum:desc");
  await expect(page).toHaveURL(/aggregate\.orderBy=period_net%3Asum/);
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toHaveText("All 3 GL account by Period net total, highest first");
  await expect(level1(page)).toHaveText(["2000 Payables", "1000 Cash", "3000 Revenue"]);
  const last = (await summaries(page)).at(-1)! as Request & { groupOrder?: string; groupLimit?: string };
  expect([last.groupOrder, last.groupLimit]).toEqual(["period_net:sum:desc", "10"]);
  // Lowest first, and a smaller limit.
  await chooseOption(region(page).getByRole("combobox", { name: "Order rows" }), "period_net:sum:asc");
  await expect(level1(page)).toHaveText(["3000 Revenue", "1000 Cash", "2000 Payables"]);
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toHaveText("All 3 GL account by Period net total, lowest first");
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-ranked.png" });
  // Back to the dimension's own order.
  await chooseOption(region(page).getByRole("combobox", { name: "Order rows" }), "");
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toHaveCount(0);
  await expect(level1(page)).toHaveText(["1000 Cash", "2000 Payables", "3000 Revenue"]);
});

test("a group below the measure's floor takes no position and is only counted", async ({ page }) => {
  await mount(page, 1440, "?aggregate.orderBy=salary%3Aaverage&aggregate.direction=desc&aggregate.top=10");
  // Account 3000 has one record, below the salary floor of 3.
  await expect(level1(page)).toHaveText(["2000 Payables", "1000 Cash"]);
  await expect(region(page)).toContainText("1 group is too small to rank.");
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toHaveText("All 2 GL account by Salary average, highest first");
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
});

test("a ranked chart follows the ranking, and a phone keeps no horizontal scroll", async ({ page }) => {
  await mount(page, 1440, "?aggregate.view=chart&aggregate.orderBy=period_net%3Asum&aggregate.direction=desc&aggregate.top=10");
  await expect(page.getByRole("group", { name: "All 3 GL account by Period net total, highest first" })).toBeVisible();
  const first = await point(page, /^2000 Payables,/).boundingBox();
  const second = await point(page, /^1000 Cash,/).boundingBox();
  expect(first!.x).toBeLessThan(second!.x);
  await mount(page, 390, "?aggregate.orderBy=period_net%3Asum&aggregate.direction=desc&aggregate.top=10");
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("on a larger fixture: Top 10 of 43, No value and the Total marked Not ranked, and a held-back group distinct from a suppressed cell", async ({ page }) => {
  await mount(page, 1440, "?aggregate.orderBy=period_net%3Asum&aggregate.direction=desc&aggregate.top=10", undefined, { extended: true });
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toHaveText("Top 10 of 43 GL account by Period net total");
  // 11 rows: ten ranked, then No value, which holds records but takes no position.
  await expect(level1(page)).toHaveCount(11);
  await expect(level1(page).first()).toHaveText("2000 Payables");
  await expect(level1(page).last()).toHaveText("No value");
  const rows = region(page).locator("tbody tr[aria-level='1']");
  await expect(rows.last().locator(".a-entity-aggregate__unranked")).toHaveText("Not ranked");
  await expect(rows.first().locator(".a-entity-aggregate__unranked")).toHaveCount(0);
  // Decision 36: the Total row stands outside the ranking and says so.
  await expect(region(page).locator(".a-entity-aggregate__total .a-entity-aggregate__unranked")).toHaveText("Not ranked");
  // Account 3000 ranks third by Period net, while its Salary average cell is
  // suppressed: the floor applies to the ordered measure only.
  const revenue = rows.filter({ hasText: "3000 Revenue" });
  await expect(revenue).toContainText("Too few records");
  await expect(region(page)).not.toContainText("too small to rank");
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-aggregate-ranked-top.png", fullPage: true });
  // Ordered by Salary average (floor 3), the one-record accounts are held
  // back: counted, never rows.
  await chooseOption(region(page).getByRole("combobox", { name: "Order rows" }), "salary:average:desc");
  await expect(region(page)).toContainText("41 groups are too small to rank.");
  await expect(region(page).locator(".a-entity-aggregate__ranking")).toHaveText("All 2 GL account by Salary average, highest first");
  await expect(level1(page)).toHaveText(["2000 Payables", "1000 Cash", "No value"]);
});

