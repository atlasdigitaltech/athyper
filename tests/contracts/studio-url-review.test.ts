import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { notificationServiceWorkerSource } from "../../packages/platform/communications/notifications-client/src/service-worker";
import { studioCatalogRoutes } from "../../apps/studio/lib/catalog-routes";
import { defaultExperienceSurface } from "../../packages/contracts/platform/dashboard/src/generated-defaults";

test("every Studio catalog URL resolves to a default experience surface", () => {
  for (const workspace of studioCatalogRoutes) {
    assert.ok(
      defaultExperienceSurface(`studio.${workspace.code}.home`, "studio"),
      workspace.routeSlug,
    );
    for (const module of workspace.modules) {
      assert.ok(
        defaultExperienceSurface(
          `studio.${workspace.code}.${module.code}.home`,
          "studio",
        ),
        `${workspace.routeSlug}/${module.routeSlug}`,
      );
    }
  }
});

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const navigated: string[] = [];
  const notifications: any[] = [];
  runInNewContext(notificationServiceWorkerSource, {
    URL,
    self: {
      location: { origin: "https://studio.dev.athyper.test" },
      addEventListener: (name: string, handler: (event: any) => void) => {
        handlers[name] = handler;
      },
      registration: {
        showNotification: async (title: string, options: unknown) => {
          notifications.push({ title, options });
        },
      },
      clients: {
        matchAll: async () => [],
        openWindow: async (href: string) => {
          navigated.push(href);
        },
      },
    },
  });
  return { handlers, navigated, notifications };
}

test("notification clicks cannot retain an external origin and tolerate malformed URLs", async () => {
  for (const href of [
    "//external.test/path",
    "/\\external.test/path",
    "https://external.test/path",
    "//[",
    undefined,
  ]) {
    const value = worker();
    let pending: Promise<unknown> | undefined;
    value.handlers.notificationclick!({
      notification: { close() {}, data: { href } },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    assert.deepEqual(value.navigated, [
      "https://studio.dev.athyper.test/notifications",
    ]);
  }
  const value = worker();
  let pending: Promise<unknown> | undefined;
  value.handlers.notificationclick!({
    notification: { close() {}, data: { href: "/inbox?filter=unread#item" } },
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
  assert.deepEqual(value.navigated, [
    "https://studio.dev.athyper.test/inbox?filter=unread#item",
  ]);
});

test("push handles JSON null and sanitizes notification destinations before storing them", async () => {
  for (const payload of [null, { data: { href: "/\\external.test/path" } }]) {
    const value = worker();
    let pending: Promise<unknown> | undefined;
    value.handlers.push!({
      data: { json: () => payload },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    assert.equal(value.notifications[0].options.data.href, "/notifications");
  }
});
