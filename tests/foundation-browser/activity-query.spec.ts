import {collectionFixture} from "./activity-collection-fixtures";
import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
const bundle = build({
  entryPoints: [
    resolve("tooling/scripts/verification/activity-query-fixture.tsx"),
  ],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  nodePaths: ["apps/neon/node_modules"],
}).then((r) => r.outputFiles[0]!.text);
test("shared activity toolbar synchronizes presets, URL history, pagination reset and scoped views", async ({
  page,
}) => {
  const collections=collectionFixture();
  const queries: Record<string, unknown>[] = [];
  let viewScope = '["t","p","neon"]';
  await page.route("https://activity.test/**", async (route) => {
    if(await collections(route,viewScope))return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/notifications/inbox")) {
      const q = JSON.parse(url.searchParams.get("activityQuery") ?? "{}");
      queries.push({ ...q, cursor: url.searchParams.get("cursor") });
      if (url.searchParams.get("cursor"))
        await new Promise((resolve) => setTimeout(resolve, 250));
      const title = q.search
        ? `Found ${q.search}`
        : q.collection?.filters.some((f:any)=>f.field==="read"&&f.value==="unread")
          ? "Unread update"
          : "A readable update";
      return route.fulfill({
        json: {
          notifications: [
            {
              id: "n1",
              tenantId: "t",
              principalId: "p",
              planeKey: "neon",
              templateKey: "comment_mention",
              eventCode: "collaboration.comment.mentioned",
              title,
              priority: "normal",
              payload: {},
              createdAt: "2026-09-23T00:00:00Z",
              groupLabel: "Today",
            },
          ],
          unreadCount: 8,
          matchingCount: q.search ? 1 : 120,
          viewScope,
          facets: {
            entities: ["business_partner"],
            types: ["collaboration.comment.mentioned"],
          },
          ...(!q.search ? { nextCursor: "next" } : {}),
        },
      });
    }
    if (url.pathname.endsWith("/workflow/inbox"))
      return route.fulfill({
        json: { data: [], totalCount: 6, matchingCount: 6 },
      });
    if (url.pathname.endsWith("/notifications/stream"))
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (url.pathname.includes("/api/"))
      return route.fulfill({ status: 403, json: { message: "Forbidden" } });
    return route.fulfill({
      contentType: "text/html",
      body: '<div id="root"></div>',
    });
  });
  await page.goto("https://activity.test/notifications");
  await page.evaluate(await bundle);
  await expect(page.getByText("120 matching notifications")).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.cursor).toBe("next");
  await page.getByRole("searchbox", { name: "Search activity" }).fill("needle");
  await page.getByRole("searchbox", { name: "Search activity" }).press("Enter");
  await expect(page.getByText("Found needle", { exact: false })).toBeVisible();
  await expect(page.getByText("1 matching notifications")).toBeVisible();
  expect(queries.at(-1)?.cursor).toBeNull();
  await page.getByRole("searchbox", { name: "Search activity" }).press("Enter");
  await expect(page.getByText("1 matching notifications")).toBeVisible();
  await expect(page).toHaveURL(/activityQuery=/);
  await page.getByRole("button", { name: "Select view" }).click();
  await page.getByRole("menuitem", { name: "Unread", exact: true }).click();
  await expect(page.getByText("Unread update", { exact: false })).toBeVisible();
  expect((queries.at(-1)?.collection as any)?.filters).toContainEqual({field:"read",operator:"eq",value:"unread"});
  await page.goBack();
  await expect(
    page.getByRole("searchbox", { name: "Search activity" }),
  ).toHaveValue("needle");
  await expect(page.getByText("Found needle", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Select view" }).click();
  await page.getByRole("menuitem", {name:"Manage views",exact:true}).click();
  await page.getByLabel("View name",{exact:true}).fill("My search");
  await page.getByRole("button",{name:"Save personal view",exact:true}).click();
  await expect(page.getByText("My search",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage))).not.toContain('athyper.activity.views.v1:["t","p","neon"]:notifications');
  await page.getByRole("button",{name:"Close manage views",exact:true}).click();
  viewScope = '["t","another-user","neon"]';
  await page.reload();
  await page.evaluate(await bundle);
  await expect(page.getByText("1 matching notifications")).toBeVisible();
  await page.getByRole("button", { name: "Select view" }).click();
  await expect(
    page.getByRole("menuitem", { name: "My search", exact: true }),
  ).toHaveCount(0);
  await page.goto("https://activity.test/record");
  await page.evaluate(await bundle);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search activity" })
    .fill("drawer needle");
  await page.getByRole("searchbox", { name: "Search activity" }).press("Enter");
  const href = await page
    .getByRole("link", { name: "Open Activity center in full view" })
    .getAttribute("href");
  const carried = JSON.parse(
    new URL(href!, "https://activity.test").searchParams.get("activityQuery")!,
  );
  expect(carried).toMatchObject({ search: "drawer needle", collection:{query:"drawer needle"} });
});
