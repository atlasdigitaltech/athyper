import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";

const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EntityRecordHeader } from './packages/platform/entity/runtime/form-detail/src/record-header';
import { EntityPageLayout, useRecordPage } from './packages/platform/shell/shell/src/entity-page-layout';
const header = { title: 'Northwind Industrial Supplies Ltd', entityLabel: 'Business Partner', iconKey: 'contact', code: 'CATL-BP-001', badges: [{ label: 'Supplier', tone: 'neutral' }, { label: 'Active', tone: 'success' }], context: [{ key: 'organization', label: 'Organization', value: 'CirrusAtlantic UK' }, { key: 'as-of', label: 'As of', value: '2026-09-08' }], actions: [{ key: 'change', label: 'Propose change', placement: 'primary', href: '#change' }, { key: 'role', label: 'Add supplier/customer role', placement: 'overflow', href: '#role' }], sections: ['Overview','Identity','Contacts','Addresses','Identifiers & tax','Banking','Activity'].map((label,index) => ({ key: index === 4 ? 'tax' : label.toLowerCase(), label, placement: index < 5 ? 'direct' : 'overflow', count: index === 0 ? undefined : index })) };
function Record(){ useRecordPage(); const [section,setSection]=useState('overview'); return <><EntityRecordHeader header={header} activeSection={section} onSelectSection={setSection} contextControls={<label>Role lens <select><option>All roles</option><option>Supplier</option></select></label>} technicalDetails={<dl><div><dt>Partner ID</dt><dd>11111111-2222-4333-8444-555555555555</dd></div></dl>}/><p data-testid='active'>{section}</p></>; }
createRoot(document.getElementById('root')).render(<EntityPageLayout collectionHeader={<h1>Business Partners</h1>} collectionNavigation={<nav>Manage</nav>}><Record/></EntityPageLayout>);
`,
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

test("record header owns the page and reflows with accessible overflow navigation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<html data-theme="light"><style>${styles}\nbody{padding:32px;margin:0}*{box-sizing:border-box}</style><div id="root"></div></html>`,
  );
  await page.addScriptTag({ content: script });
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText(
    "Northwind Industrial Supplies Ltd",
  );
  await expect(
    page.getByRole("link", { name: "Propose change" }),
  ).toBeVisible();
  await page.getByText("More actions", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Add supplier/customer role" }),
  ).toBeVisible();
  await page.locator("h1").click();
  await expect(
    page.getByRole("link", { name: "Add supplier/customer role" }),
  ).toBeHidden();
  await page.getByText("More actions", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("link", { name: "Add supplier/customer role" }),
  ).toBeHidden();
  await expect(page.getByText("More actions", { exact: true })).toBeFocused();
  await page.getByText("More sections", { exact: true }).click();
  await page.locator("h1").click();
  await expect(page.getByRole("button", { name: /Banking/ })).toBeHidden();
  await page.getByText("More sections", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Banking/ })).toBeHidden();
  await page.getByText("More sections", { exact: true }).click();
  await page.getByRole("button", { name: /Banking/ }).click();
  await expect(page.getByTestId("active")).toHaveText("banking");
  await page.screenshot({
    path: testInfo.outputPath("record-header-desktop.png"),
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByLabel("Section", { exact: true }).selectOption("activity");
    await expect(page.getByTestId("active")).toHaveText("activity");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByText("Technical details", { exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByText("Technical details", { exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("record-header-mobile-" + width + ".png"),
    });
  }
  await page.evaluate(() => (document.documentElement.dir = "rtl"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
