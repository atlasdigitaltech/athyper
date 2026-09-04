import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const css = ["theme", "ui", "surface-kit"].map((name) => readFileSync(`packages/platform/foundation/${name === "surface-kit" ? name : name}/src/styles.css`, "utf8").replace(/^@import[^;]+;\s*/m, "")).join("\n");
const cases = ["login-skeleton", "error-page", "toast", "dialog", "empty-shell"] as const;

for (const name of cases) {
  test(`${name} has no critical accessibility violations and matches its visual snapshot`, async ({ page }) => {
    const markup = execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tooling/scripts/verification/render-foundation-fixture.tsx", name], { encoding: "utf8" });
    await page.setContent(`<!doctype html><html lang="en" data-theme="light" data-density="comfortable"><head><style>${css}</style></head><body>${markup}</body></html>`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}
