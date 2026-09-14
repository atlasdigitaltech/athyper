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
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EntityDataSurface} from './packages/platform/entity/runtime/form-detail/src/data-surface';
import {dataSurfaceValues} from './packages/contracts/platform/entity-runtime/src/intake-data-values';
const profiles:any={
 MY:{accountType:'local_account',accountPattern:'',routingWidget:'hidden',routingRequired:false},
 IN:{accountType:'local_account',accountPattern:'',routingWidget:'text',routingLabel:'IFSC',routingPattern:'^[A-Z]{4}0[A-Z0-9]{6}$',routingRequired:true},
 SA:{accountType:'iban',accountPattern:'^SA[0-9]{4}[A-Z0-9]{18}$',routingWidget:'hidden',routingRequired:false},
 EG:{accountType:'iban',accountPattern:'^EG[0-9]{27}$',routingWidget:'hidden',routingRequired:false},
 QA:{accountType:'iban',accountPattern:'^QA[0-9]{2}[A-Z]{4}[A-Z0-9]{21}$',routingWidget:'hidden',routingRequired:false},
};
const input=(key:string,extra:any={})=>({control:'input',key,valueKey:key,label:key,widget:'text',columnSpan:6,required:false,...extra});
const country=input('country',{widget:'select',lookup:{options:Object.entries(profiles).map(([value,data])=>({value,label:value,data:{...data as any,typeWidget:'hidden'}}))}});
const type=input('type',{widget:'select',required:true,lookup:{options:[{value:'iban',label:'IBAN'},{value:'local_account',label:'Local account'}]},referenceRules:{field:'country',value:'accountType',widget:'typeWidget'}});
const account=input('account',{label:'Account number',required:true,referenceRules:{field:'country',pattern:'accountPattern'},variants:[{when:{field:'type',operator:'equals',value:'iban'},format:'iban',label:'IBAN'}]});
const routing=input('routing',{referenceRules:{field:'country',widget:'routingWidget',label:'routingLabel',pattern:'routingPattern',required:'routingRequired'},normalize:'uppercase'});
const surface:any={sections:[{fields:[country,type,account,routing]}]};

function App(){const [answers,setAnswers]=useState({country:'MY',account:'',routing:''}),[result,setResult]=useState('');return <><EntityDataSurface surface={surface} surfaces={[surface]} answers={answers} onChange={setAnswers}/><button onClick={()=>{try{setResult(JSON.stringify(dataSurfaceValues(surface,[surface],answers)))}catch{setResult('Invalid')}}}>Done</button><output>{result}</output></>}
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

for (const [country, value] of Object.entries({
  MY: "001234",
  IN: "001234",
  SA: "SA03 8000 0000 6080 1016 7519",
  EG: "EG38 0019 0005 0000 0000 2631 8000 2",
  QA: "QA58 DOHB 0000 1234 5678 90AB CDEF G",
}))
  test(country + " account format and routing", async ({ page }) => {
    await mount(page);
    await page.getByRole("combobox", { name: "country" }).selectOption(country);
    await expect(page.getByRole("combobox")).toHaveCount(1);
    const iban = ["SA", "EG", "QA"].includes(country);
    await page
      .getByRole("textbox", { name: iban ? "IBAN" : "Account number" })
      .fill(value);
    if (country === "IN") {
      await page.getByRole("textbox", { name: "IFSC" }).fill("ABCD1123456");
      await page.getByRole("button", { name: "Done" }).focus();
      await page.getByRole("button", { name: "Done" }).press("Enter");
      await expect(page.getByRole("status")).toHaveText("Invalid");
      await page.getByRole("textbox", { name: "IFSC" }).fill("ABCD0123456");
    } else
      await expect(page.getByRole("textbox", { name: "routing" })).toHaveCount(
        0,
      );
    await page.getByRole("button", { name: "Done" }).focus();
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(page.getByRole("status")).toContainText(
      value.replace(/ /g, ""),
    );
    await expect(page.getByRole("status")).toContainText(
      iban ? "iban" : "local_account",
    );
  });
