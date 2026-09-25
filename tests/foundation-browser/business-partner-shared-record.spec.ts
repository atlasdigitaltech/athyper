import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { test, expect } from "@playwright/test";

const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/record/record.css",
].map(path => readFileSync(path, "utf8").replace(/@import[^;]+;/g, "")).join("\n");
const bundle = build({
  entryPoints: ["tests/foundation-browser/fixtures/bp-shared-record.tsx"],
  plugins: [{
    name: "shell-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^@athyper\/(platform-shell|platform-shell-app-foundation|platform-entity-descriptor-client)$/ },
        args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        resolveDir: process.cwd(), loader: "tsx", contents: args.path.endsWith("descriptor-client") ? `
          export * from "./packages/platform/entity/runtime/descriptor-client/src/index";
          import {entityRuntimeClient as actual} from "./packages/platform/entity/runtime/descriptor-client/src/runtime-client";
          export const entityRuntimeClient = {...actual};
        ` : args.path.endsWith("app-foundation") ? `
          export * from "./packages/platform/shell/app-foundation/src/index";
          const http={request:async()=>({attachmentId:'certificate',url:'https://documents.test/certificate.pdf',expiresAt:'2099-01-01T00:00:00Z'})};
          const identity={scope:{tenantId:'tenant',principalId:'actor',authEpoch:1}};
          export const useApiClient=()=>http; export const useSessionIdentity=()=>identity;
        ` : `
          export * from "./packages/platform/shell/shell/src/index";
          export const useRecordPage=()=>{}; export const useRecordBreadcrumb=()=>{};
          export const useRecordFooterSources=()=>{}; export const useAtlasBusinessContextPublisher=()=>{};
        `,
      }));
    },
  }],
  bundle: true, write: false, outfile: "fixture.js", format: "iife", platform: "browser",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"), logLevel: "silent",
}).then(result => result.outputFiles.find(file => file.path.endsWith(".js"))!.text);

test.beforeEach(async ({ page }) => {
  await page.route("https://neon.test/**", route => route.fulfill({
    contentType: "text/html",
    body: `<style>${styles} body{margin:0;padding:24px;font-family:Arial} .a-entity-record-record-content{height:360px;overflow-y:auto} .a-runtime-continuous-section{min-height:500px}</style><div id="root"></div>`,
  }));
});
async function open(page: import("@playwright/test").Page, query = "") {
  await page.goto("https://neon.test/app/entity/business_partner/33333333-3333-4333-8333-333333333333" + query);
  await page.addScriptTag({ content: await bundle });
}
async function select(page: import("@playwright/test").Page, tab: string, section: string) {
  await page.locator("summary").filter({ hasText: tab }).click();
  await page.getByRole("menu", { name: tab + " sections" }).getByRole("menuitem", { name: section, exact: true }).click();
}

test("shared record navigation uses metadata tabs and preserves browser history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await expect(page.getByRole("heading", { name: "Cendana Office", exact: true })).toBeVisible();
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("menuitemcheckbox", { name: "Section view" }).click();
  await select(page, "360 View", "Banking");
  await expect(page.getByText("Maybank · MYR · •••• 4821", { exact: true })).toBeVisible();
  await expect(page.locator("#entity-runtime-heading-banking")).toBeFocused();
  await select(page, "Qualifications", "Restrictions");
  await expect(page.getByText("restrictions details", { exact: true })).toBeVisible();
  await select(page, "360 View", "Certificates");
  await expect(page.getByText("ISO 9001:2015", { exact: true })).toBeVisible();
  await expect(page.locator("#entity-runtime-heading-certificates")).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/section=restrictions/);
  await expect(page.getByText("restrictions details", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/section=certificates/);
  expect(await page.evaluate(() => (window as any).__requests.filter((r: any) => r.kind === "bootstrap").length)).toBe(1);
  expect(errors).toEqual([]);
});

test("working-context updates and history retain the record and selected section", async ({ page }) => {
  await open(page, "?section=banking&tab=360");
  await expect(page.getByText("Maybank · MYR · •••• 4821", { exact: true })).toBeVisible();
  const company = "55555555-5555-4555-8555-555555555555";
  await page.evaluate(id => (window as any).selectCompany(id), company);
  await expect(page).toHaveURL(new RegExp("companyCodeId=" + company));
  await expect.poll(() => page.evaluate(() => (window as any).__requests.filter((r: any) => r.kind === "bootstrap").at(-1)?.context.companyCodeId)).toBe(company);
  await expect(page.getByText("Maybank · MYR · •••• 4821", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/companyCodeId=/);
  await expect.poll(() => page.evaluate(() => (window as any).__requests.filter((r: any) => r.kind === "bootstrap").at(-1)?.context.companyCodeId)).toBeUndefined();
});

test("narrow-screen deep links allow direct section selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "?section=identity&tab=360");
  await expect(page.getByText("identity details", { exact: true })).toBeVisible();
  await page.locator('summary[aria-label="View settings"]').click();
  await page.getByRole("menuitemcheckbox", { name: "Section view" }).click();
  await select(page, "360 View", "Certificates");
  await expect(page).toHaveURL(/section=certificates/);
  await expect(page.getByText("ISO 9001:2015", { exact: true })).toBeVisible();
  await expect(page.locator("#entity-runtime-heading-certificates")).toBeFocused();
});

test("retained certificate document adapter resolves an authorized download", async ({ page }) => {
  await open(page, "?document=1");
  await page.getByRole("button", { name: "View certificate" }).click();
  await expect(page.getByRole("link", { name: "Open document in new tab" })).toHaveAttribute("href", "https://documents.test/certificate.pdf");
});
