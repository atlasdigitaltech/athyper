import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  recordBookmarksOperation,
  removeRecordBookmarksOperation,
  addRecordBookmarksOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
import { EntityFavouritesRuntime } from "../../packages/platform/entity/runtime/list-view/src/overview-favourites";

test("favourites shares bookmarks, persists removal and Undo, preserves rows on failure and clears on scope remount", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/assets",
  });
  const previous = [
    "window",
    "document",
    "CustomEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    CustomEvent: { configurable: true, value: dom.window.CustomEvent },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let stored = Array.from({ length: 7 }, (_, i) => ({
    id: `bookmark-${i}`,
    entityCode: "asset",
    recordId: `id-${i}`,
    label: `Asset ${i}`,
    createdAt: "2026-09-08T10:00:00Z",
  }));
  let fail = false,
    hold = false,
    release: (() => void) | undefined;
  const mutations: any[] = [];
  const client = {
    request: async (operation: unknown, options: any) => {
      if (operation === recordBookmarksOperation) {
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return options.query.operatingOrganizationId === "two" ? [] : stored;
      }
      mutations.push({ operation, ...options });
      if (fail) throw new Error("Unavailable");
      const id = options.body.records[0].id;
      if (operation === removeRecordBookmarksOperation)
        stored = stored.filter((row) => row.recordId !== id);
      if (operation === addRecordBookmarksOperation)
        stored = [
          {
            id: "restored",
            entityCode: "asset",
            recordId: id,
            label: options.body.records[0].label,
            createdAt: "2026-09-08T10:00:00Z",
          },
          ...stored,
        ];
      return [id];
    },
  } as unknown as HttpClient;
  const render = (scope = "one") => (
    <EntityFavouritesRuntime
      key={scope}
      client={client}
      entityCode="asset"
      detailRouteTemplate="/assets/:recordId"
      browseHref="/assets/manage"
      scopeCoordinate={{ operatingOrganizationId: scope }}
      refreshKey={0}
    />
  );
  const button = (label: string) =>
    [...dom.window.document.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.textContent === label,
    )!;
  const remove = () =>
    dom.window.document.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Asset 0 from favourites"]',
    )!;
  try {
    await act(async () => root.render(render()));
    assert.equal(
      dom.window.document.querySelectorAll(".a-entity-pulse__favourite").length,
      5,
    );
    await act(async () => button("View favourites").click());
    assert.equal(
      dom.window.document.querySelectorAll(".a-entity-pulse__favourite").length,
      7,
    );
    fail = true;
    await act(async () => remove().click());
    assert.ok(remove());
    assert.match(
      dom.window.document.querySelector('[role="alert"]')!.textContent!,
      /couldn’t be removed/,
    );
    fail = false;
    await act(async () => remove().click());
    assert.equal(remove(), null);
    assert.match(
      dom.window.document.querySelector('[role="status"]')!.textContent!,
      /Asset 0 removed/,
    );
    assert.equal(mutations.at(-1).body.operatingOrganizationId, "one");
    assert.ok(mutations.at(-1).idempotencyKey);
    await act(async () => button("Undo").click());
    assert.ok(remove());
    assert.equal(mutations.at(-1).operation, addRecordBookmarksOperation);
    hold = true;
    await act(async () => root.render(render("two")));
    assert.doesNotMatch(dom.window.document.body.textContent!, /Asset 0/);
    hold = false;
    await act(async () => release?.());
    assert.match(
      dom.window.document.body.textContent!,
      /Keep your go-to records close/,
    );
    assert.equal(
      dom.window.document.querySelector("a")!.getAttribute("href"),
      "/assets/manage",
    );
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
