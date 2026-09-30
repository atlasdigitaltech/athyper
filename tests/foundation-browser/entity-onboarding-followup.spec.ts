import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const theme = readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8");
const ui = readFileSync("packages/platform/foundation/ui/src/styles.css", "utf8");
for (const mode of ["light", "dark", "high-contrast"]) {
  test(`shared search focus remains visible in ${mode}`, async ({page}) => {
    await page.setContent(`<style>${theme}${ui}</style><div class="a-search-field"><input aria-label="Search"></div>`);
    await page.locator("html").evaluate((el, mode) => el.setAttribute("data-theme", mode), mode);
    await page.getByRole("textbox").focus();
    const outline = await page.locator(".a-search-field").evaluate(el => {const s=getComputedStyle(el); return {style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor};});
    expect(outline.style).toBe("solid");
    expect(outline.width).toBeGreaterThanOrEqual(2);
    expect(outline.color).not.toBe("rgba(0, 0, 0, 0)");
  });
}

test("Country source preserves the accepted private default", () => {
  const source=JSON.parse(readFileSync("metadata/products/shared/entities/country/capabilities.json", "utf8"));
  const defaults: string[]=[];
  function visit(value:unknown){if(value && typeof value==='object')for(const [key,child] of Object.entries(value)){if(key==='defaultAudience')defaults.push(String(child));visit(child);}}
  visit(source);
  expect(defaults).toEqual(["private"]);
});
