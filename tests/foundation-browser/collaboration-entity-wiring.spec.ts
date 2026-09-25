import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const fixture = resolve("tooling/scripts/verification/collaboration-entity-wiring-fixture.tsx");
const bundle = build({
  entryPoints: [fixture], bundle: true, write: false, format: "iife", platform: "browser",
  jsx: "automatic", loader: { ".css": "empty" }, nodePaths: ["apps/neon/node_modules"],
  alias: {
    "@athyper/platform-shell-app-foundation": fixture,
    "@athyper/platform-entity-descriptor-client": fixture,
  },
  plugins: [{ name: "renderer-probe", setup(builder) {
    builder.onResolve({ filter: /^\.\/compiled-section-content$/ }, () => ({ path: fixture }));
  } }],
}).then(result => result.outputFiles[0]!.text);

test("a different entity and comments section key retain reply context", async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  await page.evaluate(await bundle);
  await page.getByRole("button", { name: "Load custom discussion replies" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sectionRequests.at(-1))).toEqual({
    entityCode: "fixture_order", recordId: "order-42", surfaceKey: "detail", sectionKey: "discussion",
    cursor: "page-8", resourceContext: { orgUnitId: "org-7", threadRootId: "thread-90" },
  });
});
