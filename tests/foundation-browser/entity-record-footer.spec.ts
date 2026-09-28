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
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RecordFooterProvider, RecordFooterSource, useRecordFooterSources, useRecordFooterInformation} from './packages/platform/shell/shell/src/record-footer';
import {RecordInformationControl} from './packages/platform/shell/shell/src/record-information';
function Section(){useRecordFooterInformation({recordId:'test-record-id',metadataRelease:3});useRecordFooterSources([{sourceObject:'master.business_partner_governance_relation',observedAt:'2026-09-08T06:35:19Z'}]);return <p>Governance</p>;}
function App(){const [active,setActive]=useState(true);return <RecordFooterProvider><button onClick={()=>setActive(!active)}>Switch section</button>{active?<Section/>:<p>Other section</p>}<footer className="athyper-shell__footer"><span>© 2026 Atlas Digital Technology Solutions</span><RecordFooterSource/><RecordInformationControl/></footer></RecordFooterProvider>;}
createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  bundle: true,
  loader: { ".css": "empty" },
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).outputFiles[0]!.text;
test("record information is opt-in, copy-safe, dismissible and removed on navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>${styles}body{margin:0;padding:24px}footer.athyper-shell__footer{margin-top:400px}</style><div id="root"></div>`,
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copied = text;
        },
      },
    }),
  );
  await page.addScriptTag({ content: script });
  const trigger = page.getByRole("button", {
    name: "Record information",
    exact: true,
  });
  await expect(page.getByText("test-record-id", { exact: true })).toHaveCount(
    0,
  );
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Record information" });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("Record revision");
  const labels = await dialog.locator("dt").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
  expect(labels[1]).toBeGreaterThan(labels[0]!);
  const inline = await dialog.locator('dl>div').first().evaluate(node => {
    const label=node.querySelector('dt')!.getBoundingClientRect(),value=node.querySelector('dd span')!.getBoundingClientRect();
    return {label:label.top,value:value.top};
  });
  expect(Math.abs(inline.label-inline.value)).toBeLessThan(2);
  const fieldCopy = dialog.getByRole("button", {name: "Copy Record ID", exact: true});
  await expect(fieldCopy.locator("svg")).toHaveCount(1);
  await expect(fieldCopy).toHaveText("");
  await fieldCopy.click();
  expect(await page.evaluate(() => (window as any).copied)).toBe("test-record-id");
  await expect(dialog.locator("footer").getByRole("button", {name:"Copy details"})).toBeVisible();
  const popupBox = await dialog.boundingBox(),
    triggerBox = await trigger.boundingBox();
  expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(triggerBox!.y);
  await dialog
    .getByRole("button", { name: "Copy details", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).copied)).toBe(
    "Record ID: test-record-id\nMetadata release: 3",
  );
  await expect(dialog.getByRole("status")).toHaveText("Copied to clipboard.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByText("Governance", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button",{name:"Close record information"})).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Switch section" }).click();
  await expect(trigger).toHaveCount(0);
});
test("footer source follows the active section and wraps on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>${styles}body{padding:24px;margin:0}footer.athyper-shell__footer{margin-top:100px}*{box-sizing:border-box}</style><div id="root"></div>`,
  );
  await page.addScriptTag({ content: script });
  const footer = page.locator("footer");
  await expect(footer).toContainText("Observed");
  const source = page.getByText("master.business_partner_governance_relation", {
    exact: true,
  });
  await expect(source).toBeHidden();
  await page.getByText("Data source", { exact: true }).click();
  await expect(source).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch section" }).click();
  await expect(footer).not.toContainText("Observed");
  await expect(footer).not.toContainText("Data source");
});
