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
import {DataValidationProvider,useDataValidation} from './packages/platform/entity/runtime/form-detail/src/data-validation';
const field=(key,label,extra={})=>({control:'input',key,valueKey:key,label,required:true,widget:'text',columnSpan:6,...extra});
const group=(key,label,renderer,itemSurfaceKey,summary)=>({control:'repeatableGroup',key,valueKey:key,label,itemLabel:label,addLabel:'Add '+label,removeLabel:'Remove '+label,itemSurfaceKey,minItems:0,maxItems:3,columnSpan:12,presentation:{renderer,summary,emptyText:'No '+label+' yet.',editLabel:'Edit',doneLabel:'Done',issuesLabel:'{count} issues',headingCount:true,validateOnDone:true,removalConfirmation:{message:'Remove this entry?',confirmLabel:'Confirm removal',cancelLabel:'Keep entry'}}});
const docs=group('proofs','Document','documents','proof',[{field:'kind'}]);
const bank=group('accounts','Bank account','bank-accounts','bank',[{field:'display'},{field:'secret'},{field:'proofs',format:'count'}]);
const address=group('locations','Address','addresses','address',[{field:'street'}]);
const contact=group('people','Contact','contacts','person',[{field:'fullName'}]);
const cert=group('certs','Certification','certifications','cert',[{field:'title'}]);
const surface=(key,fields)=>({schemaVersion:1,key,title:key,columns:1,sections:[{key:'main',columns:12,fields}]});
const surfaces=[surface('root',[bank,address,contact,cert]),surface('bank',[field('display','Bank name'),field('secret','Account identifier',{widget:'password'}),docs]),surface('proof',[field('kind','Document type')]),surface('address',[field('street','Street')]),surface('person',[field('fullName','Contact name')]),surface('cert',[field('title','Certificate name',{maxLength:256}),docs])];
function App(){const [answers,setAnswers]=useState({accounts:[{key:'one',display:'Maybank',secret:'123456789012',proofs:[{key:'doc',kind:''}]},{key:'two',display:'HSBC',secret:'87654321',proofs:[]}],locations:[],people:[],certs:[]});const v=useDataValidation();return <><EntityDataSurface surface={surfaces[0]} surfaces={surfaces} answers={answers} onChange={setAnswers}/><button onClick={()=>v.validate()}>Review</button></>}
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
test("metadata summaries mask secrets, preserve edits and focus nested errors", async ({
  page,
}) => {
  await mount(page);
  const banks = page.locator(
    '.a-collection[data-presentation="bank-accounts"]',
  );
  const rows = banks.locator(":scope > details");
  await expect(rows.first()).not.toHaveAttribute("open");
  await expect(rows.first().locator(":scope > summary")).toContainText(
    "•••• 9012",
  );
  await expect(rows.first().locator(":scope > summary")).not.toContainText(
    "123456789012",
  );
  await rows.first().locator(":scope > summary").click();
  await page.getByLabel("Bank name").first().fill("Updated bank");
  await rows.nth(1).locator(":scope > summary").click();
  await expect(rows.first()).not.toHaveAttribute("open");
  await rows.first().locator(":scope > summary").click();
  await expect(page.getByLabel("Bank name").first()).toHaveValue(
    "Updated bank",
  );
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByLabel("Document type")).toBeFocused();
  await expect(
    rows
      .first()
      .locator('.a-collection[data-presentation="documents"] > details'),
  ).toHaveAttribute("open");
  await expect(rows.first().locator(":scope > summary")).toContainText(
    "1 issues",
  );
  await page.getByLabel("Document type").fill("Bank letter");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".a-validation-summary")).toHaveCount(0);
});
test("new rows open and focus; removal and mobile layout remain usable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  for (const [label, field] of [
    ["Address", "Street"],
    ["Contact", "Contact name"],
    ["Certification", "Certificate name"],
  ] as const) {
    await page
      .getByRole("button", { name: "Add " + label, exact: true })
      .click();
    await expect(page.getByLabel(field)).toBeFocused();
    await page.getByLabel(field).fill("Example " + label);
  }
  const bank = page.locator('.a-collection[data-presentation="bank-accounts"]');
  await bank
    .getByRole("button", { name: "Add Bank account", exact: true })
    .click();
  await expect(
    bank.getByRole("button", { name: "Add Bank account", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Bank name").last()).toBeFocused();
  await bank
    .getByRole("button", { name: "Remove Bank account", exact: true })
    .last()
    .click();
  await expect(bank.locator(":scope > details")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("collections-mobile.png"),
    fullPage: true,
  });
});

test("leaving a character-counted field does not shift the document action during a click", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Add Certification", exact: true })
    .click();
  await page.getByLabel("Certificate name").fill("Example certificate");
  const cert = page.locator(
    '.a-collection[data-presentation="certifications"]',
  );
  await cert.getByRole("button", { name: "Add Document", exact: true }).click();
  await expect(cert.getByLabel("Document type")).toBeFocused();
  await expect(
    cert.locator('.a-collection[data-presentation="documents"] > details'),
  ).toHaveCount(1);
});

test("Done validates only its entry, keeps invalid editors open, and removal confirms populated rows", async ({
  page,
}) => {
  await mount(page);
  const banks = page.locator(
    '.a-collection[data-presentation="bank-accounts"]',
  );
  await expect(
    banks.getByRole("heading", { name: "Bank account (2)", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Contact", exact: true }).click();
  const contact = page.locator('.a-collection[data-presentation="contacts"]');
  await contact.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Contact name")).toBeFocused();
  await expect(contact.locator(":scope > details")).toHaveAttribute("open");
  await expect(
    contact.locator(":scope > details > summary .a-collection__edit"),
  ).toBeHidden();
  await page.getByLabel("Contact name").fill("Example person");
  await contact.getByRole("button", { name: "Done", exact: true }).click();
  await expect(contact.locator(":scope > details")).not.toHaveAttribute("open");
  await expect(
    contact.locator(":scope > details > summary .a-collection__edit"),
  ).toBeVisible();
  // The unrelated bank document is still invalid, proving Done was local.
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByLabel("Document type")).toBeFocused();
  await contact.locator(":scope > details > summary").click();
  await contact
    .getByRole("button", { name: "Remove Contact", exact: true })
    .click();
  await contact
    .getByRole("button", { name: "Keep entry", exact: true })
    .click();
  await expect(contact.locator(":scope > details")).toHaveCount(1);
  await contact
    .getByRole("button", { name: "Remove Contact", exact: true })
    .click();
  await contact
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(
    contact.getByRole("heading", { name: "Contact (0)", exact: true }),
  ).toBeVisible();
  await expect(
    contact.getByRole("button", { name: "Add Contact", exact: true }),
  ).toBeFocused();
});
