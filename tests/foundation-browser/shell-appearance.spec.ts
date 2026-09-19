import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createThemeBootstrapScript } from "@athyper/platform-theme";

const css = `${readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8")}\n${readFileSync("packages/platform/foundation/ui/src/styles.css", "utf8")}\n${readFileSync("packages/platform/shell/shell/src/styles.css", "utf8")}`;
const outputs = buildSync({ entryPoints: ["tooling/scripts/verification/appearance-browser-entry.tsx"], bundle: true, outfile: "fixture.js", write: false, format: "iife", platform: "browser", jsx: "automatic", nodePaths: ["apps/neon/node_modules"] }).outputFiles;
const bundle = outputs.find((file) => file.path.endsWith(".js"))!.text;

async function mount(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://appearance.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><style>${css}</style></head><body><div id="root"></div></body></html>` }),
  );
  await page.goto("https://appearance.test/");
  await page.evaluate(bundle);
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  expect(errors).toEqual([]);
}

test("theme buttons switch the document color scheme and persist across reload", async ({ page }) => {
  await mount(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "false");
  const stored = await page.evaluate(() => localStorage.getItem("athyper.theme"));
  expect(stored).toBe("dark");
  await page.reload();
  await page.evaluate(bundle);
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("density buttons switch density and stay independent of theme", async ({ page }) => {
  await mount(page);
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  await page.getByRole("button", { name: "Compact", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const stored = await page.evaluate(() => localStorage.getItem("athyper.density"));
  expect(stored).toBe("compact");
});

test("the blocking bootstrap script applies a stored dark preference before any app JS runs", async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem("athyper.theme", "dark"); window.localStorage.setItem("athyper.density", "compact"); });
  await page.route("https://appearance.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><script>${createThemeBootstrapScript()}</script><style>${css}</style></head><body><div id="root"></div></body></html>` }),
  );
  await page.goto("https://appearance.test/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme-family");
});

test("the blocking bootstrap script falls back to the platform default with no stored preference", async ({ page }) => {
  await page.route("https://appearance.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><script>${createThemeBootstrapScript()}</script><style>${css}</style></head><body><div id="root"></div></body></html>` }),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("https://appearance.test/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
});
