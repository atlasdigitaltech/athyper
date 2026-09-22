import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const css = `${readFileSync("packages/platform/foundation/ui/src/composer-frame/styles.css", "utf8")}
${readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8")}\n${readFileSync("packages/platform/shell/shell/src/styles.css", "utf8")}`;
const bundle = buildSync({
  loader: { ".css": "empty" },
  entryPoints: ["tooling/scripts/verification/atlas-composer-browser-entry.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  nodePaths: ["apps/neon/node_modules"],
}).outputFiles[0]!.text;

test("Atlas shared composer keeps prompt editing, library and submission controls", async ({ page }) => {
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(bundle);
  const frame = page.locator(".athyper-home__composer.a-composer-frame");
  await expect(frame.locator(".a-composer-frame__header")).toContainText("Ask Atlas");
  const editor = page.getByRole("textbox", {name:"Ask Atlas to search, create, or take action"});
  const send = page.getByRole("button", {name:"Send message"});
  await expect(send).toBeDisabled();
  await editor.fill("Help me review this record");
  await expect(send).toBeEnabled();
  await expect(frame.locator(".a-composer-frame__footer")).toContainText("Add context");
  await page.getByRole("button", {name:"Prompt library",exact:true}).click();
  await expect(page.getByRole("menu", {name:"Prompt library"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveText("Help me review this record");
  await send.click();
});
