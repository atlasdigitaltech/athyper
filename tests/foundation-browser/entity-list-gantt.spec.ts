import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// Real shared list runtime + real Neon CSS with a deterministic API fixture
// (Entity list Gantt blueprint, Phase 1 on synthetic fixtures).
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const cfg=window.ganttFixture;
    const uuid=i=>'7f3c2e1d-4b5a-4c6d-8e9f-'+String(100000000000+i).slice(-12);
    const ops={string:['contains','eq'],enum:['eq','in','is_null','is_not_null'],decimal:['eq','gt','lt'],date:['eq','gt','gte','lt','lte','between','is_null','is_not_null']};
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:ops[valueKind],sortable:true,groupable:valueKind==='enum',aggregations:[],...extra});
    const fields=[field('code','Work item','string'),field('title','Title','string',{semanticRole:'title'}),
      field('phase','Phase','enum',{filterOptions:[{value:'plan',label:'Plan'},{value:'build',label:'Build'}],statusTones:{plan:'success',build:'warning'}}),
      field('done','Done','decimal'),field('starts_on','Starts on','date'),field('ends_on','Ends on','date'),field('due_on','Due on','date')];
    const dateFields=cfg.milestones
      ?[{start:'due_on',label:'Due on',kind:'date',unscheduled:false}]
      :[{start:'starts_on',end:'ends_on',endNullable:true,label:'Starts on',kind:'date',unscheduled:true,tone:{field:'phase',tones:{plan:'success',build:'warning'}}}];
    const gantt={defaultZoom:'quarter',dateFields,group:{field:'phase',label:'Phase',choices:[{value:'plan',label:'Plan',tone:'success'},{value:'build',label:'Build',tone:'warning'}]},progress:{field:'done',label:'Done'}};
    const surface=cfg.unavailable
      ?{supportedModes:['table','compact'],unavailableModes:[{mode:'gantt',code:'LIST_GANTT_DATE_FIELD_UNAVAILABLE'}]}
      :{supportedModes:['table','compact','gantt'],gantt};
    const descriptor={schemaVersion:1,plane:'neon',
      entity:{code:'work_item',label:'work_item',pluralLabel:'Work items',identityField:'code',detailRouteTemplate:'/work_item/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:'Work items',defaultState:{filters:[],sort:[{field:'title',direction:'asc'}],columns:fields.map(f=>f.key),density:'comfortable',mode:cfg.defaultMode??'table'},search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true},...surface},
      fields:fields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:10,allowedPageSizes:[10,cfg.pageSize??25],maxSortLevels:2,countMode:cfg.exact?'exact':'none'}};
    const items=[
      ['Kickoff workshop','plan',40,'2026-10-05','2026-10-07'],
      ['One-day review','build',100,'2026-10-09','2026-10-09'],
      ['Vendor contract','build',null,'2026-09-01',null],
      ['Backlog grooming','plan',null,null,'2026-10-30'],
      ['Legacy migration','legacy',' ','2026-11-02','2026-11-20'],
      ['Unassigned audit',null,10,'2026-12-01','2027-02-15'],
      ...Array.from({length:cfg.many??0},(_,i)=>['Bulk item '+(i+1),'plan',50,'2026-10-20','2026-10-21'])];
    const rows=items.map(([title,phase,done,starts_on,ends_on],i)=>({id:uuid(i),values:{code:'WI-'+(100+i),title,phase,done,starts_on,ends_on,due_on:starts_on}}));
    window.ganttRequests=[];
    const cmp=(a,b)=>String(a).localeCompare(String(b));
    const client={request:async(op,options)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.ganttRequests.push(q);
      let matched=rows;
      for(const f of (q.filter??[]).map(f=>JSON.parse(f))){
        const v=r=>r.values[f.field];
        if(f.operator==='is_null')matched=matched.filter(r=>v(r)==null);
        else if(f.operator==='is_not_null')matched=matched.filter(r=>v(r)!=null);
        else if(f.operator==='gte')matched=matched.filter(r=>v(r)!=null&&cmp(v(r),f.value)>=0);
        else if(f.operator==='lt')matched=matched.filter(r=>v(r)!=null&&cmp(v(r),f.value)<0);
      }
      const sortField=(q.sort??[])[0]?.split(':')[0];
      if(sortField)matched=[...matched].sort((a,b)=>cmp(a.values[sortField]??'',b.values[sortField]??'')||a.id.localeCompare(b.id));
      const start=q.cursor?Number(q.cursor):0,limit=Number(q.limit),page=matched.slice(start,start+limit),more=start+limit<matched.length;
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:page,
        pagination:{pageSize:page.length,hasNext:more,...(more?{nextCursor:String(start+limit)}:{}),hasPrevious:false,...(q.countMode==='exact'?{total:matched.length}:{}),countMode:q.countMode==='exact'?'exact':'none'}};
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode="work_item"/>);
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

type Fixture = {
  defaultMode?: string;
  unavailable?: boolean;
  many?: number;
  exact?: boolean;
  pageSize?: number;
  milestones?: boolean;
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
type Query = { filter?: string[]; sort?: string[]; limit?: number };

async function mount(
  page: Page,
  width: number,
  fixture: Fixture = {},
  path = "?gantt=2026-11-15",
  dir?: "rtl",
) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route("https://list.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><body><div id="root" style="padding:clamp(var(--a-space-6),3vw,var(--a-space-10))"></div></body></html>`,
    }),
  );
  await page.goto(`https://list.test/items${path}`);
  await page.evaluate(
    (value) => Object.assign(window, { ganttFixture: value }),
    fixture,
  );
  await page.addStyleTag({
    content: planeStyles("neon") + "\nbody{margin:0}*{box-sizing:border-box}",
  });
  await page.addScriptTag({ content: script });
}
const requests = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { ganttRequests: Query[] }).ganttRequests,
  );
const bar = (page: Page, name: RegExp) => page.getByRole("gridcell", { name });

test("bars, one-day bars, open-ended records, groups and progress over the window and open-ended queries", async ({
  page,
}) => {
  await mount(page, 1440, { defaultMode: "gantt" });
  await expect(page.getByRole("heading", { name: "Q4 2026" })).toBeVisible();
  const chart = page.getByRole("grid", { name: "Q4 2026 Gantt chart" });
  await expect(chart).toBeVisible();
  // Labels are the readable identity's title, never the internal ID; status text backs the tone.
  await expect(
    bar(
      page,
      /^Kickoff workshop, plan, October 5, 2026 to October 7, 2026, 40% complete$/,
    ),
  ).toBeVisible();
  // A date range ending on its start day is a one-day bar, not a milestone.
  await expect(
    bar(page, /One-day review, build, October 9, 2026 to October 9, 2026/),
  ).toBeVisible();
  await expect(chart.locator(".a-entity-gantt__milestone")).toHaveCount(0);
  // Open-ended: drawn once, hatched to the window end.
  await expect(
    bar(page, /Vendor contract, build, from September 1, 2026, open-ended/),
  ).toHaveCount(1);
  await expect(
    bar(page, /Vendor contract/).locator(".a-entity-gantt__bar"),
  ).toHaveAttribute("data-open-ended", "true");
  // Blank progress text draws no fill (shared progress reader).
  await expect(bar(page, /Legacy migration/)).not.toHaveAccessibleName(
    /complete/,
  );
  await expect(
    bar(page, /Legacy migration/).locator(".a-entity-gantt__fill"),
  ).toHaveCount(0);
  // Groups: published choice order, then No value, then Unmapped values.
  await expect(chart.locator(".a-entity-gantt__group button")).toHaveText([
    "▾Plan",
    "▾Build",
    "▾No value",
    "▾Unmapped values",
  ]);
  // Within each group, rows keep start order across both streams.
  await expect(chart.locator(".a-entity-gantt__row").nth(0)).toContainText(
    "Kickoff workshop",
  );
  await expect(chart.locator(".a-entity-gantt__row").nth(1)).toContainText(
    "Vendor contract",
  );
  const issued = (await requests(page)).map((q) =>
    (q.filter ?? []).map((f) => JSON.parse(f)),
  );
  expect(issued).toContainEqual([
    { field: "starts_on", operator: "lt", value: "2027-01-04" },
    { field: "ends_on", operator: "gte", value: "2026-09-28" },
    { field: "ends_on", operator: "is_not_null" },
  ]);
  expect(issued).toContainEqual([
    { field: "starts_on", operator: "lt", value: "2027-01-04" },
    { field: "ends_on", operator: "is_null" },
  ]);
  expect(issued).toContainEqual([{ field: "starts_on", operator: "is_null" }]);
  for (const query of await requests(page))
    if ((query.filter ?? []).length)
      expect(query.sort).toEqual(["starts_on:asc"]);
  // Collapsing a group hides its rows only.
  await chart.getByRole("button", { name: "Plan" }).click();
  await expect(bar(page, /Kickoff workshop/)).toHaveCount(0);
  await expect(bar(page, /One-day review/)).toBeVisible();
  // The tray holds the record with no start.
  await page.locator(".a-entity-dated__tray > summary").click();
  await expect(page.locator(".a-entity-dated__tray")).toContainText(
    "Backlog grooming",
  );
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(
    false,
  );
  await page.screenshot({
    path: "tooling/config/test-results/entity-list-gantt-quarter.png",
    fullPage: true,
  });
});

test("milestones come only from a date range declared without an end", async ({
  page,
}) => {
  await mount(page, 1440, { defaultMode: "gantt", milestones: true });
  // No tone is declared for this range, so the label carries no status text.
  await expect(
    bar(page, /^One-day review, October 9, 2026, milestone, 100% complete$/),
  ).toBeVisible();
  await expect(
    page.locator(".a-entity-gantt__milestone").first(),
  ).toBeVisible();
  await expect(page.locator(".a-entity-gantt__bar")).toHaveCount(0);
});

test("zoom changes the window and is saved in the link; the anchor stays location-only", async ({
  page,
}) => {
  await mount(page, 1440, { defaultMode: "gantt" });
  await page
    .getByRole("radiogroup", { name: "Zoom" })
    .getByRole("radio", { name: "Year" })
    .click();
  await expect(
    page.getByRole("heading", { name: "2026", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gantt.zoom"))
    .toBe("year");
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(
    page.getByRole("heading", { name: "2027", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radiogroup", { name: "Zoom" })
    .getByRole("radio", { name: "Month" })
    .click();
  await expect(
    page.getByRole("heading", { name: "November 2027" }),
  ).toBeVisible();
  await mount(
    page,
    1440,
    { defaultMode: "gantt" },
    "?gantt=2026-11-15&gantt.zoom=week",
  );
  await expect(
    page
      .getByRole("radiogroup", { name: "Zoom" })
      .getByRole("radio", { name: "Quarter" }),
  ).toBeChecked();
});

test("Load more rows pages both streams, and the row ceiling stops loading and drawing at 500", async ({
  page,
}) => {
  await mount(page, 1440, { defaultMode: "gantt", many: 520, pageSize: 250 });
  await expect(
    page.getByText(
      "More records than fit in this period. Showing the first 251.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more rows" }).click();
  await expect(
    page.getByText(
      "Showing the first 500 records. Records after these are not shown here; narrow the period, add filters or open Table.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more rows" }),
  ).toHaveCount(0);
  await expect(page.locator(".a-entity-gantt__row")).toHaveCount(500);
});

test("an unavailable Gantt is a disabled, explained layout option", async ({
  page,
}) => {
  await mount(page, 1440, { unavailable: true }, "?view=gantt");
  await expect(page.locator(".a-entity-list__table")).toBeVisible();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Display settings/ }).click();
  const layout = page
    .getByRole("dialog", { name: "Work items list controls" })
    .getByRole("radiogroup", { name: "Layout" });
  await expect(
    layout.getByRole("radio", { name: "Gantt, unavailable" }),
  ).toBeDisabled();
  await expect(layout).toHaveAccessibleDescription(
    "Gantt is unavailable: none of its date fields is available to you.",
  );
});

test("phones show the dated list; rows move by keyboard; right to left mirrors the axis", async ({
  page,
}) => {
  await mount(page, 390, { defaultMode: "gantt" });
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: /Monday, October 5/ }),
  ).toContainText("Kickoff workshop");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const first = bar(page, /Kickoff workshop/);
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(bar(page, /Vendor contract/)).toBeFocused();
  await page.keyboard.press("End");
  await expect(bar(page, /Legacy migration/)).toBeFocused(); // the Unmapped values group is last
  await page.keyboard.press("PageDown");
  await expect(page.getByRole("heading", { name: "Q1 2027" })).toBeVisible();
  await mount(page, 1440, { defaultMode: "gantt" }, "?gantt=2026-11-15", "rtl");
  const box = await bar(page, /Kickoff workshop/)
    .locator(".a-entity-gantt__bar")
    .boundingBox();
  const track = await bar(page, /Kickoff workshop/).boundingBox();
  // Early October sits at the start of the axis, which is the right edge in RTL.
  expect(box!.x + box!.width).toBeGreaterThan(track!.x + track!.width * 0.8);
  await page.screenshot({
    path: "tooling/config/test-results/entity-list-gantt-rtl.png",
  });
});

test("the list title carries no record count in Gantt, under either count mode; Table keeps it", async ({ page }) => {
  // The page query is only the window stream: a count would omit open-ended
  // and Unscheduled records and rows past the ceiling.
  for (const exact of [false, true]) {
    await mount(page, 1440, { defaultMode: "gantt", exact });
    await expect(page.getByRole("grid", { name: "Q4 2026 Gantt chart" })).toBeVisible();
    await expect(page.locator(".a-entity-list__header").first()).not.toContainText(/\d+ records?/);
  }
  await mount(page, 1440, { defaultMode: "table", exact: true });
  await expect(page.locator(".a-entity-list__header").first()).toContainText(/\d+ records/);
});
