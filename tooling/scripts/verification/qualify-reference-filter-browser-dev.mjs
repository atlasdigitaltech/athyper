import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { X509Certificate, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const out = resolve(process.argv[2]);
mkdirSync(out, { recursive: true, mode: 0o700 });
const cert = new X509Certificate(readFileSync(process.env.NODE_EXTRA_CA_CERTS));
const spki = createHash("sha256")
  .update(cert.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64");
const browser = await chromium.launch({
  args: [`--ignore-certificate-errors-spki-list=${spki}`],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
const report = { passed: false };
try {
  await page.goto("https://neon.dev.athyper.test/app/entity/state_region");
  await page
    .getByRole("heading", { name: "States and regions", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const picker = page.getByRole("combobox", { name: /Country code/ });
  await picker.click();
  await page
    .getByRole("combobox", { name: "Search by name or code…", exact: true })
    .fill("Malaysia");
  await page.getByRole("option", { name: /Malaysia/ }).click();
  const filtered = page.waitForResponse(
    (r) =>
      r.url().includes("/entity-runtime/state_region/list?") &&
      r.url().includes("MY"),
  );
  await page.getByRole("button", { name: /Apply filters/ }).click();
  const response = await filtered;
  const rows = (await response.json()).rows;
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.values.country_code === "MY"));
  report.passed = true;
  report.rows = rows.length;
  await page.screenshot({ path: join(out, "filters.png") });
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} finally {
  await page.screenshot({ path: join(out, "last.png") }).catch(() => {});
  console.log((await page.getByRole("option").allTextContents()).slice(0, 10));
  await browser.close();
}
