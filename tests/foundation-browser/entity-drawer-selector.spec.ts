import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const styles = ["packages/platform/foundation/ui/src/styles.css", "packages/platform/entity/runtime/list-view/src/styles.css"].map(path => readFileSync(path, "utf8").replace(/^@import[^;]+;/mg, "")).join("\n");
const labels = ["Filters", "Sort", "Columns", "Group by", "Display settings", "Manage views"];

test("drawer title menu clears the heading and body and every destination is clickable", async ({ page }) => {
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.setContent(`<style>${styles}
      :root{--a-space-1:4px;--a-space-2:8px;--a-space-3:12px;--a-space-4:16px;--a-border-width:1px;--a-border:#ccc;--a-surface-raised:white;--a-surface:white;--a-muted:#eee;--a-z-popover:60;--a-touch-target:40px;--a-font-size-md:18px;--a-font-size-sm:14px}
      body{margin:0;font-family:Arial}.a-entity-list__controls-drawer{position:fixed;right:0;top:50px;bottom:0;background:white}.a-drawer__toolbar{height:60px;background:#ddd}.a-drawer__body{background:#eee}
      </style><div class="a-entity-list__controls-drawer"><header class="a-drawer__header"><span class="a-drawer__heading"><h2><span><div class="a-menu"><button id="trigger">Filters</button><div role="menu" class="a-menu__content a-entity-list__drawer-menu">${labels.map(label => `<button class="a-menu__item" role="menuitem" onclick="document.body.dataset.selected=this.textContent">${label}</button>`).join("")}</div></div></span></h2><p>Refine this entity list.</p></span></header><div class="a-entity-list__drawer-section"><div class="a-drawer__toolbar">Summary</div><div class="a-drawer__body">Quick filters</div></div></div>`);
    const trigger = await page.locator('#trigger').boundingBox();
    const menu = await page.getByRole('menu').boundingBox();
    expect(menu!.y).toBeGreaterThanOrEqual(trigger!.y + trigger!.height);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    for (const label of labels) {
      // Playwright verifies hit testing, including clipping and coverage by the body.
      await page.getByRole('menuitem', { name: label, exact: true }).click({ timeout: 2000 });
      await expect(page.locator('body')).toHaveAttribute('data-selected', label);
    }
  }
});
