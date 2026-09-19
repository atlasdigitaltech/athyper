import type { ReferenceHistoryItem } from "@athyper/platform-api-client";

type Items = readonly ReferenceHistoryItem[];
type Transport = (
  signal: AbortSignal,
  action?: "select" | "clear",
  key?: string,
) => Promise<Items>;
export const REFERENCE_HISTORY_FRESH_MS = 60_000;

/** One active store per authenticated history scope. No request is made on subscribe. */
export class ReferenceHistoryStore {
  items: Items = [];
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private controller = new AbortController();
  private reads = new Map<string, { at: number; pending?: Promise<unknown> }>();
  private listeners = new Set<() => void>();
  private refreshers = new Set<() => void>();
  constructor(
    readonly storageKey: string,
    private readonly limit: number,
    private readonly retentionDays: number,
  ) {
    this.readStorage();
  }
  private valid(items: Items): Items {
    const seen = new Set<string>(),
      cutoff = Date.now() - this.retentionDays * 86400000;
    return items
      .filter((item) => {
        if (
          !item ||
          typeof item.key !== "string" ||
          Date.parse(item.selectedAt) <= cutoff ||
          !Number.isFinite(Date.parse(item.selectedAt)) ||
          seen.has(item.key)
        )
          return false;
        seen.add(item.key);
        return true;
      })
      .slice(0, this.limit);
  }
  private apply(items: Items, persist = true) {
    this.items = this.valid(items);
    if (persist)
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.items));
      } catch {
        /* Device storage is optional. */
      }
    for (const listener of this.listeners) listener();
  }
  readStorage() {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? "[]",
      );
      this.revision++;
      for (const read of this.reads.values()) read.at = 0;
      this.apply(Array.isArray(value) ? value : [], false);
    } catch {
      /* Keep memory history when storage is unavailable. */
    }
  }
  subscribe(listener: () => void, refresh: () => void) {
    this.listeners.add(listener);
    this.refreshers.add(refresh);
    return () => {
      this.listeners.delete(listener);
      this.refreshers.delete(refresh);
    };
  }
  get subscriberCount() {
    return this.listeners.size;
  }
  prune() {
    const items = this.valid(this.items);
    if (items.length !== this.items.length) this.apply(items);
  }
  focus() {
    this.prune();
    for (const refresh of this.refreshers) refresh();
  }
  dispose() {
    this.controller.abort();
    this.listeners.clear();
    this.refreshers.clear();
    this.reads.clear();
  }
  refresh(bindingKey: string, transport: Transport) {
    const prior = this.reads.get(bindingKey);
    if (
      prior &&
      (prior.pending || Date.now() - prior.at < REFERENCE_HISTORY_FRESH_MS)
    )
      return;
    if (!prior && this.reads.size >= 100) {
      const disposable = [...this.reads].find(([, read]) => !read.pending);
      if (!disposable) return;
      this.reads.delete(disposable[0]);
    }
    const issued = this.revision,
      signal = this.controller.signal;
    const read: { at: number; pending?: Promise<unknown> } = { at: Date.now() };
    this.reads.set(bindingKey, read);
    // Wait for committed local mutations; never replace newer optimistic state.
    read.pending = this.queue
      .catch(() => {})
      .then(async () => {
        if (signal.aborted || issued !== this.revision) return;
        const items = await transport(signal);
        if (!signal.aborted && issued === this.revision) this.apply(items);
      })
      .catch(() => {
        /* History failure never blocks the field. */
      })
      .finally(() => {
        read.pending = undefined;
      });
  }
  mutate(action: "select" | "clear", key?: string, transport?: Transport) {
    const issued = ++this.revision,
      signal = this.controller.signal;
    for (const read of this.reads.values()) read.at = 0;
    this.apply(
      action === "clear"
        ? []
        : [
            { key: key!, selectedAt: new Date().toISOString() },
            ...this.items.filter((item) => item.key !== key),
          ],
    );
    if (!transport) return;
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (signal.aborted) return;
        const items = await transport(signal, action, key);
        if (!signal.aborted && issued === this.revision) this.apply(items);
      })
      .catch(() => {
        /* Keep the optimistic browser cache on transport failure. */
      });
  }
}

const stores = new Map<string, ReferenceHistoryStore>();
const focus = () => {
  for (const store of stores.values()) store.focus();
};
const storage = (event: StorageEvent) => {
  for (const store of stores.values())
    if (!event.key || event.key === store.storageKey) store.readStorage();
};
/** Stores exist only while mounted; one pair of window listeners for all controls. */
export function subscribeReferenceHistory(
  storageKey: string,
  limit: number,
  retentionDays: number,
  changed: (store: ReferenceHistoryStore) => void,
  focused: (store: ReferenceHistoryStore) => void,
) {
  const key = JSON.stringify([storageKey, limit, retentionDays]);
  if (!stores.size) {
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storage);
  }
  let store = stores.get(key);
  if (!store) {
    store = new ReferenceHistoryStore(storageKey, limit, retentionDays);
    stores.set(key, store);
  }
  const current = store;
  const unsubscribe = current.subscribe(
    () => changed(current),
    () => focused(current),
  );
  changed(current);
  return {
    store: current,
    unsubscribe: () => {
      unsubscribe();
      // StrictMode can re-subscribe before cleanup; do not cancel another consumer.
      queueMicrotask(() => {
        if (current.subscriberCount) return;
        current.dispose();
        stores.delete(key);
        if (!stores.size) {
          window.removeEventListener("focus", focus);
          window.removeEventListener("storage", storage);
        }
      });
    },
  };
}
