const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CompositionReview} from './packages/planes/studio/business-partner/src/composition-review'; import {graph} from './packages/planes/studio/business-partner/src/composition-structure.fixture'; import {CompositionPreview} from './apps/studio/app/(shell)/mdg/business-partner/composition-preview'; graph.surfaces.push({id:'unsupported',surfaceKey:'unsupported',surfaceKind:'form',title:'Unsupported surface',layoutConfig:{}}); const baseline={source:'draft',id:'fixture',version:'4',status:'draft',targets:[],data:graph}; const working={...graph,surfaceFieldBindings:graph.surfaceFieldBindings.map(b=>b.id==='placement-role'?{...b,labelOverride:'Requested business role'}:b)}; createRoot(document.getElementById('root')).render(<CompositionReview baseline={baseline} saved={baseline} working={working} renderPreview={(graph,revision,surfaceId)=><CompositionPreview graph={graph} revision={revision} surfaceId={surfaceId}/>}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    outdir: "/tmp/preview-evidence",
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const css = [
    "packages/platform/foundation/theme/src/styles.css",
    "packages/platform/foundation/ui/src/styles.css",
    "packages/platform/entity/runtime/list-view/src/styles.css",
    "packages/platform/shell/shell/src/styles.css",
    "apps/studio/app/(shell)/mdg/business-partner/workbench.css",
  ]
    .map((p) => fs.readFileSync(p, "utf8").replace(/^@import[^;]+;/gm, ""))
    .join("\n");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    page.setDefaultTimeout(10000);
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.request().url() === "https://preview.test/"
        ? route.fulfill({
            contentType: "text/html",
            body: `<html><head><style>${css} body{margin:0;padding:24px;font-family:Arial;background:var(--a-background);color:var(--a-foreground)} *{box-sizing:border-box}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find((f) => f.path.endsWith(".js")).text}</script></body></html>`,
          })
        : route.abort();
    });
    await page.goto("https://preview.test/");
    const candidate = page.frameLocator('iframe[title^="Candidate"]'),
      base = page.frameLocator('iframe[title^="Base"]');
    await expect(
      candidate.getByText("Requested business role", { exact: true }),
    ).toBeVisible();
    await expect(base.getByText("Role", { exact: true })).toBeVisible();
    await expect(candidate.locator("body")).not.toContainText(
      "Preview unavailable",
    );
    if ((await candidate.locator("body").evaluate(() => innerWidth)) !== 1024)
      throw Error("Wrong desktop viewport");
    await candidate
      .getByRole("radio", { name: "Supplier", exact: true })
      .first()
      .check();
    await page.getByRole("button", { name: "Unified", exact: true }).click();
    await expect(
      page.locator('[data-side="base"].studio-composition-review__canvas'),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "Mobile · 390px", exact: true })
      .click();
    if ((await candidate.locator("body").evaluate(() => innerWidth)) !== 390)
      throw Error("Wrong mobile viewport");
    await expect(
      candidate.getByRole("radio", { name: "Supplier", exact: true }).first(),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Reset preview", exact: true })
      .click();
    await expect(
      candidate.getByRole("radio", { name: "Supplier", exact: true }).first(),
    ).not.toBeChecked();
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await page.screenshot({
      path: "docs/architecture/business-partner/ux-preview-evidence/desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.locator('[data-side="base"].studio-composition-review__canvas'),
    ).toBeHidden();
    await page.getByRole("button", { name: "Base", exact: true }).click();
    await expect(
      page.locator('[data-side="candidate"].studio-composition-review__canvas'),
    ).toBeHidden();
    await page.getByRole("button", { name: "Candidate", exact: true }).click();
    await page.screenshot({
      path: "docs/architecture/business-partner/ux-preview-evidence/mobile.png",
      fullPage: true,
    });
    await page.locator("#review-surface").selectOption("unsupported");
    await expect(candidate.getByRole("status")).toContainText("does not use the supported intake renderer");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (
      errors.length ||
      overflow ||
      requests.some((r) => r !== "https://preview.test/")
    )
      throw Error(JSON.stringify({ errors, overflow, requests }));
    const result = {
      actualCompilerAndRenderer: true,
      viewportWidths: [1024, 390],
      inputPreservedAcrossModes: true,
      resetVerified: true,
      unsupportedSurfaceExplained: true,
      narrowSideSwitch: true,
      pageOverflow: overflow,
      pageErrors: errors,
      networkRequests: requests,
      fixtureOnly: true,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/ux-preview-evidence/results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(result);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
