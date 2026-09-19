import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { test, expect, type Page } from "@playwright/test";

const script = build({
  entryPoints: ["tooling/scripts/verification/neon-context-browser-entry.tsx"],
  bundle: true,
  write: false,
  loader: { ".css": "empty" },
  format: "iife",
  platform: "browser",
  jsx: "automatic",
});
const styles = [
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/ui/src/styles.css",
  "packages/platform/shell/shell/src/styles.css",
  "packages/planes/neon/shell/src/styles.css",
]
  .map((path) => readFileSync(path, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
const catalog = {
  schemaVersion: 1,
  revision: "revision-one",
  tenantId: "tenant-a",
  supportsAllPermitted: true,
  companies: ["uk", "sg"].map((code) => ({
    companyCodeId: `${code}01`,
    code: `${code}01`,
    displayName: `${code} Company`,
    legalEntityId: code,
    legalEntityCode: `le-${code}`,
    legalEntityName: code === "uk" ? "UK Legal" : "Singapore Legal",
    functionalCurrency: "USD",
    capabilityGroups: ["procurement"],
  })),
};

async function mount(page: Page) {
  await page.route("http://context.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/neon/work-contexts"))
      return route.fulfill({ json: catalog });
    if (path.endsWith("/neon/operating-organizations"))
      return route.fulfill({
        json: {
          schemaVersion: 1,
          revision: "orgs",
          tenantId: "tenant-a",
          effectiveAt: "2026-09-18T00:00:00Z",
          organizations: [],
        },
      });
    if (path.startsWith("/api/"))
      return route.fulfill({ status: 503, json: {} });
    return route.fulfill({
      contentType: "text/html",
      body: `<style>${styles}</style><div id="root"></div>`,
    });
  });
  await page.goto("http://context.test/");
  await page.evaluate(() =>
    localStorage.setItem(
      "athyper.neon.work-context.v1:tenant-a:principal-a",
      JSON.stringify({ mode: "company", companyCodeId: "uk01" }),
    ),
  );
  await page.addScriptTag({ content: (await script).outputFiles[0]!.text });
  await expect(page.getByTestId("scope")).toHaveText("uk / uk01");
}

async function chooseSingapore(page: Page) {
  await page
    .getByLabel("Legal entity: LE-UK · UK Legal", { exact: true })
    .click();
  await page.getByRole("radio", { name: /sg Company/ }).click();
}

test("switch cancellation preserves draft; commit resets content and is isolated from another tab", async ({
  page,
  context,
}) => {
  await mount(page);
  const other = await context.newPage();
  await mount(other);
  await page.getByLabel("Draft", { exact: true }).fill("Unsaved work");
  await chooseSingapore(page);
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toContainText("SG01 · sg Company (LE-SG · Singapore Legal)");
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(page.getByTestId("scope")).toHaveText("uk / uk01");
  await expect(page.getByLabel("Draft", { exact: true })).toHaveValue(
    "Unsaved work",
  );
  await chooseSingapore(page);
  await page
    .getByRole("button", { name: "Discard and switch", exact: true })
    .click();
  await expect(page.getByTestId("scope")).toHaveText("sg / sg01");
  await expect(
    page.getByLabel("Legal entity: LE-SG · Singapore Legal", { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Draft", { exact: true })).toHaveValue("");
  await expect(other.getByTestId("scope")).toHaveText("uk / uk01");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            "athyper.neon.work-context.v1:tenant-a:principal-a",
          )!,
        ).companyCodeId,
    ),
  ).toBe("uk01");
});

test("running commands block a switch and keyboard dismissal restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 850 });
  await mount(page);
  await page.getByLabel("Running command", { exact: true }).check();
  await chooseSingapore(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Finish the running command" }),
  ).toBeVisible();
  await expect(page.getByTestId("scope")).toHaveText("uk / uk01");
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Legal entity: LE-UK · UK Legal", { exact: true }),
  ).toBeFocused();
});
