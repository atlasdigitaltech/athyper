import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { HttpClient } from "../../packages/platform/foundation/api-client/src";
import { useAttachmentBrowse } from "../../packages/platform/entity/runtime/form-detail/src/use-attachment-browse";

test("browse ignores stale pagination after filters change and refreshes after mutations", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://example.test",
  });
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const descriptors = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  type Page = { items: { id: string }[]; nextCursor?: string };
  const requests: {
    body: any;
    signal: AbortSignal;
    resolve: (page: Page) => void;
  }[] = [];
  const client = {
    request: (_operation: unknown, input: any) =>
      new Promise<Page>((resolve) => requests.push({ ...input, resolve })),
  } as unknown as HttpClient;
  let state: ReturnType<typeof useAttachmentBrowse>;
  function Harness({ name, revision }: { name: string; revision: number }) {
    state = useAttachmentBrowse(
      client,
      "business_partner",
      "record",
      true,
      name,
      "",
      "",
      revision,
    );
    return <div>{state.items?.map((item) => String(item.id)).join(",")}</div>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = async (name: string, revision = 1) => {
    await act(async () => {
      root.render(<Harness name={name} revision={revision} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  };
  try {
    await render("old");
    await act(async () => {
      requests[0]!.resolve({
        items: [{ id: "old" }],
        nextCursor: "cursor-old",
      });
    });
    await act(async () => {
      state!.loadMore();
    });
    assert.equal(requests[1]!.body.after, "cursor-old");
    await render("new");
    assert.equal(requests[1]!.signal.aborted, true);
    await act(async () => {
      requests[2]!.resolve({ items: [{ id: "new" }] });
    });
    await act(async () => {
      requests[1]!.resolve({
        items: [{ id: "stale" }],
        nextCursor: "stale-cursor",
      });
    });
    assert.deepEqual(state!.items, [{ id: "new" }]);
    assert.equal(state!.cursor, undefined);
    await render("new", 2);
    assert.equal(requests.length, 4);
    await act(async () => {
      requests[3]!.resolve({ items: [{ id: "renamed" }] });
    });
    assert.deepEqual(state!.items, [{ id: "renamed" }]);
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    names.forEach((name, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
