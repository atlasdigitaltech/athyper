import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const fixture = resolve("tooling/scripts/verification/entity-edit-collaboration-fixture.tsx");
const bundle = build({ entryPoints: [fixture], bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", nodePaths: ["apps/neon/node_modules"],
  plugins: [{ name: "workspace-probes", setup(builder) {
    builder.onResolve({ filter: /^\.\/(entity-runtime-workspace|collaboration-surface)$/ }, () => ({ path: fixture }));
  } }],
}).then(result => result.outputFiles[0]!.text);

test.beforeEach(async ({ page }) => {
  await page.route("https://edit.test/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
});
test("generic edit Collaboration forwards entity context and preserves unsaved fields", async ({ page }) => {
  await page.goto("https://edit.test/");
  await page.evaluate(await bundle);
  expect(await page.evaluate(() => (window as any).runtimeInput)).toEqual({ entityCode: "fixture_order", recordId: "order-42", surfaceKey: "detail", resourceContext: { orgUnitId: "org-7" } });
  await expect(page.getByRole("region")).toHaveCount(0);
  await page.getByLabel("Order description").fill("Unsaved change");
  await page.getByRole("button", { name: "Discussion", exact: true }).click();
  await expect(page.getByLabel("Order description")).toBeHidden();
  await page.getByRole("button", { name: "Close collaboration" }).click();
  await expect(page.getByLabel("Order description")).toHaveValue("Unsaved change");
});
test("an unsaved record renders its form without loading Collaboration", async ({ page }) => {
  await page.goto("https://edit.test/?new=1");
  await page.evaluate(await bundle);
  await expect(page.getByLabel("Order description")).toBeVisible();
  expect(await page.evaluate(() => (window as any).runtimeInput)).toBeUndefined();
});
