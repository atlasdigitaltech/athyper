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
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EntityDataSurface} from './packages/platform/entity/runtime/form-detail/src/data-surface';
const country={control:'input',key:'country',valueKey:'countryCode',label:'Country',required:true,widget:'select',columnSpan:6,lookup:{options:[{value:'MY',label:'Malaysia'},{value:'SG',label:'Singapore'}]},clearOnChange:{mode:'dialog',title:'Change country to {next}?',message:'The current state or region will be cleared. Street details remain.',confirmLabel:'Change country',cancelLabel:'Keep {previous}',fields:['region']}};
const surface={schemaVersion:1,key:'address',title:'Address',sections:[{key:'details',columns:12,fields:[country,{control:'input',key:'region',valueKey:'region',label:'Region',widget:'text',required:false,columnSpan:6},{control:'input',key:'street',valueKey:'street',label:'Street',widget:'text',required:false,columnSpan:12}]}]};
function App(){const [answers,setAnswers]=useState({countryCode:'MY',region:'Johor',street:'Example Tower'});return <><EntityDataSurface surface={surface} surfaces={[surface]} answers={answers} onChange={setAnswers}/><output>{JSON.stringify(answers)}</output></>}
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
test('country confirmation preserves values, supports Escape and cancel, and clears only dependent values',async({page})=>{
 await mount(page);
 const country=page.getByRole('combobox', {name:/Country/});
 await country.selectOption('SG');
 const dialog=page.getByRole('dialog',{name:'Change country to Singapore?'});
 await expect(dialog).toBeVisible();
 await expect(country).toHaveValue('MY');
 await expect(page.getByLabel('Region',{exact:true})).toHaveValue('Johor');
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(country).toBeFocused();
 await country.selectOption('SG');
 await dialog.getByRole('button',{name:'Keep Malaysia'}).click();
 await expect(country).toHaveValue('MY');
 await expect(country).toBeFocused();
 await country.selectOption('SG');
 await dialog.getByRole('button',{name:'Change country',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(country).toHaveValue('SG');
 await expect(page.getByLabel('Region',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Street',{exact:true})).toHaveValue('Example Tower');
 await country.selectOption('MY');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(country).toHaveValue('MY');
});
