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
// Mock only the component's authorized context and service boundary.
const script = build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AccessScopeCard,RecordTechnicalDetails} from './packages/planes/neon/business-partner/src/360/components/access-scope';import {BusinessPartner360Provider} from './packages/planes/neon/business-partner/src/360/business-partner-360-context';const summary={identity:{id:'partner-uuid'},scope:{operatingOrganizationId:'org',companyCodeId:'company',legalEntityId:'legal'},asOf:'2026-09-08',directoryScope:'tenant'};createRoot(document.getElementById('root')).render(<div className="bp360"><BusinessPartner360Provider value={{summary,selectSection:()=>{},roleLens:'all',section:'overview',selectRole:()=>{}}}><AccessScopeCard/><RecordTechnicalDetails/></BusinessPartner360Provider></div>);`,
  },
  plugins: [
    {
      name: "scope-fixture",
      setup(build) {
        build.onResolve(
          {
            filter:
              /^@athyper\/(platform-shell-app-foundation|product-neon-shell)$/,
          },
          (args) =>
            args.importer.endsWith("access-scope.tsx")
              ? { path: args.path, namespace: "fixture" }
              : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: args.path.includes("app-foundation")
            ? `const client={request:async(operation,input)=>input.query.role==='supplier'?{eligible:true,reasons:[]}:{eligible:false,reasons:[{code:'COMPANY_PROFILE_MISSING',severity:'blocking'}]}};export const useApiClient=()=>client;`
            : `const org={id:'org',displayName:'CirrusAtlantic Operations'},company={companyCodeId:'company',displayName:'CirrusAtlantic UK'};export const useNeonOperatingOrganization=()=>({organizations:[org]});export const useNeonWorkContext=()=>({companies:[company]});`,
          loader: "js",
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).then((result) => result.outputFiles[0]!.text);
test("Overview separates directory visibility, transaction eligibility, and technical identifiers", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>${styles}body{padding:24px;margin:0}*{box-sizing:border-box}</style><div id="root"></div>`,
  );
  await page.addScriptTag({ content: await script });
  await expect(
    page.getByRole("heading", { name: "Access & transaction scope" }),
  ).toBeVisible();
  await expect(page.getByText("Available across this tenant")).toBeVisible();
  await expect(page.getByText("Allowed", { exact: true })).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await expect(page.getByText("partner-uuid", { exact: false })).toBeHidden();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy Partner ID" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("access-scope-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
