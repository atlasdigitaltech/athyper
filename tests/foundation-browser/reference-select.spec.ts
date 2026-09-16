import { readFileSync } from "node:fs";
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
  outdir: "/tmp/reference-select-browser",
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReferenceSelect} from './packages/platform/entity/runtime/form-detail/src/reference-select';
const names=new Intl.DisplayNames(['en'],{type:'region'});
const countries='AF AX AL DZ AR AU AT BE BR CA CN DE DK EG ES FI FR GB HK ID IN IT JP KR MY NL NZ PH PK PT QA SA SE SG TH TR US VN WS ZA'.split(' ').map(value=>({value,label:names.of(value)}));
function App(){const[value,setValue]=useState(''),[person,setPerson]=useState('alice'),[revision,setRevision]=useState(0),[hide,setHide]=useState(false);
return <main><h1>Reference selection</h1><button onClick={()=>setPerson(p=>p==='alice'?'bob':'alice')}>Switch user</button><button onClick={()=>setRevision(r=>r+1)}>Remount</button><button onClick={()=>setHide(true)}>Remove Malaysia</button>
<form onSubmit={e=>e.preventDefault()}><label htmlFor="country">Registration country *</label><ReferenceSelect key={revision} id="country" name="country" label="Registration country" value={value} onChange={setValue} options={hide?countries.filter(c=>c.value!=='MY'):countries} sourceKey="iso.country" recentPolicy={window.__serverHistory?{enabled:true,limit:5,persistence:'server',scope:'referenceSource',retentionDays:90}:undefined} history={window.__serverHistory?{entityCode:'business_partner',surfaceKey:'details',fieldKey:'country',client:{request:async(operation,opts)=>{const response=await fetch('/history',{method:operation.method,headers:{'content-type':'application/json'},...(opts.body?{body:JSON.stringify(opts.body)}:{}),signal:opts.signal});if(!response.ok)throw Error('history unavailable');return response.json()}}}:undefined} required placeholder="Select registration country" recentScope={{plane:'neon',tenantId:'tenant',principalId:person,contextKey:'company'}}/><button type="submit">Submit</button></form></main>};createRoot(document.getElementById('root')).render(<App/>);`,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).outputFiles[0]!.text;

async function mount(
  page: import("@playwright/test").Page,
  serverHistory = false,
) {
  await page.route("http://reference.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html lang="en"><head><title>Reference chooser</title><style>${styles}body{font-family:Arial,sans-serif;background:var(--a-background);color:var(--a-foreground);padding:16px}main{max-width:420px}form{margin-top:240px}*{box-sizing:border-box}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.goto("http://reference.test/");
  if (serverHistory)
    await page.evaluate(() => {
      (window as any).__serverHistory = true;
    });
  await page.addScriptTag({ content: script });
}
for (const width of [1000, 390])
  test(`country search, explicit selection, recents, and keyboard at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 650 });
    await mount(page);
    const input = page.getByRole("combobox", { name: "Registration country" });
    const search = page.getByRole("combobox", {
      name: "Search by name or code…",
    });
    await expect(input).toHaveValue("");
    expect(
      await input.evaluate((node: HTMLInputElement) => node.checkValidity()),
    ).toBe(false);
    await input.click();
    await search.fill("MY");
    await expect(page.getByRole("option").first()).toContainText("Malaysia");
    await expect(
      page.locator('input[type="hidden"][name="country"]'),
    ).toHaveValue("");
    await search.press("Enter");
    await expect(input).toHaveValue("Malaysia");
    expect(
      await input.evaluate((node: HTMLInputElement) => node.checkValidity()),
    ).toBe(true);
    await input.click();
    await search.fill("sau");
    await expect(page.getByRole("option").first()).toContainText(
      "Saudi Arabia",
    );
    await search.fill("SA");
    await expect(page.getByRole("option").first()).toContainText(
      "Saudi Arabia",
    );
    await search.press("Enter");
    await expect(input).toHaveValue("Saudi Arabia");
    await input.click();
    await expect(input).toHaveValue("Saudi Arabia");
    const recent = page.getByRole("group", { name: "Recently selected" });
    await expect(recent.getByRole("option")).toHaveCount(2);
    await expect(recent.getByRole("option").first()).toContainText(
      "Saudi Arabia",
    );
    await expect(page.getByRole("option", { name: /Malaysia/ })).toHaveCount(1);
    const popup = await page
      .locator(".a-reference-select__popup")
      .boundingBox();
    expect(popup!.height).toBeLessThanOrEqual(282);
    expect(popup!.y).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(width);
    expect(popup!.y + popup!.height).toBeLessThanOrEqual(650);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("reference-chooser.png"),
    });
    await search.fill("not a country");
    await expect(page.getByRole("option")).toHaveCount(0);
    await search.press("Enter");
    await expect(page.locator('input[name="country"]')).toHaveValue("SA");
    await search.press("Escape");
    await expect(input).toHaveValue("Saudi Arabia");
    await input.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await input.press("ArrowDown");
    await search.press("Escape");
    await expect(input).toHaveValue("Saudi Arabia");
    await page.getByRole("button", { name: "Remount", exact: true }).click();
    await input.click();
    await expect(recent.getByRole("option")).toHaveCount(2);
    const saved = await page.evaluate(() => Object.values(localStorage));
    expect(
      JSON.parse(saved[0]).map((item: { key: string }) => item.key),
    ).toEqual(["SA", "MY"]);
    await search.press("Escape");
    await page.getByRole("button", { name: "Switch user" }).click();
    await input.click();
    await expect(recent).toHaveCount(0);
    const selectedBox = await page
      .getByRole("option", { name: /Saudi Arabia/ })
      .boundingBox();
    const listBox = await page.getByRole("listbox").boundingBox();
    expect(selectedBox!.y).toBeGreaterThanOrEqual(listBox!.y);
    expect(selectedBox!.y + selectedBox!.height).toBeLessThanOrEqual(
      listBox!.y + listBox!.height,
    );
    await search.press("Escape");
    await page.getByRole("button", { name: "Switch user" }).click();
    await page.getByRole("button", { name: "Remove Malaysia" }).click();
    await input.click();
    await expect(recent.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option", { name: /Malaysia/ })).toHaveCount(0);
    await search.fill("aland");
    await page.getByRole("option", { name: /Åland Islands/ }).click();
    await expect(input).toHaveValue("Åland Islands");
    await expect(page.locator('input[name="country"]')).toHaveValue("AX");
    await input.click();
    await page.getByRole("button", { name: "Clear recent choices" }).click();
    await expect(recent).toHaveCount(0);
    await expect(input).toHaveValue("Åland Islands");
  });

test("search and selection work when browser storage is blocked", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  const input = page.getByRole("combobox", { name: "Registration country" });
  const search = page.getByRole("combobox", {
    name: "Search by name or code…",
  });
  await input.click();
  await search.fill("mal");
  await search.press("Enter");
  await expect(input).toHaveValue("Malaysia");
  await expect(page.locator('input[name="country"]')).toHaveValue("MY");
});

test("server history syncs across devices and clearing history preserves the form value", async ({
  browser,
}) => {
  const first = await browser.newContext(),
    second = await browser.newContext();
  const a = await first.newPage(),
    b = await second.newPage();
  let items: { key: string; selectedAt: string }[] = [];
  const serve = async (page: typeof a) => {
    await mount(page, true);
    await page.route("http://reference.test/history", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        if (body.action === "clear") items = [];
        else
          items = [
            { key: body.key, selectedAt: new Date().toISOString() },
            ...items.filter((item) => item.key !== body.key),
          ].slice(0, 5);
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items }),
      });
    });
  };
  try {
    await serve(a);
    const input = a.getByRole("combobox", { name: "Registration country" });
    await input.click();
    await a
      .getByRole("combobox", { name: "Search by name or code…" })
      .fill("MY");
    await a.getByRole("option", { name: /Malaysia/ }).click();
    await expect.poll(() => items.map((item) => item.key)).toEqual(["MY"]);
    await serve(b);
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await b.getByRole("combobox", { name: "Registration country" }).click();
    await expect(
      b.getByRole("group", { name: "Recently selected" }).getByRole("option"),
    ).toContainText("Malaysia");
    await b.getByRole("option", { name: /Malaysia/ }).click();
    await b.getByRole("combobox", { name: "Registration country" }).click();
    await b.getByRole("button", { name: "Clear recent choices" }).click();
    await expect.poll(() => items.length).toBe(0);
    await expect(
      b.getByRole("combobox", { name: "Registration country" }),
    ).toHaveValue("Malaysia");
    await a.evaluate(() => window.dispatchEvent(new Event("focus")));
    await input.click();
    await expect(
      a.getByRole("group", { name: "Recently selected" }),
    ).toHaveCount(0);
  } finally {
    await first.close();
    await second.close();
  }
});

test("a history-service outage does not block selection or local recents", async ({
  page,
}) => {
  await mount(page, true);
  await page.route("http://reference.test/history", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  const input = page.getByRole("combobox", { name: "Registration country" });
  await input.click();
  await page
    .getByRole("combobox", { name: "Search by name or code…" })
    .fill("MY");
  await page.getByRole("option", { name: /Malaysia/ }).click();
  await expect(input).toHaveValue("Malaysia");
  await input.click();
  await expect(
    page.getByRole("group", { name: "Recently selected" }).getByRole("option"),
  ).toContainText("Malaysia");
  expect(
    await input.evaluate((node: HTMLInputElement) => node.checkValidity()),
  ).toBe(true);
});
