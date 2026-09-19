import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const classes = ["authentication", "required-action", "permission-denied", "context-mismatch", "conflict", "validation", "rate-limit", "service-unavailable", "network", "offline", "unexpected"] as const;
for (const kind of classes) test(`${kind} boundary is accessible and redacted`, async ({ page }) => {
  const markup = execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tooling/scripts/verification/render-boundary-fixture.tsx", kind], { encoding: "utf8" });
  await page.setContent(`<!doctype html><html lang="en"><body>${markup}</body></html>`);
  await page.locator("#app-error-title").focus();
  await expect(page.locator("#app-error-title")).toBeFocused();
  await expect(page.locator("main")).toHaveAttribute("data-error-kind", kind);
  await expect(page.locator("body")).not.toContainText(/Bearer|password|SQL|internal-url/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => item.impact === "critical")).toEqual([]);
});
