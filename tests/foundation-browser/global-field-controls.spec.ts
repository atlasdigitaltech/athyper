import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{Select,Input,DrawerRoot,DrawerPanel,DrawerHeader,DrawerBody}from'./packages/platform/foundation/ui/src/index';
import{ReferenceSelect}from'./packages/platform/entity/runtime/form-detail/src/reference-select';
import{FilterValueEditor}from'./packages/platform/entity/runtime/list-view/src/filter-editor';
const options=[{value:'MY',label:'Malaysia'},{value:'SG',label:'Singapore'},...Array.from({length:247},(_,i)=>({value:'C'+i,label:'Country '+i}))];
window.requests={get:0,post:0};let history=[];
const client={request:async(operation,opts)=>{if(operation.method==='GET'){window.requests.get++;await new Promise(r=>setTimeout(r,40));}
else{window.requests.post++;history=opts.body.action==='clear'?[]:[{key:opts.body.key,selectedAt:new Date().toISOString()},...history.filter(item=>item.key!==opts.body.key)];}return{items:history};}};
function App(){const[open,setOpen]=useState(false),[value,setValue]=useState('MY'),[user,setUser]=useState('alice'),[many,setMany]=useState('MY'),[legacy,setLegacy]=useState('Mal'),[period,setPeriod]=useState('last_7_days'),[dates,setDates]=useState('2026-09-13,2026-09-20');
return <main><h1>Global field controls</h1><button onClick={()=>setOpen(true)}>Open filters</button><button onClick={()=>setUser('bob')}>Switch identity</button>
<label htmlFor="ownership">Ownership</label><Select id="ownership" defaultValue="external"><option value="external">External</option><option value="internal">Internal</option></Select>
<label htmlFor="need">Need by date</label><Input id="need" type="date" defaultValue="2026-09-13"/>
{Array.from({length:20},(_,i)=><ReferenceSelect key={i} id={'country-'+i} name={'country-'+i} label={'Country '+i} value={value} onChange={setValue} options={options} sourceKey="iso.country" recentScope={{plane:'neon',tenantId:'tenant',principalId:user}} recentPolicy={{enabled:true,limit:5,persistence:'server',scope:'referenceSource',retentionDays:90}} history={{client,entityCode:'business_partner',surfaceKey:'details',fieldKey:'country'}}/>)}
<DrawerRoot open={open} onOpenChange={setOpen}><DrawerPanel size="standard"><DrawerHeader title="Filters"/><DrawerBody><div style={{height:260}}>Filter values</div><FilterValueEditor field={{key:'country',label:'Country',valueKind:'reference',filterOperators:['eq','in'],filterOptions:options}} operator="in" value={many} filterNumber={1} onChange={setMany}/><FilterValueEditor field={{key:'legacy',label:'Legacy country',valueKind:'string',semanticRole:'country_code',filterOperators:['contains'],filterOptions:options}} operator="contains" value={legacy} filterNumber={2} onChange={setLegacy}/><FilterValueEditor field={{key:'updated',label:'Updated',valueKind:'datetime',filterOperators:['relative']}} operator="relative" value={period} filterNumber={3} onChange={setPeriod}/><FilterValueEditor field={{key:'need',label:'Need by',valueKind:'date',filterOperators:['between']}} operator="between" value={dates} filterNumber={4} onChange={setDates}/><output aria-label="Selected countries">{many}</output><div style={{height:500}}/></DrawerBody></DrawerPanel></DrawerRoot></main>};
createRoot(document.getElementById('root')).render(<App/>);`,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
}).outputFiles[0]!.text;

async function mount(page: import("@playwright/test").Page) {
  await page.route("http://controls.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html lang="en"><head><title>Global controls</title><style>${styles}body{font-family:Arial;padding:16px}main{max-width:400px}*{box-sizing:border-box}.a-reference-select{margin-bottom:8px}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.goto("http://controls.test/");
  await page.addScriptTag({ content: script });
}

test("20 mounted country controls make no eager requests and share fresh history", async ({
  page,
}, testInfo) => {
  await mount(page);
  expect(await page.evaluate(() => (window as any).requests)).toEqual({
    get: 0,
    post: 0,
  });
  const first = page.getByRole("combobox", { name: "Country 0", exact: true });
  const second = page.getByRole("combobox", { name: "Country 1", exact: true });
  await first.click();
  await page
    .getByRole("combobox", { name: "Search by name or code…" })
    .press("Escape");
  await second.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).requests.get))
    .toBe(1);
  await page
    .getByRole("combobox", { name: "Search by name or code…" })
    .fill("Singapore");
  await page.getByRole("option", { name: /Singapore/ }).click();
  await expect(first).toHaveValue("Singapore");
  await expect
    .poll(() => page.evaluate(() => (window as any).requests.post))
    .toBe(1);
  await first.click();
  await expect(
    page.getByRole("group", { name: "Recently selected" }).getByRole("option"),
  ).toContainText("Singapore");
  await expect
    .poll(() => page.evaluate(() => (window as any).requests.get))
    .toBe(2);
  await page.waitForTimeout(70);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.dispatchEvent(new Event("focus"));
  });
  const search = page.getByRole("combobox", {
    name: "Search by name or code…",
  });
  for (const query of ["m", "my", "Malaysia"]) await search.fill(query);
  expect(await page.evaluate(() => (window as any).requests.get)).toBe(2);
  await search.press("Escape");
  await page.getByRole("button", { name: "Switch identity" }).click();
  // Cached Alice history is not rendered in the new identity before interaction.
  expect(await page.evaluate(() => (window as any).requests.get)).toBe(2);
  await testInfo.attach("request-counts.json", {
    body: JSON.stringify(await page.evaluate(() => (window as any).requests)),
    contentType: "application/json",
  });
});

for (const width of [900, 390])
  test(`multi-country popup stays accessible inside a drawer at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    await mount(page);
    await page.getByRole("button", { name: "Open filters" }).click();
    const input = page.getByRole("combobox", {
      name: "Value for Country filter 1",
      exact: true,
    });
    await input.click();
    const popup = page.locator(".a-reference-select__popup");
    const search = page.getByRole("combobox", {
      name: "Search by name or code…",
    });
    await expect(search).toBeFocused();
    await search.fill("Singapore");
    await search.press("Enter");
    await expect(page.getByLabel("Selected countries")).toHaveText("MY,SG");
    await expect(input).toHaveValue("Malaysia, Singapore");
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
    const option = page.getByRole("option", { name: /Singapore/ });
    expect(
      await option.evaluate((node) => {
        const b = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      }),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("drawer-country.png") });
    await search.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "Filters", exact: true }),
    ).toBeVisible();
    await expect(input).toBeFocused();
    await expect(
      page.getByRole("textbox", { name: "Value for Legacy country filter 2" }),
    ).toHaveValue("Mal");
    await input.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

test("native choices and dates retain form semantics and RTL styling", async ({
  page,
}) => {
  await mount(page);
  const select = page.getByLabel("Ownership"),
    date = page.getByLabel("Need by date");
  await select.selectOption("internal");
  await expect(select).toHaveValue("internal");
  await date.fill("2026-10-01");
  await expect(date).toHaveValue("2026-10-01");
  expect(
    await select.evaluate((node) => getComputedStyle(node).appearance),
  ).toBe("none");
  await page.evaluate(() => (document.documentElement.dir = "rtl"));
  expect(
    await select.evaluate((node) => getComputedStyle(node).backgroundPosition),
  ).toContain("11px");
  expect(await page.evaluate(() => (window as any).requests)).toEqual({
    get: 0,
    post: 0,
  });
});

test("local catalogue search meets the browser interaction budget", async ({
  page,
}, testInfo) => {
  await mount(page);
  await page.getByRole("combobox", { name: "Country 0", exact: true }).click();
  const result = await page.evaluate(async () => {
    const search = document.querySelector<HTMLInputElement>(
      ".a-reference-select__search input",
    )!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    const longTasks: number[] = [],
      samples: number[] = [];
    const observer = new PerformanceObserver((list) =>
      longTasks.push(...list.getEntries().map((entry) => entry.duration)),
    );
    observer.observe({ type: "longtask" });
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      setter.call(search, ["MY", "country 2", "unmatched", ""][i % 4]);
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await frame();
      await frame();
      samples.push(performance.now() - start);
    }
    observer.disconnect();
    samples.sort((a, b) => a - b);
    return {
      p95Milliseconds: samples[Math.floor(samples.length * 0.95)],
      longTasksMilliseconds: longTasks,
      choices: 249,
      mountedControls: 20,
    };
  });
  await testInfo.attach("browser-performance.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  writeFileSync(
    testInfo.outputPath("browser-performance.json"),
    JSON.stringify(result, null, 2),
  );
  expect(result.p95Milliseconds).toBeLessThanOrEqual(100);
  expect(
    result.longTasksMilliseconds.filter((duration) => duration > 50),
  ).toEqual([]);
  expect(await page.evaluate(() => (window as any).requests.get)).toBe(1);
});

test("relative periods keep groups and commit a date preset inside the drawer", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Open filters" }).click();
  const field = page.getByRole("combobox", {
    name: "Value for Updated filter 3",
  });
  await expect(field).toHaveValue("last_7_days");
  expect(
    await field
      .locator("optgroup")
      .evaluateAll((nodes) => nodes.map((n) => n.label)),
  ).toEqual(["Days", "Weeks", "Months", "Years"]);
  expect(
    await field.locator('optgroup[label="Days"] option').allTextContents(),
  ).toEqual([
    "Today",
    "Yesterday",
    "Tomorrow",
    "Last 7 days",
    "Last 30 days",
    "Last 90 days",
    "Next 7 days",
    "Next 30 days",
    "Next 90 days",
  ]);
  await field.selectOption("last_30_days");
  await expect(page.getByText(/Previous 30 days plus today/)).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Search by name or code…" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Recent choices for Updated" }),
  ).toHaveCount(0);
  await field.focus();
  await field.press("Home");
  await field.press("ArrowDown");
  await expect(field).toHaveValue("today");
  await expect(field).toBeFocused();
  expect(await page.evaluate(() => (window as any).requests)).toEqual({
    get: 0,
    post: 0,
  });
});

test("date ranges keep native calendars and validate both boundaries", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Open filters" }).click();
  const from = page.getByLabel("From Value for Need by filter 4");
  const to = page.getByLabel("To Value for Need by filter 4");
  await expect(from).toHaveAttribute("type", "date");
  await expect(from).toHaveAttribute("max", "2026-09-20");
  await expect(to).toHaveAttribute("min", "2026-09-13");
  await to.fill("2026-09-10");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The end must be on or after the start." }),
  ).toBeVisible();
  await to.fill("2026-09-25");
  await expect(from).toHaveAttribute("max", "2026-09-25");
  await expect(to).toHaveAttribute("aria-invalid", "false");
  expect(await page.evaluate(() => (window as any).requests)).toEqual({
    get: 0,
    post: 0,
  });
});
