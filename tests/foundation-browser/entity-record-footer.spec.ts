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
import {RecordFooterProvider, RecordFooterSource, useRecordFooterSources} from './packages/platform/shell/shell/src/record-footer';
function Section(){useRecordFooterSources([{sourceObject:'master.business_partner_governance_relation',observedAt:'2026-09-08T06:35:19Z'}]);return <p>Governance</p>;}
function App(){const [active,setActive]=useState(true);return <RecordFooterProvider><button onClick={()=>setActive(!active)}>Switch section</button>{active?<Section/>:<p>Other section</p>}<footer className="athyper-shell__footer"><span>© 2026 Atlas Digital Technology Solutions</span><RecordFooterSource/></footer></RecordFooterProvider>;}
createRoot(document.getElementById('root')).render(<App/>);
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
test("footer source follows the active section and wraps on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>${styles}body{padding:24px;margin:0}footer{margin-top:100px}*{box-sizing:border-box}</style><div id="root"></div>`,
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
