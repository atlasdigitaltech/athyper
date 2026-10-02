import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Real stylesheets for the collection controls tool panel: shell frame, shared
// panel primitives and the collection controls anatomy.
const styles = [
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/platform/entity/runtime/collection-controls/src/styles.css",
  "packages/platform/entity/runtime/list-view/src/styles.css",
].map(path => readFileSync(path, "utf8").replace(/^@import[^;]+;/mg, "")).join("\n");
const labels = ["Filters", "Sort", "Columns", "Group", "Display", "Views"];

test("section tabs replace the title menu; every section is reachable and the anatomy never overlaps", async ({ page }) => {
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.setContent(`<style>${styles}
      :root{--a-space-1:4px;--a-space-2:8px;--a-space-3:12px;--a-space-4:16px;--a-border-width:1px;--a-border:#ccc;--a-surface:white;--a-muted:#eee;--a-z-drawer:50;--shell-topbar:56px}
      body{margin:0;font-family:Arial}</style>
      <section class="a-tool-panel a-context-panel a-collection-controls" data-mode="drawer" role="dialog" aria-label="Countries list controls" style="--tool-panel-width:420px">
        <header class="a-panel-header"><span class="a-panel-header__icon"></span><div class="a-panel-header__identity"><strong role="heading" aria-level="2">Filters</strong><small>Refine the Countries list.</small></div><nav class="a-panel-header__actions"><button type="button" aria-label="Close list controls">x</button></nav></header>
        <div class="a-panel-context a-collection-controls__context" data-scope="global"><span class="a-panel-context__label">Countries · Operations</span><span class="a-panel-context__detail">247 records</span></div>
        <div class="a-panel-tabs a-collection-controls__tabs" role="tablist" aria-label="List controls">${labels.map((label, index) => `<button type="button" role="tab" aria-selected="${index === 0}" onclick="document.body.dataset.selected=this.textContent"><span>${label}</span></button>`).join("")}</div>
        <div data-list-drawer="filters"><div class="a-drawer__body">Quick filters</div>
        <footer class="a-drawer__footer a-collection-footer"><div class="a-drawer__footer-actions"><button class="a-button a-button--ghost">Reset</button><button class="a-button">Show results</button></div></footer></div>
      </section>`);
    const panel = (await page.locator(".a-tool-panel").boundingBox())!;
    expect(panel.y).toBeCloseTo(56, 0);
    expect(panel.x + panel.width).toBeCloseTo(width, 0);
    if (width < 700) expect(panel.width).toBeCloseTo(width, 0);
    const header = (await page.locator(".a-panel-header").boundingBox())!, context = (await page.locator(".a-panel-context").boundingBox())!, tabs = (await page.getByRole("tablist").boundingBox())!;
    // Same order as the Files panel: header, context row, then content.
    expect(context.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(tabs.y).toBeGreaterThanOrEqual(context.y + context.height - 1);
    const label = (await page.locator(".a-panel-context__label").boundingBox())!, detail = (await page.locator(".a-panel-context__detail").boundingBox())!;
    expect(Math.abs(label.y - detail.y)).toBeLessThan(4);
    expect(detail.x).toBeGreaterThan(label.x);
    for (const label of labels) {
      // Playwright scrolls the tab strip and verifies hit testing and clipping.
      await page.getByRole("tab", { name: label, exact: true }).click({ timeout: 2000 });
      await expect(page.locator("body")).toHaveAttribute("data-selected", label);
    }
    const reset = (await page.getByRole("button", { name: "Reset" }).boundingBox())!, apply = (await page.getByRole("button", { name: "Show results" }).boundingBox())!;
    expect(reset.x).toBeLessThan(apply.x);
    expect(apply.x + apply.width).toBeGreaterThan(panel.x + panel.width - 40);
  }
});
