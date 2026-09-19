import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { test, expect } from "@playwright/test";

const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/planes/neon/business-partner/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const presentation = JSON.parse(readFileSync("server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json", "utf8")).recordPresentation;
const bundle = build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {BusinessPartner360Shell} from './packages/planes/neon/business-partner/src/360/business-partner-360';
createRoot(document.getElementById('root')).render(<BusinessPartner360Shell businessPartnerId="33333333-3333-4333-8333-333333333333"/>);
`,
  },
  plugins: [
    {
      name: "record-api-fixture",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^@athyper\/(platform-shell|platform-shell-app-foundation|product-neon-shell)$/,
          },
          (args) => ({ path: args.path, namespace: "record-fixture" }),
        );
        builder.onLoad(
          { filter: /.*/, namespace: "record-fixture" },
          (args) => ({
            resolveDir: process.cwd(),
            loader: "tsx",
            contents: args.path.endsWith("app-foundation")
              ? `
import {parseEntityRecordPresentation} from './packages/contracts/platform/entity-runtime/src/index';
const sections=['overview','identity','contacts','addresses','identifiers-tax','governance','banking','qualifications-certificates','roles-scope','supplier-company','customer-company','credit','network','requests','business-activity','activity','comments','attachments'];
const identity={scope:{tenantId:'tenant',principalId:'principal',authEpoch:1}};
const partner='33333333-3333-4333-8333-333333333333';
const search=new URL(window.location.href).searchParams;
const summary={schemaVersion:1,asOf:'2026-09-08',generatedAt:'2026-09-08T10:00:00Z',businessPartnerVersion:1,identity:{id:partner,displayName:'Cendana Office',legalName:'Cendana Office Sdn Bhd',code:'ATH-APAC-003',category:'organization',lifecycleStatus:'active'},scope:{businessPartnerId:partner,asOf:'2026-09-08',...(search.get('operatingOrganizationId')?{operatingOrganizationId:search.get('operatingOrganizationId')}:{}) ,...(search.get('companyCodeId')?{companyCodeId:search.get('companyCodeId')}:{})},roles:[{id:'supplier',code:'supplier',status:'active'},{id:'customer',code:'customer',status:'active'}],primaryContact:{id:'contact',primary:true,displayName:'Amelia Hart',email:'amelia@example.test',phone:'+60 3 1234 5678',verified:true},primaryAddress:{id:'address',primary:true,purpose:'registered',lines:['Suite 12','18 Jalan Cendana'],locality:'Kuala Lumpur',postalCode:'50250',countryCode:'MY',verified:true},identifiers:[],openWork:{activeRequestCount:2,returnedRequestCount:0},recentActivity:[],sections:sections.map(code=>({code,authorization:'granted',state:'ready',count:1})),provenance:[],completeness:{status:'complete',percent:100,requiredCount:4,completeCount:4,restrictedCount:0,required:[],recommended:[],readOnly:false,fingerprint:'x'},collaboration:{canComment:true}};
summary.recordHeader={title:'Cendana Office',code:'ATH-APAC-003',entityLabel:'Business Partner',iconKey:'contact',badges:[],context:[],actions:[],readOnly:false,sections:${JSON.stringify(presentation.sections)},related:parseEntityRecordPresentation(${JSON.stringify(presentation)}).related};
window.__requests=[];
const client={async request(operation,input){const path=typeof operation.path==='function'?operation.path(input.params??{}):operation.path;window.__requests.push({path,query:input.query,method:operation.method});
if(path.endsWith('/summary'))return summary;
if(path.endsWith('/eligibility'))return {eligible:true,reasons:[]};
if(path.endsWith('/download'))return {attachmentId:'certificate',url:'https://documents.test/certificate.pdf',expiresAt:'2099-01-01T00:00:00Z'};
if(path.endsWith('/comments')&&operation.method==='POST')return {id:'created'};
const code=path.split('/').pop();
if(code==='qualifications')return {data:{certifications:[{id:'cert',name:'ISO 9001:2015',certificateNumber:'BSI-9001-772',issuingBody:'BSI',status:'verified',effectiveUntil:'2027-04-18',attachment:{attachmentId:'certificate',fileName:'ISO-9001.pdf'}}],qualifications:[],preferences:[],blocks:[]}};
if(code==='banking')return {data:{readOnly:true,accounts:[{linkId:'bank',bankName:'Maybank',maskedAccount:'•••• 4821',currencyCode:'MYR',accountHolderName:'Cendana Office Sdn Bhd',primary:true,verified:true,revealable:false}]}};
if(code==='comments')return {data:{items:[{id:'comment',text:'Please review the renewal date.',authorName:'Amelia Hart',visibility:'internal',createdAt:'2026-09-08T01:00:00Z'}]}};
if(code==='attachments')return {data:{items:[{id:'certificate',attachmentId:'certificate',fileName:'ISO-9001.pdf',contentType:'application/pdf',sizeBytes:2048}]}};
if(code==='identity')return {schemaVersion:1,state:'ready',redactions:[],sectionCode:code,data:{items:[{id:partner,kind:'canonical',displayName:'Cendana Office',code:'ATH-APAC-003',legalName:'Cendana Office Sdn Bhd',legalForm:'private_limited',registrationCountryCode:'MY'},{id:'industry',kind:'classification',industryDomainCode:'isic',industryCode:'4659',industryName:'Wholesale of machinery and equipment',industryCodeId:'technical-id'}]},provenance:[]};
if(['contacts','addresses','identifiers','governance'].includes(code))return {schemaVersion:1,state:'ready',redactions:[],sectionCode:code,data:{items:[{id:code==='contacts'?'contact':code==='addresses'?'address':code,displayName:code==='contacts'?'Amelia Hart':'Partner details',primary:true,lines:['Suite 12','18 Jalan Cendana'],countryCode:'MY'}]},provenance:[]};
if(code==='network')return {data:{live:{state:'not_requested'}}};
return {data:{items:[],roles:[],providers:[],openWork:{active:2}},provenance:[]};}};
export * from "./packages/platform/shell/app-foundation/src/index";
export const usePermissions=()=>({has:()=>false});export const useApiClient=()=>client;export const useSessionIdentity=()=>identity;
`
              : args.path.endsWith("product-neon-shell")
                ? `
const organizations=[{id:'44444444-4444-4444-8444-444444444444',displayName:'Malaysia Operations',companyAssignments:[{companyCodeId:'55555555-5555-4555-8555-555555555555'}]}],companies=[{companyCodeId:'55555555-5555-4555-8555-555555555555',displayName:'Cendana Malaysia',code:'MY01'}];
export const useNeonOperatingOrganization=()=>({organizations});export const useNeonWorkContext=()=>({companies});
`
                : `export * from './packages/platform/shell/shell/src/index';import React from 'react';export const useAtlasBusinessContextPublisher=()=>{};export const useRegisterEntityTaskHeader=()=>false;export const useRecordPage=()=>{};export const useRecordBreadcrumb=()=>{};export const useRecordFooterSources=()=>{};export const PageFrame=({children})=><div>{children}</div>;export const PageHeader=({title,description,metadata,actions})=><header className="fixture-header"><h1>{title}</h1><p>{description}</p><div>{metadata}</div><div>{actions}</div></header>;`,
          }),
        );
      },
    },
  ],
  bundle: true,
  write: false,
  outfile: "fixture.js",
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).then((result) => ({
  script: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
  styles: result.outputFiles.filter((file) => file.path.endsWith(".css")).map((file) => file.text).join("\n"),
}));

test.beforeEach(async ({ page }) => {
  const { styles: importedStyles } = await bundle;
  await page.route("https://neon.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>${importedStyles}\n${styles}*{box-sizing:border-box}body{--shell-topbar:72px;--shell-crumbs:0px;margin:0;padding:88px 24px 24px;background:var(--a-background);color:var(--a-foreground);font-family:Arial,sans-serif}.appbar{position:fixed;inset:0 0 auto;height:72px;background:var(--a-surface);z-index:20;border-bottom:1px solid var(--a-border);padding:20px;font-weight:bold}.fixture-header{padding:12px 0 20px}.fixture-header h1{margin:0}.fixture-header .a-badge{margin-right:8px}</style><div class="appbar">athyper NEON</div><div id="root"></div>`,
    }),
  );
});

test("continuous navigation, real tabs, documents, and browser history", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("https://neon.test/partner");
  await page.addScriptTag({ content: (await bundle).script });
  await expect(page.locator(".athyper-page-workspace")).toHaveCount(1);
  await expect(page.locator('[data-slot="page-navigation"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="page-navigation"]')).toHaveAttribute("data-navigation-band", "shell");
  await expect(page.locator('[data-slot="page-navigation"]')).toContainText("360 View");
  await expect(page.locator('[data-slot="page-toolbar"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="page-body"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveText(["360 View", "Roles & scope", "Requests", "Business Transactions", "Activity", "Comments", "Attachments"]);
  await expect(
    page.getByRole("heading", { name: "Primary Contact", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Suite 12", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("360-desktop.png"),
    fullPage: false,
  });
  const rail = page.getByRole("navigation", { name: "360 sections" });
  await rail.getByRole("button", { name: "Banking" }).click();
  await expect(page.locator('[data-record-section="banking"]')).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Maybank · MYR · •••• 4821" }),
  ).toBeVisible();
  // Lazy section rendering can resize the document after focus; wait for scroll settling.
  await expect.poll(() => page.locator('[data-record-section="banking"]').evaluate(
    (element) => {
      const tabs = document.querySelector('[role="tablist"]')!;
      return element.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom;
    },
  )).toBeGreaterThanOrEqual(0);
  await expect.poll(() => page.locator('[data-record-section="banking"]').evaluate(
    (element) => element.getBoundingClientRect().top,
  )).toBeLessThan(200);
  await page.getByRole("tab", { name: "Roles & scope", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Roles & scope", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Roles & scope", exact: true })).toBeFocused();
  await page.getByRole("tab", { name: "360 View", exact: true }).click();
  await expect(page.getByRole("tab", { name: "360 View", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "360 View", exact: true })).toBeFocused();
  await rail
    .getByRole("button", { name: "Qualifications & certificates" })
    .click();
  await expect(
    page.getByRole("button", { name: "View certificate" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View certificate" }).click();
  await expect(
    page.getByRole("link", { name: "Open document in new tab" }),
  ).toHaveAttribute("href", "https://documents.test/certificate.pdf");
  await page.screenshot({
    path: info.outputPath("360-certificates.png"),
    fullPage: false,
  });
  await page.getByRole("tab", { name: "Comments", exact: true }).click();
  await expect(page.getByText("Please review the renewal date.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Add an internal comment" })
    .fill("Reviewed.");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(page.getByText("Comment added.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Attachments", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ISO-9001.pdf" }),
  ).toBeVisible();
  await expect(page.getByText("Please review the renewal date.")).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Comments", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () =>
        (window as any).__requests.filter((item: any) =>
          item.path.endsWith("/summary"),
        ).length,
    ),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("changing transaction context retains the workspace and updates the route", async ({ page }) => {
  await page.goto("https://neon.test/partner?section=overview&tab=360&operatingOrganizationId=44444444-4444-4444-8444-444444444444&companyCodeId=55555555-5555-4555-8555-555555555555");
  await page.addScriptTag({ content: (await bundle).script });
  await page.getByRole("button", { name: "Change context" }).click();
  await expect(page.getByRole("region", { name: "Transaction context" })).toBeFocused();
  await page.getByRole("combobox", { name: "Transaction organization" }).selectOption("44444444-4444-4444-8444-444444444444");
  await page.getByRole("combobox", { name: "Transaction company" }).selectOption("55555555-5555-4555-8555-555555555555");
  await page.getByRole("button", { name: "Use this context" }).click();
  await expect.poll(() => page.url()).toContain("operatingOrganizationId=44444444-4444-4444-8444-444444444444");
  await expect(page.locator(".athyper-page-workspace")).toHaveCount(1);
});

test("deep links and narrow screens preserve accessible section navigation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://neon.test/partner?section=identity");
  await page.addScriptTag({ content: (await bundle).script });
  await expect(
    page.getByText("Private limited company", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Wholesale of machinery and equipment", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "360 sections", exact: true })
    .selectOption("qualifications-certificates");
  await expect(
    page.getByRole("button", { name: "View certificate" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect.poll(async () => page.locator('[data-record-section="qualifications-certificates"]').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(200);
  await expect.poll(async () => page.locator('.appbar').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
  await page.screenshot({
    path: info.outputPath("360-mobile.png"),
    fullPage: false,
  });
  await page.getByRole("tab", { name: "360 View", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Attachments", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
