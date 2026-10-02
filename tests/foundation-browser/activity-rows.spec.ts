import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
const bundle = build({
  entryPoints: [
    resolve("tooling/scripts/verification/activity-rows-fixture.tsx"),
  ],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  nodePaths: ["apps/neon/node_modules"],
}).then((r) => r.outputFiles[0]!.text);
test("shared rows expose record destinations, not generic completion", async ({
  page,
}) => {
  await page.route("https://activity.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("https://activity.test");
  await page.evaluate(await bundle);
  await expect(
    page.getByRole("link", { name: "Review request" }),
  ).toHaveAttribute("href", "/requests/123?attemptId=a&workItemId=w#review");
  await expect(
    page.getByRole("link", { name: "View comment" }),
  ).toHaveAttribute("href", /comment-c/);
  await expect(
    page.getByRole("button", { name: "Complete", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Record no longer available")).toBeVisible();
  await page.getByLabel("Actions for Alex mentioned you").click();
  await page.getByRole("button", { name: "Mark as read" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not update");
});
