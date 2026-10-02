import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const bundle = build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React,{useEffect,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {PlatformShell} from './packages/platform/shell/shell/src/index';
    import {useI18n} from './packages/platform/foundation/i18n/src/react';
    import {EntityListRuntime} from './packages/platform/entity/runtime/list-view/src/index';
    import {EntityLink,EntityNavigationProvider} from './packages/platform/entity/runtime/list-view/src/entity-navigation';
    import {ApiTransportError} from './packages/platform/foundation/api-client/src/index';
    import {entityListDescriptorOperation,entityListOperation,recordBookmarkMembershipOperation} from './packages/platform/foundation/api-client/src/entity-list';
    const descriptor={schemaVersion:1,plane:'neon',entity:{code:'country',label:'Country',pluralLabel:'Countries',identityField:'code',detailRouteTemplate:'/app/entity/country/:recordId'},
      revision:{release:1,descriptorHash:'a'.repeat(64),surfaceHash:'b'.repeat(64)},surface:{key:'default_list',title:'Countries',defaultState:{filters:[],sort:[{field:'name',direction:'asc'}],columns:['code','name'],density:'comfortable',mode:'table'},supportedModes:['table','compact'],search:{minimumQueryLength:1}},
      fields:['code','name'].map((key,i)=>({key,label:i?'Name':'Code',valueKind:'string',semanticRole:i?'title':'identity',defaultVisible:true,defaultOrder:i,filterOperators:['contains','eq'],sortable:true,groupable:false,aggregations:[]})),
      actions:[],scope:{status:'ready',labels:[],fingerprint:'c'.repeat(64)},limits:{defaultPageSize:10,allowedPageSizes:[10,25],maxSortLevels:2,countMode:'none'}};
    window.queries=[];window.pending=[];window.navigations=[];window.shellMounts=0;window.scopeChanges=[];
    const client={request:async(op,input)=>{
      if(op===entityListDescriptorOperation)return descriptor;
      if(op===recordBookmarkMembershipOperation)return new Set();
      if(op!==entityListOperation)return [];
      window.queries.push(input.query);
      const result={schemaVersion:1,descriptorHash:'a'.repeat(64),scopeFingerprint:'c'.repeat(64),queryHash:'d'.repeat(64),rows:[{id:'record-1',values:{code:'MY',name:input.query.search||'Malaysia'}}],pagination:{pageSize:10,hasNext:true,nextCursor:'next-cursor',hasPrevious:!!input.query.cursor,countMode:'none'}};
      if(window.hold)return new Promise((resolve,reject)=>window.pending.push({resolve:()=>resolve(result),reject:(status=503)=>reject(new ApiTransportError('http','Failed',status)),signal:input.signal}));
      return result;
    }};
    function LocaleProbe(){const intl=useI18n();useEffect(()=>{window.localeRevisions=(window.localeRevisions||0)+1},[intl]);return null}
    const route={id:'country.list',moduleCode:'mdm',href:'/app/entity/country',label:'Countries',iconKey:'home',requiredPermissions:[],requiredFeatures:[],navigation:'primary',workspaceCode:'mdm',workspaceName:'Master data',moduleName:'Countries',sortOrder:1};
    const navigation={workspaces:[{code:'mdm',name:'Master data',href:'/app/entity/country',iconKey:'home',sortOrder:1,routes:[route]}],routes:[route],entityRoutes:[{entityCode:'country',operation:'list'}],landingHref:'/app/entity/country',unknownActiveModules:[]};
    function ActivityShell({children}){
      const [revision,setRevision]=useState(0);
      useEffect(()=>{
        const refresh=()=>{if(document.visibilityState==='visible'){setRevision(n=>n+1);setTimeout(()=>setRevision(n=>n+1),30)}};
        document.addEventListener('visibilitychange',refresh);
        return ()=>document.removeEventListener('visibilitychange',refresh);
      },[]);
      return <PlatformShell applicationName='Neon' tenantId='tenant' principalId='actor' tenantLabel='Tenant' accountLabel='Actor' navigation={navigation} activity={{notifications:[],inbox:[],unreadNotificationCount:revision,openInboxCount:0}}><LocaleProbe/>{children}</PlatformShell>;
    }
    function App(){const [route,setRoute]=useState('list');const [scope,setScope]=useState(undefined);
      useEffect(()=>{window.shellMounts++},[]);window.changeScope=setScope;
      const navigate=href=>{window.navigations.push(href);setRoute(href)};
      return <><header data-shell>Shell</header><button onClick={()=>setRoute('list')}>Back to list</button>
        {route==='list'?<EntityListRuntime client={client} entityCode='country' scopeCoordinate={scope} onScopeCoordinateChange={value=>{window.scopeChanges.push(value);setScope(value)}} renderScopeControl={({onChange})=><button onClick={()=>onChange({operatingOrganizationId:'selected-organization'})}>Choose organization</button>} onNavigate={navigate}/>:<p data-detail>Detail</p>}
        <EntityNavigationProvider navigate={navigate}><EntityLink id='external' href='https://outside.test/'>External</EntityLink><EntityLink id='download' href='/file' download>Download</EntityLink><EntityLink id='blank' href='/new' target='_blank'>New tab</EntityLink></EntityNavigationProvider>
      </>;
    }
    createRoot(document.getElementById('root')).render(location.search.includes('activityShell')?<ActivityShell><App/></ActivityShell>:<App/>);
  ` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  loader: { ".css": "empty" }, tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
}).then(result => result.outputFiles[0]!.text);
async function mount(page: Page, query = "") {
  await page.route("https://list.test/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto(`https://list.test/app/entity/country${query}`);
  await page.addScriptTag({ content: await bundle });
  await expect(page.locator('.a-entity-list__record-link').first()).toBeVisible();
}
for (const mode of ["table", "compact"]) test(`${mode} record links use application navigation and preserve shell`, async ({page}) => {
  await mount(page, mode === "compact" ? "?view=compact" : "");
  const link = page.locator('.a-entity-list__record-link').first();
  await expect(link).toHaveAttribute('href','/app/entity/country/record-1');
  // Prevent native popup/download only after the link handler has had its chance.
  const prevented = await page.evaluate(() => {
    const results: boolean[]=[];
    for (const [selector, init] of [['.a-entity-list__record-link',{ctrlKey:true}],['.a-entity-list__record-link',{button:1}],['#external',{}],['#download',{}],['#blank',{}]] as const) {
      document.addEventListener('click', event=>{results.push(event.defaultPrevented);event.preventDefault()}, {once:true});
      document.querySelector(selector)!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,...init}));
    }
    return results;
  });
  expect(prevented).toEqual([false,false,false,false,false]);
  expect(await page.evaluate(()=>(window as any).navigations)).toEqual([]);
  await link.click();
  await expect(page.locator('[data-detail]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).navigations)).toEqual(['/app/entity/country/record-1']);
  expect(await page.evaluate(()=>(window as any).shellMounts)).toBe(1);
});
test("row Enter uses the same application navigation", async ({page}) => {
  await mount(page);
  await page.locator('tbody tr[tabindex="0"]').press('Enter');
  await expect(page.locator('[data-detail]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).shellMounts)).toBe(1);
});
test("query refresh retains rows, disables stale cursors and ignores late results", async ({page}) => {
  await mount(page);
  await page.evaluate(() => { (window as any).hold=true; });
  const search=page.getByRole('searchbox');
  await search.fill('Singapore');await search.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(1);
  await expect(page.getByText('Malaysia',{exact:true})).toBeVisible();
  await expect(page.locator('.a-entity-list__table-wrap')).toHaveAttribute('aria-busy','true');
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await search.fill('Thailand');await search.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(2);
  await page.evaluate(() => (window as any).pending[1].resolve());
  await expect(page.getByText('Thailand',{exact:true})).toBeVisible();
  await page.evaluate(() => (window as any).pending[0].resolve());
  await expect(page.getByText('Thailand',{exact:true})).toBeVisible();
  await expect(page.getByText('Singapore',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeEnabled();
});
test("transient failure retains rows but denial and scope change clear them", async ({page}) => {
  await mount(page);await page.evaluate(() => { (window as any).hold=true; });
  const search=page.getByRole('searchbox');
  await search.fill('Singapore');await search.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(1);
  await page.evaluate(() => (window as any).pending[0].reject(503));
  await expect(page.getByText('Malaysia',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await search.fill('Thailand');await search.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).pending.length)).toBe(2);
  await page.evaluate(() => (window as any).pending[1].reject(403));
  await expect(page.getByText('Malaysia',{exact:true})).toHaveCount(0);
  await page.evaluate(() => { (window as any).hold=false;(window as any).changeScope({operatingOrganizationId:'new-organization'}); });
  await expect(page.locator('.a-entity-list__record-link').first()).toBeVisible();
  await page.evaluate(() => { (window as any).hold=true;(window as any).changeScope({operatingOrganizationId:'another-organization'}); });
  await expect(page.locator('.a-entity-list__record-link')).toHaveCount(0);
});
test("reloaded cursor page offers First page and then normal Next/Previous", async ({page}) => {
  await mount(page,'?cursor=restored-cursor&page=2');
  await expect(page.getByRole('button',{name:'First page',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'First page',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).queries.at(-1).cursor)).toBeUndefined();
  await expect(page.getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('button',{name:'Previous',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).queries.at(-1).cursor)).toBeUndefined();
});

test("scope controls notify their owner and follow subsequent parent context changes", async ({page}) => {
  await mount(page);
  await page.getByRole('button',{name:'Choose organization',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).queries.at(-1).operatingOrganizationId)).toBe('selected-organization');
  expect(await page.evaluate(()=>(window as any).scopeChanges)).toEqual([{operatingOrganizationId:'selected-organization'}]);
  await page.evaluate(()=>(window as any).changeScope({operatingOrganizationId:'parent-organization'}));
  await expect.poll(()=>page.evaluate(()=>(window as any).queries.at(-1).operatingOrganizationId)).toBe('parent-organization');
});


test("returning to the tab updates shell activity without refetching or replacing entity rows", async ({ page }) => {
  await mount(page, "?activityShell=true");
  await expect.poll(() => page.evaluate(() => (window as any).queries.length)).toBe(1);
  const revisions = await page.evaluate(() => {
    (window as any).originalRow = document.querySelector("tbody tr");
    return (window as any).localeRevisions;
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByRole("button", { name: new RegExp("Notifications.*" + (i + 1) * 2) }).first()).toBeAttached();
  }
  expect(await page.evaluate(() => (window as any).queries.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).localeRevisions)).toBe(revisions);
  expect(await page.evaluate(() => document.querySelector("tbody tr") === (window as any).originalRow)).toBe(true);
  await expect(page.locator('table[aria-busy="true"]')).toHaveCount(0);
});
