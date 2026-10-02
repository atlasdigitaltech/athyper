import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { withSessionDefaults } from "./fixtures/session-stub";
import { chooseOption } from "./fixtures/choice";
const bundle = build({
  stdin: {
    loader: "tsx",
    resolveDir: process.cwd(),
    contents: `
 import country from './metadata/products/shared/entities/country/definition.json';
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {MetadataDetailWorkspace} from './packages/platform/entity/runtime/form-detail/src/detail-workspace';
 import {parseEntityRecordPresentation} from './packages/contracts/platform/entity-runtime/src/record-presentation';
 import {IntlProvider} from './packages/platform/foundation/i18n/src/react';
 import {createEffectiveLocalization} from './packages/platform/foundation/i18n/src/index';
 import {entityMessages,entityFallbackMessages} from './packages/platform/foundation/i18n/src/entity-catalogs';
 const presentation=parseEntityRecordPresentation({schemaVersion:1,titleField:'name',sections:[{key:'main',label:'Details',fields:['name','enabled','status','date']},{key:'coverage',label:'Other details',fields:['missing']},{key:'private',label:'Hidden section',fields:['secret']}],navigation:{mode:'scroll',tabs:[{key:'overview',label:'Overview',sectionKeys:['main','coverage','private']}]}});
 const countryDescriptor={schema:'athyper.entity-detail-descriptor/1',plane:'neon',pageKind:'detail',entity:{code:'country',label:'Country'},revision:{release:'release'},titleField:'name',fields:country.definition.fields.map(f=>({key:f.key,label:f.label.defaultText,kind:f.type==='boolean'?'boolean':'string',readOnly:true,required:!!f.required})),actions:[],collaboration:['comments','attachments'],activity:true,presentation:parseEntityRecordPresentation({schemaVersion:1,titleField:'name',navigation:country.definition.navigation,sections:country.definition.sections.map(s=>({...s,label:s.label.defaultText}))})};
 function App(){const [identity,setIdentity]=useState('first');return <IntlProvider localization={createEffectiveLocalization({uiLocale:window.locale??'en',formatLocale:window.locale??'en',timeZone:'UTC'})} messages={entityMessages(window.locale??'en')} fallbackMessages={entityFallbackMessages}><><button onClick={()=>{window.tenant='second';setIdentity('second')}}>Switch tenant</button><MetadataDetailWorkspace key={identity} entityCode={window.country?"country":"example_reference"} preferenceKey="test.activity" descriptor={window.country?countryDescriptor:{schema:'athyper.entity-detail-descriptor/1',plane:'neon',pageKind:'detail',entity:{code:'example_reference',label:'Example'},revision:{release:'release'},titleField:'name',fields:[{key:'name',label:'Name',kind:'string'},{key:'enabled',label:'Enabled',kind:'boolean'},{key:'status',label:'Status',kind:'enum',options:[{value:'active',label:'Active'}]},{key:'date',label:'Effective date',kind:'date'},{key:'missing',label:'Optional detail',kind:'string'}],actions:[],collaboration:['comments','attachments'],activity:window.activityEnabled!==false,presentation}} record={{id:'00000000-0000-4000-8000-000000000010',values:{name:'Example'}}}/></></IntlProvider>}
 createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /^@athyper\/platform-shell-app-foundation$/ },
          () => ({ path: "session", namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          loader: "js",
          resolveDir: process.cwd(),
          contents: withSessionDefaults(`
 import {ApiTransportError} from './packages/platform/foundation/api-client/src/index';
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const snap=n=>({id:id(n),capturedAt:'2026-09-28T00:00:00Z',capturedBy:'Test user',sequence:n,sourceRecordVersion:null,coverage:'authorized_fields'});
 const client={request:async(op,input={})=>{const path=op.path(input.params??{});window.requests.push(path);window.lastQuery=input.query;if(path.endsWith('/compare')&&window.incompatible)throw new ApiTransportError('conflict','Conflict',409);if(window.denied)throw Error('Forbidden');let result;
 if(path.endsWith('/activity'))result={views:window.timelineEnabled?['timeline','auditLog','snapshots']:window.versionsEnabled?['auditLog','versions','snapshots']:['auditLog','snapshots'],defaultView:window.defaultView??'auditLog',canCapture:window.captureAllowed!==false,releaseHash:'release',defaultRangeDays:window.defaultDays??30,maxRangeDays:90,supportsCalendarRanges:window.calendarRanges!==false};
 else if(path.endsWith('/timeline'))result={items:window.timelineItems??[],releaseHash:'release'};
 else if(path.endsWith('/versions'))result={items:[{id:id(8),occurredAt:'2026-09-28T00:00:00Z',version:7,operation:'patch',actor:'Test user',changedFields:['name']}],releaseHash:'release'};
 else if(path.endsWith('/audit'))result={items:window.emptyAudit?[]:[{id:id(9),occurredAt:'2026-09-28T00:00:00Z',event:'record.updated',operation:'update',outcome:'success',actor:'Test user',changedFields:['name']}],releaseHash:'release'};
 else if(path.endsWith('/snapshots')&&op.method==='POST'){window.captureKeys.push(input.idempotencyKey);if(window.failCapture){window.failCapture=false;throw Error('Lost response');}result={id:id(3),replayed:window.captureKeys.length>1};}
 else if(path.endsWith('/snapshots'))result={items:Array.from({length:window.snapshotCount??2},(_,i)=>snap(i+1)),releaseHash:'release'};
 else if(path.includes('/collections/')) {if(window.collectionDenied)throw new ApiTransportError('denied','Denied',403);if(window.collectionExpired&&input.body?.cursor)throw new ApiTransportError('expired','Expired',400);result=op.method==='GET'&&window.collectionSnapshot?window.collectionSnapshot:window.collectionPages[input.body?.cursor?1:0];}
 else if(path.endsWith('/compare'))result={from:input.body.from,to:input.body.to,fields:window.comparisonFields??[{key:'name',label:'name',before:{state:'value',value:'Old'},after:{state:'value',value:window.tenant??'New'},changed:true}]};
 else if(path.includes('/snapshots/'))result={...snap(1),collections:window.collectionPages?[{key:'related',label:'Related records',sectionKey:'main'}]:[],fields:[{key:'name',label:'name',state:'value',value:'Captured value'}]};
 else result={releaseId:'release',releaseHash:'release',revision:'1',sectionKey:'comments',presentation:{rendererKey:'platform.comments.v1',fields:[],childCollections:[]},capability:{actions:[]},data:{items:[]}};
 return op.parse?op.parse(result):result;}};
 export {ErrorSurface} from "./packages/platform/shell/app-foundation/src/boundaries";
 export const useApiClient=()=>client;export const useSessionIdentity=()=>({scope:{tenantId:window.tenant??'first',principalId:'actor',authEpoch:1}});export const useToasts=()=>({push:()=>{}});export const useOptionalAppearanceProfile=()=>undefined;export const readBrowserCsrfToken=()=>undefined;
 `),
        }));
      },
    },
  ],
}).then((result) => result.outputFiles[0]!.text);
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/detail-workspace.css",
  "packages/platform/entity/runtime/form-detail/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/record/record-collaboration.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
async function mount(
  page: import("@playwright/test").Page,
  settings: Record<string, unknown> = {},
) {
  await page.route("https://activity.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("https://activity.test/");
  await page.evaluate(
    (settings) =>
      Object.assign(window, { requests: [], captureKeys: [], ...settings }),
    settings,
  );
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: await bundle });
}
test("navigation order, lazy reads, shared side/full state, comparison expansion and Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mount(page);
  const controls = page.locator(".a-entity-record__collaboration-control");
  await expect(controls).toHaveText(["Comments", "Files", "Activity"]);
  expect(await page.evaluate(() => (window as any).requests)).toEqual([]);
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  await expect(page.locator(".a-activity-events").getByText("record.updated").first()).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Versions", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Saved snapshots", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select snapshot 1", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select snapshot 2", exact: true })
    .check();
  await chooseOption(page.getByRole("combobox", { name: "Activity date range" }), "last:7");
  await expect(
    page.getByRole("checkbox", { name: "Select snapshot 1", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: /Side view/i }).click();
  await expect(page.locator(".a-collaboration-panel")).toHaveAttribute(
    "data-mode",
    "pinned",
  );
  await expect(
    page.getByRole("checkbox", { name: "Select snapshot 1", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Compare selected snapshots" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Snapshot comparison" }),
  ).toBeVisible();
  await expect(page.locator(".a-collaboration-panel")).toHaveAttribute(
    "data-mode",
    "content",
  );
  await expect(page.getByRole("combobox", { name: "Activity date range" })).toHaveText("Last 7 days");
  await page.screenshot({
    path: test.info().outputPath("activity-full.png"),
    fullPage: true,
  });
  await page.goBack();
  await expect(page.locator(".a-collaboration-panel")).toHaveAttribute(
    "data-mode",
    "pinned",
  );
  await expect(
    page.getByRole("heading", { name: "Snapshot comparison" }),
  ).toBeVisible();
});
test("capture retry retains command key; access denial and identity switch remove old results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mount(page, { failCapture: true });
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  await page.getByRole("tab", { name: "Saved snapshots", exact: true }).click();
  await page
    .getByRole("button", {name:"Save snapshot", exact:true})
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", {name:"Save snapshot", exact:true})
    .click();
  await expect(
    page.getByText("Snapshot saved.", { exact: true }),
  ).toBeVisible();
  const keys = await page.evaluate(() => (window as any).captureKeys);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.getByRole("button", { name: "Snapshot 1", exact: true }).click();
  await expect(page.getByText("Captured value", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).denied = true;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Captured value", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Switch tenant" }).click();
  await expect(page.getByText("Captured value", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("alert")).toBeVisible();
});
test("compact view, read-only actions and absent capability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 850 });
  await mount(page, { captureAllowed: false });
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  await page.getByRole("tab", { name: "Saved snapshots", exact: true }).click();
  await expect(
    page.getByRole("button", {name:"Save snapshot", exact:true}),
  ).toHaveCount(0);
  await expect(page.locator(".a-collaboration-panel")).toHaveAttribute(
    "data-mode",
    "content",
  );
  await mount(page, { activityEnabled: false });
  await expect(
    page.getByRole("button", { name: "Open Activity", exact: true }),
  ).toHaveCount(0);
});
test("keyboard view selection and reading offset survive dock/full transitions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mount(page, { snapshotCount: 30 });
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  const audit = page.getByRole("tab", { name: "Audit log", exact: true });
  await audit.focus();
  await audit.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Saved snapshots", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Side view/i }).click();
  const body = page.locator(".a-entity-activity__content");
  await body.evaluate((element) => {
    element.scrollTop = 500;
  });
  await expect
    .poll(() => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(400);
  await page.getByRole("button", { name: /Full view/i }).click();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(400);
});

test("published profile supplies the default view and date range", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mount(page, { defaultView: "snapshots", defaultDays: 7 });
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Saved snapshots", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("combobox", { name: "Activity date range" })).toHaveText("Last 7 days");
  const calls = await page.evaluate(() => (window as any).requests.length);
  await page.getByRole("button", { name: /Side view/i }).click();
  await expect(
    page.getByRole("tab", { name: "Saved snapshots", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(
    calls,
  );
  expect(
    (await page.evaluate(() => (window as any).requests)).some((path: string) =>
      path.endsWith("/audit"),
    ),
  ).toBe(false);
});

test("audit timeline, empty guidance and keyboard boundaries work in side and full views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mount(page);
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  await expect(page.locator(".a-activity-events").getByText("Succeeded", { exact: true })).toBeVisible();
  await page.locator(".a-activity-event-inspect summary").click();
  await expect(page.locator(".a-activity-event-inspect dd").last()).toHaveText("Name");
  await page.getByRole("button", { name: /Side view/i }).click();
  await expect(page.locator(".a-collaboration-panel")).toHaveAttribute(
    "data-mode",
    "pinned",
  );
  await page.screenshot({
    path: test.info().outputPath("activity-side.png"),
    fullPage: true,
  });
  const audit = page.getByRole("tab", { name: "Audit log", exact: true });
  await audit.focus();
  await audit.press("End");
  await expect(
    page.getByRole("tab", { name: "Saved snapshots", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("checkbox", { name: "Select snapshot 1", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Select snapshot 1", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("tab", { name: "Saved snapshots", exact: true })
    .press("Home");
  await expect(audit).toBeFocused();
  await page.evaluate(() => {
    (window as any).emptyAudit = true;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Try a wider date range. Events appear here when recorded."),
  ).toBeVisible();
});

test("Arabic activity fits a compact RTL viewport and uses localized outcomes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await mount(page, { locale: "ar" });
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  await page.locator(".a-entity-record__collaboration-control").last().click();
  await expect(page.locator(".a-activity-events").getByText("نجح", { exact: true })).toBeVisible();
  const bounds = await page
    .locator(".a-entity-activity")
    .evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await page.screenshot({
    path: test.info().outputPath("activity-rtl.png"),
    fullPage: true,
  });
});

test("Versions displays authoritative headers only when admitted and preserves side/full state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mount(page, { versionsEnabled: true });
  await page
    .getByRole("button", { name: "Open Activity", exact: true })
    .click();
  await page.getByRole("tab", { name: "Versions", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Versions", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Version 7", { exact: true })).toBeVisible();
  await expect(page.getByText("Committed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {name:"Save snapshot", exact:true}),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Side view/i }).click();
  await expect(page.locator(".a-collaboration-panel")).toHaveAttribute(
    "data-mode",
    "pinned",
  );
  await expect(
    page.getByRole("tab", { name: "Versions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});


test("metadata comparison keeps limits separate, formats values, and preserves controls across side/full", async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 1100 });
 const value = (value: unknown) => ({ state: "value", value });
 await mount(page, { defaultView: "snapshots", snapshotCount: 3, comparisonFields: [
  { key: "name", label: "name", before: value("Old"), after: value("New"), changed: true },
  { key: "enabled", label: "enabled", before: value(false), after: value(true), changed: true },
  { key: "status", label: "status", before: value("active"), after: value("active"), changed: false },
  { key: "date", label: "date", before: value("2026-09-28"), after: value("2026-09-28"), changed: false },
  { key: "missing", label: "missing", before: { state: "uncaptured" }, after: value(null), changed: false },
 ] });
 await page.getByRole("button", { name: "Open Activity", exact: true }).click();
 const info = page.locator('summary[aria-label="Capture information for snapshot 1"]');
 // Exercise the native disclosure directly; summary role mappings vary by browser.
 await info.focus(); await info.press("Enter");
 await expect(page.locator('.a-entity-activity__capture-info').first().getByText("Captured fields available to the capturing user. This may not include every record field.", { exact: true })).toBeVisible();
 await info.press("Space");
 await expect(page.locator('.a-entity-activity__capture-info[open]')).toHaveCount(0);
 await page.getByRole("checkbox", { name: "Select snapshot 2", exact: true }).check();
 await page.getByRole("checkbox", { name: "Select snapshot 1", exact: true }).check();
 await expect(page.getByRole("checkbox", { name: "Select snapshot 3", exact: true })).toBeDisabled();
 await page.getByRole("button", { name: "Compare selected snapshots" }).click();
 const comparison = page.locator('.a-activity-comparison');
 await expect(comparison.locator('header p')).toContainText('Snapshot 1');
 await expect(comparison.locator('.a-activity-comparison__counts')).toHaveText('2 changed fields1 affected section');
 await expect(comparison.getByText('Yes', { exact: true })).toBeVisible();
 await expect(comparison.getByText('Hidden section', { exact: true })).toHaveCount(0);
 await expect(comparison.locator('.a-activity-comparison__notes')).toContainText('Other details');
 await expect(comparison.locator('[data-limited="true"]')).toHaveCount(0);
 await comparison.getByRole('button', { name: 'Collapse all' }).click();
 await expect(comparison.locator('details[open]')).toHaveCount(0);
 await page.getByRole('button', { name: /Side view/i }).click();
 await expect(comparison.locator('details[open]')).toHaveCount(0);
 await comparison.getByRole('button', { name: 'Expand all' }).click();
 await expect(comparison.getByText('Not captured', { exact: true })).toBeVisible();
 await expect(comparison.getByText('Empty · captured', { exact: true })).toBeVisible();
 await comparison.getByRole('checkbox', { name: 'Changes only' }).uncheck();
 await expect(comparison.getByText('Active', { exact: true }).first()).toBeVisible();
 await expect(comparison.getByText('Sep 28, 2026', { exact: true }).first()).toBeVisible();
 await page.getByRole('button', { name: /Full view/i }).click();
 await expect(comparison.getByRole('checkbox', { name: 'Changes only' })).not.toBeChecked();
 await page.screenshot({ path: test.info().outputPath('activity-comparison-grouped.png'), fullPage: true });
 await page.setViewportSize({ width: 390, height: 850 });
 await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
 await expect.poll(() => comparison.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test("no comparable changes shows one scoped limitation and no zero counts", async ({ page }) => {
 await mount(page, { defaultView: 'snapshots', comparisonFields: [{ key: 'missing', label: 'missing', before: {state:'uncaptured'}, after:{state:'value',value:null}, changed:false }] });
 await page.getByRole('button', { name: 'Open Activity', exact:true }).click();
 for (const n of [1,2]) await page.getByRole('checkbox', {name: 'Select snapshot '+n, exact:true}).check();
 await page.getByRole('button', {name:'Compare selected snapshots'}).click();
 const comparison=page.locator('.a-activity-comparison');
 await expect(comparison.locator('[data-limited="true"]')).toHaveCount(1);
 await expect(comparison.locator('.a-activity-comparison__counts span')).toHaveCount(0);
 await expect(comparison.locator('.a-activity-comparison__notes')).toContainText('Other details');
});


test("incompatible historical snapshots explain the limit without guessing changes", async ({ page }) => {
 await mount(page, { defaultView: 'snapshots', incompatible: true });
 await page.getByRole('button', {name:'Open Activity',exact:true}).click();
 for (const n of [1,2]) await page.getByRole('checkbox',{name:'Select snapshot '+n,exact:true}).check();
 await page.getByRole('button',{name:'Compare selected snapshots'}).click();
 await expect(page.getByText('These saved values cannot be compared with the current record definition. Choose compatible snapshots; no field changes have been inferred.', {exact:true})).toBeVisible();
 await expect(page.locator('.a-activity-comparison')).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:'Select snapshot 1',exact:true})).toBeChecked();
});

const collectionField=(key:string,before:unknown,after:unknown,changed=true)=>({key,label:key,before:{state:'value',value:before},after:{state:'value',value:after},changed});
const collectionRow=(id:string,change:string,fields:unknown[]=[])=>({id,change,beforePresence:change==='added'?'absent':'present',afterPresence:change==='removed'?'absent':'present',valueComparison:change==='replaced'?'different_target':'same_record',fields});
const collectionPage=(items:unknown[],counts={},extra={})=>({key:'related',label:'Related records',from:'one',to:'two',releaseHash:'release',totalItems:items.length,notes:[],counts:{added:0,updated:0,removed:0,replaced:0,unchanged:0,...counts},items,...extra});
async function openCollections(page:import('@playwright/test').Page,pages:unknown[],settings={}) {
 await mount(page,{defaultView:'snapshots',collectionPages:pages,...settings});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 for(const n of [1,2])await page.getByRole('checkbox',{name:'Select snapshot '+n,exact:true}).check();
 await page.getByRole('button',{name:'Compare selected snapshots'}).click();
 return page.locator('.a-activity-collection');
}
test('collection single record keyboard expansion and side/full state',async({page})=>{
 await page.setViewportSize({width:1440,height:950});
 const section=await openCollections(page,[collectionPage([collectionRow('stable-link','updated',[collectionField('Street','Old street','New street')])],{updated:1})]);
 await expect(section.getByText('Updated: 1',{exact:true})).toBeVisible();
 await expect(section.getByText('1 changed field',{exact:true})).toBeVisible();
 const summary=section.locator('summary');await summary.focus();await page.keyboard.press('Enter');
 await expect(section.getByText('New street',{exact:true})).toBeVisible();
 await section.getByRole('checkbox',{name:'Changes only'}).uncheck();
 await page.getByRole('button',{name:/Side view/i}).click();
 await expect(section.locator('details[open]')).toHaveCount(1);
 await expect(section.getByRole('checkbox',{name:'Changes only'})).not.toBeChecked();
 await page.getByRole('button',{name:/Full view/i}).click();
 await expect(section.locator('details[open]')).toHaveCount(1);
 await summary.focus();await page.keyboard.press('Space');await expect(section.locator('details[open]')).toHaveCount(0);
});
test('collection address-like records distinguish additions removals and replacement',async({page})=>{
 const section=await openCollections(page,[collectionPage([
 collectionRow('link-1','added',[collectionField('Street',null,'New street',false)]),
 collectionRow('link-2','removed',[collectionField('Street','Old street',null,false)]),
 collectionRow('link-3','replaced',[collectionField('Street','First target','Different target',false)]),
 collectionRow('link-4','unchanged',[collectionField('Street','Same','Same',false)])],{added:1,removed:1,replaced:1,unchanged:1})]);
 await expect(section.locator('summary')).toHaveCount(3);
 await section.getByRole('button',{name:'Expand all'}).click();
 await expect(section.getByText('Not present in this capture',{exact:true})).toHaveCount(2);
 await expect(section.getByText('A different target is linked. These values are not edits to the same target record.',{exact:true})).toBeVisible();
 await expect(section.getByText(/changed field/)).toHaveCount(0);
 await section.getByRole('checkbox',{name:'Changes only'}).uncheck();await expect(section.locator('summary')).toHaveCount(4);
});
test('collection line-like records keep repeated products and exact decimals across pages',async({page})=>{
 const first=collectionRow('line-A','updated',[collectionField('Product','P1','P1',false),collectionField('Quantity','1.000000000000000001','1.000000000000000002'),collectionField('Position',1,2)]);
 const second=collectionRow('line-B','updated',[collectionField('Product','P1','P1',false),collectionField('Price','99999999999999999.01','99999999999999999.02')]);
 const section=await openCollections(page,[collectionPage([first],{updated:2},{totalItems:2,nextCursor:'next'}),collectionPage([second],{updated:2},{totalItems:2})]);
 await section.getByRole('button',{name:'Load more'}).click();await expect(section.locator('summary')).toHaveCount(2);
 await section.getByRole('button',{name:'Expand all'}).click();
 await expect(section.getByText('1.000000000000000002',{exact:true})).toBeVisible();
 await expect(section.getByText('99999999999999999.02',{exact:true})).toBeVisible();
 await expect(section.getByText('P1',{exact:true})).toHaveCount(4);
 await expect(section.getByText('Updated: 2',{exact:true})).toBeVisible();
});
for(const note of ['incomplete_capture','incompatible_scope','restricted_scope','independent_sources'])test('collection notes survive changes-only: '+note,async({page})=>{
 const section=await openCollections(page,[collectionPage([],{}, {notes:[note]})]);
 await expect(section.locator('.a-activity-comparison__notes')).toBeVisible();
 await expect(section.locator('.a-activity-comparison__counts span')).toHaveCount(0);
 await expect(section.locator('summary')).toHaveCount(0);
});
test('collection paging rejects expired authorization and clears previously loaded values',async({page})=>{
 const section=await openCollections(page,[collectionPage([collectionRow('visible','updated',[collectionField('Value','Before','Sensitive')])],{updated:2},{totalItems:2,nextCursor:'next'})],{collectionExpired:true});
 await section.getByRole('button',{name:'Expand all'}).click();await expect(section.getByText('Sensitive',{exact:true})).toBeVisible();
 await section.getByRole('button',{name:'Load more'}).click();await expect(section.locator('summary')).toHaveCount(0);
 await expect(section.getByText('Sensitive',{exact:true})).toHaveCount(0);await expect(section.getByRole('button',{name:'Retry'})).toBeVisible();
});
test('collection narrow RTL and reduced-motion layout stays within its container',async({page})=>{
 await page.setViewportSize({width:390,height:850});await page.emulateMedia({reducedMotion:'reduce'});
 const section=await openCollections(page,[collectionPage([collectionRow('stable-'+('x'.repeat(80)),'updated',[collectionField('Long text','Old','x'.repeat(180))])],{updated:1})]);
 await section.getByRole('button',{name:'Expand all'}).click();await page.evaluate(()=>document.documentElement.dir='rtl');
 await expect.poll(()=>section.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath('collection-rtl.png'),fullPage:true});
});

test('Country metadata root comparison stays read-only with no collection enrollment',async({page})=>{
 await mount(page,{country:true,defaultView:'snapshots',captureAllowed:false,comparisonFields:[collectionField('name','Old country','Country name'),collectionField('has_postal_codes',false,true)]});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 for(const n of [1,2])await page.getByRole('checkbox',{name:'Select snapshot '+n,exact:true}).check();
 await page.getByRole('button',{name:'Compare selected snapshots'}).click();
 await expect(page.locator('.a-activity-comparison__section').getByText('Country',{exact:true})).toBeVisible();
 await expect(page.locator('.a-activity-comparison__section').getByText('Postal and address',{exact:true})).toBeVisible();
 await expect(page.getByText('Yes',{exact:true})).toBeVisible();
 await expect(page.locator('.a-activity-collection')).toHaveCount(0);
 expect((await page.evaluate(()=>(window as any).requests)).some((path:string)=>path.includes('/entity-runtime/country/'))).toBe(true);
 expect((await page.evaluate(()=>(window as any).requests)).some((path:string)=>path.includes('/collections/'))).toBe(false);
});
test('collection snapshot read uses current format metadata without implying changes',async({page})=>{
 await mount(page,{defaultView:'snapshots',collectionPages:[],collectionSnapshot:{key:'related',label:'Related records',snapshotId:'one',capturedAt:'2026-09-28T00:00:00Z',releaseHash:'release',totalItems:1,notes:[],items:[{id:'single',fields:[{key:'date',label:'Effective date',format:{kind:'date'},state:'value',value:'2026-09-28'},{key:'status',label:'Status',format:{kind:'enum',options:[{value:'active',label:'Active'}]},state:'value',value:'active'},{key:'missing',label:'Missing',state:'uncaptured'},{key:'empty',label:'Empty',state:'value',value:null}]}]}});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 await page.getByRole('button',{name:'Snapshot 1',exact:true}).click();
 const section=page.locator('.a-activity-collection');await section.getByRole('button',{name:'Expand all'}).click();
 for(const value of ['Sep 28, 2026','Active','Not captured','Empty · captured'])await expect(section.getByText(value,{exact:true})).toBeVisible();
 await expect(section.getByRole('checkbox')).toHaveCount(0);
});
test('collection denied access removes section label and records',async({page})=>{
 const section=await openCollections(page,[collectionPage([])],{collectionDenied:true});
 await expect(section.getByRole('button',{name:'Retry'})).toBeVisible();
 await expect(section.getByText('Related records',{exact:true})).toHaveCount(0);
 await expect(section.locator('summary')).toHaveCount(0);
});

test('complete empty collection and unchanged collection omit zero change categories',async({page})=>{
 const section=await openCollections(page,[collectionPage([])]);
 await expect(section.getByText('No accessible captured records. Review any comparison notes below.',{exact:true})).toBeVisible();
 await expect(section.locator('.a-activity-comparison__notes')).toHaveCount(0);
 await expect(section.locator('.a-activity-comparison__counts span')).toHaveCount(0);
});
test('Arabic collection comparison localizes controls and states',async({page})=>{
 await mount(page,{locale:'ar',defaultView:'snapshots',collectionPages:[collectionPage([collectionRow('stable','updated',[collectionField('Name','Before','After')])],{updated:1})]});
 await page.locator('.a-entity-record__collaboration-control').last().click();
 const boxes=page.locator('.a-entity-activity__snapshot-row input');await boxes.nth(0).check();await boxes.nth(1).check();
 await page.locator('.a-entity-activity__selection button').last().click();
 const section=page.locator('.a-activity-collection');
 await expect(section.getByRole('checkbox',{name:'التغييرات فقط'})).toBeVisible();
 await expect(section.getByText('محدّث',{exact:true})).toBeVisible();
 await section.getByRole('button',{name:'توسيع الكل'}).click();
 await expect(section.getByText('After',{exact:true})).toBeVisible();
});

test('Timeline mixed-outcome large groups preserve every event and keep snapshot capture separate',async({page})=>{
 const audit=Array.from({length:12},(_,i)=>({id:'audit:'+i,occurredAt:'2026-09-28T00:00:00.000123Z',event:'record.updated',operation:'update',outcome:i<3?'failure':'success',actor:'Change actor',changedFields:['name'],source:'audit',correlation:'command-1'}));
 const capture={id:'snapshot:one',occurredAt:'2026-09-28T00:00:00.000123Z',event:'snapshot.saved',operation:'capture',outcome:'success',actor:'Capture actor',changedFields:[],source:'snapshot'};
 await mount(page,{timelineEnabled:true,defaultView:'timeline',timelineItems:[capture,...audit]});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 await page.locator('.a-activity-event-inspect').first().locator('summary').click();
 await expect(page.getByText('This capture does not establish a record change.',{exact:true})).toBeVisible();
 await page.locator('.a-activity-timeline > li > details > summary').filter({hasText:'Related events'}).click();
 await expect(page.getByText('Failed: 3',{exact:true})).toBeVisible();await expect(page.getByText('Succeeded: 9',{exact:true})).toBeVisible();
 await expect(page.getByText('Change actor',{exact:true})).toHaveCount(12);
 await expect(page.getByText('Capture actor',{exact:true})).toHaveCount(1);
 await expect(page.locator('.a-activity-timeline > li')).toHaveCount(2);
});
test('Activity side view keeps the first event near the header and collapses advanced filters', async ({page}) => {
 await page.setViewportSize({width:1440,height:950}); await mount(page,{timelineEnabled:true,defaultView:'timeline',timelineItems:Array.from({length:10},(_,i)=>({id:'snapshot:'+i,occurredAt:'2026-09-28T00:00:00Z',event:'snapshot.saved',operation:'capture',outcome:'success',actor:'Capture actor',changedFields:[],source:'snapshot'}))});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 await page.getByRole('button',{name:/Side view/i}).click();
 const panel=page.locator('.a-collaboration-panel');
 await expect(panel.locator('.a-collaboration-panel__tabs')).toBeHidden();
 await expect(panel.locator('.a-entity-activity__intro')).toHaveCount(0);
 await expect(page.getByLabel('Event code (exact)')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();
 const header=await panel.locator('.a-collaboration-panel__header').boundingBox();
 const event=await panel.locator('.a-entity-activity__event').first().boundingBox();
 await page.screenshot({path:"/tmp/activity-range-side.png"});
 expect(event!.y-header!.y).toBeLessThanOrEqual(240);
 const toolbar=panel.locator('.a-entity-activity__toolbar');
 const before=await toolbar.boundingBox();
 await panel.locator('.a-entity-activity__content').evaluate(node=>{node.scrollTop=300;});
 const after=await toolbar.boundingBox();
 expect(Math.abs(after!.y-before!.y)).toBeLessThan(2);
 await expect(page.getByLabel('Event code (exact)')).toHaveCount(0);
});

test('Activity toolbar only offers authorized capture on Saved snapshots', async({page})=>{
 await mount(page,{timelineEnabled:true,defaultView:'timeline'});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save snapshot',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'Saved snapshots',exact:true}).click();
 const capture=page.getByRole('button',{name:'Save snapshot',exact:true});
 await expect(capture).toHaveAccessibleName('Save snapshot');
 await capture.focus();await capture.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).captureKeys.length)).toBe(1);
 await page.getByRole('tab',{name:'Audit log',exact:true}).click();
 await expect(capture).toHaveCount(0);
});

for (const width of [390, 1440]) {
 test(`Activity full toolbar is compact and aligned at ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:950});
  await mount(page,{timelineEnabled:true,defaultView:'timeline'});
  await page.getByRole('button',{name:'Open Activity',exact:true}).click();
  const panel=page.locator('.a-collaboration-panel');
  await expect(panel).toHaveAttribute('data-toolbar-first','true');
  await expect(panel.locator('.a-panel-header,.a-panel-context,.a-entity-activity__intro')).toHaveCount(0);
  const toolbar=panel.locator('.a-entity-activity__toolbar');
  await expect(toolbar.getByRole('tab',{name:'Timeline',exact:true})).toBeVisible();
  await expect(toolbar.getByRole('button',{name:'Filters',exact:true})).toHaveCount(0);
  await expect(toolbar.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();
  if(width===1440) await expect(toolbar.getByRole('button',{name:/Side view/i})).toBeVisible();
  else await expect(toolbar.getByRole('button',{name:/Side view/i})).toHaveCount(0);
  expect(await toolbar.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  if(width===1440) {
   const tabs=await toolbar.getByRole('tablist').boundingBox();
   const commands=await toolbar.locator('.a-entity-activity__commands').boundingBox();
   expect(Math.abs((tabs!.y+tabs!.height/2)-(commands!.y+commands!.height/2))).toBeLessThan(2);
  }
  await page.screenshot({path:test.info().outputPath(`activity-toolbar-${width}.png`)});
 });
}

test('calendar range groups, timezone, custom validation and navigation preserve selection',async({page})=>{
 await page.clock.install({time:new Date('2026-09-29T12:00:00Z')});
 await page.setViewportSize({width:1440,height:950});
 await mount(page,{timelineEnabled:true,defaultView:'timeline'});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 const range=page.getByRole('combobox',{name:'Activity date range'});
 await expect(range).toHaveText('Last 30 days');
 await range.click(); const list=page.getByRole('listbox',{name:'Activity date range'});
 expect(await list.getByRole('group').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).toEqual(['Days','Weeks','Months','Custom']);
 expect(await list.getByRole('option').allTextContents()).not.toContain('Tomorrow');
 await page.keyboard.press('Escape');
 await chooseOption(range,'yesterday');
 await expect.poll(()=>page.evaluate(()=>(window as any).lastQuery?.period)).toBe('yesterday');
 expect(await page.evaluate(()=>(window as any).lastQuery.timeZone)).toBe('UTC');
 await page.getByRole('tab',{name:'Saved snapshots',exact:true}).click();
 await expect(range).toHaveText('Yesterday');
 await page.getByRole('button',{name:/Side view/i}).click();
 await expect(range).toHaveText('Yesterday');
 await chooseOption(range,'custom');
 await page.getByLabel('Start date',{exact:true}).fill('2026-09-10');
 await page.getByLabel('End date',{exact:true}).fill('2026-09-09');
 await expect(page.getByRole('button',{name:'Apply range',exact:true})).toBeDisabled();
 await page.getByLabel('End date',{exact:true}).fill('2026-09-12');
 await page.getByRole('button',{name:'Apply range',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).lastQuery?.startDate)).toBe('2026-09-10');
 expect(await page.evaluate(()=>(window as any).lastQuery.endDate)).toBe('2026-09-12');
 await page.goBack();
 await expect(range).toHaveText('Yesterday');
});

test('older API only offers supported days presets',async({page})=>{
 await mount(page,{calendarRanges:false});
 await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 const range=page.getByRole('combobox',{name:'Activity date range'});
 await range.click(); const list=page.getByRole('listbox',{name:'Activity date range'});
 await expect(list.getByRole('group')).toHaveCount(1);
 await expect(list.locator('[data-value="custom"]')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await chooseOption(range,'last:90');
 await expect.poll(()=>page.evaluate(()=>(window as any).lastQuery?.days)).toBe(90);
 expect(await page.evaluate(()=>(window as any).lastQuery.period)).toBeUndefined();
});
