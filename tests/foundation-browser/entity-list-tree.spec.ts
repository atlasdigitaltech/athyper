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
    import {entityListDescriptorOperation,entityListOperation,entityRecordPatchOperation} from './packages/platform/foundation/api-client/src/entity-list';
    import {ApiTransportError} from './packages/platform/foundation/api-client/src/index';
    import {parseEntityLookupOptions} from './packages/contracts/platform/entity-runtime/src/lookup-options';
    const cfg=window.treeFixture;
    const uuid=i=>'7f3c2e1d-4b5a-4c6d-8e9f-'+String(100000000000+i).slice(-12);
    const ops={string:['contains','eq'],enum:['eq','in','is_null','is_not_null'],decimal:['eq','gt','lt'],reference:['eq','in','is_null','is_not_null'],date:['gte','lt','is_null']};
    const field=(key,label,valueKind,extra={})=>({key,label,valueKind,defaultVisible:true,defaultOrder:0,filterOperators:ops[valueKind],sortable:true,groupable:false,aggregations:[],...extra});
    const opts=(...values)=>values.map(([value,label])=>({value,label}));
    const fields=[field('code','Account','string'),field('name','Name','string',{semanticRole:'title'}),
      field('status','Status','enum',{groupable:true,filterOptions:opts(['active','Active'],['blocked','Blocked for posting'],['deprecated','Deprecated']),statusTones:{active:'success',blocked:'danger'}}),
      field('account_type','Account type','enum',{groupable:true,filterOptions:opts(['asset','Asset'],['liability','Liability'])}),
      field('kind','Kind','enum',{filterOptions:opts(['summary','Summary account'],['posting','Posting account'])}),
      field('budget','Annual budget','decimal',{aggregations:['count','sum']}),field('opened','Opened','date',{defaultVisible:false,groupable:true}),field('parent','Parent account','reference',{defaultVisible:false}),
      field('chart','Chart of accounts','reference',{defaultVisible:false,filterOperators:['eq','in'],filterOptions:opts(['chart-a','Operating chart'],['chart-b','Group chart'])}),
      field('postable','Postable','boolean',{defaultVisible:false,filterOperators:['eq']})];
    const accounts=[
      ['1000','Assets','active','asset','summary',null,null],['1100','Current assets','active','asset','summary',null,'1000'],
      ['1110','Cash and bank','active','asset','summary',null,'1100'],['1111','Operating accounts','active','asset','summary',null,'1110'],
      ['1112','Payroll account','deprecated','asset','posting',120000,'1111'],['1113','USD collection account','active','asset','posting',80000,'1111'],
      ['1130','Inventory','active','asset','summary',null,'1100'],['1200','Non-current assets','active','asset','summary',1705000,'1000'],
      ['2000','Liabilities','active','liability','summary',null,null],['2100','Trade payables','blocked','liability','posting',null,'2000'],
      ['2200','Accruals','legacy','liability','posting',null,'2000'],['3000','Suspense','active',null,'posting',null,null],
      ['1131','Raw materials','active','asset','posting',50000,'1130'],
      ...Array.from({length:cfg.many??0},(_,i)=>['9'+String(i).padStart(3,'0'),'Bulk '+i,'active','asset','posting',1,null]),
      // A second chart reusing the same codes (scoped fixtures only).
      ...(cfg.scoped?[['1000','Group assets','active','asset','summary',null,null,'chart-b'],['1100','Group current assets','active','asset','posting',null,'1000','chart-b']]:[])];
    const chartOf=a=>a[7]??'chart-a';
    const idOf=Object.fromEntries(accounts.map((a,i)=>[chartOf(a)+':'+a[0],uuid(i)]));
    const rows=accounts.map((a,i)=>{const [code,name,status,account_type,kind,budget,parent]=a;return {id:uuid(i),values:{code,name,status,account_type,kind,budget,parent:parent?idOf[chartOf(a)+':'+parent]:null,chart:chartOf(a),postable:kind==='posting',opened:i%3===0?null:(i%3===1?'2026-09-1'+(i%9):'2026-10-0'+(1+i%8))},...(parent&&!(cfg.hidden??[]).includes(parent)?{displayValues:{parent:accounts.find(x=>x[0]===parent&&chartOf(x)===chartOf(a))[1]}}:{})}});
    const descriptor={schemaVersion:1,plane:'neon',
      entity:{code:'gl_account',label:'gl_account',pluralLabel:'Chart of Accounts',identityField:'code',detailRouteTemplate:'/gl_account/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},
      surface:{key:'list',title:'Chart of Accounts',defaultState:{filters:[],sort:[{field:'code',direction:'asc'}],columns:['code','name','status','account_type','kind','budget'],density:'comfortable',mode:cfg.defaultMode??'table'},search:{minimumQueryLength:1},filterPresentation:{quickFields:[],source:'metadata',allowUserPinning:true},
        ...(cfg.tree?{supportedModes:['table','compact','tree'],tree:{parentField:'parent',...(cfg.scoped?{scopeField:'chart'}:{}),...(cfg.scopeLocked?{scopeLocked:true}:{}),...(cfg.movable?{movable:true}:{}),nodeKind:cfg.booleanKind?{kind:'boolean',field:'postable',branchWhen:false}:{kind:'choice',field:'kind',branchValues:['summary'],tones:{summary:'success'}},maxDepth:cfg.maxDepth??5}}
          :cfg.treeUnavailable?{supportedModes:['table','compact'],unavailableModes:[{mode:'tree',code:'LIST_TREE_PARENT_FIELD_UNAVAILABLE'}]}
          :{supportedModes:['table','compact']})},
      fields:fields.map((f,i)=>({...f,defaultOrder:i})),actions:[],
      scope:{status:'ready',labels:[{key:'access',label:'Scope',value:'All permitted tenant records'}],fingerprint:'c'.repeat(64)},
      limits:{defaultPageSize:cfg.pageSize??4,allowedPageSizes:[cfg.pageSize??4,25],maxSortLevels:2,countMode:cfg.exact?'exact':'none'}};
    window.treeRequests=[];
    const cmp=(a,b)=>String(a??'').localeCompare(String(b??''));
    const client={request:async(op,options)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op===entityRecordPatchOperation){
        window.treePatches=[...(window.treePatches??[]),{recordId:options.params.recordId,body:options.body,headers:options.headers,idempotencyKey:options.idempotencyKey}];
        if(cfg.moveError)throw new ApiTransportError('conflict','refused',409,{type:'about:blank',title:'Conflict',status:409,code:cfg.moveError});
        const moved=rows.find(r=>r.id===options.params.recordId);moved.values={...moved.values,parent:options.body.parent};
        return {recordId:moved.id};
      }
      if(op!==entityListOperation)throw Error('Unexpected fixture operation');
      const q=options.query??{};window.treeRequests.push(q);
      // Records the viewer cannot read are never returned or counted.
      const visible=rows.filter(r=>!(cfg.hidden??[]).includes(r.values.code));
      const visibleIds=new Set(visible.map(r=>r.id));
      let matched=visible;
      const ids=q.recordIds?[].concat(q.recordIds):undefined;
      if(ids)matched=matched.filter(r=>ids.includes(r.id));
      if(q.hierarchy==='orphans')matched=matched.filter(r=>r.values.parent&&!visibleIds.has(r.values.parent));
      const filters=(q.filter??[]).map(f=>JSON.parse(f));
      const apply=(list,fs)=>{for(const f of fs){
        const v=r=>r.values[f.field];
        if(f.operator==='is_null')list=list.filter(r=>v(r)==null);
        else if(f.operator==='is_not_null')list=list.filter(r=>v(r)!=null);
        else if(f.operator==='eq')list=list.filter(r=>v(r)===f.value);
        else if(f.operator==='in')list=list.filter(r=>f.value.includes(v(r)));
        else if(f.operator==='gte')list=list.filter(r=>v(r)!=null&&String(v(r))>=f.value);
        else if(f.operator==='lt')list=list.filter(r=>v(r)!=null&&String(v(r))<f.value);
      }return list};
      matched=apply(matched,filters);
      if(q.search){const n=String(q.search).toLowerCase();matched=matched.filter(r=>[r.values.code,r.values.name].some(v=>String(v??'').toLowerCase().includes(n)));}
      // hasChildren: a visible child that matches the list's filters other than the parent filter.
      if(q.hierarchy){const others=filters.filter(f=>f.field!=='parent');
        matched=matched.map(r=>({...r,hasChildren:apply(visible.filter(c=>c.values.parent===r.id),others).length>0,...(q.hierarchy==='orphans'?{parentOutsideView:true}:{})}));}
      const sortField=(q.sort??[])[0]?.split(':')[0];
      if(sortField)matched=[...matched].sort((a,b)=>cmp(a.values[sortField],b.values[sortField])||a.id.localeCompare(b.id));
      if(q.hierarchy==='matches'){
        // Matches with the visible ancestors that place them (B2), as the server does.
        const maxDepth=cfg.maxDepth??5,scopeFs=filters.filter(f=>f.field==='chart'),others=filters.filter(f=>f.field!=='parent');
        const ancestorsOk=apply(visible,scopeFs),byId=new Map(ancestorsOk.map(r=>[r.id,r]));
        const searched=list=>q.search?list.filter(r=>[r.values.code,r.values.name].some(v=>String(v??'').toLowerCase().includes(String(q.search).toLowerCase()))):list;
        const kids=r=>searched(apply(visible.filter(c=>c.values.parent===r.id),others)).length>0;
        const out=[],seen=new Set(),top=new Set();let beyond=0;
        const found=matched.slice(0,500),matchIds=new Set(found.map(r=>r.id));
        for(const m of found){const path=[m];let t=m,placed;
          while(!placed){if(!t.values.parent)placed=path.length>maxDepth?'beyond':'root';else if(path.length>=maxDepth)placed='beyond';else{const n=byId.get(t.values.parent);if(!n)placed='outside';else{path.push(n);t=n;}}}
          if(placed==='beyond'){beyond++;continue}
          if(placed==='outside')top.add(t.id);
          for(const p of path)if(!seen.has(p.id)){seen.add(p.id);out.push(p)}}
        const ordered=[...out.filter(r=>matchIds.has(r.id)),...out.filter(r=>!matchIds.has(r.id))];
        return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),
          rows:ordered.map(r=>({...r,hasChildren:kids(r),treeRole:matchIds.has(r.id)?'match':'context',...(top.has(r.id)?{parentOutsideView:true}:{})})),
          ...(matched.length>500?{matchesTruncated:true}:{}),...(beyond?{matchesBeyondDepth:beyond}:{}),
          pagination:{pageSize:found.length,hasNext:false,hasPrevious:false,countMode:'none'}};
      }
      const exact=q.countMode==='exact';
      // Group buckets with month buckets (A3) and sums (A2), as the server does.
      const [gField,gUnit]=String(q.group??'').split(':');
      const bucketOf=r=>{const v=r.values[gField];if(v==null)return null;if(!gUnit)return v;const m=Number(String(v).slice(5,7));return gUnit==='quarter'?String(v).slice(0,4)+'-Q'+Math.ceil(m/3):String(v).slice(0,7)};
      const wanted=[].concat(q.aggregate??[]);
      const groups=q.group&&exact?Object.entries(matched.reduce((acc,r)=>{const k=JSON.stringify(bucketOf(r));(acc[k]??=[]).push(r);return acc},{})).map(([k,list])=>({value:JSON.parse(k),label:String(JSON.parse(k)),count:list.length,...(wanted.length?{aggregates:Object.fromEntries(wanted.map(w=>{const f=w.split(':')[0];const vals=list.map(r=>r.values[f]).filter(v=>v!=null);return [w,vals.length?vals.reduce((x,y)=>x+y,0):null]}))}:{})})).sort((a,b)=>a.value===null?1:b.value===null?-1:cmp(a.value,b.value)):undefined;
      if(q.groupsOnly==='true')return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:[],groups,...(cfg.truncateGroups?{groupsTruncated:true}:{}),pagination:{pageSize:0,hasNext:false,hasPrevious:false,total:matched.length,countMode:'exact'}};
      const start=q.cursor?Number(q.cursor):0,limit=Number(q.limit),page=matched.slice(start,start+limit),more=start+limit<matched.length;
      return {schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:page,...(groups?{groups}:{}),
        pagination:{pageSize:page.length,hasNext:more,...(more?{nextCursor:String(start+limit)}:{}),hasPrevious:false,...(exact?{total:matched.length}:{}),countMode:exact?'exact':'none'}};
    }};
    // A record picker (B5): the lookup embedding with a tree default layout.
    const Picker=()=>{const [selected,setSelected]=React.useState([]);window.pickerSelection=selected.map(r=>r.values.code);
      return <EntityListRuntime client={client} entityCode="gl_account" contentOnly embedding={{options:parseEntityLookupOptions({presentation:{viewType:'full',fullViewHost:'inline'},display:{defaults:{layout:'tree'}}}),selectedRows:selected,onSelectionChange:setSelected,selectionAllowed:true}}/>};
    createRoot(document.getElementById('root')).render(cfg.picker?<Picker/>:<EntityListRuntime client={client} entityCode="gl_account" {...(cfg.section?{section:{}}:{})}/>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).outputFiles[0]!.text;

type Fixture = { defaultMode?: string; exact?: boolean; many?: number; pageSize?: number; tree?: boolean; treeUnavailable?: boolean; maxDepth?: number; hidden?: string[]; scoped?: boolean; scopeLocked?: boolean; booleanKind?: boolean; section?: boolean; movable?: boolean; moveError?: string; picker?: boolean; truncateGroups?: boolean };
type Query = { filter?: string[]; group?: string; aggregate?: string | string[]; groupsOnly?: string; countMode?: string; hierarchy?: string; recordIds?: string | string[]; cursor?: string };
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

  test("selection covers records loaded inside groups, and the header selects every loaded record", async ({ page }) => {
    await mount(page, 1440, { exact: true }, "?groups=status,account_type");
    await headingRow(page, "Asset").getByRole("button", { name: /Expand Asset/ }).click();
    const nested = page.locator('tr[aria-level="3"]', { hasText: "1110" });
    await nested.getByRole("checkbox").check();
    await expect(page.locator(".a-entity-list__selection-bar")).toContainText("1 selected");
    await expect(page.getByText("Selection includes loaded records only.")).toBeVisible();
    // Under exact counts the page itself has no rows; the header selects what is loaded.
    await page.getByRole("checkbox", { name: "Select loaded records" }).check();
    const loaded = await page.locator('tr[aria-level="3"]').count();
    expect(loaded).toBeGreaterThan(1);
    await expect(page.locator(".a-entity-list__selection-bar")).toContainText(`${loaded} selected`);
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

const idOf = (index: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(100000000000 + index).slice(-12)}`;
const node = (page: Page, code: string) => page.locator("[role=row][aria-posinset]", { hasText: code });
const parentFilters = (queries: Query[]) =>
  queries.flatMap(q => (q.filter ?? []).map(f => JSON.parse(f) as { field: string; operator: string; value?: string }).filter(f => f.field === "parent"));

test.describe("B1 Tree layout", () => {
  test("roots, one request per expansion, leaves without an expand control, node kinds, path, no UUID", async ({ page }) => {
    await mount(page, 1440, { tree: true }, "?view=tree");
    const grid = page.getByRole("treegrid");
    await expect(grid).toBeVisible();
    await expect(page.locator('[role=row][aria-level="1"][aria-posinset] .a-entity-tree__identity')).toHaveText(["1000", "2000", "3000"]);
    // The roots are the list's own page: parent is null, hierarchy=nodes.
    const first = await requests(page);
    expect(first.some(q => q.hierarchy === "nodes" && parentFilters([q]).some(f => f.operator === "is_null"))).toBe(true);
    expect(first.some(q => q.hierarchy === "orphans")).toBe(true);
    // A leaf (3000, no children) has no expand control; a branch has one.
    await expect(node(page, "3000").locator("[data-tree-toggle]")).toHaveCount(0);
    await expect(node(page, "3000")).not.toHaveAttribute("aria-expanded", /.*/);
    await expect(node(page, "1000")).toHaveAttribute("aria-expanded", "false");
    // Node kind: hidden text, round for a branch kind and a diamond for a leaf kind.
    await expect(node(page, "1000").locator(".a-entity-tree__kind")).toHaveAttribute("data-shape", "branch");
    await expect(node(page, "3000").locator(".a-entity-tree__kind")).toHaveAttribute("data-shape", "leaf");
    await expect(node(page, "1000").locator(".a-entity-tree__kind")).toHaveText("Summary account");
    const before = (await requests(page)).length;
    await node(page, "1000").getByRole("button", { name: "Expand 1000 Assets" }).click();
    await expect(node(page, "1100")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "1200")).toHaveAttribute("aria-level", "2");
    const after = await requests(page);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.hierarchy).toBe("nodes");
    expect(parentFilters([after.at(-1)!])).toEqual([{ field: "parent", operator: "eq", value: idOf(0) }]);
    // Collapse and reopen: the loaded level is kept, no request.
    await node(page, "1000").getByRole("button", { name: "Collapse 1000 Assets" }).click();
    await expect(node(page, "1100")).toHaveCount(0);
    await node(page, "1000").getByRole("button", { name: "Expand 1000 Assets" }).click();
    await expect(node(page, "1100")).toBeVisible();
    expect((await requests(page)).length).toBe(before + 1);
    // The path bar shows where the focused row sits, from loaded nodes.
    await node(page, "1200").focus();
    await expect(page.getByRole("navigation", { name: "Path" })).toContainText("1000 Assets");
    await expect(page.getByRole("navigation", { name: "Path" }).locator("[aria-current=location]")).toHaveText("1200 Non-current assets");
    // Tree pages itself and shows no list pagination or title count.
    await expect(page.locator(".a-entity-list__pagination")).toHaveCount(0);
    expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
    await page.screenshot({ path: "tooling/config/test-results/entity-list-tree-layout.png", fullPage: true });
  });

  test("records whose parent is hidden form their own group with a marker and never the parent's identity", async ({ page }) => {
    await mount(page, 1440, { tree: true, hidden: ["1100"] }, "?view=tree");
    const heading = page.locator(".a-entity-tree__group-row", { hasText: "Records whose parent is outside your view" });
    await expect(heading).toHaveAttribute("aria-level", "1");
    await expect(page.locator('[role=row][aria-level="2"][aria-posinset] .a-entity-tree__identity')).toHaveText(["1110", "1130"]);
    await expect(node(page, "1110").locator(".a-entity-tree__marker")).toHaveText("Parent outside your view");
    // Expanding Assets shows only the visible child; the hidden one is not inferred.
    await node(page, "1000").getByRole("button", { name: /Expand 1000/ }).click();
    await expect(page.locator('[role=row][aria-level="2"][aria-posinset]', { hasText: "1200" })).toBeVisible();
    await expect(page.locator(".a-entity-list")).not.toContainText("Current assets");
    // An orphan's own children browse normally.
    await node(page, "1110").getByRole("button", { name: /Expand 1110/ }).click();
    await expect(node(page, "1111")).toHaveAttribute("aria-level", "3");
  });

  test("nothing deeper than the maximum depth is requested; the depth limit is marked", async ({ page }) => {
    await mount(page, 1440, { tree: true, maxDepth: 2 }, "?view=tree");
    await node(page, "1000").getByRole("button", { name: /Expand 1000/ }).click();
    await expect(node(page, "1100")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "1100").locator(".a-entity-tree__marker--limit")).toHaveText("Depth limit");
    await expect(node(page, "1100").locator("[data-tree-toggle]")).toHaveCount(0);
    await page.getByRole("button", { name: "Expand all loaded" }).click();
    expect(parentFilters(await requests(page)).some(f => f.value === idOf(1))).toBe(false);
  });

  test("an unavailable Tree is a disabled, explained layout option", async ({ page }) => {
    await mount(page, 1440, { treeUnavailable: true }, "?view=tree");
    await expect(page.locator(".a-entity-list__table")).toBeVisible();
    await expect(page.getByRole("treegrid")).toHaveCount(0);
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Display settings/ }).click();
    const layout = page.getByRole("dialog").getByRole("radiogroup", { name: "Layout" });
    await expect(layout.getByRole("radio", { name: "Tree, unavailable" })).toBeDisabled();
    await expect(layout).toHaveAccessibleDescription("Tree is unavailable: its parent field is not available to you.");
  });

  test("a deep link reveals and focuses its node, expanding the path", async ({ page }) => {
    await mount(page, 1440, { tree: true }, `?view=tree&tree.node=${idOf(5)}`);
    await expect(node(page, "1113")).toBeFocused();
    await expect(node(page, "1113")).toHaveAttribute("aria-level", "5");
    for (const code of ["1000", "1100", "1110", "1111"]) await expect(node(page, code)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Path" }).locator("[aria-current=location]")).toHaveText("1113 USD collection account");
    // The link stays in the location; switching layout drops it.
    expect(page.url()).toContain(`tree.node=${idOf(5)}`);
    expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
    await page.reload();
    await page.evaluate(value => Object.assign(window, { treeFixture: value }), { tree: true });
    await page.addStyleTag({ content: planeStyles("neon") + "\nbody{margin:0}*{box-sizing:border-box}" });
    await page.addScriptTag({ content: script });
    await expect(node(page, "1113")).toBeFocused();
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Display settings/ }).click();
    await page.getByRole("dialog").getByRole("radiogroup", { name: "Layout" }).getByRole("radio", { name: "Table" }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("treegrid")).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain("tree.node");
  });

  test("a deep link deeper than the maximum depth explains itself", async ({ page }) => {
    await mount(page, 1440, { tree: true, maxDepth: 3 }, `?view=tree&tree.node=${idOf(5)}`);
    await expect(page.getByRole("status").filter({ hasText: "deeper than the 3 levels" })).toBeVisible();
  });

  test("keyboard follows the tree grid, mirrored right to left", async ({ page }) => {
    await mount(page, 1440, { tree: true }, "?view=tree", "rtl");
    const assets = node(page, "1000");
    await assets.focus();
    await page.keyboard.press("ArrowLeft"); // forward in right-to-left
    await expect(assets).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(node(page, "1100")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(assets).toBeFocused();
    await page.keyboard.press("End");
    await expect(node(page, "3000")).toBeFocused();
  });

  test("phones show an indented list with labels, expand controls and details", async ({ page }) => {
    await mount(page, 390, { tree: true }, "?view=tree");
    const list = page.locator(".a-entity-tree__list[role=treegrid]");
    await expect(list).toBeVisible();
    await expect(page.locator(".a-entity-list__table")).toHaveCount(0);
    await node(page, "1000").getByRole("button", { name: /Expand 1000/ }).click();
    await expect(node(page, "1200")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "1200").locator(".a-entity-tree__details")).toContainText("Annual budget");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
    await page.screenshot({ path: "tooling/config/test-results/entity-list-tree-narrow.png", fullPage: true });
  });

  test("at most 500 nodes load; the ceiling is announced and Load more stops", async ({ page }) => {
    await mount(page, 1440, { tree: true, many: 700, pageSize: 250 }, "?view=tree");
    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Showing the first 500 records of this tree" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    await expect(page.locator("[role=row][aria-posinset]")).toHaveCount(500);
  });
});

test.describe("T1–T3 scoped hierarchy and node kind", () => {
  test("a scoped hierarchy asks for one scope value, names the field by its label, and sends no tree request until then", async ({ page }) => {
    await mount(page, 1440, { tree: true, scoped: true }, "?view=tree");
    await expect(page.getByRole("heading", { name: "Choose Chart of accounts to see the tree" })).toBeVisible();
    await expect(page.getByRole("treegrid")).toHaveCount(0);
    expect((await requests(page)).some(q => q.hierarchy)).toBe(false);
    await page.screenshot({ path: "tooling/config/test-results/entity-list-tree-scope-prompt.png", fullPage: true });
    // The prompt offers the scope field's own filter; choosing one value draws the tree.
    await page.getByRole("button", { name: "Filter Chart of accounts" }).click();
    const dialog = page.getByRole("dialog", { name: "Filter Chart of accounts" });
    await dialog.getByRole("combobox", { name: "Value for Chart of accounts filter 1" }).click();
    await page.getByRole("option", { name: "Group chart" }).click();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator('[role=row][aria-level="1"][aria-posinset] .a-entity-tree__title')).toHaveText(["Group assets"]);
  });

  test("with one scope value the tree shows that chart only, even where codes repeat", async ({ page }) => {
    const filter = encodeURIComponent(JSON.stringify({ operator: "eq", value: "chart-b" }));
    await mount(page, 1440, { tree: true, scoped: true }, `?view=tree&filter.chart=${filter}`);
    await expect(page.getByRole("treegrid")).toBeVisible();
    await expect(page.locator('[role=row][aria-level="1"][aria-posinset] .a-entity-tree__title')).toHaveText(["Group assets"]);
    await node(page, "Group assets").getByRole("button", { name: /Expand 1000/ }).click();
    await expect(page.locator('[role=row][aria-level="2"][aria-posinset] .a-entity-tree__title')).toHaveText(["Group current assets"]);
    const tree = (await requests(page)).filter(q => q.hierarchy);
    expect(tree.length).toBeGreaterThan(0);
    for (const q of tree) expect((q.filter ?? []).map(f => JSON.parse(f))).toContainEqual({ field: "chart", operator: "eq", value: "chart-b" });
  });

  test("a locked record scope satisfies the scope without a filter", async ({ page }) => {
    await mount(page, 1440, { tree: true, scoped: true, scopeLocked: true }, "?view=tree");
    await expect(page.getByRole("treegrid")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Choose Chart of accounts/ })).toHaveCount(0);
  });

  test("a deep link into a scoped hierarchy sets the scope filter, then reveals the node", async ({ page }) => {
    await mount(page, 1440, { tree: true, scoped: true }, `?view=tree&tree.node=${idOf(5)}`);
    await expect(node(page, "1113")).toBeFocused();
    expect(decodeURIComponent(page.url())).toContain('filter.chart={"operator":"eq","value":"chart-a"}');
  });

  test("a boolean node kind draws leaves where the field is not the branch value", async ({ page }) => {
    await mount(page, 1440, { tree: true, booleanKind: true }, "?view=tree");
    await expect(node(page, "1000").locator(".a-entity-tree__kind")).toHaveAttribute("data-shape", "branch");
    await expect(node(page, "3000").locator(".a-entity-tree__kind")).toHaveAttribute("data-shape", "leaf");
    await expect(node(page, "3000").locator(".a-entity-tree__kind")).toHaveText("Postable: Yes");
    await expect(node(page, "1000").locator(".a-entity-tree__kind")).toHaveAttribute("data-tone", "neutral");
  });
});

test.describe("B2 search with ancestor context", () => {
  const titles = (page: Page, level: number) => page.locator(`[role=row][aria-level="${level}"][aria-posinset] .a-entity-tree__title`);

  test("a search shows each match with its path, in one request, with context marked", async ({ page }) => {
    await mount(page, 1440, { tree: true }, "?view=tree&q=cash");
    await expect(page.getByText("Records that match are shown with the records above them, for context.")).toBeVisible();
    await expect(titles(page, 1)).toHaveText(["Assets"]);
    await expect(titles(page, 2)).toHaveText(["Current assets"]);
    await expect(titles(page, 3)).toHaveText(["Cash and bank"]);
    await expect(node(page, "1000")).toHaveAttribute("data-tree-role", "context");
    await expect(node(page, "1000").locator(".a-entity-tree__marker--context")).toHaveText("Shown for context");
    await expect(node(page, "1110")).toHaveAttribute("data-tree-role", "match");
    const tree = (await requests(page)).filter(q => q.hierarchy);
    expect(tree.map(q => q.hierarchy)).toEqual(["matches"]);
    // Child existence follows the search, as for every level: Cash and bank has
    // no matching children, so it does not expand here; clearing the search browses.
    await expect(node(page, "1110").locator("[data-tree-toggle]")).toHaveCount(0);
    expect(UUID.test(await page.locator(".a-entity-list").innerText())).toBe(false);
    await page.screenshot({ path: "tooling/config/test-results/entity-list-tree-matches.png", fullPage: true });
  });

  test("a path stopped by a hidden ancestor moves to the outside-your-view group and never shows it", async ({ page }) => {
    await mount(page, 1440, { tree: true, hidden: ["1100"] }, "?view=tree&q=operating");
    const heading = page.locator(".a-entity-tree__group-row", { hasText: "Records whose parent is outside your view" });
    await expect(heading).toBeVisible();
    await expect(node(page, "1110").locator(".a-entity-tree__marker").first()).toHaveText("Parent outside your view");
    await expect(node(page, "1111")).toHaveAttribute("data-tree-role", "match");
    await expect(page.locator(".a-entity-list")).not.toContainText("Current assets");
  });

  test("matches deeper than the tree shows are counted in a notice, not drawn", async ({ page }) => {
    await mount(page, 1440, { tree: true, maxDepth: 3 }, "?view=tree&q=usd");
    await expect(page.getByRole("status").filter({ hasText: "1 match sits deeper than the 3 levels this tree shows" })).toBeVisible();
    await expect(node(page, "1113")).toHaveCount(0);
  });

  test("in a scoped hierarchy, matches and their paths stay inside the chosen scope", async ({ page }) => {
    const filter = encodeURIComponent(JSON.stringify({ operator: "eq", value: "chart-b" }));
    await mount(page, 1440, { tree: true, scoped: true }, `?view=tree&filter.chart=${filter}&q=current`);
    await expect(titles(page, 1)).toHaveText(["Group assets"]);
    await expect(titles(page, 2)).toHaveText(["Group current assets"]);
    const matches = (await requests(page)).filter(q => q.hierarchy === "matches");
    expect(matches).toHaveLength(1);
    expect((matches[0]!.filter ?? []).map(f => JSON.parse(f))).toContainEqual({ field: "chart", operator: "eq", value: "chart-b" });
  });
});

test("a record section host offers Tree; only record pickers keep Table and Cards (foundation section 8)", async ({ page }) => {
  await mount(page, 1440, { tree: true, section: true }, "?view=tree");
  await expect(page.getByRole("treegrid")).toBeVisible();
});

test.describe("B4 moving a node", () => {
  const patches = (page: Page) => page.evaluate(() => (window as unknown as { treePatches?: { recordId: string; body: Record<string, unknown>; idempotencyKey: string }[] }).treePatches ?? []);

  test("Move to… offers Move here only on eligible loaded nodes, then patches the parent and reloads", async ({ page }) => {
    await mount(page, 1440, { tree: true, movable: true }, "?view=tree");
    await node(page, "1000").getByRole("button", { name: /Expand 1000/ }).click();
    await node(page, "1100").getByRole("button", { name: /Expand 1100/ }).click();
    await node(page, "1130").getByRole("button", { name: /Actions for 1130/ }).click();
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moving 1130 Inventory" })).toBeVisible();
    // Not on itself, not on its current parent, not on a leaf kind; yes on another branch.
    await expect(node(page, "1130").getByRole("button", { name: /Move under/ })).toHaveCount(0);
    await expect(node(page, "1100").getByRole("button", { name: /Move under/ })).toHaveCount(0);
    await expect(node(page, "3000").getByRole("button", { name: /Move under/ })).toHaveCount(0);
    await node(page, "1200").getByRole("button", { name: "Move under 1200 Non-current assets" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moving" })).toHaveCount(0);
    const [patch] = await patches(page);
    expect(patch!.body).toEqual({ parent: idOf(7) });
    expect(patch!.idempotencyKey).toMatch(/^tree-move-/);
    // The list reloads: 1130 now sits under 1200.
    await node(page, "1000").getByRole("button", { name: /Expand 1000/ }).click();
    await node(page, "1200").getByRole("button", { name: /Expand 1200/ }).click();
    await expect(node(page, "1130")).toHaveAttribute("aria-level", "3");
    await page.screenshot({ path: "tooling/config/test-results/entity-list-tree-move.png", fullPage: true });
  });

  test("a refused move explains itself and keeps move mode open", async ({ page }) => {
    await mount(page, 1440, { tree: true, movable: true, moveError: "HIERARCHY_DEPTH_EXCEEDED", maxDepth: 4 }, "?view=tree");
    await node(page, "2000").getByRole("button", { name: /Actions for 2000/ }).click();
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    await node(page, "1000").getByRole("button", { name: /Move under 1000/ }).click();
    await expect(page.getByRole("alert")).toHaveText("This move would go deeper than the 4 levels this tree allows.");
    await expect(page.getByRole("status").filter({ hasText: "Moving 2000 Liabilities" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel move" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moving" })).toHaveCount(0);
  });

  test("without movable, the row menu offers no move", async ({ page }) => {
    await mount(page, 1440, { tree: true }, "?view=tree");
    await node(page, "1000").getByRole("button", { name: /Actions for 1000/ }).click();
    await expect(page.getByRole("menuitem", { name: "Move to…" })).toHaveCount(0);
  });
});

test.describe("B5 tree picker", () => {
  test("a record lookup to a hierarchical Entity shows Tree and chooses at any level", async ({ page }) => {
    await mount(page, 1440, { tree: true, picker: true });
    await expect(page.getByRole("treegrid")).toBeVisible();
    await node(page, "1000").getByRole("button", { name: /Expand 1000/ }).click();
    await node(page, "1100").getByRole("radio", { name: "Select 1100" }).check();
    await expect.poll(() => page.evaluate(() => (window as unknown as { pickerSelection: string[] }).pickerSelection)).toEqual(["1100"]);
    // Board, Calendar and Gantt stay off in pickers; nothing here offers them.
    await expect(page.getByText("Move to…")).toHaveCount(0);
  });

  test("on phones the tree picker still offers a choice per node", async ({ page }) => {
    await mount(page, 390, { tree: true, picker: true });
    await node(page, "1000").getByRole("radio", { name: "Select 1000" }).check();
    await expect.poll(() => page.evaluate(() => (window as unknown as { pickerSelection: string[] }).pickerSelection)).toEqual(["1000"]);
  });
});

test.describe("A2 group aggregates and A3 month and quarter groups", () => {
  test("group headings show each group's published total, under exact counts", async ({ page }) => {
    await mount(page, 1440, { exact: true }, "?groups=status");
    await expect(headingRow(page, "Active").locator(".a-entity-tree__aggregate")).toHaveText("Annual budget total 1,835,000");
    await expect(headingRow(page, "Deprecated").locator(".a-entity-tree__aggregate")).toHaveText("Annual budget total 120,000");
    expect((await requests(page)).find(q => q.groupsOnly === "true")?.aggregate).toEqual(["budget:sum"]);
  });

  test("no totals without exact counts", async ({ page }) => {
    await mount(page, 1440, {}, "?groups=status");
    await expect(page.locator(".a-entity-tree__aggregate")).toHaveCount(0);
    expect((await requests(page)).some(q => q.aggregate)).toBe(false);
  });

  test("a date field groups by month in order, and a month loads its records by date range", async ({ page }) => {
    await mount(page, 1440, { exact: true }, "?groups=opened:month");
    await expect(page.locator('tr.a-entity-tree__group-row[aria-level="1"] strong')).toHaveText(["September 2026", "October 2026", "No value"]);
    const september = (await requests(page)).filter(q => (q.filter ?? []).some(f => f.includes("gte")));
    expect(september.at(-1)!.filter!.map(f => JSON.parse(f))).toEqual([{ field: "opened", operator: "gte", value: "2026-09-01" }, { field: "opened", operator: "lt", value: "2026-10-01" }]);
  });

  test("the Group dialog offers a date field by month and by quarter", async ({ page }) => {
    await mount(page, 1440, { exact: true });
    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Group by/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").first().click();
    await expect(page.getByRole("option", { name: "Opened by month" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Opened by quarter" })).toBeVisible();
  });
});

test("when the server returns the first 50 groups of more, the level says so", async ({ page }) => {
  await mount(page, 1440, { exact: true, truncateGroups: true }, "?groups=opened:month");
  await expect(page.getByText("Showing the first 50 groups. Narrow the filters to see the rest.")).toBeVisible();
});

