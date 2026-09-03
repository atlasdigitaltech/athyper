import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const css = `${readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8")}\n${readFileSync("packages/platform/shell/shell/src/styles.css", "utf8")}`;
const bundle = buildSync({
  entryPoints: ["scripts/verification/atlas-composer-browser-entry.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  nodePaths: ["apps/neon/node_modules"],
}).outputFiles[0]!.text;

test("Atlas composer expands, changes to a close icon, and collapses", async ({ page }) => {
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(bundle);

  const composer = page.locator(".athyper-home__composer");
  const editor = page.getByRole("textbox", { name: "Ask Atlas AI" });
  const expand = page.getByRole("button", { name: "Expand Atlas composer" });
  const collapsedHeight = await editor.evaluate((element) => element.getBoundingClientRect().height);

  await expect(composer).toHaveAttribute("data-expanded", "false");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toHaveAttribute("aria-controls", await editor.getAttribute("id") ?? "");
  await expect(expand.locator("path")).toHaveAttribute("d", "M3 9h18");

  await expand.click();
  const collapse = page.getByRole("button", { name: "Collapse Atlas composer" });
  await expect(composer).toHaveAttribute("data-expanded", "true");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(collapse.locator("path")).toHaveAttribute("d", "M6 6l12 12M18 6 6 18");
  await expect.poll(async () => editor.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(collapsedHeight);

  await collapse.click();
  await expect(composer).toHaveAttribute("data-expanded", "false");
  await expect(page.getByRole("button", { name: "Expand Atlas composer" })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => editor.evaluate((element) => element.getBoundingClientRect().height)).toBe(collapsedHeight);
});
