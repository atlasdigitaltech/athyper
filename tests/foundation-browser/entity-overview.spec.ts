import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/entity/runtime/list-view/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EntityOverview} from './packages/platform/entity/runtime/list-view/src/overview';
import {EntityFavourites} from './packages/platform/entity/runtime/list-view/src/overview-favourites';
function App(){const[refreshed,setRefreshed]=useState(false);return <main><h1>Business Partners</h1><p className="intro">Organization-scoped partner master and governed onboarding.</p><nav className="tabs" aria-label="Sections"><a href="#" aria-current="page">Overview</a><a href="/manage">Manage</a><a href="/review">Review & Approval</a></nav><EntityOverview scopeLabel="Athyper Germany" metrics={[{key:'all',label:'All records',value:'1,248',description:'Across your current scope',href:'/manage'},{key:'mine',label:'My records',value:'86',description:'Open view',href:'/manage?standardView=mine'},{key:'requests',label:'My requests',value:'12',description:'Open view',href:'/manage?standardView=requests'},{key:'recent',label:'Recently viewed',value:'9',description:'Open view',href:'/manage?standardView=recent'}]} focus={[{key:'review',label:'Review & Approval',href:'/review',count:4,description:'Open your queue to see available work.'}]} shortcuts={[{key:'manage',label:'Manage',description:'Search, filter, and explore records',href:'/manage'},{key:'mine',label:'My records',description:'Jump into this view',href:'/manage?standardView=mine'},{key:'recent',label:'Recently viewed',description:'Jump into this view',href:'/manage?standardView=recent'}]} records={['Atlas Manufacturing','Harbor Supply Group','Summit Industries'].map((label,index)=>({key:String(index),label,detail:'BP-00'+(index+1),timestamp:'Sep 8, 2026, 10:30 AM',href:'/records/'+index}))} favouritesPanel={<EntityFavourites records={[{id:"fav1",label:"Atlas Manufacturing",description:"BP-001 · Active",href:"/records/0"},{id:"fav2",label:"Summit Industries",description:"BP-003 · Active",href:"/records/2"}]} browseHref="/manage" onRemove={()=>{}}/>} recentHref="/manage" onRefresh={()=>setRefreshed(true)}/>{refreshed?<p role="status">Overview refreshed</p>:null}</main>};createRoot(document.getElementById('root')).render(<App/>);`,
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
for (const [width, theme] of [
  [1440, "light"],
  [390, "light"],
  [1440, "dark"],
  [390, "high-contrast"],
] as const)
  test(`entity pulse at ${width} in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(
      `<html lang="en" data-theme="${theme}"><head><title>Entity overview</title><style>${styles}body{margin:0;padding:24px;background:var(--a-background);color:var(--a-foreground);font-family:Arial,sans-serif}main{max-width:1400px;margin:auto}*{box-sizing:border-box}h1{font-size:32px;margin:0 0 8px}.intro{color:var(--a-muted-foreground);margin-bottom:24px}.tabs{display:flex;flex-wrap:wrap;gap:24px;padding:18px;background:var(--a-surface);border:1px solid var(--a-border);border-radius:12px;margin-bottom:24px}.tabs a{color:var(--a-muted-foreground);text-decoration:none}.tabs a[aria-current]{color:var(--a-primary);font-weight:bold}</style></head><body><div id="root"></div></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await expect(page.locator(".a-entity-pulse__hero")).toHaveCount(0);
    await expect(page.locator(".a-entity-pulse__toolbar")).toHaveCount(0);
    await expect(page.locator(".a-entity-pulse__metric")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Focus", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Continue your work", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const star = page.getByRole("button", {
      name: "Remove Atlas Manufacturing from favourites",
    });
    await star.focus();
    await expect(star).toBeFocused();
    const recentBox = await page
      .getByRole("region", { name: "Recently updated", exact: true })
      .boundingBox();
    const favouritesBox = await page
      .getByRole("region", { name: "Favourites", exact: true })
      .boundingBox();
    if (width > 760) {
      expect(Math.abs(recentBox!.y - favouritesBox!.y)).toBeLessThan(2);
      expect(favouritesBox!.x).toBeGreaterThan(recentBox!.x);
    } else
      expect(favouritesBox!.y).toBeGreaterThan(
        recentBox!.y + recentBox!.height - 1,
      );
    await expect(
      page.getByRole("button", {
        name: "Remove Atlas Manufacturing from favourites",
      }),
    ).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .include(".a-entity-pulse")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `/tmp/athyper-entity-pulse-${width}-${theme}.png`,
      fullPage: true,
    });
  });
