import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
const fixture = resolve(
  "tooling/scripts/verification/notification-controls-fixture.tsx",
);
const bundle = build({
  entryPoints: [fixture],
  bundle: true,
  write: false,
  loader: { ".css": "empty" },
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  nodePaths: ["apps/neon/node_modules"],
  plugins: [
    {
      name: "context",
      setup(b) {
        b.onResolve(
          { filter: /^@athyper\/platform-shell-app-foundation$/ },
          () => ({ path: fixture }),
        );
      },
    },
  ],
}).then(
  (r) =>
    r.outputFiles.find((f) => f.path.endsWith(".js"))?.text ??
    r.outputFiles[0]!.text,
);
test.beforeEach(async ({ page }) => {
  await page.route("https://notifications.test/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (!url.pathname.includes("/api/"))
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    let body: unknown = {};
    if (url.pathname.endsWith("/preferences/preview"))
      body = {
        previews: [
          {
            eventCode: "collaboration.comment.mentioned",
            channels: [
              {
                channel: "in_app",
                enabled: true,
                supported: true,
                consented: true,
                reason: "enabled",
              },
            ],
          },
        ],
      };
    else if (url.pathname.endsWith("/preferences"))
      body = {
        version: 1,
        preferences: [
          {
            tenantId: "t",
            principalId: "p",
            eventCode: "collaboration.comment.mentioned",
            channels: ["in_app"],
            version: 1,
          },
        ],
      };
    else if (url.pathname.endsWith("/deliveries"))
      body = {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            channel: "email",
            status: "failed",
            subject: "Mention",
            error: "Simulated provider failure",
            createdAt: "2026-09-23T00:00:00Z",
            attemptCount: 1,
          },
        ],
      };
    else if (url.pathname.endsWith("/replay")) body = { status: "pending" };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
});
test("subscriber can save preferences and cannot see operator tools", async ({
  page,
}) => {
  await page.goto("https://notifications.test/?subscriber");
  await page.evaluate(await bundle);
  await page.getByText("Notification preferences", { exact: true }).click();
  await expect(page.getByLabel("In-app", { exact: true })).toBeChecked();
  const saved = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().endsWith("/preferences"),
  );
  await page.getByLabel("In-app", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  expect((await saved).postDataJSON().preferences).toEqual([
    { eventCode: "collaboration.comment.mentioned", channels: [] },
  ]);
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await expect(page.getByText("Delivery status", { exact: true })).toHaveCount(
    0,
  );
});
test("operator sees errors and retries through the governed endpoint", async ({
  page,
}) => {
  await page.goto("https://notifications.test/");
  await page.evaluate(await bundle);
  await page.locator("summary").filter({ hasText: "Delivery status" }).click();
  await expect(page.getByText("Simulated provider failure")).toBeVisible();
  const request = page.waitForRequest((r) => r.url().endsWith("/replay"));
  await page.getByRole("button", { name: "Retry delivery" }).click();
  const r = await request;
  expect(r.headers()["idempotency-key"]).toBe(r.postDataJSON().replayKey);
});
test("preference conflict offers reload without claiming success", async ({
  page,
}) => {
  await page.route("**/preferences", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 412,
          contentType: "application/json",
          body: JSON.stringify({
            code: "NOTIFICATION_PREFERENCE_VERSION_CONFLICT",
            message: "Changed",
          }),
        })
      : route.fallback(),
  );
  await page.goto("https://notifications.test/?subscriber");
  await page.evaluate(await bundle);
  await page.locator("summary").click();
  await page.getByLabel("In-app", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("alert")).toContainText("Reload");
  await expect(page.getByText("Preferences saved.")).toHaveCount(0);
});

test("workflow Inbox denial does not hide readable notifications", async ({
  page,
}) => {
  const source = await build({
    entryPoints: [
      resolve(
        "tooling/scripts/verification/notification-activity-source-fixture.tsx",
      ),
    ],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    loader: { ".css": "empty" },
    nodePaths: ["apps/neon/node_modules"],
  });
  await page.route("https://notifications.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/notifications/inbox"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          notifications: [
            {
              id: "n1",
              tenantId: "t",
              principalId: "p",
              planeKey: "neon",
              templateKey: "comment_mention",
              eventCode: "collaboration.comment.mentioned",
              title: "A readable mention",
              priority: "normal",
              payload: {},
              createdAt: "2026-09-23T00:00:00Z",
            },
          ],
          unreadCount: 1,
        }),
      });
    if (path.includes("workflow") || path.includes("work-inbox"))
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "FORBIDDEN", message: "Access denied" }),
      });
    if (path.endsWith("/notifications/stream"))
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path.includes("/api/"))
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "FORBIDDEN", message: "Access denied" }),
      });
    return route.fulfill({
      contentType: "text/html",
      body: '<div id="root"></div>',
    });
  });
  await page.goto("https://notifications.test/");
  await page.evaluate(source.outputFiles[0]!.text);
  await expect(page.getByText("A readable mention")).toBeVisible();
  await expect(page.getByText("Unread: 1")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("403");
});

test('refresh retains all loaded notification pages',async({page})=>{
 const source=await build({entryPoints:[resolve('tooling/scripts/verification/notification-activity-source-fixture.tsx')],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},nodePaths:['apps/neon/node_modules']});
 let firstPageReads=0;
 await page.route('https://notifications.test/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/notifications/inbox')){
   const second=url.searchParams.has('cursor');if(!second)firstPageReads++;
   return route.fulfill({contentType:'application/json',body:JSON.stringify({notifications:[{id:second?'n2':'n1',tenantId:'t',principalId:'p',planeKey:'neon',templateKey:'mention',eventCode:'comment.mention',title:second?'Second page mention':'First page mention',priority:'normal',payload:{},createdAt:'2026-09-23T00:00:00Z'}],unreadCount:2,...(!second?{nextCursor:'page2'}:{})})});
  }
  if(url.pathname.endsWith('/workflow/inbox'))return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[],totalCount:0})});
  if(url.pathname.endsWith('/stream'))return route.fulfill({contentType:'text/event-stream',body:''});
  if(url.pathname.includes('/api/'))return route.fulfill({status:403,contentType:'application/json',body:'{}'});
  return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
 });
 await page.goto('https://notifications.test');await page.evaluate(source.outputFiles[0]!.text);
 await expect(page.getByText('First page mention')).toBeVisible();await page.getByRole('button',{name:'Load more'}).click();await expect(page.getByText('Second page mention')).toBeVisible();
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect.poll(()=>firstPageReads).toBeGreaterThan(1);await expect(page.getByText('Second page mention')).toBeVisible();await expect(page.getByText('First page mention')).toBeVisible();
});
