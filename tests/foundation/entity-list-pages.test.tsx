import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  ListFilterV1,
} from "@athyper/contract-platform-entity-list";
import {
  ApiTransportError,
  type HttpClient,
} from "../../packages/platform/foundation/api-client/src";
import {
  useListPages,
  type ListPages,
} from "../../packages/platform/entity/runtime/list-view/src/list-pages";

// The shared paging hook behind Board lanes, Calendar and Gantt streams and
// grouped-tree groups (foundation section 7 implementation note).

const descriptor = {
  entity: { code: "work_item" },
  revision: { descriptorHash: "a".repeat(64) },
  scope: { fingerprint: "c".repeat(64) },
  limits: { defaultPageSize: 2, countMode: "exact" },
  surface: { search: { minimumQueryLength: 2 } },
} as unknown as EntityListDescriptorV1;

type Pending = {
  query: Record<string, unknown>;
  signal: AbortSignal;
  resolve: (page: EntityListResultV1) => void;
  reject: (cause: unknown) => void;
};

const page = (
  ids: string[],
  nextCursor?: string,
  total = 4,
): EntityListResultV1 =>
  ({
    schemaVersion: 1,
    descriptorHash: "a".repeat(64),
    scopeFingerprint: "c".repeat(64),
    queryHash: "d".repeat(64),
    rows: ids.map((id) => ({ id, values: {} })),
    pagination: {
      pageSize: 2,
      hasNext: Boolean(nextCursor),
      hasPrevious: false,
      ...(nextCursor ? { nextCursor } : {}),
      total,
      countMode: "exact",
    },
  }) as unknown as EntityListResultV1;

async function withHarness(
  run: (h: {
    requests: Pending[];
    current: () => ListPages;
    render: (props: {
      filters: readonly ListFilterV1[];
      enabled?: boolean;
      strict?: boolean;
    }) => Promise<void>;
  }) => Promise<void>,
) {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://example.test",
  });
  const names = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const saved = names.map((name) =>
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
  const requests: Pending[] = [];
  const client = {
    request: (
      _operation: unknown,
      input: { query: Record<string, unknown>; signal: AbortSignal },
    ) =>
      new Promise((resolve, reject) =>
        requests.push({
          query: input.query,
          signal: input.signal,
          resolve,
          reject,
        }),
      ),
  } as unknown as HttpClient;
  let latest: ListPages | undefined;
  function Harness({
    filters,
    enabled,
  }: {
    filters: readonly ListFilterV1[];
    enabled: boolean;
  }) {
    latest = useListPages({
      client,
      descriptor,
      query: {
        filters,
        sort: [{ field: "code", direction: "asc" }],
        columns: ["code"],
        pageSize: 2,
      },
      refreshKey: "r",
      enabled,
    });
    return <div>{latest.rows.map((row) => row.id).join(",")}</div>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await run({
      requests,
      current: () => latest!,
      render: async ({ filters, enabled = true, strict = false }) => {
        const tree = <Harness filters={filters} enabled={enabled} />;
        await act(async () =>
          root.render(
            strict ? <React.StrictMode>{tree}</React.StrictMode> : tree,
          ),
        );
      },
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    names.forEach((name, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

const open: ListFilterV1[] = [
  { field: "stage", operator: "eq", value: "open" },
];
const done: ListFilterV1[] = [
  { field: "stage", operator: "eq", value: "done" },
];
const live = (requests: Pending[]) =>
  requests.filter((request) => !request.signal.aborted);

for (const strict of [false, true]) {
  const mode = strict ? " (StrictMode)" : "";

  test(`a query change clears rows, cursor and loading, and never sends the old cursor${mode}`, async () => {
    await withHarness(async ({ requests, current, render }) => {
      await render({ filters: open, strict });
      await act(async () =>
        live(requests)
          .at(-1)!
          .resolve(page(["a", "b"], "c2")),
      );
      await act(async () => current().loadMore());
      assert.equal(live(requests).at(-1)!.query.cursor, "c2");
      assert.equal(current().loading, true);
      // The query changes while page 2 is loading.
      await render({ filters: done, strict });
      assert.deepEqual(current().rows, []);
      assert.equal(current().hasNext, false);
      const fresh = live(requests).at(-1)!;
      assert.equal(fresh.query.cursor, undefined);
      assert.deepEqual(fresh.query.filter, [JSON.stringify(done[0])]);
      await act(async () => fresh.resolve(page(["x"], "d2")));
      assert.deepEqual(
        current().rows.map((row) => row.id),
        ["x"],
      );
      assert.equal(current().loading, false);
      // Load more still works: loading was not left set by the aborted page.
      await act(async () => current().loadMore());
      assert.equal(live(requests).at(-1)!.query.cursor, "d2");
    });
  });

  test(`a disabled stream keeps its pages and enabling it again requests nothing${mode}`, async () => {
    await withHarness(async ({ requests, current, render }) => {
      await render({ filters: open, strict });
      await act(async () =>
        live(requests)
          .at(-1)!
          .resolve(page(["a", "b"], "c2")),
      );
      await act(async () => current().loadMore());
      await act(async () =>
        live(requests)
          .at(-1)!
          .resolve(page(["c", "d"])),
      );
      const sent = requests.length;
      await render({ filters: open, enabled: false, strict });
      await render({ filters: open, enabled: true, strict });
      assert.equal(requests.length, sent);
      assert.deepEqual(
        current().rows.map((row) => row.id),
        ["a", "b", "c", "d"],
      );
      assert.equal(current().total, 4);
    });
  });

  test(`a failed page reports its cause, disables Load more and retries the same cursor${mode}`, async () => {
    await withHarness(async ({ requests, current, render }) => {
      await render({ filters: open, strict });
      await act(async () =>
        live(requests)
          .at(-1)!
          .resolve(page(["a", "b"], "c2")),
      );
      await act(async () => current().loadMore());
      const failure = new ApiTransportError("http", "Unavailable", 503);
      await act(async () => live(requests).at(-1)!.reject(failure));
      assert.equal(current().failed, true);
      assert.equal(current().error, failure);
      assert.equal(current().loading, false);
      const sent = requests.length;
      await act(async () => current().loadMore());
      assert.equal(requests.length, sent);
      await act(async () => current().retry());
      assert.equal(live(requests).at(-1)!.query.cursor, "c2");
      await act(async () =>
        live(requests)
          .at(-1)!
          .resolve(page(["c"])),
      );
      assert.equal(current().failed, false);
      assert.deepEqual(
        current().rows.map((row) => row.id),
        ["a", "b", "c"],
      );
    });
  });
}

test("re-rendering with an equal query starts nothing", async () => {
  // The key is the built request, so a new but equal filter array is no change.
  await withHarness(async ({ requests, render }) => {
    await render({ filters: open });
    const sent = requests.length;
    await render({ filters: [...open] });
    assert.equal(requests.length, sent);
  });
});
