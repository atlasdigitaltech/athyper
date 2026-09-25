import {collectionFixture} from "./activity-collection-fixtures";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
const entry = resolve(
  "tooling/scripts/verification/activity-hydration-fixture.tsx",
);
const common = {
  entryPoints: [entry],
  bundle: true,
  write: false,
  jsx: "automatic" as const,
  loader: { ".css": "empty" as const },
  nodePaths: ["apps/neon/node_modules"],
};
const server = build({ ...common, platform: "node", format: "cjs" }).then(
  (result) => {
    const module = { exports: {} as { render: () => string } };
    new Function("require", "module", "exports", result.outputFiles[0]!.text)(
      createRequire(resolve("package.json")),
      module,
      module.exports,
    );
    return module.exports.render();
  },
);
const client = build({
  ...common,
  platform: "browser",
  format: "iife",
  globalName: "ActivityHydration",
}).then((result) => result.outputFiles[0]!.text);
test.use({ timezoneId: "Asia/Kuala_Lumpur" });
for (const bookmarked of [false, true])
  test(`Activity hydration restores ${bookmarked ? "bookmarked query" : "local defaults"} after matching the server`, async ({
    page,
  }) => {
    const queries: Record<string, unknown>[] = [];
    const html = await server;
    expect(html).toContain("Loading activity configuration");
    const collections=collectionFixture();
    await page.route("https://activity.test/**", async (route) => {
      if(await collections(route))return;
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/workflow/inbox")) {
        queries.push(JSON.parse(url.searchParams.get("activityQuery")!));
        return route.fulfill({
          json: { data: [], totalCount: 0, matchingCount: 0 },
        });
      }
      if (url.pathname.endsWith("/notifications/inbox"))
        return route.fulfill({
          json: { notifications: [], unreadCount: 0, matchingCount: 0 },
        });
      if (url.pathname.endsWith("/notifications/stream"))
        return route.fulfill({ contentType: "text/event-stream", body: "" });
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({ status: 403, json: { message: "Forbidden" } });
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<div id="root">${html}</div>`,
      });
    });
    const query = {
      search: "supplier",
      assignment: "team",
      density: "compact",
      timeZone: "America/New_York",
    };
    await page.goto(
      `https://activity.test/inbox${bookmarked ? "?activityQuery=" + encodeURIComponent(JSON.stringify(query)) : ""}`,
    );
    await page.evaluate(
      (await client) + ";window.hydrationErrors=ActivityHydration.hydrate();",
    );
    await expect.poll(() => queries.length).toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: "Select view" }),
    ).toContainText(bookmarked ? "Custom" : "All eligible work");
    expect(await page.evaluate("window.hydrationErrors")).toEqual([]);
    for (const q of queries)
      expect(q).toMatchObject(
        bookmarked ? {search:query.search,density:query.density,timeZone:query.timeZone} : { search: "", timeZone: "Asia/Kuala_Lumpur" },
      );
    await expect(
      page.getByRole("searchbox", { name: "Search activity" }),
    ).toHaveValue(bookmarked ? "supplier" : "");
  });
