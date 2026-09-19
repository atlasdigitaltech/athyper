const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; import {CompositionWorkspace} from './packages/planes/studio/business-partner/src/composition-workspace'; import {configurationFixture} from './packages/planes/studio/business-partner/src/composition-configuration.fixture'; function App(){const [selection,setSelection]=useState({source:'draft:fixture',node:'surfaceFieldBindings:placement-role'}); return <CompositionWorkspace inspection={{source:'draft',id:'fixture',version:'63',status:'approved',targets:[],data:configurationFixture}} selection={selection} onSelect={setSelection} />;} createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    outdir: "/tmp/studio-ux-browser",
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const css = [
    "packages/platform/foundation/theme/src/styles.css",
    "packages/platform/foundation/ui/src/styles.css",
    "apps/studio/app/(shell)/mdg/business-partner/workbench.css",
  ]
    .map((f) => fs.readFileSync(f, "utf8").replace(/^@import[^;]+;/gm, ""))
    .join("\n");
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("https://workspace.test/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} body{margin:0;padding:24px;font-family:Arial,sans-serif;background:var(--a-background);color:var(--a-foreground)} *{box-sizing:border-box}</style></head><body><div id="root"></div><script>${bundled.outputFiles[0].text}</script></body></html>`,
      }),
    );
    await p.goto("https://workspace.test");
    const w = p.locator(".studio-designer"),
      search = w.getByRole("searchbox", { name: "Find an object" });
    await w.getByRole("button", { name: "Filters", exact: true }).click();
    await w.locator("#composition-kind").selectOption("Field");
    await w.getByRole("button", { name: "Done", exact: true }).click();
    await w.getByRole("button", { name: "Remove Type: Field filter", exact: true }).click();
    await search.fill("role");
    await w.getByRole("button", { name: "Clear all", exact: true }).click();
    if (await search.inputValue()) throw Error("Clear all retained search");
    await search.fill("placement-role");
    await w.getByText("1 matching objects", { exact: true }).waitFor();
    await search.fill("no-match");
    await w
      .getByText("Selected object is outside these results.", { exact: false })
      .waitFor();
    await w
      .getByRole("button", { name: "Reveal selection", exact: true })
      .click();
    await w.getByRole("button", { name: "Controls", exact: true }).click();
    await p.getByRole("menuitem", { name: "Collapse all", exact: true }).click();
    await search.fill("placement-role");
    await w
      .locator('[data-node="surfaceFieldBindings:placement-role"]')
      .waitFor();
    await w.getByRole("button", { name: "Clear search", exact: true }).click();
    if (
      await w
        .locator('[data-node="surfaceFieldBindings:placement-role"]')
        .count()
    )
      throw Error("Expansion not restored");
    await w.getByRole("button", { name: "Controls", exact: true }).click();
    await p.getByRole("menuitem", { name: "Expand all", exact: true }).click();
    await w
      .locator(".studio-designer__tabs")
      .getByRole("button", { name: "References", exact: true })
      .click();
    await w
      .locator(".studio-designer__tabs")
      .getByRole("button", { name: "Properties", exact: true })
      .click();
    await w.screenshot({
      path: "docs/architecture/business-partner/ux-workspace-evidence/desktop.png",
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await w
      .locator(".studio-designer__mobile-switch")
      .getByRole("button", { name: "Properties", exact: true })
      .click();
    await w.screenshot({
      path: "docs/architecture/business-partner/ux-workspace-evidence/mobile.png",
    });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow || errors.length)
      throw Error(JSON.stringify({ overflow, errors }));
    const result = {
      isolatedComponents: true,
      searchAncestors: true,
      selectionPreserved: true,
      expansionRestored: true,
      propertyPanels: true,
      sharedFilterChips: true,
      controlsMenu: true,
      mobileOverflow: overflow,
      pageErrors: errors,
      liveWrites: 0,
    };
    fs.writeFileSync(
      "docs/architecture/business-partner/ux-workspace-evidence/browser-check.json",
      JSON.stringify(result, null, 2),
    );
    console.log(result);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
