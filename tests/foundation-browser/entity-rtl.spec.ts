import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const listStyles = readFileSync(
  "packages/platform/entity/runtime/list-view/src/styles.css",
  "utf8",
);
const detailStyles = readFileSync(
  "packages/platform/entity/runtime/form-detail/src/styles.css",
  "utf8",
);

test("shared Entity Framework transfer and attachment controls respect RTL logical edges", async ({
  page,
}) => {
  expect(listStyles).not.toContain(".a-transfer-workspace th,.a-transfer-workspace td{text-align:left");
  expect(detailStyles).not.toContain(".a-attachment-thumbnail__badge { position:absolute; bottom:0; right:0");
  await page.setContent(`
    <html dir="rtl"><style>${listStyles}\n${detailStyles}</style>
      <table class="a-transfer-workspace"><tr><th id="header">عنوان</th></tr></table>
      <div class="a-attachment-thumbnail" style="position:relative;width:100px;height:100px">
        <span class="a-attachment-thumbnail__badge" id="badge">PDF</span>
      </div>
    </html>`,
  );
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.locator("#header").evaluate((node) => getComputedStyle(node).textAlign)).toBe("start");
  expect(await page.locator("#badge").evaluate((node) => getComputedStyle(node).left)).toBe("0px");
});
