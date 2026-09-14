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
import {EntityDataSurface} from './packages/platform/entity/runtime/form-detail/src/data-surface';
import {DataValidationProvider,useDataValidation} from './packages/platform/entity/runtime/form-detail/src/data-validation';
const input=(key,label,required=false)=>({control:'input',key,valueKey:key,label,widget:'text',required,columnSpan:12});
const surface={schemaVersion:1,key:'details',title:'Details',sections:[{key:'identity',title:'Identity',columns:12,fields:[input('name','Name',true)]},{key:'address',title:'Addresses',columns:12,fields:[input('street','Street',true)]},{key:'contact',title:'Contacts',columns:12,fields:[input('contact','Contact',true)]}]};
function App(){const [answers,setAnswers]=useState({name:'',street:'',contact:''});const validation=useDataValidation();return <><EntityDataSurface sectionNavigation={{label:'Request sections'}} surface={surface} surfaces={[surface]} answers={answers} onChange={setAnswers}/><button onClick={()=>validation.validate()}>Review</button></>}
createRoot(document.getElementById('root')).render(<DataValidationProvider><App/></DataValidationProvider>);
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

test("shared form navigation tracks scrolling and preserves edits and validation", async ({
  page,
}) => {
  await mount(page);
  await page.addStyleTag({
    content:
      "[data-form-section]{min-height:550px}.a-form-layout{--form-section-top:20px}",
  });
  const nav = page.getByRole("navigation", { name: "Request sections" });
  await page.getByRole("textbox", { name: "Name" }).fill("Example");
  await nav.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.locator('[data-form-section="contact"]')).toBeFocused();
  await expect(
    nav.getByRole("button", { name: "Contacts", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page.getByRole("textbox", { name: "Contact" }).fill("Example contact");
  await page.mouse.wheel(0, -350);
  await expect(
    nav.getByRole("button", { name: "Addresses", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("textbox", { name: "Contact" })).toBeFocused();
  await nav.getByRole("button", { name: "Identity", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Example",
  );
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Street" })).toBeFocused();
  await expect(nav.getByRole("button", { name: /Addresses/ })).toContainText(
    "Issues: 1",
  );
  await page.getByRole("textbox", { name: "Street" }).fill("Example street");
  await expect(
    nav.getByRole("button", { name: /Addresses/ }),
  ).not.toContainText("Issues:");
  await page.setViewportSize({ width: 390, height: 844 });
  await nav.getByRole("combobox").selectOption("contact");
  await expect(page.locator('[data-form-section="contact"]')).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Contact" })).toHaveValue(
    "Example contact",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
