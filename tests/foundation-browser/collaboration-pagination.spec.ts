import { buildSync } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
const fixture = resolve(
  "tooling/scripts/verification/collaboration-pagination-fixture.tsx",
);
const bundle = buildSync({
  entryPoints: [fixture],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  nodePaths: ["apps/neon/node_modules"],
  alias: { "@athyper/platform-entity-descriptor-client": fixture },
}).outputFiles[0]!.text;
test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  await page.evaluate(bundle);
  await expect(page.getByRole("status")).toHaveText("A: 25");
});
test("refresh retains one hundred loaded comments", async ({ page }) => {
  for (const count of [50, 75, 100]) {
    await page.getByRole("button", { name: "Load more", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(`A: ${count}`);
  }
  await page.getByRole("button", { name: "Like comment 90" }).click();
  await expect(page.getByRole("status")).toHaveText("A: 100");
  await expect(page.getByText("A-90", { exact: true })).toBeVisible();
});
test("late pagination cannot overwrite the next record", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).holdPages = true;
  });
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await page.getByRole("button", { name: "Next record" }).click();
  await expect(page.getByRole("status")).toHaveText("B: 25");
  await page.evaluate(() => (window as any).releasePages());
  await expect(page.getByRole("listitem")).toHaveCount(25);
  await expect(page.getByText("A-26", { exact: true })).toHaveCount(0);
});
test("refresh supersedes an in-flight load-more response", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).holdPages = true;
  });
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await page.getByRole("button", { name: "Like comment 90" }).click();
  await page.evaluate(() => (window as any).releasePages());
  await expect(page.getByRole("status")).toHaveText("A: 25");
});
