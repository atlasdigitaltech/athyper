import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";
const script = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React,{useState,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {SearchableSelect} from './packages/platform/foundation/ui/src/searchable-select';
import {createEntityReferenceMessages} from './packages/platform/foundation/i18n/src/entity-reference-messages';
import {entityEnglishMessages} from './packages/platform/foundation/i18n/src/entity-messages';
function App(){const [scope,setScope]=useState('A'),[value,setValue]=useState('');
const loadPage=useCallback(async input=>{const r=await fetch('/choices?'+new URLSearchParams({scope,query:input.query,...(input.cursor?{cursor:input.cursor}:{}),...(input.value?{value:input.value}:{})}),{signal:input.signal});return r.json()},[scope]);
return <main><button onClick={()=>setScope('B')}>Change country</button><SearchableSelect label="Parent region" value={value} onChange={setValue} options={[]} loadPage={loadPage} messages={createEntityReferenceMessages(key=>entityEnglishMessages[key])}/><output>{value}</output></main>}
createRoot(document.getElementById('root')).render(<App/>);`,
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

test("dynamic lookup rejects delayed results after country context changes", async ({
  page,
}) => {
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let oldRequested = false;
  await page.route("http://reference.test/choices**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("scope") === "A") {
      oldRequested = true;
      await delayed;
    }
    await route
      .fulfill({
        json: {
          options: [
            {
              value: "01",
              label:
                url.searchParams.get("scope") === "A"
                  ? "Old country region"
                  : "New country region",
            },
          ],
        },
      })
      .catch(() => {});
  });
  await page.route("http://reference.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto("http://reference.test/");
  await page.addScriptTag({ content: script });
  await page
    .getByRole("combobox", { name: "Parent region", exact: true })
    .click();
  await expect.poll(() => oldRequested).toBe(true);
  await page.getByRole("button", { name: "Change country" }).click();
  release();
  await page
    .getByRole("combobox", { name: "Parent region", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "New country region" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Old country region" }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "New country region" }).click();
  await expect(
    page.getByRole("combobox", { name: "Parent region", exact: true }),
  ).toHaveValue("New country region");
  await expect(page.locator("output")).toHaveText("01");
});
