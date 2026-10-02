import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Real stylesheets for the record navigation (foundation, shell, record runtime)
// with the markup RecordModeNavigation renders.
const styles = [
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/platform/entity/runtime/form-detail/src/record/record.css",
  "packages/platform/entity/runtime/form-detail/src/detail-workspace.css",
].map(path => readFileSync(path, "utf8").replace(/^@import[^;]+;/mg, "")).join("\n");
const icon = '<svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg>';
const collaboration = ["Comments", "Files", "Activity"];
const markup = `<nav class="a-entity-record__tabs" aria-label="Record views">
  <details class="a-entity-record__group" data-active><summary aria-current="page">Overview ${icon}</summary><div role="menu"></div></details>
  ${collaboration.map(label => `<button type="button" class="a-entity-record__collaboration-control" aria-label="Open ${label}">${icon}<span>${label}</span></button>`).join("")}
  <details class="a-entity-record__view-control"><summary aria-label="Settings">${icon}</summary></details>
</nav>`;

test("record navigation fits a phone with icon-only collaboration tabs and keeps labels on wider screens", async ({ page }) => {
  for (const width of [390, 320, 1024]) {
    await page.setViewportSize({ width, height: 700 });
    await page.setContent(`<style>${styles}
      :root{--a-space-2:8px;--a-space-3:12px;--a-touch-target:44px;--a-border:#ccc;--a-surface:white}
      body{margin:0;padding:0 16px;font-family:Arial;font-size:16px}</style>${markup}`);
    const nav = page.getByRole("navigation", { name: "Record views" });
    const box = (await nav.boundingBox())!;
    for (const label of collaboration) {
      const button = nav.getByRole("button", { name: `Open ${label}` });
      await expect(button).toBeVisible();
      const control = (await button.boundingBox())!;
      if (width < 640) {
        // The whole row is on screen: nothing is clipped at the trailing edge.
        expect(control.x + control.width).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(await button.locator("span").evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
      } else {
        await expect(button.locator("span")).toHaveText(label);
        expect(await button.locator("span").evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(20);
      }
    }
    if (width < 640) expect(await nav.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});
