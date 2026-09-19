import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/planes/neon/business-partner/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const bundle = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Roles, Supplier} from './packages/planes/neon/business-partner/src/360/components/role-company-sections';
import {Banking, SupplierControls} from './packages/planes/neon/business-partner/src/360/components/commercial-controls';
createRoot(document.getElementById('root')).render(<div className="bp360"><div className="bp360-section-list">
<Roles data={{roles:[{role:'supplier',roleCode:'CATL-BP-001',status:'active'}]}}/>
<Supplier data={{supplier:{code:'CATL-BP-001',type:'general',status:'active'}}}/>
<Banking data={{readOnly:true,accounts:[{linkId:'bank',bankName:'Northwind Bank',maskedAccount:'•••• 6819',accountHolderName:'Northwind Industrial Supplies Ltd',currencyCode:'GBP',purpose:'disbursement'}]}} client={{}} businessPartnerId="bp"/>
<SupplierControls data={{commodityCapabilities:[{categoryCode:'industrial_supplies',categoryName:'Industrial supplies',partnerRole:'supplier'}]}}/>
</div></div>);`,
  },
  bundle: true,
  write: false,
  outfile: "fixture.js",
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
});
const script = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
const importedStyles = bundle.outputFiles.filter((file) => file.path.endsWith(".css")).map((file) => file.text).join("\n");
test("remaining partner sections use aligned responsive field grids", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>${importedStyles}\n${styles}body{padding:24px;margin:0}*{box-sizing:border-box}</style><div id="root"></div>`,
  );
  await page.addScriptTag({ content: script });
  for (const title of [
    "Roles",
    "Supplier role",
    "Northwind Bank · GBP · •••• 6819",
    "Commodity capabilities",
  ]) {
    const card = page
      .locator(".bp360-section-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    const fields = card.locator("dl > div");
    await expect(fields.first()).toBeVisible();
    const first = await fields.nth(0).boundingBox(),
      second = await fields.nth(1).boundingBox();
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    expect(second!.x).toBeGreaterThan(first!.x);
  }
  await expect(
    page.getByRole("heading", { name: "Current approved limit" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("partner-sections-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("partner-sections-mobile.png"),
    fullPage: true,
  });
});
