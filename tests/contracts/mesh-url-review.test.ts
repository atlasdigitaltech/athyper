import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { readAccountSelection, writeAccountSelection } from "../../packages/planes/mesh/shell/src/account-storage";
import { notificationServiceWorkerSource } from "../../packages/platform/communications/notifications-client/src/service-worker";
import { readProtectedBootstrap } from "../../packages/platform/shell/app-foundation/src/server";

test("Mesh account selection tolerates disabled browser storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Storage blocked"); } });
  try {
    assert.equal(readAccountSelection("account"), undefined);
    assert.doesNotThrow(() => writeAccountSelection("account", "supplier"));
    assert.doesNotThrow(() => writeAccountSelection("account"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("Mesh required-action bootstrap has a public recovery destination", async () => {
  const result = await readProtectedBootstrap({
    request: new Request("https://mesh.example/mdg/business-partner"),
    readSession: async () => Response.json({ schemaVersion: 1, state: "required_action", plane: "mesh", requiredActions: ["UPDATE_PASSWORD"], allowedNextActions: ["complete_required_action", "logout"] }),
    readExperience: async () => { throw new Error("Must not load a protected workspace"); },
  });
  assert.equal(result.state, "redirect");
  if (result.state === "redirect") assert.equal(result.location, "/auth/required-action?returnTo=%2Fmdg%2Fbusiness-partner");
  const page = readFileSync(new URL("../../apps/mesh/app/(public)/auth/required-action/page.tsx", import.meta.url), "utf8");
  assert.match(page, /RequiredActionGatePage/);
});

test("the notification worker handles null push payloads and keeps click targets on Mesh", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const opened: string[] = [];
  const notifications: any[] = [];
  runInNewContext(notificationServiceWorkerSource, { URL, self: {
    location: { origin: "https://mesh.example" },
    addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; },
    registration: { showNotification: async (title: string, options: any) => { notifications.push({ title, ...options }); } },
    clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
  } });
  let pending: Promise<unknown> = Promise.resolve();
  const waitUntil = (work: Promise<unknown>) => { pending = work; };
  handlers.push!({ data: { json: () => null }, waitUntil });
  await pending;
  assert.equal(notifications[0].title, "New activity");
  for (const href of ["https://evil.example/a", "//evil.example/a", "/\\evil.example/a", "http://[", "javascript:alert(1)", "/inbox?view=open#item"]) {
    handlers.notificationclick!({ notification: { data: { href }, close() {} }, waitUntil });
    await pending;
    const target = new URL(opened.at(-1)!);
    assert.equal(target.origin, "https://mesh.example");
    assert.equal(target.pathname, href.startsWith("/inbox") ? "/inbox" : "/notifications");
  }
});
