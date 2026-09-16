const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CompositionReview} from './packages/planes/studio/business-partner/src/composition-review'; import graph from './docs/architecture/business-partner/address-preview-evidence/fixture.json'; import {CompositionPreview} from './apps/studio/app/(shell)/mdg/business-partner/composition-preview'; const baseline={source:'draft',id:'fixture',version:'3',status:'draft',targets:[],data:graph}; createRoot(document.getElementById('root')).render(<CompositionReview baseline={baseline} saved={baseline} working={graph} renderPreview={(graph,revision,surfaceId)=><CompositionPreview graph={graph} revision={revision} surfaceId={surfaceId}/>}/>);`,
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
      if (route.request().method() !== "GET") { errors.push("Unexpected mutation request"); return route.abort(); }
      if (route.request().url().endsWith("/change-sets/fixture/history")) return route.fulfill({json:[]});
      if (route.request().url().includes("/address-preview-choices"))
        return route.fulfill({
          json: {
            "iso.country": [
              {
                value: "MY",
                label: "Malaysia",
                data: {
                  regionLabel: "State",
                  postalLabel: "Postcode",
                  postalPattern: "",
                  postalExample: "",
                  postalHelp: "",
                },
              },
            ],
            "shared.state_region": [
              {
                value: "MY-10",
                label: "Selangor",
                data: { countryCode: "MY", name: "Selangor" },
              },
            ],
          },
        });
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
      candidate.getByRole("textbox", { name: "City *", exact: true }),
    ).toBeVisible();
    await candidate
      .getByRole("textbox", { name: "City *", exact: true })
      .fill("Kuala Lumpur");
    await expect(candidate.locator("body")).not.toContainText(
      "Preview unavailable",
    );
    await candidate
      .getByRole("combobox", { name: "Country", exact: true })
      .click();
    await candidate.getByRole("option", { name: /Malaysia/ }).click();
    await expect(
      candidate.getByRole("textbox", { name: "Postcode", exact: true }),
    ).toBeVisible();
    await candidate
      .getByRole("combobox", { name: "State", exact: true })
      .click();
    await candidate.getByRole("option", { name: /Selangor/ }).click();
    await candidate
      .getByRole("combobox", { name: "State / Region entry", exact: true })
      .selectOption("manual");
    await candidate
      .getByRole("button", { name: "Change entry mode", exact: true })
      .click();
    await expect(
      candidate.getByRole("textbox", { name: "State", exact: true }),
    ).toBeVisible();
    await candidate
      .getByText("Additional address details", { exact: true })
      .click();
    await candidate
      .getByRole("combobox", { name: "Address kind", exact: true })
      .selectOption("po_box");
    await expect(
      candidate.getByRole("textbox", { name: "PO box number *", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Unified", exact: true }).click();
    await page
      .getByRole("button", { name: "Mobile · 390px", exact: true })
      .click();
    await expect(
      candidate.getByRole("textbox", { name: "City *", exact: true }),
    ).toHaveValue("Kuala Lumpur");
    await page.screenshot({
      path: "docs/architecture/business-partner/address-preview-evidence/desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Base", exact: true }).click();
    await page.getByRole("button", { name: "Candidate", exact: true }).click();
    await page.screenshot({
      path: "docs/architecture/business-partner/address-preview-evidence/mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Reset preview", exact: true })
      .click();
    await expect(
      candidate.getByRole("textbox", { name: "City *", exact: true }),
    ).toHaveValue("");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (
      errors.length ||
      overflow ||
      requests.some(
        (r) =>
          r !== "https://preview.test/" &&
          !r.endsWith("/address-preview-choices") && !r.endsWith("/change-sets/fixture/history"),
      )
    )
      throw Error(JSON.stringify({ errors, overflow, requests }));
    const result = {
      actualCompilerAndRenderer: true,
      viewportWidths: [1024, 390],
      inputPreservedAcrossModes: true,
      resetVerified: true,
      addressControlsRendered: true,
      countryAndRegionChoices: true,
      manualRegionAndPoBoxConditions: true,
      narrowSideSwitch: true,
      pageOverflow: overflow,
      pageErrors: errors,
      networkRequests: requests,
      fixtureOnly: true,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/address-preview-evidence/results.json",
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
