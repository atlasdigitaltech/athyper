import { test } from "node:test";
import assert from "node:assert/strict";
import { ReferenceHistoryStore } from "../../packages/platform/entity/runtime/form-detail/src/reference-history-store";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const item = (key: string) => ({ key, selectedAt: new Date().toISOString() });

test("history coalesces concurrent reads and refreshes within the freshness interval", async () => {
  const store = new ReferenceHistoryStore("test", 5, 90);
  let reads = 0;
  const transport = async () => {
    reads++;
    await tick();
    return [item("MY")];
  };
  for (let i = 0; i < 20; i++) store.refresh("authorized-country", transport);
  await tick();
  await tick();
  assert.equal(reads, 1);
  assert.equal(store.items[0]?.key, "MY");
  store.refresh("authorized-country", transport);
  await tick();
  assert.equal(reads, 1);
  store.refresh("different-eligibility", transport);
  await tick();
  await tick();
  assert.equal(reads, 2);
  store.dispose();
});

test("a stale history read cannot replace a later selection or clear", async () => {
  const store = new ReferenceHistoryStore("test", 5, 90);
  let complete!: (items: ReturnType<typeof item>[]) => void;
  store.refresh(
    "country",
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await tick();
  store.mutate("select", "MY");
  store.mutate("clear");
  complete([item("SA")]);
  await tick();
  assert.deepEqual(store.items, []);
  store.dispose();
});

test("mutations serialize across consumers and clearing wins over earlier responses", async () => {
  const store = new ReferenceHistoryStore("test", 5, 90);
  const calls: string[] = [];
  let release!: () => void;
  const transport = async (
    _signal: AbortSignal,
    action?: "select" | "clear",
    key?: string,
  ) => {
    calls.push(action!);
    if (action === "select")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return action === "clear" ? [] : [item(key!)];
  };
  store.mutate("select", "MY", transport);
  await tick();
  store.mutate("clear", undefined, transport);
  assert.deepEqual(store.items, []);
  assert.deepEqual(calls, ["select"]);
  release();
  await tick();
  await tick();
  assert.deepEqual(calls, ["select", "clear"]);
  assert.deepEqual(store.items, []);
  store.dispose();
});

test("outages retain bounded optimistic recents and disposal cancels reads", async () => {
  const store = new ReferenceHistoryStore("test", 2, 90);
  const failed = async () => {
    throw Error("offline");
  };
  for (const key of ["MY", "SG", "SA"]) store.mutate("select", key, failed);
  await tick();
  assert.deepEqual(
    store.items.map((item) => item.key),
    ["SA", "SG"],
  );
  let signal: AbortSignal | undefined;
  store.refresh("country", async (current) => {
    signal = current;
    return new Promise(() => {});
  });
  await tick();
  store.dispose();
  assert.equal(signal?.aborted, true);
});
