import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// Real shared list runtime + real Neon CSS with a deterministic API fixture
// (Entity list Calendar blueprint, Phase 1 on synthetic fixtures). "country"
// is the owner's interim rehearsal: Country-shaped, dated by updated_at.
const script = buildSync({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const cfg=window.calendarFixture;
    const uuid=i=>'7f3c2e1d-4b5a-4c6d-8e9f-'+String(100000000000+i).slice(-12);
    const ops={string:['contains','eq'],enum:['eq','in','is_null','is_not_null'],date:['eq','gt','gte','lt','lte','between','is_null','is_not_null'],datetime:['eq','gt','gte','lt','lte','between','relative','is_null','is_not_null']};
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:ops[valueKind],sortable:true,groupable:valueKind==='enum',aggregations:[],...extra});
    const base=(code,plural,fields,surface)=>({schemaVersion:1,plane:'neon',
      entity:{code,label:code,pluralLabel:plural,identityField:'code',detailRouteTemplate:'/'+code+'/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:plural,defaultState:{filters:[],sort:[{field:'title',direction:'asc'}],columns:fields.map(f=>f.key),density:'comfortable',mode:cfg.defaultMode??'table'},search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true},...surface},
      fields:fields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:10,allowedPageSizes:[10,25],maxSortLevels:2,countMode:cfg.exact?'exact':'none'}});
    let descriptor, rows;
    if(cfg.entity==='country'){
      const fields=[field('code','ISO alpha-2','string'),field('title','Name','string',{semanticRole:'title'}),field('status','Status','enum',{semanticRole:'status',statusTones:{active:'success',deprecated:'warning'}}),field('updated_at','Updated','datetime')];
      descriptor=base('country','Countries',fields,{supportedModes:['table','compact','calendar'],calendar:{defaultView:'month',dateFields:[{start:'updated_at',label:'Updated',kind:'datetime',unscheduled:false,tone:{field:'status',tones:{active:'success',deprecated:'warning'}}}]}});
      rows=[['AF','Afghanistan','active','2026-10-02T09:15:00Z'],['AL','Albania','active','2026-10-08T14:30:00Z'],['AQ','Antarctica','deprecated','2026-10-08T08:00:00Z'],['MY','Malaysia','active','2026-10-21T03:45:00Z'],['FR','France','active','2026-11-01T10:00:00Z'],['DE','Germany','active','2026-11-05T10:00:00Z']]
        .map(([code,title,status,updated_at],i)=>({id:uuid(i),values:{code,title,status,updated_at}}));
    } else {
      const fields=[field('code','Work item','string'),field('title','Title','string',{semanticRole:'title'}),field('starts_on','Starts on','date'),field('ends_on','Ends on','date')];
      const surface=cfg.unavailable
        ?{supportedModes:['table','compact'],unavailableModes:[{mode:'calendar',code:'LIST_CALENDAR_DATE_FIELD_UNAVAILABLE'}]}
        :{supportedModes:['table','compact','calendar'],calendar:{defaultView:'month',dateFields:[{start:'starts_on',end:'ends_on',label:'Starts on',kind:'date',unscheduled:true}]}};
      descriptor=base('work_item','Work items',fields,surface);
      const items=[['Kickoff workshop','2026-10-05','2026-10-07'],['Steering review','2026-10-09','2026-10-09'],['Vendor contract','2026-09-20',null],['Backlog grooming',null,'2026-10-30'],
        ...['A','B','C','D','E'].map(x=>['Sprint task '+x,'2026-10-14','2026-10-14']),
        ...Array.from({length:cfg.many??0},(_,i)=>['Bulk item '+(i+1),'2026-10-22','2026-10-22'])];
      rows=items.map(([title,starts_on,ends_on],i)=>({id:uuid(i),values:{code:'WI-'+(100+i),title,starts_on,ends_on}}));
    }
    window.calendarRequests=[];
    const cmp=(a,b)=>/T/.test(a)||/T/.test(b)?Date.parse(a)-Date.parse(b):String(a).localeCompare(String(b));
    const client={request:async(op,options)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.calendarRequests.push(q);
      let matched=rows;
      for(const f of (q.filter??[]).map(f=>JSON.parse(f))){
        const v=r=>r.values[f.field];
        if(f.operator==='is_null')matched=matched.filter(r=>v(r)==null);
        else if(f.operator==='is_not_null')matched=matched.filter(r=>v(r)!=null);
        else if(f.operator==='gte')matched=matched.filter(r=>v(r)!=null&&cmp(v(r),f.value)>=0);
        else if(f.operator==='gt')matched=matched.filter(r=>v(r)!=null&&cmp(v(r),f.value)>0);
        else if(f.operator==='lt')matched=matched.filter(r=>v(r)!=null&&cmp(v(r),f.value)<0);
      }
      const sortField=(q.sort??[])[0]?.split(':')[0];
      if(sortField)matched=[...matched].sort((a,b)=>cmp(a.values[sortField]??'',b.values[sortField]??'')||a.id.localeCompare(b.id));
      const start=q.cursor?Number(q.cursor):0,limit=Number(q.limit),page=matched.slice(start,start+limit),more=start+limit<matched.length;
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:page,
        pagination:{pageSize:page.length,hasNext:more,...(more?{nextCursor:String(start+limit)}:{}),hasPrevious:false,...(q.countMode==='exact'?{total:matched.length}:{}),countMode:q.countMode==='exact'?'exact':'none'}};
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode={descriptor.entity.code}/>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

type Fixture = { entity?: "country" | "work"; defaultMode?: string; unavailable?: boolean; many?: number; exact?: boolean };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
type Query = { filter?: string[]; sort?: string[]; limit?: number };

// The shell main padding hosts the list header rule that bleeds into it.
async function mount(page: Page, width: number, fixture: Fixture = {}, path = "?cal=2026-10-08", dir?: "rtl") {
  await page.setViewportSize({ width, height: 1000 });
  await page.route("https://list.test/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><body><div id="root" style="padding:clamp(var(--a-space-6),3vw,var(--a-space-10))"></div></body></html>` }));
  await page.goto(`https://list.test/items${path}`);
  await page.evaluate(value => Object.assign(window, { calendarFixture: value }), fixture);
  await page.addStyleTag({ content: planeStyles("neon") + "\nbody{margin:0}*{box-sizing:border-box}" });
  await page.addScriptTag({ content: script });
}
const requests = (page: Page) => page.evaluate(() => (window as unknown as { calendarRequests: Query[] }).calendarRequests);
const day = (page: Page, label: RegExp) => page.getByRole("gridcell", { name: label });

test("Country-shaped rehearsal: updated_at as a datetime calendar with offset edges and an explicit sort", async ({ page }) => {
  await mount(page, 1440, { entity: "country", defaultMode: "calendar" });
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await expect(day(page, /Thursday, October 8/).getByRole("link")).toHaveCount(2);
  await expect(day(page, /Thursday, October 8/).getByRole("link").first()).toHaveAccessibleName(/Antarctica, 8:00/);
  await expect(day(page, /Thursday, October 8/).getByRole("link").first()).toHaveAttribute("data-tone", "warning");
  const window = (await requests(page)).find(q => (q.filter ?? []).some(f => f.includes('"updated_at"')))!;
  expect(window.filter!.map(f => JSON.parse(f))).toEqual([
    { field: "updated_at", operator: "gte", value: "2026-09-28T00:00:00.000Z" },
    { field: "updated_at", operator: "lt", value: "2026-11-02T00:00:00.000Z" },
  ]);
  expect(window.sort).toEqual(["updated_at:asc"]);
  expect(Number(window.limit)).toBe(25);
  await expect(day(page, /Sunday, November 1/).getByRole("link")).toHaveCount(1);
  await expect(page.getByText("Germany")).toHaveCount(0); // 5 November is outside the October grid
  await expect(page.getByText("Unscheduled")).toHaveCount(0);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-calendar-month.png", fullPage: true });
});

test("date ranges, open-ended records, +N more and the Unscheduled tray", async ({ page }) => {
  await mount(page, 1440, { entity: "work", defaultMode: "calendar" });
  // A range is one continuous bar from its first day; a date end is inclusive.
  const kickoff = day(page, /October 5/).getByRole("link", { name: /Kickoff workshop/ });
  await expect(kickoff).toHaveAttribute("style", /--cal-span: 3/);
  for (const label of [/October 6/, /October 7/, /October 8/]) await expect(day(page, label).getByRole("link", { name: /Kickoff workshop/ })).toHaveCount(0);
  // Open-ended from before the window: starts at the grid's first day and continues.
  const vendor = day(page, /September 28/).getByRole("link", { name: /Vendor contract, open-ended/ });
  await expect(vendor).toHaveAttribute("data-continues-after", "true");
  await expect(vendor).toHaveAttribute("data-open-ended", "true");
  const issued = (await requests(page)).map(q => (q.filter ?? []).map(f => JSON.parse(f)));
  expect(issued).toContainEqual([{ field: "starts_on", operator: "lt", value: "2026-11-02" }, { field: "ends_on", operator: "gte", value: "2026-09-28" }, { field: "ends_on", operator: "is_not_null" }]);
  expect(issued).toContainEqual([{ field: "starts_on", operator: "lt", value: "2026-11-02" }, { field: "ends_on", operator: "is_null" }]);
  expect(issued).toContainEqual([{ field: "starts_on", operator: "is_null" }]);
  const busy = day(page, /October 14/);
  await expect(busy.getByRole("link")).toHaveCount(2); // the open-ended bar holds lane 1 from the week's first day
  await busy.getByRole("button", { name: "+3 more" }).click();
  const dialog = page.getByRole("dialog", { name: /October 14, 2026/ });
  await expect(dialog.locator(".a-entity-list__card")).toHaveCount(6);
  await page.keyboard.press("Escape");
  const tray = page.locator(".a-entity-dated__tray");
  await tray.locator("summary").click();
  await expect(tray).toContainText("Backlog grooming");
  await expect(tray).toContainText("Ends Oct 30, 2026");
  await expect(tray.locator("summary")).toHaveText("Unscheduled"); // no count without exact counts
  await page.screenshot({ path: "tooling/config/test-results/entity-list-calendar-ranges.png", fullPage: true });
});

test("Agenda pages the window and reports overflow without inventing a total", async ({ page }) => {
  await mount(page, 1440, { entity: "work", defaultMode: "calendar", many: 30 });
  await expect(page.getByText("More records than fit in this period. Showing the first 25.")).toBeVisible();
  await page.getByRole("button", { name: "Open Agenda" }).click();
  await expect(page.getByRole("radiogroup", { name: "Calendar view" }).getByRole("radio", { name: "Agenda" })).toBeChecked();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("region", { name: /Thursday, October 22/ }).locator(".a-entity-list__card")).toHaveCount(30);
  // An open-ended record appears once, on its first visible day, not on every day.
  await expect(page.getByRole("region", { name: /Thursday, October 1/ })).toContainText("Vendor contract");
  await expect(page.locator(".a-entity-dated__agenda").getByText("Vendor contract")).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).searchParams.get("cal.view")).toBe("agenda");
  await expect(page.getByRole("region", { name: /Thursday, October 1/ }).locator(".a-entity-list__card-note")).toContainText("open-ended");
  await page.evaluate(() => window.scrollTo(0, 0)); // sticky day headings render in place
  await page.screenshot({ path: "tooling/config/test-results/entity-list-calendar-agenda.png", fullPage: true });
});

test("an unavailable Calendar is a disabled, explained layout option", async ({ page }) => {
  await mount(page, 1440, { entity: "work", unavailable: true }, "?view=calendar");
  await expect(page.locator(".a-entity-list__table")).toBeVisible();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Display settings/ }).click();
  const layout = page.getByRole("dialog", { name: "Work items list controls" }).getByRole("radiogroup", { name: "Layout" });
  await expect(layout.getByRole("radio", { name: "Calendar, unavailable" })).toBeDisabled();
  await expect(layout).toHaveAccessibleDescription("Calendar is unavailable: none of its date fields is available to you.");
});

test("phones show Agenda only, and the month grid moves by keyboard", async ({ page }) => {
  await mount(page, 390, { entity: "work", defaultMode: "calendar" });
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Friday, October 9/ })).toContainText("Steering review");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const anchor = day(page, /Thursday, October 8/);
  await anchor.focus();
  await page.keyboard.press("ArrowRight");
  await expect(day(page, /Friday, October 9/)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /October 9, 2026/ })).toContainText("Steering review");
  await page.keyboard.press("Escape");
  await day(page, /Friday, October 9/).focus();
  await page.keyboard.press("PageDown");
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(day(page, /Monday, November 9/)).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(day(page, /Friday, October 9/)).toBeFocused();
});
