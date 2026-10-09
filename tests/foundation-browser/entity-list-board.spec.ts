import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { planeStyles } from "./fixtures/app-styles";

// Real shared list runtime + real Neon CSS with a deterministic API fixture.
// Two synthetic entities with different field shapes prove the Board is driven
// by published metadata alone (Entity list Board blueprint, Phase 1 acceptance).
const script = buildSync({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {entityListDescriptorOperation,entityListOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const cfg=window.boardFixture;
    const uuid=i=>'0d4c1f2e-6a7b-4c8d-9e0f-'+String(100000000000+i).slice(-12);
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:valueKind==='enum'?['eq','ne','in','is_null','is_not_null']:['contains','eq'],sortable:true,groupable:valueKind==='enum',aggregations:[],...extra});
    const lane=(key,label,values,tone,extra={})=>({key,label,values,tone,collapsed:false,terminal:false,...extra});
    const base=(code,label,plural,fields,columns,surface)=>({schemaVersion:1,plane:'neon',
      entity:{code,label,pluralLabel:plural,identityField:'code',detailRouteTemplate:'/'+code+'/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:plural,defaultState:{filters:[],sort:[{field:'title',direction:'asc'}],columns,density:'comfortable',mode:cfg.defaultMode??'table'},search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true},...surface},
      fields:fields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:10,allowedPageSizes:[10,25],maxSortLevels:2,countMode:'exact'}});
    let descriptor, rows, laneKey;
    if(cfg.entity==='country'){
      // Country-shaped rehearsal: the shape Country publishes after the cleanup.
      laneKey=()=>'status';
      const fields=[field('code','ISO alpha-2','string'),field('title','Name','string',{semanticRole:'title'}),
        field('status','Status','enum',{semanticRole:'status',statusTones:{active:'success',deprecated:'warning'}}),
        field('subregion','Subregion','string'),field('code3','ISO alpha-3','string'),field('calling_code','Calling code','string')];
      descriptor=base('country','Country','Countries',fields,['code','title','status','subregion','code3','calling_code'],{supportedModes:['table','compact','board'],
        cardContent:{fields:[{field:'subregion'},{field:'code3'},{field:'calling_code'}]},
        board:{laneFields:[{field:'status',label:'Status',noValueLane:false,lanes:[lane('active','Active',['active'],'success'),lane('deprecated','Deprecated',['deprecated'],'warning',{terminal:true})]}]}});
      rows=[['AF','Afghanistan','active','Southern Asia','AFG','93'],['AL','Albania','active','Southern Europe','ALB','355'],['AQ','Antarctica','deprecated','—','ATA','672'],['MY','Malaysia','active','South-eastern Asia','MYS','60']]
        .map(([code,title,status,subregion,code3,calling_code],i)=>({id:uuid(i),values:{code,title,status,subregion,code3,calling_code}}));
    } else if(cfg.entity==='requests'){
      laneKey=()=>cfg.lane??'priority';
      const fields=[field('code','Request','string'),field('title','Summary','string',{semanticRole:'title'}),field('priority','Priority','enum'),field('category','Category','enum'),field('requester','Requester','string')];
      descriptor=base('asset_request','Asset request','Asset requests',fields,['code','title','priority','category','requester'],{supportedModes:['table','compact','board'],
        board:{laneFields:[
          {field:'priority',label:'Priority',noValueLane:false,lanes:[lane('low','Low',['low'],'neutral'),lane('medium','Medium',['medium'],'warning'),lane('high','High',['high'],'danger')]},
          {field:'category',label:'Category',noValueLane:false,lanes:[lane('hardware','Hardware',['hardware'],'neutral'),lane('software','Software',['software'],'success')]}]}});
      rows=[['AR-1','Laptop refresh','high','hardware'],['AR-2','IDE licence','low','software'],['AR-3','Monitor arm','medium','hardware'],['AR-4','VPN seat','high','software']]
        .map(([code,title,priority,category],i)=>({id:uuid(i),values:{code,title,priority,category,requester:'Team '+(i+1)}}));
    } else {
      laneKey=()=>'stage';
      const fields=[field('code','Work item','string'),field('title','Title','string',{semanticRole:'title'}),field('stage','Stage','enum',{semanticRole:'status',statusTones:{open:'warning',done:'success'}}),field('owner','Owner','string'),field('due','Due','date'),field('progress','Progress','decimal')];
      const surface=cfg.unavailable
        ?{supportedModes:['table','compact'],unavailableModes:[{mode:'board',code:'LIST_BOARD_LANE_FIELD_UNAVAILABLE'}]}
        :{supportedModes:['table','compact','board'],cardContent:{fields:[{field:'owner'},{field:'due',rendererKey:'date.due'},{field:'progress',rendererKey:'number.progress'}]},
          board:{laneFields:[{field:'stage',label:'Stage',noValueLane:true,lanes:[lane('open','Open',['open'],'warning'),lane('in_progress','In progress',['in_progress','review'],'neutral'),lane('done','Done',['done'],'success',{terminal:true,collapsed:Boolean(cfg.collapseDone)})]}]}};
      descriptor=base('work_item','Work item','Work items',fields,['code','title','stage','owner','due','progress'],surface);
      const stages=[...Array(12).fill('open'),'in_progress','in_progress','review','done',null,...(cfg.unmapped?['legacy_hold','legacy_hold']:[])];
      rows=stages.map((stage,i)=>({id:uuid(i),values:{code:'WI-'+(100+i),title:'Task '+String(i+1).padStart(2,'0'),stage,owner:'Owner '+(i%3+1),due:i%2?'2026-01-15':'2099-12-31',progress:(i*17)%101}}));
    }
    window.boardRequests=[];
    const client={request:async(op,options)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.boardRequests.push(q);
      const filters=(q.filter??[]).map(f=>JSON.parse(f));
      let matched=rows;
      for(const f of filters){
        if(f.operator==='in')matched=matched.filter(r=>f.value.includes(r.values[f.field]));
        else if(f.operator==='is_null')matched=matched.filter(r=>r.values[f.field]==null);
      }
      const start=q.cursor==='p2'?Number(q.limit):0,page=matched.slice(start,start+Number(q.limit));
      const groups=q.group?[...matched.reduce((m,r)=>m.set(r.values[q.group]??null,(m.get(r.values[q.group]??null)??0)+1),new Map())].map(([value,count])=>({value,label:String(value??''),count})):undefined;
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:page,
        pagination:{pageSize:page.length,hasNext:start+page.length<matched.length,...(start+page.length<matched.length?{nextCursor:'p2'}:{}),hasPrevious:false,total:matched.length,countMode:'exact'},...(groups?{groups}:{})};
    }};
    createRoot(document.getElementById('root')).render(<EntityListRuntime client={client} entityCode={descriptor.entity.code}/>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

type Fixture = { entity?: "work" | "requests" | "country"; defaultMode?: string; unmapped?: boolean; unavailable?: boolean; collapseDone?: boolean };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// The shell main padding hosts the list header rule that bleeds into it.
async function mount(page: Page, width: number, fixture: Fixture = {}, path = "", dir?: "rtl") {
  await page.setViewportSize({ width, height: 900 });
  await page.route("https://list.test/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html${dir ? ` dir="${dir}"` : ""}><body><div id="root" style="padding:clamp(var(--a-space-6),3vw,var(--a-space-10))"></div></body></html>` }));
  await page.goto(`https://list.test/items${path}`);
  await page.evaluate(value => Object.assign(window, { boardFixture: value }), fixture);
  await page.addStyleTag({ content: planeStyles("neon") + "\nbody{margin:0}*{box-sizing:border-box}" });
  await page.addScriptTag({ content: script });
}
const lane = (page: Page, name: RegExp) => page.getByRole("region", { name });

test("renders lanes from published metadata with exact counts, card content and no identifiers", async ({ page }) => {
  await mount(page, 1440, { defaultMode: "board" });
  await expect(lane(page, /^Open, 12 records$/)).toBeVisible();
  // A multi-value lane folds both buckets; No value holds the null record.
  await expect(lane(page, /^In progress, 3 records$/).locator(".a-entity-board__count")).toHaveText("3");
  await expect(lane(page, /^Done, 1 record$/).getByText("Final", { exact: true })).toBeVisible();
  await expect(lane(page, /^No value, 1 record$/)).toBeVisible();
  // One summary request plus one page request per expanded lane.
  await expect.poll(() => page.evaluate(() => (window as unknown as { boardRequests: { group?: string }[] }).boardRequests.filter(q => q.group === "stage").length)).toBe(1);
  const inProgress = lane(page, /^In progress/);
  await expect(inProgress.locator(".a-entity-list__card")).toHaveCount(3);
  await expect(inProgress.getByText("Task 15", { exact: true })).toBeVisible();
  // Card content: published placements in order; the lane field is not repeated.
  const card = inProgress.locator(".a-entity-list__card").first();
  await expect(card.locator("dt")).toHaveText(["Owner", "Due", "Progress"]);
  await expect(card.locator(".a-entity-list__progress")).toBeVisible();
  await expect(card.getByText("Stage", { exact: true })).toHaveCount(0);
  await expect(lane(page, /^Open/).locator(".a-entity-list__due--overdue").first()).toBeVisible();
  await expect(lane(page, /^Done/).locator(".a-entity-list__due--overdue")).toHaveCount(0);
  // Distribution summary carries the same counts as text.
  await expect(page.getByRole("list", { name: "Records by Stage" }).getByRole("listitem")).toHaveText(["Open 12", "In progress 3", "Done 1", "No value 1"]);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-board-desktop.png", fullPage: true });
});

test("pages a lane with Load more and keeps collapsed lanes in the link", async ({ page }) => {
  await mount(page, 1440, { defaultMode: "board" });
  const open = lane(page, /^Open/);
  await expect(open.locator(".a-entity-list__card")).toHaveCount(10);
  await open.getByRole("button", { name: "Load more (2 left)" }).click();
  await expect(open.locator(".a-entity-list__card")).toHaveCount(12);
  await open.getByRole("button", { name: "Collapse Open" }).click();
  await expect(open.getByRole("button", { name: "Expand Open" })).toHaveAttribute("aria-expanded", "false");
  await expect(open.locator(".a-entity-list__card")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("lanes.collapsed")).toBe("open");
  // Expanding again shows the loaded cards once: no page is fetched twice.
  await open.getByRole("button", { name: "Expand Open" }).click();
  await expect(open.locator(".a-entity-list__card")).toHaveCount(12);
  await expect(open.getByRole("button", { name: /^Load more/ })).toHaveCount(0);
});

test("a second entity offers its declared lane fields and switches lanes by field", async ({ page }) => {
  await mount(page, 1440, { entity: "requests", defaultMode: "board" });
  await expect(lane(page, /^High, 2 records$/)).toBeVisible();
  await expect(lane(page, /^No value/)).toHaveCount(0);
  await page.getByRole("radiogroup", { name: "Lanes by" }).getByRole("radio", { name: "Category" }).click();
  await expect(lane(page, /^Hardware, 2 records$/)).toBeVisible();
  await expect(lane(page, /^Software, 2 records$/).getByText("IDE licence")).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("lane")).toBe("category");
});

test("shows unmapped values only as a warning and opens them in the table", async ({ page }) => {
  await mount(page, 1440, { defaultMode: "board", unmapped: true });
  const notice = page.getByRole("status").filter({ hasText: "outside the published choices" });
  await expect(notice).toContainText("2 records have a Stage value outside the published choices");
  await expect(lane(page, /legacy/i)).toHaveCount(0);
  await notice.getByRole("button", { name: "View in table" }).click();
  await expect(page.locator(".a-entity-list__table")).toBeVisible();
});

test("an unavailable Board is a disabled, explained layout option", async ({ page }) => {
  await mount(page, 1440, { unavailable: true }, "?view=board");
  await expect(page.locator(".a-entity-list__table")).toBeVisible();
  await expect(page.getByText("The requested layout isn't available to you, so the default layout is shown.")).toBeVisible();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Display settings/ }).click();
  const layout = page.getByRole("dialog", { name: "Work items list controls" }).getByRole("radiogroup", { name: "Layout" });
  const board = layout.getByRole("radio", { name: "Board, unavailable" });
  await expect(board).toBeDisabled();
  await expect(layout).toHaveAccessibleDescription("Board is unavailable: none of its lane fields is available to you.");
  await layout.getByRole("radio", { name: "Table" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(layout.getByRole("radio", { name: "Cards" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(board).not.toBeFocused();
});

test("phones show one lane at a time with lane chips", async ({ page }) => {
  await mount(page, 390, { defaultMode: "board" });
  const chips = page.getByRole("group", { name: "Lanes" });
  await expect(chips.getByRole("button")).toHaveText(["Open 12", "In progress 3", "Done 1", "No value 1"]);
  await expect(page.locator(".a-entity-board__lane")).toHaveCount(1);
  await chips.getByRole("button", { name: /^Done/ }).click();
  await expect(lane(page, /^Done, 1 record$/).locator(".a-entity-list__card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "tooling/config/test-results/entity-list-board-phone.png", fullPage: true });
});

test("lanes flow right to left and arrow keys move between lanes in reading order", async ({ page }) => {
  await mount(page, 1440, { defaultMode: "board" }, "", "rtl");
  const openCard = lane(page, /^Open/).locator("[data-board-card]").first();
  const progressCard = lane(page, /^In progress/).locator("[data-board-card]").first();
  await expect(progressCard).toBeVisible();
  const [openBox, progressBox] = await Promise.all([openCard.boundingBox(), progressCard.boundingBox()]);
  expect(progressBox!.x).toBeLessThan(openBox!.x);
  await openCard.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(progressCard).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(lane(page, /^In progress/).locator("[data-board-card]").nth(1)).toBeFocused();
});

test("a saved lane field that is no longer published falls back with a notice", async ({ page }) => {
  await mount(page, 1440, { entity: "requests" }, "?view=board&lane=retired_field");
  await expect(page.getByText("The saved lane field isn't available to you, so the board uses the first available one.")).toBeVisible();
  await expect(lane(page, /^Low, 1 record$/)).toBeVisible();
});

test("Country-shaped rehearsal: a required status gives two lanes, no No value lane, and card content", async ({ page }) => {
  await mount(page, 1440, { entity: "country", defaultMode: "board" });
  await expect(lane(page, /^Active, 3 records$/)).toBeVisible();
  await expect(lane(page, /^Deprecated, 1 record$/).getByText("Final", { exact: true })).toBeVisible();
  await expect(page.locator(".a-entity-board__lane")).toHaveCount(2);
  await expect(lane(page, /^No value/)).toHaveCount(0);
  const card = lane(page, /^Active/).locator(".a-entity-list__card").first();
  await expect(card.locator("dt")).toHaveText(["Subregion", "ISO alpha-3", "Calling code"]);
  await expect(card.getByText("Status", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Records by Status" }).getByRole("listitem")).toHaveText(["Active 3", "Deprecated 1"]);
  expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
});
