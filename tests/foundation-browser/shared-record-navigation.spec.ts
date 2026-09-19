import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
]
  .map((p) => readFileSync(p, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {EntityRecord360Panel} from './packages/platform/entity/runtime/form-detail/src/record-360-panel';
const sections=[{key:'identity',label:'Identity'},{key:'contacts',label:'Contacts'},{key:'addresses',label:'Addresses'}];
const panel={sections:sections.map(s=>s.key),tabs:[{key:'360',label:'360 View',provider:'360'},{key:'activity',label:'Activity',provider:'activity',sectionKey:'activity'}],sidebar:[]};
function App(){const [section,setSection]=useState('identity'),[tab,setTab]=useState('360'),[revision,setRevision]=useState(0);return <EntityRecord360Panel panel={panel} sections={sections} activeSection={section} activeTab={tab} navigationRevision={revision} onSelectTab={(t,preferred)=>{setTab(t);setSection(preferred??section)}} onSelectSection={s=>{setSection(s);setTab('360');setRevision(r=>r+1)}} onObserve={setSection} renderSection={key=><div style={{minHeight:700}}>{key} content</div>} renderSidebar={()=>null}/>}
createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  loader: { ".css": "empty" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).outputFiles[0]!.text;
async function mount(page: import("@playwright/test").Page) {
  await page.route("https://collections.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html></html>",
    }),
  );
  await page.goto("https://collections.test/");
  await page.setContent(
    `<style>${styles}body{margin:0;padding:24px}*{box-sizing:border-box}</style><main id="root"></main>`,
  );
  await page.addScriptTag({ content: script });
}

test("record view shares navigation without scrolling feedback loops", async ({
  page,
}) => {
  await mount(page);
  const nav = page.getByRole("navigation", { name: "360 sections" });
  await nav.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.locator('[data-record-section="contacts"]')).toBeFocused();
  await expect(
    nav.getByRole("button", { name: "Contacts", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 1000);
  await expect(
    page.getByText("addresses content", { exact: true }),
  ).toBeVisible();
  await page.mouse.wheel(0, 400);
  await expect(
    nav.getByRole("button", { name: "Addresses", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await expect(page.locator('[data-record-section="contacts"]')).toBeFocused();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("activity content");
  await page.getByRole("tab", { name: "360 View", exact: true }).click();
  await expect(nav).toBeVisible();
});
